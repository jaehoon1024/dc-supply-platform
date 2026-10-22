// 도로명주소 API(행정안전부 business.juso.go.kr)로 센터 주소 표준화 (Vercel Cron이 매일 07시대에 /api/address?sync=1 호출)
// - 지번·도로명 번호가 있는 주소: 표준 주소(도로명·지번·건물명·법정동코드)를 찾아 dc.addr_std에 저장합니다. 주소 칸은 그대로 둡니다.
// - 시·군·구까지만 있는 주소: 센터명·별칭으로 건물명을 검색해 1곳으로 좁혀지면 지번 주소로 채웁니다(추정 — 확인 필요).
// - 인허가 연결(permit_ref)이 비어 있으면 법정동코드·번지로 채워, 다음 건축HUB 동기화에서 연면적·착공·준공을 받아옵니다.
// - 사람이 고정한 주소·인허가 연결은 덮어쓰지 않고 히스토리에 '제안'으로 남깁니다.
// - 주소가 바뀌지 않은 센터는 다시 조회하지 않습니다(addr_std.src = 조회에 쓴 주소).
// 필요: 환경변수 JUSO_KEY (도로명주소 검색 API 승인키)
import { applyAuto, addEvidence, parseSido, stamp } from '../lib/model.js';

const ENDPOINT = 'https://business.juso.go.kr/addrlink/addrLinkApi.do';
const sleep = ms => new Promise(r => setTimeout(r, ms));
export const LIMIT = { gapMs: Number(process.env.JUSO_GAP_MS ?? 150), retries: 2 };

