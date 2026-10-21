// 기사·공시 자동수집 결과를 data/*.json에 반영합니다. (Claude 예약 작업이 매일 실행)
// 사용: node scripts/ingest.mjs findings.json [--now=ISO] [--dry]
// findings.json 형식:
// {
//   "sources": [{ "id": "s01", "hits": 2 }],                  // 확인한 소스와 관련 항목 수
//   "items": [
//     { "dc_id": "기존 센터 id",                               // 기존 센터 갱신
//       "updates": { "status": { "value": "착공", "conf": "확정", "note": "...", "evidence_url": "https://..." } },
//       "evidence": [{ "url": "https://...", "title": "", "publisher": "", "pub_date": "YYYY-MM-DD", "grade": "A|B|C",
//                      "fields": ["상태"], "excerpt": "", "source_id": "s01" }] },
//     { "new": { "id": "영문-슬러그(선택)", "name": "신규 센터명", "category": "상용", "address": "..." },   // 신규 센터
//       "updates": { ... }, "evidence": [ ... ] }
//   ],
//   "companies": [                                            // (주간 플레이어 업데이트) 회사 프로필 갱신·신규
//     { "id": "기존 회사 id(없으면 신규)", "name": "", "aliases": [], "type": "통신·클라우드", "roles": ["dev","op","con"],
//       "major": true, "parent": "", "note": "최근 동향 요약", "url": "https://..." }   // 바꿀 필드만 넣어도 됩니다
//   ],
//   "targets": [                                              // (주간) 핵심 4사 목표·현황
//     { "player": "KT", "target_mw": 1000, "year": 2031, "basis": "", "note": "", "url": "",
//       "reported_mw": 162, "reported_n": 15, "reported_basis": "", "reported_url": "" }
//   ],
//   "kind": "자동수집",                                       // runs 로그 종류(주간 작업은 "플레이어 업데이트")
//   "errors": 0,
//   "summary": "한국어 2~3문장"
// }
// 회사: 사람이 마지막으로 고친 필드(log의 editor가 auto가 아님)는 덮어쓰지 않고 요약에 '제안'으로 남깁니다.
// 규칙: 고정(locked) 필드는 덮어쓰지 않고 history에 제안(proposal)으로만 남깁니다. 같은 dc_id+url 근거는 중복 추가하지 않습니다.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { applyAuto, addEvidence, validateData, slug, stamp, normalizeField, CATEGORIES, applyCompanyEdit, validateCompanies, PLAYERS, isNum } from '../lib/model.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FILES = ['dcs', 'evidence', 'history', 'sources', 'runs', 'companies', 'targets'];
const norm = s => String(s || '').toLowerCase().replace(/㈜|\(주\)|주식회사|데이터센터|idc|센터/g, '').replace(/[\s·.,()\[\]&'’\-_/]/g, '');

export function ingest(data, findings, now = new Date().toISOString()) {
  let { dcs, evidence, history, sources, runs, companies = [], targets = [] } = data;
  const s = { new_dcs: 0, updated: 0, evidence: 0, proposals: 0, errors: Number(findings.errors || 0), notes: [], companies: 0, new_companies: 0, targets: 0 };
  for (const item of findings.items || []) {
    try {
      let id = item.dc_id;
      if (!id && item.new) {
        const name = normalizeField('name', item.new.name);
        if (!name) throw new Error('신규 센터명 없음');
        const dup = dcs.find(d => norm(d.name) === norm(name) || (d.aliases || []).some(a => norm(a) === norm(name)));
        if (dup) id = dup.id; // 이미 있는 센터면 갱신으로 처리
        else {
          const want = /^[a-z0-9][a-z0-9-]{1,39}$/.test(String(item.new.id || '')) ? item.new.id : slug(name);
          let nid = want || 'dc', n = 2; const base = nid;
          while (dcs.some(d => d.id === nid)) nid = `${base}-${n++}`;
          const dc = { id: nid, name, aliases: Array.isArray(item.new.aliases) ? item.new.aliases : [], category: CATEGORIES.includes(item.new.category) ? item.new.category : '상용',
            status: '설계중', phase: '개발', owner: '', contractor: '', operator: '', address: '', lat: null, lng: null, power_mw: null, it_mw: null,
            start_ym: '', complete_ym: '', rfs_ym: '', note: String(item.new.note || ''), conf: {}, locked: {}, permit_ref: null, player: '',
            created_at: now, updated_at: now, updated_by: 'auto' };
          dcs = [...dcs, dc].sort((a, b) => a.id.localeCompare(b.id));
          history = [...history, { id: `h-${nid}-${stamp(now)}-create`, dc_id: nid, at: now, field: '_create', old: '', new: name, by: 'auto', note: '자동수집 신규 등록' }];
          id = nid; s.new_dcs++;
          // 신규 센터의 기본 속성(주소·사업자 등)은 updates로 함께 반영
          const extra = {};
          for (const f of ['category', 'status', 'owner', 'contractor', 'operator', 'address', 'lat', 'lng', 'power_mw', 'it_mw', 'start_ym', 'complete_ym', 'rfs_ym'])
            if (item.new[f] !== undefined && item.new[f] !== '' && item.new[f] !== null && !(item.updates || {})[f]) extra[f] = { value: item.new[f], conf: (item.new.conf || {})[f] || '추정', note: '자동수집 신규 등록' };
          item.updates = { ...extra, ...(item.updates || {}) };
        }
      }
      if (!id || !dcs.some(d => d.id === id)) throw new Error(`센터 없음: ${id || '(id 없음)'}`);
      if (item.updates && Object.keys(item.updates).length) {
        const r = applyAuto(dcs, history, id, item.updates, now, 'auto');
        dcs = r.dcs; history = r.history; s.updated += r.updated; s.proposals += r.proposals;
      }
      for (const ev of item.evidence || []) {
        const r = addEvidence(evidence, history, { ...ev, dc_id: id }, now, 'auto');
        evidence = r.evidence; history = r.history; if (r.added) s.evidence++;
      }
    } catch (e) { s.errors++; s.notes.push(String(e.message || e)); }
  }
  // 회사 프로필
  const CO_FIELDS = ['name', 'aliases', 'type', 'roles', 'major', 'parent', 'note', 'url'];
  for (const c of findings.companies || []) {
    try {
      const cur = c.id ? companies.find(x => x.id === c.id) : companies.find(x => [x.name, ...(x.aliases || [])].includes(c.name));
      const humanFields = new Set((cur?.log || []).filter(l => l.editor && l.editor !== 'auto').flatMap(l => l.fields || []));
      const input = cur ? { id: cur.id, ...Object.fromEntries(CO_FIELDS.map(f => [f, cur[f]])) } : { name: c.name };
      for (const f of CO_FIELDS) {
        if (c[f] === undefined) continue;
        if (cur && humanFields.has(f) && JSON.stringify(cur[f]) !== JSON.stringify(c[f])) { s.proposals++; s.notes.push(`${cur.name}.${f}: 사람이 고친 값 유지(제안 ${JSON.stringify(c[f]).slice(0, 60)})`); continue; }
        input[f] = c[f];
      }
      const r = applyCompanyEdit(companies, input, 'auto', now);
      if (r.changed.length) {
        companies = r.companies.map(x => (x.id === r.id ? { ...x, updated_by: 'auto' } : x));
        if (cur) s.companies++; else s.new_companies++;
      }
    } catch (e) { s.errors++; s.notes.push(`회사 ${c.name || c.id}: ${e.message}`); }
  }
  // 핵심 사업자 목표·현황
  const T_FIELDS = ['target_mw', 'year', 'basis', 'note', 'url', 'reported_mw', 'reported_n', 'reported_basis', 'reported_url'];
  for (const t of findings.targets || []) {
    try {
      if (!PLAYERS.includes(t.player)) throw new Error(`핵심 사업자가 아닙니다: ${t.player}`);
      const cur = targets.find(x => x.player === t.player) || { player: t.player };
      const next = { ...cur };
      for (const f of T_FIELDS) {
        if (t[f] === undefined) continue;
        if (['target_mw', 'year', 'reported_mw', 'reported_n'].includes(f) && t[f] !== null && !isNum(t[f])) throw new Error(`${f}는 숫자여야 합니다`);
        if (/url$/.test(f) && t[f] && !/^https?:\/\//.test(t[f])) throw new Error(`${f}는 http(s) 주소여야 합니다`);
        next[f] = ['target_mw', 'year', 'reported_mw', 'reported_n'].includes(f) && t[f] !== null ? Number(t[f]) : t[f];
      }
      if (JSON.stringify(next) !== JSON.stringify(cur)) {
        next.updated_at = now;
        targets = targets.some(x => x.player === t.player) ? targets.map(x => (x.player === t.player ? next : x)) : [...targets, next];
        s.targets++;
      }
    } catch (e) { s.errors++; s.notes.push(`목표 ${t.player}: ${e.message}`); }
  }
  const hits = new Map((findings.sources || []).map(x => [x.id, Number(x.hits || 0)]));
  sources = sources.map(src => (hits.has(src.id) ? { ...src, last_run: now, last_hits: hits.get(src.id) } : src));
  const kind = findings.kind || '자동수집';
  const run = { id: `r-${stamp(now).slice(0, 8)}-${kind === '자동수집' ? 'news' : 'players'}`, at: now, kind, checked: hits.size || (findings.companies || []).length, new_dcs: s.new_dcs, updated: s.updated + s.companies + s.targets,
    evidence: s.evidence, proposals: s.proposals, errors: s.errors,
    summary: String(findings.summary || '').trim() || (s.new_dcs + s.updated + s.evidence + s.proposals + s.companies + s.new_companies + s.targets ? '' : '변경 없음') + (s.notes.length ? ` 오류: ${s.notes.slice(0, 3).join(' / ')}` : '') };
  runs = [...runs.filter(r => r.id !== run.id), run].slice(-400);
  return { dcs, evidence, history, sources, runs, companies, targets, stats: s };
}

async function main() {
  const file = process.argv[2];
  if (!file) { console.error('사용: node scripts/ingest.mjs findings.json [--now=ISO] [--dry]'); process.exit(2); }
  const now = (process.argv.find(a => a.startsWith('--now=')) || '').slice(6) || new Date().toISOString();
  const dry = process.argv.includes('--dry');
  const findings = JSON.parse(await readFile(file, 'utf8'));
  const data = {};
  for (const n of FILES) data[n] = JSON.parse(await readFile(path.join(ROOT, 'data', `${n}.json`), 'utf8'));
  const out = ingest(data, findings, now);
  const problems = [...validateData(out), ...validateCompanies(out.companies)];
  if (problems.length) { console.error('검증 실패:\n' + problems.slice(0, 20).join('\n')); process.exit(1); }
  if (!dry) for (const n of FILES) await writeFile(path.join(ROOT, 'data', `${n}.json`), JSON.stringify(out[n], null, 2) + '\n');
  const st = out.stats;
  console.log(`${dry ? '[dry] ' : ''}신규 ${st.new_dcs} · 갱신 필드 ${st.updated} · 근거 ${st.evidence} · 제안 ${st.proposals} · 회사 갱신 ${st.companies}/신규 ${st.new_companies} · 목표 ${st.targets} · 오류 ${st.errors}${st.notes.length ? '\n' + st.notes.join('\n') : ''}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
