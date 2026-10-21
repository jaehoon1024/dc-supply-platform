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
//     { "new": { "name": "신규 센터명", "category": "상용", "address": "..." },   // 신규 센터 (id는 자동 생성)
//       "updates": { ... }, "evidence": [ ... ] }
//   ],
//   "errors": 0,
//   "summary": "한국어 2~3문장"
// }
// 규칙: 고정(locked) 필드는 덮어쓰지 않고 history에 제안(proposal)으로만 남깁니다. 같은 dc_id+url 근거는 중복 추가하지 않습니다.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { applyAuto, addEvidence, validateData, slug, stamp, normalizeField, CATEGORIES } from '../lib/model.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FILES = ['dcs', 'evidence', 'history', 'sources', 'runs'];
const norm = s => String(s || '').toLowerCase().replace(/㈜|\(주\)|주식회사|데이터센터|idc|센터/g, '').replace(/[\s·.,()\[\]&'’\-_/]/g, '');

export function ingest(data, findings, now = new Date().toISOString()) {
  let { dcs, evidence, history, sources, runs } = data;
  const s = { new_dcs: 0, updated: 0, evidence: 0, proposals: 0, errors: Number(findings.errors || 0), notes: [] };
  for (const item of findings.items || []) {
    try {
      let id = item.dc_id;
      if (!id && item.new) {
        const name = normalizeField('name', item.new.name);
        if (!name) throw new Error('신규 센터명 없음');
        const dup = dcs.find(d => norm(d.name) === norm(name) || (d.aliases || []).some(a => norm(a) === norm(name)));
        if (dup) id = dup.id; // 이미 있는 센터면 갱신으로 처리
        else {
          let nid = slug(name) || 'dc', n = 2; const base = nid;
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
  const hits = new Map((findings.sources || []).map(x => [x.id, Number(x.hits || 0)]));
  sources = sources.map(src => (hits.has(src.id) ? { ...src, last_run: now, last_hits: hits.get(src.id) } : src));
  const run = { id: `r-${stamp(now).slice(0, 8)}-news`, at: now, kind: '자동수집', checked: hits.size, new_dcs: s.new_dcs, updated: s.updated,
    evidence: s.evidence, proposals: s.proposals, errors: s.errors,
    summary: String(findings.summary || '').trim() || (s.new_dcs + s.updated + s.evidence + s.proposals ? '' : '변경 없음') + (s.notes.length ? ` 오류: ${s.notes.slice(0, 3).join(' / ')}` : '') };
  runs = [...runs.filter(r => r.id !== run.id), run].slice(-400);
  return { dcs, evidence, history, sources, runs, stats: s };
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
  const problems = validateData(out);
  if (problems.length) { console.error('검증 실패:\n' + problems.slice(0, 20).join('\n')); process.exit(1); }
  if (!dry) for (const n of FILES) await writeFile(path.join(ROOT, 'data', `${n}.json`), JSON.stringify(out[n], null, 2) + '\n');
  const st = out.stats;
  console.log(`${dry ? '[dry] ' : ''}신규 ${st.new_dcs} · 갱신 필드 ${st.updated} · 근거 ${st.evidence} · 제안 ${st.proposals} · 오류 ${st.errors}${st.notes.length ? '\n' + st.notes.join('\n') : ''}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
