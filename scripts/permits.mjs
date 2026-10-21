// 국토교통부 건축HUB 건축인허가 기본개요 동기화 (Vercel Cron이 매일 08:00 KST에 /api/permits?sync=1 호출)
// - data/dcs.json 중 permit_ref(시군구코드·법정동코드·번·지)가 있는 센터를 조회합니다.
// - 허가·착공·사용승인일을 data/permits.json에 저장하고, 센터의 착공월·준공월·상태를 A등급 근거로 갱신합니다.
// - 사람이 고정한 필드는 덮어쓰지 않고 히스토리에 '제안'으로만 남깁니다.
// 필요: 환경변수 BUILDING_HUB_KEY (data.go.kr 일반 인증키, Decoding 값)
import { readFile, writeFile } from 'node:fs/promises';
import { applyAuto, addEvidence, stamp } from '../lib/model.js';

const ENDPOINT = 'https://apis.data.go.kr/1613000/ArchPmsHubService/getApBasisOulnInfo';
const DC_HINT = /(데이터|IDC|전산|클라우드|AI|방송통신)/i;

const ym = d => (/^\d{8}$/.test(String(d || '').trim()) ? `${String(d).slice(0, 4)}-${String(d).slice(4, 6)}` : '');
const day = d => (/^\d{8}$/.test(String(d || '').trim()) ? `${String(d).slice(0, 4)}-${String(d).slice(4, 6)}-${String(d).slice(6, 8)}` : '');
export const stageOf = p => (p.useAprDay ? '준공' : p.realStcnsDay ? '공사 중' : '착공 전');

// 건축HUB는 초당 요청 수 제한이 있어(초과 시 HTTP 429) 요청 간격을 두고, 429·5xx는 지수 백오프로 재시도합니다.
export const LIMIT = { gapMs: Number(process.env.PERMIT_GAP_MS ?? 350), retries: 4, backoffMs: 1000 };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let nextSlot = 0;
async function throttle() {
  const now = Date.now(), wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + LIMIT.gapMs;
  if (wait) await sleep(wait);
}

async function fetchPage(ref, key, pageNo, fetchImpl) {
  const q = new URLSearchParams({ serviceKey: key, sigunguCd: ref.sigunguCd, bjdongCd: ref.bjdongCd, numOfRows: '100', pageNo: String(pageNo), _type: 'json' });
  if (ref.bun) { q.set('platGbCd', ref.platGbCd === '1' ? '1' : '0'); q.set('bun', ref.bun.padStart(4, '0')); q.set('ji', (ref.ji || '0').padStart(4, '0')); }
  let res, text;
  for (let attempt = 0; ; attempt++) {
    await throttle();
    res = await fetchImpl(`${ENDPOINT}?${q}`);
    text = await res.text();
    // 한도 초과는 429 외에 빈 응답·XML 오류(LIMITED_NUMBER_OF_SERVICE_REQUESTS…)로 오기도 해서 함께 재시도합니다.
    const body = text.trim();
    const retryable = res.status === 429 || res.status >= 500 || (res.ok && (!body || (body[0] !== '{' && /LIMIT|EXCEED|초과/i.test(body))));
    if (!retryable || attempt >= LIMIT.retries) break;
    const ra = Number(res.headers?.get?.('retry-after'));
    await sleep(ra > 0 ? ra * 1000 : LIMIT.backoffMs * 2 ** attempt + Math.random() * 300);
  }
  if (!res.ok) throw new Error(`건축HUB HTTP ${res.status}: ${text.slice(0, 200)}`);
  let j; try { j = JSON.parse(text); } catch { throw new Error(text.trim() ? `건축HUB 응답이 JSON이 아닙니다(인증키·활용신청 확인): ${text.slice(0, 160)}` : '건축HUB 빈 응답(요청 한도 초과로 추정, 재시도 후에도 실패)'); }
  const code = j?.response?.header?.resultCode;
  if (code && code !== '00') throw new Error(`건축HUB 오류 ${code}: ${j.response.header.resultMsg}`);
  const items = j?.response?.body?.items?.item;
  return { items: Array.isArray(items) ? items : items ? [items] : [], total: Number(j?.response?.body?.totalCount || 0) };
}