// 검색어 정리: 괄호 설명, '외 N필지', 특수문자 제거 (API가 특수문자·SQL 예약어를 거부)
export function cleanKeyword(s) {
  return String(s || '').replace(/\(.*?\)/g, ' ').replace(/외\s*\d+\s*필지/g, ' ').replace(/일원|일대|번지/g, ' ')
    .replace(/[%=><\[\]{}'"`;:#&|\\^*+!?~]/g, ' ').replace(/\b(OR|SELECT|INSERT|DELETE|UPDATE|CREATE|DROP|EXEC|UNION|FETCH|DECLARE|TRUNCATE)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

export async function jusoSearch(keyword, key, fetchImpl = fetch, count = 10) {
  const q = new URLSearchParams({ confmKey: key, currentPage: '1', countPerPage: String(count), keyword, resultType: 'json' });
  let res, text;
  for (let a = 0; ; a++) {
    await sleep(LIMIT.gapMs);
    res = await fetchImpl(`${ENDPOINT}?${q}`);
    text = await res.text();
    if ((res.status === 429 || res.status >= 500) && a < LIMIT.retries) { await sleep(800 * 2 ** a); continue; }
    break;
  }
  if (!res.ok) throw new Error(`도로명주소 HTTP ${res.status}`);
  let j; try { j = JSON.parse(text); } catch { throw new Error(`도로명주소 응답이 JSON이 아닙니다: ${text.slice(0, 120)}`); }
  const c = j?.results?.common || {};
  if (String(c.errorCode ?? '0') !== '0') throw Object.assign(new Error(`도로명주소 오류 ${c.errorCode}: ${c.errorMessage}`), { code: String(c.errorCode) });
  return j?.results?.juso || [];
}

const norm = s => String(s || '').replace(/\s+/g, '').replace(/번지/g, '');
const GENERIC = /(데이터센터|데이터|센터|캠퍼스|AI|AIDC|IDC|DC|하이퍼스케일|클라우드|신축|사업|프로젝트|제\d+|\d+호|단계|1차|2차|3차)/gi;
export const nameTokens = dc => [...new Set([dc.name, ...(dc.aliases || [])]
  .flatMap(n => String(n || '').replace(/\(.*?\)/g, ' ').replace(GENERIC, ' ').split(/[\s·,/]+/))
  .map(t => t.trim()).filter(t => t.length >= 2 && !/^(서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)$/.test(t)))];

export const toStd = (j, src, how, now) => ({
  src, how, road: j.roadAddrPart1 || j.roadAddr || '', jibun: j.jibunAddr || '', bdNm: j.bdNm || '', zip: j.zipNo || '',
  admCd: j.admCd || '', bun: String(j.lnbrMnnm || ''), ji: String(j.lnbrSlno || '0'), mt: String(j.mtYn || '0'),
  // 좌표제공 API용 키
  rnMgtSn: j.rnMgtSn || '', udrtYn: j.udrtYn || '0', buldMnnm: String(j.buldMnnm || ''), buldSlno: String(j.buldSlno || '0'), at: now
});

/** 결과 중 주소와 맞는 1곳 고르기 (번지 있는 주소): 지번(동+본번-부번) 또는 도로명(도로명+건물번호)이 같아야 합니다 */
export function pickByAddress(list, keyword) {
  if (!list.length) return null;
  const m = String(keyword).match(/(\d+)(?:-(\d+))?\s*$/);
  if (!m) return null;
  const [main, sub] = [m[1], m[2] || '0'], k = norm(keyword);
  const eq = (a, b) => String(Number(a || 0)) === String(Number(b || 0));
  const hits = list.filter(j => (j.emdNm && k.includes(norm(j.emdNm)) && eq(j.lnbrMnnm, main) && eq(j.lnbrSlno, sub))
    || (j.rn && k.includes(norm(j.rn)) && eq(j.buldMnnm, main) && eq(j.buldSlno, sub)));
  const lots = new Set(hits.map(j => `${j.admCd}-${j.lnbrMnnm}-${j.lnbrSlno}`));
  return lots.size >= 1 ? hits[0] : null;
}

/** 결과 중 센터명과 건물명이 맞는 1곳 고르기 (시·군·구까지만 있는 주소) */
export function pickByName(list, dc, sigungu) {
  const toks = nameTokens(dc).map(norm);
  const hits = list.filter(j => (!sigungu || norm(j.sggNm).includes(norm(sigungu)) || norm(j.jibunAddr).includes(norm(sigungu)))
    && toks.some(t => norm(j.bdNm).includes(t)));
  const lots = new Set(hits.map(j => `${j.admCd}-${j.lnbrMnnm}-${j.lnbrSlno}`));
  return lots.size === 1 ? hits[0] : null;
}

const permitRefOf = s => (s.admCd?.length === 10 && s.bun ? { sigunguCd: s.admCd.slice(0, 5), bjdongCd: s.admCd.slice(5, 10), bun: s.bun, ji: s.ji && s.ji !== '0' ? s.ji : '', ...(s.mt === '1' ? { platGbCd: '1' } : {}) } : null);

export async function refineAddresses(data, { key, fetchImpl = fetch, now = new Date().toISOString(), budgetMs = Infinity, log = () => {} } = {}) {
  const t0 = Date.now();
  let { dcs, evidence, history, runs } = data;
  const todo = dcs.filter(d => String(d.address || '').trim() && d.addr_std?.src !== d.address)
    .sort((a, b) => String(a.addr_std?.at || '').localeCompare(String(b.addr_std?.at || '')) || a.id.localeCompare(b.id));
  const st = { checked: 0, matched: 0, filled: 0, permit_refs: 0, updated: 0, proposals: 0, evidence: 0, nomatch: 0, errors: 0, notes: [] };
  let partial = false;
  for (const dc0 of todo) {
    if (Date.now() - t0 > budgetMs) { partial = true; break; }
    const dc = dcs.find(d => d.id === dc0.id);
    const { rest } = parseSido(dc.address);
    const hasLot = /\d/.test(rest);
    st.checked++;
    try {
      let hit = null, how = '';
      if (hasLot) {
        const kw = cleanKeyword(dc.address);
        hit = pickByAddress(await jusoSearch(kw, key, fetchImpl), kw); how = '주소';
      } else {
        const sigungu = rest.split(/\s+/)[0] || '';
        for (const t of nameTokens(dc).slice(0, 3)) {
          const kw = cleanKeyword(`${sigungu} ${t}`);
          if (kw.length < 3) continue;
          hit = pickByName(await jusoSearch(kw, key, fetchImpl), dc, sigungu);
          if (hit) { how = `건물명(${t})`; break; }
        }
      }
      const std = hit ? toStd(hit, dc.address, how, now) : { src: dc.address, how: hasLot ? '주소' : '건물명', status: '미일치', at: now };
      if (!hit) st.nomatch++; else st.matched++;
      const upd = {};
      const url = `https://business.juso.go.kr/addrlink/main.do#${encodeURIComponent(std.jibun || dc.address)}`;
      if (hit && !hasLot && std.jibun) { upd.address = { value: std.jibun, conf: '추정', note: `도로명주소 API 건물명 일치(${std.bdNm}) — 확인 필요`, evidence_url: url }; std.src = std.jibun; }
      const ref = hit ? permitRefOf(std) : null;
      if (ref && !dc.permit_ref) upd.permit_ref = { value: ref, note: `도로명주소 API 법정동코드·번지 (${std.jibun})`, evidence_url: url };
      if (Object.keys(upd).length) {
        const r = applyAuto(dcs, history, dc.id, upd, now, 'auto');
        dcs = r.dcs; history = r.history; st.updated += r.updated; st.proposals += r.proposals;
        if (upd.address && r.updated) st.filled++;
        if (upd.permit_ref && r.updated) st.permit_refs++;
        if (r.updated) {
          const e = addEvidence(evidence, history, { dc_id: dc.id, url, title: `도로명주소 – ${std.road || std.jibun}`, publisher: '행정안전부 도로명주소', pub_date: now.slice(0, 10),
            grade: hasLot ? 'A' : 'B', fields: [upd.address ? '주소' : '', upd.permit_ref ? '인허가 연결' : ''].filter(Boolean),
            excerpt: `도로명 ${std.road} · 지번 ${std.jibun}${std.bdNm ? ' · 건물명 ' + std.bdNm : ''} · 법정동코드 ${std.admCd}`, source_id: 's03' }, now, 'auto');
          evidence = e.evidence; history = e.history; if (e.added) st.evidence++;
        }
      }
      dcs = dcs.map(d => (d.id === dc.id ? { ...d, addr_std: std } : d)); // 메타 정보(히스토리 없음)
    } catch (e) {
      st.errors++; st.notes.push(`${dc.name}: ${e.message}`); log(`오류 ${dc.name}: ${e.message}`);
      if (['E0001', '-999'].includes(e.code)) break; // 승인키 오류·시스템 오류면 중단
    }
  }
  const run = { id: `r-${stamp(now)}-address`, at: now, kind: '도로명주소 정제', checked: st.checked, new_dcs: 0, updated: st.updated, evidence: st.evidence, proposals: st.proposals, errors: st.errors,
    summary: todo.length ? `주소 미정제 ${todo.length}곳 중 ${st.checked}곳 조회${partial ? '(시간 제한으로 중단 — 다음 실행에서 이어서)' : ''}: 표준주소 일치 ${st.matched}, 미일치 ${st.nomatch}, 지번 보완 ${st.filled}, 인허가 연결 ${st.permit_refs}, 제안 ${st.proposals}.${st.notes.length ? ' ' + st.notes.slice(0, 3).join(' / ') : ''}`
      : '새로 정제할 주소가 없습니다.' };
  return { dcs, evidence, history, runs: [...runs, run].slice(-400), stats: st };
}