/** 인허가 목록 조회. 번지가 없으면 법정동 전체를 최대 maxPages×100건까지 넘겨 봅니다. */
export async function fetchPermits(ref, key, fetchImpl = fetch, maxPages = ref.bun ? 1 : 5) {
  const first = await fetchPage(ref, key, 1, fetchImpl);
  let all = first.items;
  for (let p = 2; p <= Math.min(maxPages, Math.ceil(first.total / 100)); p++) all = all.concat((await fetchPage(ref, key, p, fetchImpl)).items);
  return all;
}

export const isDcPermit = it => DC_HINT.test(`${it.bldNm || ''} ${it.mainPurpsCdNm || ''} ${it.etcPurps || ''}`);
export const toPermit = (it, dc_id, now) => {
  const p = { id: String(it.mgmPmsrgstPk || `${it.sigunguCd}${it.bjdongCd}-${it.bun}-${it.ji}-${it.bldNm || ''}`), dc_id, bldNm: it.bldNm || '', platPlc: it.platPlc || '',
    mainPurpsCdNm: it.mainPurpsCdNm || '', totArea: Number(it.totArea || 0) || null, archPmsDay: day(it.archPmsDay),
    stcnsSchedDay: day(it.stcnsSchedDay), realStcnsDay: day(it.realStcnsDay), useAprDay: day(it.useAprDay), fetched_at: now };
  p.stage = stageOf(p); return p;
};

/** 센터와 가장 잘 맞는 인허가 1건 선택 */
export function pickPermit(items, dc, { dongLevel = false, shared = 1 } = {}) {
  if (!items.length) return null;
  const name = String(dc.name || '').replace(/\s/g, '');
  const scored = items.map(it => {
    let s = 0; const nm = String(it.bldNm || '').replace(/\s/g, '');
    if (nm && name && (nm.includes(name) || name.includes(nm))) s += 5;
    if (DC_HINT.test(`${it.bldNm || ''} ${it.mainPurpsCdNm || ''}`)) s += 3;
    s += Math.min(2, Number(it.totArea || 0) / 50000);
    return { it, s };
  }).sort((a, b) => b.s - a.s);
  const top = scored[0];
  if (!dongLevel) return top.s >= 3 ? top.it : null;
  // 법정동 단위 조회: 이름이 맞거나, 그 동에 데이터센터성 인허가가 1건뿐일 때만 연결
  const nameHit = top.s >= 5 && String(top.it.bldNm || '').replace(/\s/g, '') !== '';
  const dcOnes = items.filter(isDcPermit);
  return nameHit && isDcPermit(top.it) ? top.it : dcOnes.length === 1 && shared <= 1 ? dcOnes[0] : null; // 같은 동에 센터가 여럿이면 이름 일치만 허용
}

export async function syncPermits(data, { key, fetchImpl = fetch, now = new Date().toISOString(), log = console.log } = {}) {
  let { dcs, evidence, history, permits, runs } = data;
  const targets = dcs.filter(d => d.permit_ref && d.permit_ref.sigunguCd && d.permit_ref.bjdongCd);
  const dongKey = d => `${d.permit_ref.sigunguCd}${d.permit_ref.bjdongCd}`;
  const shareCount = {}; targets.forEach(d => { shareCount[dongKey(d)] = (shareCount[dongKey(d)] || 0) + 1; });
  const stats = { checked: 0, matched: 0, updated: 0, proposals: 0, evidence: 0, errors: 0, notes: [] };
  const cache = new Map(); // 같은 법정동·지번은 한 번만 조회
  const get = ref => { const k = JSON.stringify(ref); if (!cache.has(k)) cache.set(k, fetchPermits(ref, key, fetchImpl)); return cache.get(k); };
  for (const dc of targets) {
    stats.checked++;
    try {
      const it = pickPermit(await get(dc.permit_ref), dc, { dongLevel: !dc.permit_ref.bun, shared: shareCount[dongKey(dc)] });
      if (!it) { stats.notes.push(`${dc.name}: 일치하는 인허가 없음`); continue; }
      stats.matched++;
      const p = toPermit(it, dc.id, now);
      permits = [...permits.filter(x => x.id !== p.id), p];
      const url = `https://www.hub.go.kr/portal/opn/tyb/idx-acpmslg.do#${encodeURIComponent(p.id)}`;
      const note = `건축HUB 인허가 (${p.bldNm || p.platPlc})`;
      const upd = {};
      if (p.archPmsDay && (dc.prep?.permit?.state !== '허가' || dc.prep?.permit?.c !== '확정')) {
        const site = dc.prep?.site || { state: '확보', ym: '', c: '추정', note: '건축허가로부터 추정' };
        upd.prep = { value: { ...(dc.prep || {}), site, permit: { state: '허가', ym: ym(it.archPmsDay), c: '확정', note: '건축HUB 허가일' } }, note: `${note} 건축허가`, evidence_url: url };
      }
      if (p.realStcnsDay) upd.start_ym = { value: ym(it.realStcnsDay), conf: '확정', note, evidence_url: url };
      if (p.useAprDay) upd.complete_ym = { value: ym(it.useAprDay), conf: '확정', note, evidence_url: url };
      if (p.useAprDay && ['설계중', '착공', '개발중'].includes(dc.status)) upd.status = { value: '준공', conf: '확정', note: `${note} 사용승인`, evidence_url: url };
      else if (p.realStcnsDay && dc.status === '설계중') upd.status = { value: '착공', conf: '확정', note: `${note} 착공`, evidence_url: url };
      if (Object.keys(upd).length) {
        const r = applyAuto(dcs, history, dc.id, upd, now, 'auto');
        dcs = r.dcs; history = r.history; stats.updated += r.updated; stats.proposals += r.proposals;
        if (r.updated || r.proposals) {
          const e = addEvidence(evidence, history, { dc_id: dc.id, url, title: `건축인허가 기본개요 – ${p.bldNm || dc.name}`, publisher: '국토교통부 건축HUB',
            pub_date: now.slice(0, 10), grade: 'A', fields: Object.keys(upd).map(f => ({ start_ym: '착공월', complete_ym: '준공월', status: '상태' })[f]),
            excerpt: `허가 ${p.archPmsDay || '-'} · 착공 ${p.realStcnsDay || '-'} · 사용승인 ${p.useAprDay || '-'} · 연면적 ${p.totArea ?? '-'}㎡ · ${p.platPlc}`,
            source_id: 's02' }, now, 'auto');
          evidence = e.evidence; history = e.history; if (e.added) stats.evidence++;
        }
      }
    } catch (e) { stats.errors++; stats.notes.push(`${dc.name}: ${e.message}`); log(`오류 ${dc.name}: ${e.message}`); }
  }
  const run = { id: `r-${stamp(now)}-permits`, at: now, kind: '건축HUB 동기화', checked: stats.checked, new_dcs: 0, updated: stats.updated,
    evidence: stats.evidence, proposals: stats.proposals, errors: stats.errors,
    summary: targets.length ? `인허가 연결 센터 ${targets.length}곳 조회, ${stats.matched}곳 일치, 필드 ${stats.updated}개 갱신, 제안 ${stats.proposals}건.${stats.notes.length ? ' ' + stats.notes.slice(0, 3).join(' / ') : ''}`
      : '인허가 연결(permit_ref)이 설정된 센터가 없습니다. 상세 페이지에서 시군구·법정동 코드를 입력하세요.' };
  return { dcs, evidence, history, permits, runs: [...runs, run].slice(-400), stats };
}

async function main() {
  const key = process.env.BUILDING_HUB_KEY;
  if (!key) { console.log('BUILDING_HUB_KEY가 없어 건축HUB 동기화를 건너뜁니다.'); return; }
  const names = ['dcs', 'evidence', 'history', 'permits', 'runs'];
  const data = Object.fromEntries(await Promise.all(names.map(async n => [n, JSON.parse(await readFile(`data/${n}.json`, 'utf8'))])));
  const out = await syncPermits(data, { key });
  for (const n of names) await writeFile(`data/${n}.json`, JSON.stringify(out[n], null, 2) + '\n');
  console.log(out.runs.at(-1).summary);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
