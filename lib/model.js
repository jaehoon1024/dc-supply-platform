// 공용 도메인 규칙 — 브라우저(app.js), Vercel 함수(api/), 수집 스크립트(scripts/)가 함께 사용합니다.

export const STATUSES = ['설계중', '착공', '개발중', '준공', '운영중'];
export const CATEGORIES = ['자체', '상용'];
export const CONF_FIELDS = ['owner', 'contractor', 'operator', 'address', 'power_mw', 'it_mw', 'status', 'start_ym', 'complete_ym', 'rfs_ym'];
export const EDITABLE = ['name', 'aliases', 'category', 'status', 'owner', 'contractor', 'operator', 'power_mw', 'it_mw',
  'start_ym', 'complete_ym', 'rfs_ym', 'address', 'lat', 'lng', 'note', 'permit_ref', 'player', 'prep', 'score_manual', 'dbo', 'campus', 'complaints'];
export const NUMERIC = ['power_mw', 'it_mw', 'lat', 'lng'];
export const LABEL = {
  name: '센터명', aliases: '별칭', category: '구분', owner: '개발사(발주처)', contractor: '시공사', operator: '운영사', address: '주소',
  sido: '시도', sigungu: '시군구', lat: '위도', lng: '경도', power_mw: '수전용량(MW)', it_mw: 'IT Load(MW)', status: '상태', phase: '단계',
  start_ym: '착공월', complete_ym: '준공월', rfs_ym: 'RFS', note: '비고', permit_ref: '인허가 연결', player: '사업자', prep: '준비단계', score_manual: '가치점수 수동 보정', dbo: 'DBO', campus: '캠퍼스·단계', complaints: '민원·인허가 리스크',
  _create: '신규 등록', _evidence: '근거 추가'
};

export const SIDO = [
  ['서울', ['서울특별시', '서울시', '서울'], [37.41, 37.72, 126.76, 127.19]],
  ['부산', ['부산광역시', '부산시', '부산'], [34.88, 35.40, 128.76, 129.31]],
  ['대구', ['대구광역시', '대구시', '대구'], [35.60, 36.02, 128.35, 128.77]],
  ['인천', ['인천광역시', '인천시', '인천'], [37.00, 37.98, 124.60, 126.80]],
  ['광주', ['광주광역시', '광주'], [35.05, 35.26, 126.64, 127.02]],
  ['대전', ['대전광역시', '대전시', '대전'], [36.18, 36.50, 127.24, 127.56]],
  ['울산', ['울산광역시', '울산시', '울산'], [35.32, 35.73, 128.96, 129.47]],
  ['세종', ['세종특별자치시', '세종시', '세종'], [36.40, 36.74, 127.13, 127.40]],
  ['경기', ['경기도', '경기'], [36.89, 38.30, 126.36, 127.86]],
  ['강원', ['강원특별자치도', '강원도', '강원'], [37.02, 38.62, 127.08, 129.37]],
  ['충북', ['충청북도', '충북'], [36.00, 37.27, 127.27, 128.66]],
  ['충남', ['충청남도', '충남'], [35.97, 37.07, 125.90, 127.66]],
  ['전북', ['전북특별자치도', '전라북도', '전북'], [35.28, 36.16, 125.97, 127.92]],
  ['전남', ['전라남도', '전남'], [33.90, 35.51, 125.00, 127.90]],
  ['경북', ['경상북도', '경북'], [35.56, 37.56, 127.80, 131.00]],
  ['경남', ['경상남도', '경남'], [34.46, 35.92, 127.56, 129.24]],
  ['제주', ['제주특별자치도', '제주도', '제주'], [33.10, 33.60, 126.10, 127.00]]
];
export const REGION_OF = { 서울: '수도권', 경기: '수도권', 인천: '수도권', 대전: '충청', 세종: '충청', 충북: '충청', 충남: '충청',
  광주: '호남', 전북: '호남', 전남: '호남', 부산: '영남', 대구: '영남', 울산: '영남', 경북: '영남', 경남: '영남', 강원: '강원', 제주: '제주' };
export const REGIONS = ['수도권', '충청', '영남', '호남', '강원', '제주'];

export const isNum = v => v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v));
export const phaseOf = st => (st === '운영중' ? '운영' : '개발');
export const confOf = (dc, f) => (dc.conf && dc.conf[f]) || '추정';

/** 'YYYY-MM' | 'YYYY-Qn' | 'YYYY-Hn' | 'YYYY' → 정렬 키 'YYYY-MM' (없으면 null) */
export function ymKey(v) {
  const m = String(v || '').match(/^(\d{4})(?:-(\d{2})|-Q([1-4])|-H([12]))?$/);
  if (!m) return null;
  const mm = m[2] || (m[3] ? String(+m[3] * 3).padStart(2, '0') : m[4] ? (m[4] === '1' ? '06' : '12') : '12');
  return `${m[1]}-${mm}`;
}
export const validYm = v => v === '' || v == null || ymKey(v) !== null;

export function parseSido(addr) {
  const a = String(addr || '').trim();
  for (const [k, names] of SIDO) for (const n of names) if (a.startsWith(n)) return { sido: k, rest: a.slice(n.length).trim() };
  return { sido: null, rest: a };
}
export const regionOf = dc => REGION_OF[dc.sido || parseSido(dc.address).sido] || null;

/** 주소 정합성: 정상 | 부분 | 불일치 | 주소불완전 | 좌표없음 | 미입력 */
export function addrCheck(dc) {
  const addr = String(dc.address || '').trim();
  if (!addr) return { status: '미입력', note: '주소가 비어 있습니다' };
  const { sido, rest } = parseSido(addr);
  if (!sido) return { status: '주소불완전', note: '시·도를 인식할 수 없습니다' };
  const t = rest.split(/\s+/).filter(Boolean);
  const sigungu = sido === '세종' ? '세종' : (t[0] && /(시|군|구)$/.test(t[0]) ? t[0] : null);
  if (!sigungu) return { status: '주소불완전', note: '시·군·구가 없습니다', sido };
  if (dc.sido && dc.sido !== sido) return { status: '불일치', note: `시도 입력값(${dc.sido})과 주소(${sido})가 다릅니다`, sido, sigungu };
  if (!isNum(dc.lat) || !isNum(dc.lng)) return { status: '좌표없음', note: '위경도가 없습니다', sido, sigungu };
  const b = SIDO.find(x => x[0] === sido)[2];
  const lat = Number(dc.lat), lng = Number(dc.lng);
  if (lat < b[0] || lat > b[1] || lng < b[2] || lng > b[3]) return { status: '불일치', note: `좌표가 ${sido} 범위 밖입니다`, sido, sigungu };
  if (!/\d/.test(rest)) return { status: '부분', note: '지번·도로명 번호가 없어 행정동 수준입니다', sido, sigungu };
  return { status: '정상', note: '주소·시도·좌표가 일치합니다', sido, sigungu };
}

export const gmapUrl = dc => (isNum(dc.lat) && isNum(dc.lng)
  ? `https://www.google.com/maps/search/?api=1&query=${dc.lat},${dc.lng}`
  : dc.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dc.address)}` : '');

const fmt = v => (Array.isArray(v) ? v.join(', ') : v && typeof v === 'object' ? JSON.stringify(v) : v ?? '');
const same = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');

/** 입력값 정규화·검증. 잘못되면 Error를 던집니다. */
export function normalizeField(f, v) {
  if (!EDITABLE.includes(f)) throw new Error(`수정할 수 없는 필드입니다: ${f}`);
  if (NUMERIC.includes(f)) {
    if (v === '' || v === null || v === undefined) return null;
    if (!isNum(v)) throw new Error(`${LABEL[f]}에는 숫자를 입력하세요`);
    return Number(v);
  }
  if (f === 'aliases') return (Array.isArray(v) ? v : String(v || '').split(',')).map(s => String(s).trim()).filter(Boolean);
  if (f === 'status' && !STATUSES.includes(v)) throw new Error(`상태는 ${STATUSES.join('/')} 중 하나여야 합니다`);
  if (f === 'category' && !CATEGORIES.includes(v)) throw new Error('구분은 자체/상용 중 하나여야 합니다');
  if (['start_ym', 'complete_ym', 'rfs_ym'].includes(f) && !validYm(v)) throw new Error(`${LABEL[f]} 형식: YYYY-MM, YYYY-Q4, YYYY-H2, YYYY`);
  if (f === 'player') {
    const p = String(v ?? '').trim();
    if (p && ![...PLAYERS, '기타'].includes(p)) throw new Error('사업자는 LG유플러스/KT/SK/LG CNS/기타 중 하나입니다');
    return p;
  }
  if (f === 'prep') return normalizePrep(v);
  if (f === 'dbo') return normalizeDbo(v);
  if (f === 'campus') return normalizeCampus(v);
  if (f === 'complaints') return normalizeComplaints(v);
  if (f === 'score_manual') return normalizeScoreManual(v);
  if (f === 'permit_ref') {
    if (!v) return null;
    const o = { sigunguCd: String(v.sigunguCd || '').trim(), bjdongCd: String(v.bjdongCd || '').trim(), bun: String(v.bun || '').trim(), ji: String(v.ji || '').trim() };
    if (String(v.platGbCd || '') === '1') o.platGbCd = '1'; // 산 지번
    if (!o.sigunguCd && !o.bjdongCd) return null;
    if (!/^\d{5}$/.test(o.sigunguCd) || !/^\d{5}$/.test(o.bjdongCd)) throw new Error('시군구코드·법정동코드는 각각 5자리 숫자입니다');
    return o;
  }
  return String(v ?? '').trim();
}

function derive(dc, now) {
  const ac = addrCheck({ ...dc, sido: '' });
  dc.phase = phaseOf(dc.status);
  dc.sido = ac.sido || '';
  dc.sigungu = ac.sigungu || '';
  dc.addr_check = { status: ac.status, note: ac.note, at: now };
  return dc;
}

/* ---------- DBO: 설계(Design)·구축(Build)·운영(Operate)을 발주처가 아닌 사업자에게 맡겼는지 ---------- */
// type: DBO(설계·구축·운영 일괄) / 부분 DBO(D·B·O 중 일부, 예: 운영(O)만 = 위탁운영) /
//       마스터리스(운영사가 건물 전체를 장기 임차해 직접 운영·재임대) / 자체(발주처·계열사가 직접) / 미상
export const DBO_TYPES = ['DBO', '부분 DBO', '마스터리스', '자체', '미상'];
export const DBO_SCOPE = [{ key: 'D', label: '설계' }, { key: 'B', label: '구축' }, { key: 'O', label: '운영' }];
export const DBO_EXTERNAL = ['DBO', '부분 DBO', '마스터리스']; // 발주처 외 사업자가 맡는 유형
const DBO_LEGACY = { 위탁운영: '부분 DBO' }; // 예전 구분값 호환
export function normalizeDbo(v) {
  if (!v || typeof v !== 'object') return null;
  const raw = String(v.type || '').trim() || '미상', type = DBO_LEGACY[raw] || raw;
  if (!DBO_TYPES.includes(type)) throw new Error(`DBO 구분은 ${DBO_TYPES.join('/')} 중 하나입니다`);
  const scope = DBO_SCOPE.map(x => x.key).filter(k => (Array.isArray(v.scope) ? v.scope : String(v.scope || '').split('')).includes(k));
  const provider = String(v.provider || '').trim().slice(0, 60);
  const note = String(v.note || '').trim().slice(0, 300);
  const c = ['확정', '추정'].includes(v.c) ? v.c : '추정';
  if (type === '미상' && !provider && !note) return null;
  return { type, provider, scope, c, ...(note ? { note } : {}) };
}
/** 센터의 DBO 정보(없으면 미상) */
export const dboOf = dc => dc.dbo || { type: '미상', provider: '', scope: [], c: '' };
export const dboLabel = d => (d.type === '미상' ? '미상' : `${d.type}${d.provider && DBO_EXTERNAL.includes(d.type) ? ' · ' + d.provider : ''}`);

/* ---------- 캠퍼스·단계: 한 사이트를 여러 동·단계로 나눠 짓는 경우 ---------- */
// 센터 레코드는 '현재 확정된 단계'를 나타내고, campus에는 사이트 전체 계획을 적습니다.
// 계획 용량 중 아직 센터(단계)로 등록되지 않은 몫은 '미배정'이며 공급 추정에 넣지 않습니다.
// 다음 단계가 구체화되면 같은 campus.name으로 새 센터를 추가합니다.
export const CAMPUS_BASIS = ['수전', 'IT', '미상'];
export function normalizeCampus(v) {
  if (!v || typeof v !== 'object') return null;
  const name = String(v.name || '').trim().slice(0, 60);
  const phase = String(v.phase || '').trim().slice(0, 30);
  const plan_mw = v.plan_mw === '' || v.plan_mw == null ? null : Number(v.plan_mw);
  if (plan_mw !== null && (!Number.isFinite(plan_mw) || plan_mw < 0)) throw new Error('캠퍼스 계획 용량은 0 이상의 숫자(MW)입니다');
  const basis = CAMPUS_BASIS.includes(v.basis) ? v.basis : '미상';
  const plan_year = String(v.plan_year || '').trim();
  if (plan_year && !validYm(plan_year)) throw new Error('캠퍼스 목표 시점 형식: YYYY, YYYY-MM, YYYY-H2');
  const note = String(v.note || '').trim().slice(0, 300);
  const c = ['확정', '추정'].includes(v.c) ? v.c : '추정';
  if (!name && !phase && plan_mw === null && !note) return null;
  return { name, phase, plan_mw, basis, plan_year, c, ...(note ? { note } : {}) };
}
const capFor = (dc, basis) => (basis === 'IT' ? (isNum(dc.it_mw) ? +dc.it_mw : 0) : basis === '수전' ? (isNum(dc.power_mw) ? +dc.power_mw : 0)
  : Math.max(isNum(dc.power_mw) ? +dc.power_mw : 0, isNum(dc.it_mw) ? +dc.it_mw : 0));
/** 캠퍼스별 계획·등록·미배정 용량. 계획 용량은 같은 이름의 센터 중 가장 큰 값을 씁니다. */
export function campusPlans(dcs) {
  const by = new Map();
  for (const dc of dcs) {
    const c = dc.campus; if (!c || !c.name) continue;
    const g = by.get(c.name) || { name: c.name, plan_mw: null, basis: '미상', plan_year: '', members: [] };
    g.members.push(dc);
    if (isNum(c.plan_mw) && (g.plan_mw == null || +c.plan_mw > g.plan_mw)) { g.plan_mw = +c.plan_mw; g.basis = c.basis || '미상'; g.plan_year = c.plan_year || ''; }
    by.set(c.name, g);
  }
  return [...by.values()].map(g => {
    const assigned = Math.round(g.members.reduce((s, d) => s + capFor(d, g.basis), 0) * 10) / 10;
    return { ...g, assigned, unassigned: g.plan_mw == null ? null : Math.max(0, Math.round((g.plan_mw - assigned) * 10) / 10) };
  }).sort((a, b) => (b.unassigned || 0) - (a.unassigned || 0));
}

/* ---------- 준비단계: 부지확보 → 전기확보 → 건축허가 ---------- */
export const PREP_STEPS = [
  { key: 'site', label: '부지확보', states: ['미확보', '협상중', '확보'] },
  { key: 'power', label: '전기확보', states: ['미확보', '협의중', '확보'] },
  { key: 'permit', label: '건축허가', states: ['미신청', '심의중', '허가'] }
];
export const PREP_STAGES = ['부지확보 단계', '전기확보 단계', '건축허가 단계', '착공 대기', '착공 이후'];
const PREP_STATE = { 0: 'todo', 1: 'doing', 2: 'done' };
export function normalizePrep(v) {
  if (!v || typeof v !== 'object') return null;
  const o = {};
  for (const st of PREP_STEPS) {
    const x = v[st.key]; if (!x || typeof x !== 'object') continue;
    const state = String(x.state || '').trim();
    if (state && !st.states.includes(state)) throw new Error(`${st.label} 상태는 ${st.states.join('/')} 중 하나입니다`);
    const ym = String(x.ym || '').trim();
    if (ym && !validYm(ym)) throw new Error(`${st.label} 시점 형식: YYYY-MM, YYYY-Q4, YYYY`);
    const c = ['확정', '추정'].includes(x.c) ? x.c : '추정';
    const note = String(x.note || '').trim().slice(0, 200);
    if (state || ym || note) o[st.key] = { state: state || st.states[0], ym, c, ...(note ? { note } : {}) };
  }
  return Object.keys(o).length ? o : null;
}
/** 단계별 실효 상태. 착공 이후 센터는 저장값이 없으면 3단계 모두 '완료(상태로부터)'로 봅니다. */
export function prepOf(dc) {
  const started = ['착공', '개발중', '준공', '운영중'].includes(dc.status);
  const steps = PREP_STEPS.map(st => {
    const x = (dc.prep || {})[st.key];
    if (x) { const i = st.states.indexOf(x.state); return { ...st, ...x, level: PREP_STATE[i < 0 ? 0 : i], inferred: false }; }
    if (started) return { ...st, state: st.states[2], ym: '', c: '추정', level: 'done', inferred: true };
    return { ...st, state: '', ym: '', c: '', level: 'unknown', inferred: false };
  });
  let stage;
  if (started) stage = '착공 이후';
  else { const i = steps.findIndex(s => s.level !== 'done'); stage = i < 0 ? '착공 대기' : PREP_STAGES[i]; }
  const known = steps.some(s => s.level !== 'unknown');
  return { steps, stage, known, done: steps.filter(s => s.level === 'done').length };
}
/** 설계중 센터의 공급 확률: 준비단계 정보가 있으면 진척도로 보정 */
export const PREP_PROB = { '부지확보 단계': 0.3, '전기확보 단계': 0.45, '건축허가 단계': 0.6, '착공 대기': 0.7 };
export function probOf(dc) {
  if (dc.status === '설계중') { const p = prepOf(dc); if (p.known && PREP_PROB[p.stage] != null) return PREP_PROB[p.stage]; }
  return STATUS_PROB[dc.status] ?? 0.5;
}

export const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/**
 * 사람이 상세 페이지에서 한 수정.
 * input: { id?, changes:{field:value}, conf:{field:'확정'|'추정'}, locked:{field:bool}, editor }
 * 수정된 필드는 자동으로 고정(locked)됩니다. 반환: { dcs, history, id, changed:[fields] }
 */
export function applyEdit(dcs, history, input, now = new Date().toISOString()) {
  const editor = String(input.editor || '').trim().slice(0, 40) || '이름 없음';
  const changes = input.changes || {};
  let dc, isNew = false;
  if (input.id) {
    dc = dcs.find(d => d.id === input.id);
    if (!dc) throw new Error('센터를 찾을 수 없습니다');
    dc = structuredClone(dc);
  } else {
    isNew = true;
    const name = normalizeField('name', changes.name);
    if (!name) throw new Error('센터명을 입력하세요');
    let id = slug(name) || 'dc'; let n = 2;
    while (dcs.some(d => d.id === id)) id = `${slug(name)}-${n++}`;
    dc = { id, name, aliases: [], category: '상용', status: '설계중', owner: '', contractor: '', operator: '', address: '', lat: null, lng: null,
      power_mw: null, it_mw: null, start_ym: '', complete_ym: '', rfs_ym: '', note: '', conf: {}, locked: {}, permit_ref: null, created_at: now };
  }
  dc.conf = { ...(dc.conf || {}) }; dc.locked = { ...(dc.locked || {}) };
  const changed = [], hist = [];
  for (const [f, raw] of Object.entries(changes)) {
    const v = normalizeField(f, raw);
    if (!isNew && same(dc[f], v)) continue;
    if (!isNew) hist.push({ field: f, old: fmt(dc[f]), new: fmt(v), note: '수동 변경 · 필드 고정' });
    dc[f] = v; dc.locked[f] = true; changed.push(f);
  }
  for (const [f, c] of Object.entries(input.conf || {})) {
    if (!CONF_FIELDS.includes(f) || !['확정', '추정'].includes(c)) continue;
    if (confOf(dc, f) === c) continue;
    if (!isNew) {
      const h = hist.find(x => x.field === f);
      if (h) h.note += ` · 근거 ${c}`; else hist.push({ field: f, old: confOf(dc, f), new: c, note: '근거 구분 변경' });
    }
    dc.conf[f] = c; dc.locked[f] = true; if (!changed.includes(f)) changed.push(f);
  }
  for (const [f, l] of Object.entries(input.locked || {})) {
    if (typeof l !== 'boolean' || changed.includes(f)) continue;
    if (!!dc.locked[f] !== l) { dc.locked[f] = l; changed.push(`lock:${f}`); hist.push({ field: f, old: l ? '자동' : '고정', new: l ? '고정' : '자동', note: '고정 설정 변경' }); }
  }
  if (!changed.length && !isNew) return { dcs, history, id: dc.id, changed: [] };
  dc.updated_at = now; dc.updated_by = `user:${editor}`;
  derive(dc, now);
  const nextDcs = isNew ? [...dcs, dc] : dcs.map(d => (d.id === dc.id ? dc : d));
  nextDcs.sort((a, b) => a.id.localeCompare(b.id));
  const base = { dc_id: dc.id, at: now, by: 'user', editor };
  const newHist = isNew
    ? [{ ...base, id: `h-${dc.id}-${stamp(now)}-create`, field: '_create', old: '', new: dc.name, note: '상세 페이지에서 수동 등록' }]
    : hist.map((h, i) => ({ ...base, id: `h-${dc.id}-${stamp(now)}-${h.field}-${i}`, ...h }));
  return { dcs: nextDcs, history: [...history, ...newHist], id: dc.id, changed };
}

/** 근거 추가 (사람/자동 공용). 같은 dc_id+url은 중복 추가하지 않습니다. */
export function addEvidence(evidence, history, ev, now = new Date().toISOString(), by = 'user', editor = '') {
  if (!ev.dc_id) throw new Error('dc_id가 필요합니다');
  if (!ev.title && !ev.url) throw new Error('제목이나 URL을 입력하세요');
  if (ev.url && !/^https?:\/\//.test(ev.url)) throw new Error('URL은 http(s)로 시작해야 합니다');
  if (ev.url && evidence.some(e => e.dc_id === ev.dc_id && e.url === ev.url)) return { evidence, history, added: false };
  const grade = ['A', 'B', 'C'].includes(ev.grade) ? ev.grade : 'B';
  const item = { id: `e-${ev.dc_id}-${stamp(now)}-${evidence.length}`, dc_id: ev.dc_id, title: String(ev.title || '').slice(0, 300), url: ev.url || '',
    publisher: String(ev.publisher || '').slice(0, 80), pub_date: String(ev.pub_date || '').slice(0, 10), grade,
    fields: (Array.isArray(ev.fields) ? ev.fields : String(ev.fields || '').split(',')).map(s => String(s).trim()).filter(Boolean),
    excerpt: String(ev.excerpt || '').slice(0, 1000), source_id: ev.source_id || (by === 'user' ? 'manual' : ''), collected_at: now, added_by: by === 'user' ? `user:${editor}` : by };
  const h = { id: `h-${ev.dc_id}-${stamp(now)}-evidence-${evidence.length}`, dc_id: ev.dc_id, at: now, field: '_evidence', old: '', new: item.title || item.url,
    by, editor: by === 'user' ? editor : undefined, evidence_url: item.url, note: by === 'user' ? '근거 수동 추가' : '근거 자동 추가' };
  return { evidence: [...evidence, item], history: [...history, h], added: true };
}

/**
 * 자동수집 반영: 고정되지 않은 필드만 갱신하고, 고정 필드는 제안(proposal)으로만 기록합니다.
 * updates: { field: { value, conf, note, evidence_url } }
 */
export function applyAuto(dcs, history, id, updates, now = new Date().toISOString(), by = 'auto') {
  const idx = dcs.findIndex(d => d.id === id);
  if (idx < 0) throw new Error(`센터 없음: ${id}`);
  const dc = structuredClone(dcs[idx]);
  dc.conf = { ...(dc.conf || {}) }; dc.locked = { ...(dc.locked || {}) };
  const newHist = []; let updated = 0, proposals = 0;
  for (const [f, u] of Object.entries(updates)) {
    const v = normalizeField(f, u.value);
    if (same(dc[f], v) && (!u.conf || confOf(dc, f) === u.conf)) continue;
    const base = { id: `h-${id}-${stamp(now)}-${f}`, dc_id: id, at: now, field: f, old: fmt(dc[f]), new: fmt(v), evidence_url: u.evidence_url || '' };
    if (dc.locked[f]) { newHist.push({ ...base, by: 'proposal', note: `고정 필드 – 제안${u.note ? ' · ' + u.note : ''}` }); proposals++; continue; }
    dc[f] = v; if (u.conf) dc.conf[f] = u.conf;
    newHist.push({ ...base, by, note: u.note || '' }); updated++;
  }
  if (updated) { dc.updated_at = now; dc.updated_by = by; derive(dc, now); }
  const next = updated ? dcs.map((d, i) => (i === idx ? dc : d)) : dcs;
  return { dcs: next, history: [...history, ...newHist], updated, proposals };
}

export function stamp(iso) { return String(iso).replace(/[^0-9]/g, '').slice(0, 14); }

/** 데이터 파일 검증 — CI(scripts/validate.mjs)와 저장 전 검사에 사용 */
export function validateData({ dcs, evidence = [], history = [] }) {
  const errs = [];
  const ids = new Set();
  for (const d of dcs) {
    if (!d.id) errs.push('id 없는 센터'); else if (ids.has(d.id)) errs.push(`중복 id: ${d.id}`); ids.add(d.id);
    if (!d.name) errs.push(`${d.id}: 이름 없음`);
    if (!STATUSES.includes(d.status)) errs.push(`${d.id}: 잘못된 상태 ${d.status}`);
    if (!CATEGORIES.includes(d.category)) errs.push(`${d.id}: 잘못된 구분 ${d.category}`);
    for (const f of NUMERIC) if (d[f] != null && !isNum(d[f])) errs.push(`${d.id}: ${f} 숫자 아님`);
    for (const f of ['start_ym', 'complete_ym', 'rfs_ym']) if (!validYm(d[f])) errs.push(`${d.id}: ${f} 형식 오류 (${d[f]})`);
    if (d.phase !== phaseOf(d.status)) errs.push(`${d.id}: phase 불일치`);
    if (d.prep) { try { normalizePrep(d.prep); } catch (e) { errs.push(`${d.id}: ${e.message}`); } }
    if (d.dbo) { try { normalizeDbo(d.dbo); } catch (e) { errs.push(`${d.id}: ${e.message}`); } }
    if (d.campus) { try { normalizeCampus(d.campus); } catch (e) { errs.push(`${d.id}: ${e.message}`); } }
    if (d.complaints) { try { normalizeComplaints(d.complaints); } catch (e) { errs.push(`${d.id}: ${e.message}`); } }
  }
  for (const e of evidence) if (!ids.has(e.dc_id)) errs.push(`근거 ${e.id}: 없는 센터 ${e.dc_id}`);
  for (const h of history) if (!ids.has(h.dc_id)) errs.push(`히스토리 ${h.id}: 없는 센터 ${h.dc_id}`);
  return errs;
}

/* ---------------- 핵심 사업자 ---------------- */
export const PLAYERS = ['LG유플러스', 'KT', 'SK', 'LG CNS'];
const PLAYER_RX = [
  ['LG유플러스', /(LG\s?유플러스|LG\s?U\+|LGU\+|엘지유플러스)/i],
  ['LG CNS', /(LG\s?CNS|엘지씨엔에스)/i],
  ['KT', /(^|[^A-Z])KT(클라우드|\s?Cloud)?([^A-Z]|$)|케이티/],
  ['SK', /(SK\s?(텔레콤|브로드밴드|호라이즌|하이퍼|C&C|AX)|SKT|SKB)/i]
];
/** 사업자 판정: 수동 지정(player) → 운영사 → 발주처 순. 시공사는 보지 않습니다. */
export function playerOf(dc) {
  if (dc.player) return dc.player;
  for (const field of ['operator', 'owner']) {
    const t = String(dc[field] || '');
    for (const [p, rx] of PLAYER_RX) if (rx.test(t)) return p;
  }
  return '기타';
}

/* ---------------- 공급 추정 ---------------- */
// 상태별 실현 확률과, 일정이 없을 때 쓰는 기준일(오늘)로부터의 예상 소요 개월
export const STATUS_PROB = { 운영중: 1, 준공: 1, 개발중: 0.9, 착공: 0.8, 설계중: 0.5 };
export const STATUS_LEAD_MONTHS = { 준공: 3, 개발중: 12, 착공: 24, 설계중: 36 };
export const PUE_RATIO = 1.4; // 수전 ≈ IT × 1.4 (한쪽 값만 있을 때 환산)

const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };

/** 공급 시점: RFS → 준공월 → 상태별 리드타임 추정. 운영중인데 일정이 없으면 기존 공급(base). */
export function supplyTiming(dc, now = new Date()) {
  const k = ymKey(dc.rfs_ym) || ymKey(dc.complete_ym);
  if (k) return { ym: k, how: ymKey(dc.rfs_ym) ? 'RFS' : '준공월' };
  if (dc.status === '운영중') return { ym: null, how: 'base' };
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return { ym: addMonths(cur, STATUS_LEAD_MONTHS[dc.status] ?? 36), how: '리드타임 추정' };
}

/** 용량: 원하는 지표가 없으면 다른 지표에서 환산(추정) */
export function capacityOf(dc, metric) {
  if (isNum(dc[metric])) return { mw: Number(dc[metric]), how: confOf(dc, metric) };
  const other = metric === 'it_mw' ? 'power_mw' : 'it_mw';
  if (isNum(dc[other])) return { mw: metric === 'it_mw' ? Number(dc[other]) / PUE_RATIO : Number(dc[other]) * PUE_RATIO, how: '환산' };
  return { mw: null, how: '미상' };
}

/**
 * 연도별 공급 추정.
 * 반환: { years, base, rows:[{dc, year, mw, prob, timing, cap}], byYear:{year:{nominal, weighted, groups:{key:{nominal,weighted}}}}, unknown:[dc] }
 */
export function forecast(dcs, { metric = 'it_mw', from = 2026, to = 2031, groupBy = () => '전체', now = new Date() } = {}) {
  const years = []; for (let y = from; y <= to; y++) years.push(y);
  const byYear = Object.fromEntries(years.map(y => [y, { nominal: 0, weighted: 0, groups: {} }]));
  const base = { nominal: 0, groups: {} }; const rows = []; const unknown = []; const later = [];
  for (const dc of dcs) {
    const cap = capacityOf(dc, metric);
    if (cap.mw === null) { unknown.push(dc); continue; }
    const timing = supplyTiming(dc, now);
    const g = groupBy(dc, cap, timing);
    const year = timing.ym ? Number(timing.ym.slice(0, 4)) : null;
    if (year === null || year < from) {
      base.nominal += cap.mw; base.groups[g] = (base.groups[g] || 0) + cap.mw;
      rows.push({ dc, year: year ?? 'base', mw: cap.mw, prob: 1, timing, cap }); continue;
    }
    if (year > to) { later.push(dc); continue; }
    const prob = probOf(dc);
    const b = byYear[year];
    b.nominal += cap.mw; b.weighted += cap.mw * prob;
    b.groups[g] = b.groups[g] || { nominal: 0, weighted: 0 };
    b.groups[g].nominal += cap.mw; b.groups[g].weighted += cap.mw * prob;
    rows.push({ dc, year, mw: cap.mw, prob, timing, cap });
  }
  let cn = base.nominal, cw = base.nominal;
  for (const y of years) { cn += byYear[y].nominal; cw += byYear[y].weighted; byYear[y].cumNominal = cn; byYear[y].cumWeighted = cw; }
  return { years, base, rows, byYear, unknown, later };
}

/* ---------------- 행정구역 ---------------- */
export const METRO_SIDO = ['서울', '인천', '경기'];
export const SIDO_ORDER = SIDO.map(s => s[0]).sort((a, b) => (METRO_SIDO.includes(b) - METRO_SIDO.includes(a)) || 0);
/** 시도·시군구: 저장값 우선, 없으면 주소에서 판정 */
export function locOf(dc) {
  const ac = addrCheck({ ...dc, sido: '' });
  const sido = dc.sido || ac.sido || '';
  return { sido, sigungu: dc.sigungu || ac.sigungu || '', area: !sido ? '' : METRO_SIDO.includes(sido) ? '수도권' : '지방', region: REGION_OF[sido] || '' };
}
export const areaOf = dc => locOf(dc).area;

/* ---------------- 주요 개발·운영사 (관심 목록) ---------------- */
export const WATCH = [
  ['코람코', /코람코|케이스퀘어|K-?Square/i],
  ['퍼시픽', /퍼시픽|Pacific/i],
  ['이도', /이도(테라원)?\b|이도\s|\(이도\)|청라IDC/],
  ['디지털엣지', /디지털\s?엣지|Digital\s?Edge/i],
  ['디지털리얼티', /디지털\s?리얼티|Digital\s?Realty/i],
  ['삼성SDS', /삼성\s?SDS/i],
  ['액티스', /액티스|Actis|에포크|Epoch/i],
  ['원아시아', /원아시아|OneAsia/i],
  ['유림', /유림/],
  ['SC제우스', /SC\s?제우스|SC\s?ZEUS/i],
  ['롯데이노베이트', /롯데\s?이노베이트|롯데정보통신/],
  ['카카오', /카카오|Kakao/i],
  ['네이버', /네이버|NAVER/i],
  ['CJ', /CJ\s?올리브네트웍스|CJ올넷|CJ\s?ONS/i, 'all'],
  ['에퀴닉스', /에퀴닉스|Equinix/i],
  ['마이크로소프트', /마이크로소프트|Microsoft|\bMS\b/i],
  ['AWS', /\bAWS\b|Amazon/i],
  ['맥쿼리·가비아', /맥쿼리|Macquarie|가비아/i],
  ['ESR·켄달스퀘어', /ESR\b|켄달스퀘어|STACK/],
  ['와이드크릭', /와이드크릭|Wide\s?Creek/i],
  ['다우기술', /다우기술|다우데이타|Daou/i],
  ['케펠', /케펠|Keppel/i],
  ['SGC', /SGC/],
  ['현대차그룹', /현대자동차|현대차그룹|현대오토에버/],
  ['STT', /STT/],
  ['교보DTS', /교보\s?DTS|교보디티에스/],
  ['스마일게이트', /스마일게이트/],
  ['KINX', /KINX/],
  ['드림마크원', /드림마크원/],
  ['디씨브릿지', /디씨브릿지|DC\s?브릿지/],
  ['엠피리온', /엠피리온|Empyrion/i],
  ['DCI', /\bDCI\b/],
  ['ADIK', /ADIK|에포크\s?디지털|Epoch\s?Digital/i],
  ['캡스톤', /캡스톤/],
  ['KAAM', /KAAM|한국대체투자|캄스퀘어/i],
  ['메가데이타', /메가데이[타터]/],
  ['한국초저온', /초저온/],
  ['킨드릴', /킨드릴|Kyndryl/i, 'all'],
  // 시공사는 시공사(contractor) 필드만 봅니다
  ['현대건설', /현대건설/, 'contractor'],
  ['GS건설', /GS건설/, 'contractor'],
  ['자이C&A', /자이\s?C&A|자이씨앤에이/i, 'contractor']
];
export const BUILDERS = ['현대건설', 'GS건설', '자이C&A'];
export const WATCH_NAMES = WATCH.map(w => w[0]);
/** 발주처·운영사·센터명·별칭에서 관심 개발·운영사를 찾습니다(복수 가능). */
export function watchOf(dc) {
  const t = [dc.owner, dc.operator, dc.name, ...(dc.aliases || [])].join(' ');
  return WATCH.filter(([, rx, field]) => rx.test(field === 'all' ? `${t} ${dc.contractor || ''}` : field ? String(dc[field] || '') : t)).map(([n]) => n);
}

/* ---------- 가치점수 (자동 산정 + 수동 보정) ---------- */
// 각 항목: key, axis, label, max. 자동값은 데이터·근거에서 계산하고, dc.score_manual[key]가 있으면 그 값을 씁니다.
export const SCORE_AXES = [
  { key: 'power', label: '전력' }, { key: 'location', label: '입지·접근성' }, { key: 'certainty', label: '사업 확실성' },
  { key: 'market', label: '시장성' }, { key: 'tech', label: '기술 사양' }, { key: 'strategy', label: '전략 적합도' }
];
export const SCORE_ITEMS = [
  { key: 'power_size', axis: 'power', label: '수전 규모', max: 10 },
  { key: 'power_secure', axis: 'power', label: '전력 확보', max: 10 },
  { key: 'region', axis: 'location', label: '권역', max: 6 },
  { key: 'own_distance', axis: 'location', label: '자사센터 거리', max: 8 },
  { key: 'access', axis: 'location', label: '접근성', max: 6 },
  { key: 'complaint', axis: 'location', label: '민원·인허가 리스크', max: 10 },
  { key: 'stage', axis: 'certainty', label: '진행 단계', max: 10 },
  { key: 'evidence', axis: 'certainty', label: '근거 확정도', max: 5 },
  { key: 'finance', axis: 'certainty', label: '자금 조달', max: 5 },
  { key: 'tenant', axis: 'market', label: '임차·수요 확보', max: 8 },
  { key: 'timing', axis: 'market', label: '공급 시점', max: 7 },
  { key: 'ai_ready', axis: 'tech', label: 'AI 대응', max: 5 },
  { key: 'efficiency', axis: 'tech', label: '효율·등급', max: 5 },
  { key: 'dbo_room', axis: 'strategy', label: 'DBO 참여 여지', max: 5 },
  { key: 'competitor', axis: 'strategy', label: '경쟁사 점유', max: 5 }
];
// 관점별 배점표: 항목 점수를 (점수/만점)×배점으로 환산해 더합니다. 각 관점의 배점 합계 = 100.
export const SCORE_VIEWS = {
  balanced: { label: '균형', q: '전력·입지·사업성·기술·당사 전략을 고르게 본 종합 점수',
    points: { power_size: 8, power_secure: 9, region: 6, own_distance: 6, access: 5, complaint: 8, stage: 9, evidence: 5, finance: 6, tenant: 9, timing: 6, ai_ready: 6, efficiency: 5, dbo_room: 6, competitor: 6 } },
  invest: { label: '투자가치', q: '자산(부동산·인프라) 투자자 관점: 전력이 확보되고, 임차인이 있고, 인허가·자금·민원 리스크가 낮아 예정대로 완공·임대되어 안정적 임대수익을 낼 가능성. 당사와의 거리·경쟁사 점유·DBO 여지는 넣지 않음',
    points: { power_secure: 18, power_size: 12, tenant: 18, stage: 10, finance: 10, complaint: 10, region: 8, access: 4, timing: 4, ai_ready: 4, evidence: 2 } },
  dbo: { label: 'DBO 영업기회', q: '당사(LG유플러스)가 설계·구축·운영을 수주할 여지: 운영사 미정·착공 전·경쟁사 미점유·자사 센터 인접·대형 용량',
    points: { dbo_room: 30, competitor: 15, power_size: 15, own_distance: 10, stage: 5, power_secure: 5, complaint: 5, region: 5, tenant: 5, timing: 5 } }
};
for (const v of Object.values(SCORE_VIEWS)) v.w = Object.fromEntries(SCORE_AXES.map(a => [a.key, SCORE_ITEMS.filter(i => i.axis === a.key).reduce((t, i) => t + (v.points[i.key] || 0), 0)]));

/* ---------- 민원·인허가 리스크 ---------- */
export const COMPLAINT_TYPES = ['주민 반대·집단민원', '전자파·소음·열', '송전선로·변전소', '학교·주거 인접', '행정심판·소송', '인허가 반려·보류', '입지 규제·조례', '기타'];
export const COMPLAINT_LEVELS = ['심각', '주의', '경미'];
/** complaints: [{ type, level(심각|주의|경미), status(진행|해소), ym, note, url }] */
export function normalizeComplaints(v) {
  if (!Array.isArray(v)) return null;
  const out = v.map(x => {
    if (!x || typeof x !== 'object') return null;
    const type = COMPLAINT_TYPES.includes(x.type) ? x.type : '기타';
    const level = COMPLAINT_LEVELS.includes(x.level) ? x.level : '주의';
    const status = x.status === '해소' ? '해소' : '진행';
    const ym = String(x.ym || '').trim();
    if (ym && !validYm(ym)) throw new Error('민원 시점 형식: YYYY-MM 또는 YYYY');
    const url = String(x.url || '').trim();
    if (url && !/^https?:\/\//.test(url)) throw new Error('민원 근거 URL은 http(s)로 시작해야 합니다');
    const note = String(x.note || '').trim().slice(0, 300);
    if (!note && !url) return null;
    return { type, level, status, ym, note, ...(url ? { url } : {}) };
  }).filter(Boolean).slice(0, 20);
  return out.length ? out : null;
}
const CM_SEVERE = /불허|반려|백지화|철회|소송|행정심판|집단\s?(민원|반대)|반대\s?집회|비상대책위|비대위|공사\s?중단/;
const CM_MILD = /민원|주민\s?반대|반대\s?(여론|서명)|전자파|소음|갈등|우려|주민설명회/;
const CM_RESOLVED = /민원\s?해소|합의|상생\s?협약|협의체\s?합의|인용/;
/** 민원·인허가 리스크 점수(0~10, 높을수록 리스크 낮음)와 근거 */
export function complaintRisk(dc, text = '') {
  const list = dc.complaints || [];
  const open = list.filter(c => c.status !== '해소');
  if (list.length) {
    const worst = open.some(c => c.level === '심각') ? '심각' : open.some(c => c.level === '주의') ? '주의' : open.length ? '경미' : '해소';
    const v = { 심각: 1, 주의: 4, 경미: 6, 해소: 7 }[worst];
    const started = ['착공', '개발중', '준공', '운영중'].includes(dc.status);
    const adj = worst === '해소' && ['준공', '운영중'].includes(dc.status) ? 9 : started && worst !== '해소' ? Math.min(10, v + 1) : v;
    return { v: adj, level: worst, basis: `기록 ${list.length}건(진행 ${open.length}) · ${worst === '해소' ? '모두 해소' : '최고 수준 ' + worst}${started && worst !== '해소' ? ' · 착공 이후 +1' : ''}: ${[...new Set(open.concat(list).map(c => c.type))].slice(0, 3).join(', ')}` };
  }
  const sev = text.match(CM_SEVERE), mild = text.match(CM_MILD), res = text.match(CM_RESOLVED);
  if (sev && !res) return { v: 2, level: '심각', basis: `비고·근거에 "${sev[0]}" 언급(자동 감지)` };
  if (mild && !res) return { v: 5, level: '주의', basis: `비고·근거에 "${mild[0]}" 언급(자동 감지)` };
  if ((sev || mild) && res) return { v: 7, level: '해소', basis: `"${(sev || mild)[0]}" 후 "${res[0]}" 언급(자동 감지)` };
  const base = { 운영중: 10, 준공: 9, 개발중: 8, 착공: 8 }[dc.status] ?? 6;
  return { v: base, level: '없음', basis: base >= 9 ? '민원 기록 없음 · 운영·준공(입지 검증됨)' : base === 8 ? '민원 기록 없음 · 착공 이후' : '민원 기록 없음 · 착공 전(미확인 리스크)' };
}
const HUBS = [['서울 도심', 37.5665, 126.978], ['강남', 37.498, 127.028], ['판교', 37.395, 127.111], ['부산', 35.18, 129.075], ['대전', 36.35, 127.385], ['광주', 35.16, 126.852], ['대구', 35.871, 128.601]];
export function distKm(a, b) {
  const R = 6371, r = x => (x * Math.PI) / 180, dLat = r(b[0] - a[0]), dLng = r(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const STARTED = ['착공', '개발중', '준공', '운영중'];
export function normalizeScoreManual(v) {
  if (!v || typeof v !== 'object') return null;
  const o = {};
  for (const it of SCORE_ITEMS) {
    const x = v[it.key];
    if (x === '' || x === null || x === undefined) continue;
    if (!isNum(x) || Number(x) < 0 || Number(x) > it.max) throw new Error(`${it.label} 점수는 0~${it.max} 사이 숫자입니다`);
    o[it.key] = Math.round(Number(x) * 10) / 10;
  }
  if (typeof v.note === 'string' && v.note.trim()) o.note = v.note.trim().slice(0, 300);
  return Object.keys(o).length ? o : null;
}
/** ctx: { dcs, evidence, now } — 자사센터·근거 텍스트를 쓰기 위해 전체 목록이 필요합니다 */
export function valueScore(dc, ctx = {}) {
  const { dcs = [], evidence = [], now = new Date() } = ctx;
  const text = [dc.note, dc.name, ...(evidence.filter(e => e.dc_id === dc.id).map(e => `${e.title || ''} ${e.excerpt || ''}`))].join(' ');
  const pos = isNum(dc.lat) && isNum(dc.lng) ? [+dc.lat, +dc.lng] : null;
  const loc = locOf(dc), prep = prepOf(dc), auto = {};
  const set = (k, v, basis) => { auto[k] = { v: Math.round(v * 10) / 10, basis }; };
  // 전력
  const pw = isNum(dc.power_mw) ? +dc.power_mw : isNum(dc.it_mw) ? +dc.it_mw * PUE_RATIO : null;
  const pwConf = isNum(dc.power_mw) ? (confOf(dc, 'power_mw') === '확정' ? 1 : 0.85) : 0.8;
  if (pw == null) set('power_size', 0, '용량 미상');
  else set('power_size', (pw >= 100 ? 10 : pw >= 50 ? 8 : pw >= 30 ? 6 : pw >= 10 ? 4 : 2) * pwConf, `${Math.round(pw)}MW${pwConf < 1 ? ' (추정 반영 ×' + pwConf + ')' : ''}`);
  const ps = prep.steps.find(s => s.key === 'power');
  set('power_secure', ps.level === 'done' ? (ps.c === '확정' || ps.inferred ? 10 : 8) : ps.level === 'doing' ? 5 : ps.level === 'todo' ? 1 : 3,
    ps.level === 'unknown' ? '전력 확보 정보 없음' : `전력확보: ${ps.state}${ps.inferred ? ' (착공 이후)' : ps.c ? ' · ' + ps.c : ''}`);
  // 입지·접근성
  const regionScore = loc.sido === '서울' ? 6 : loc.area === '수도권' ? 5 : ['부산', '대전', '대구', '광주', '울산', '세종'].includes(loc.sido) ? 3 : loc.sido ? 2 : 1;
  set('region', regionScore, loc.sido ? `${loc.sido}${loc.sigungu ? ' ' + loc.sigungu : ''} (${loc.area})` : '주소 미상');
  const own = dcs.filter(o => o.id !== dc.id && playerOf(o) === 'LG유플러스' && isNum(o.lat) && isNum(o.lng));
  let near = null;
  if (pos) for (const o of own) { const d = distKm(pos, [+o.lat, +o.lng]); if (!near || d < near.km) near = { km: d, name: o.name, id: o.id }; }
  if (!pos) set('own_distance', 2, '좌표 없음');
  else if (!near) set('own_distance', 0, '자사센터 좌표 없음');
  else set('own_distance', near.km <= 5 ? 8 : near.km <= 15 ? 6 : near.km <= 30 ? 4 : near.km <= 60 ? 2 : 0, `최근접 자사센터 ${near.name} ${near.km.toFixed(1)}km`);
  let hub = null;
  if (pos) for (const [n, la, ln] of HUBS) { const d = distKm(pos, [la, ln]); if (!hub || d < hub.km) hub = { km: d, name: n }; }
  if (!hub) set('access', 2, '좌표 없음');
  else set('access', hub.km <= 10 ? 6 : hub.km <= 25 ? 5 : hub.km <= 45 ? 3 : hub.km <= 80 ? 2 : 1, `${hub.name} ${hub.km.toFixed(0)}km (업무·고객 거점 기준)`);
  const cr = complaintRisk(dc, text);
  set('complaint', cr.v, cr.basis);
  // 사업 확실성
  const stageMap = { 운영중: 10, 준공: 9, 개발중: 8, 착공: 7 };
  const stagePrep = { '착공 대기': 6, '건축허가 단계': 4, '전기확보 단계': 3, '부지확보 단계': 2 };
  const st = stageMap[dc.status] ?? (prep.known ? stagePrep[prep.stage] ?? 2 : 2);
  set('stage', st, dc.status === '설계중' ? `설계중 · ${prep.known ? prep.stage : '준비단계 미분류'}` : dc.status);
  const filled = CONF_FIELDS.filter(f => dc[f] !== '' && dc[f] != null);
  const ratio = filled.length ? filled.filter(f => confOf(dc, f) === '확정').length / filled.length : 0;
  set('evidence', ratio * 5, `입력 ${filled.length}개 중 확정 ${Math.round(ratio * 100)}%`);
  const fin = /본\s?PF|PF\s?(전환|약정|조달)|재원\s?조달\s?완료|투융자\s?승인|자금\s?조달\s?완료|펀드\s?(조성|투자)/.test(text) ? 5 : /브릿지/.test(text) ? 3 : STARTED.includes(dc.status) ? 4 : dc.category === '자체' ? 4 : 1;
  set('finance', fin, fin === 5 ? 'PF·투자 확정 언급' : fin === 3 ? '브릿지론 단계' : fin === 4 ? (dc.category === '자체' ? '자체 투자' : '착공 이후') : '자금 조달 정보 없음');
  // 시장성
  const tn = dc.category === '자체' ? 8 : /임차\s?확약|선임차|임차\s?계약|앵커|장기\s?임대|위탁운영/.test(text) ? 6 : dc.status === '운영중' ? 6 : /임차\s?협의|MOU/.test(text) ? 4 : 2;
  set('tenant', tn, dc.category === '자체' ? '자체 사용' : tn === 6 ? '임차·운영 계약 언급' : tn === 4 ? '임차 협의/MOU' : '수요 확보 정보 없음');
  const tm = supplyTiming(dc, now), yr = tm.ym ? +tm.ym.slice(0, 4) : null;
  const tsc = tm.how === 'base' || (yr && yr <= now.getFullYear()) ? 5 : yr >= 2027 && yr <= 2029 ? 7 : yr === now.getFullYear() + 0 ? 5 : yr ? 4 : 2;
  set('timing', tsc, tm.how === 'base' ? '운영 중' : `${tm.ym} (${tm.how})`);
  // 기술
  const ai = /AI|GPU|액침|D2C|액체\s?냉각|수냉|고밀도|하이퍼스케일/i.test(text);
  set('ai_ready', ai ? 5 : 2, ai ? 'AI·고밀도 사양 언급' : '언급 없음');
  const eff = /PUE|Tier|티어|LEED|Uptime/i.test(text);
  set('efficiency', eff ? 4 : 2, eff ? 'PUE/Tier/LEED 언급' : '언급 없음');
  // 전략(당사 관점)
  const pl = playerOf(dc);
  const dbo = !STARTED.includes(dc.status) && !dc.operator ? 5 : !STARTED.includes(dc.status) ? 3 : dc.status === '착공' && !dc.operator ? 3 : ['운영중', '준공'].includes(dc.status) ? 0 : 1;
  set('dbo_room', dbo, !STARTED.includes(dc.status) ? (dc.operator ? '착공 전 · 운영사 있음' : '착공 전 · 운영사 미정') : dc.operator ? '착공 이후 · 운영사 확정' : '착공 이후 · 운영사 미정');
  set('competitor', pl === '기타' ? 5 : pl === 'LG유플러스' ? 3 : 1, pl === '기타' ? '핵심 경쟁사 미점유' : pl === 'LG유플러스' ? '자사' : `${pl} 점유`);
  // 수동 보정 반영
  const man = dc.score_manual || {};
  const items = SCORE_ITEMS.map(it => { const m = isNum(man[it.key]) ? +man[it.key] : null; return { ...it, auto: auto[it.key].v, basis: auto[it.key].basis, manual: m, score: m ?? auto[it.key].v }; });
  const axes = {};
  for (const a of SCORE_AXES) { const its = items.filter(i => i.axis === a.key); axes[a.key] = { score: its.reduce((s, i) => s + i.score, 0), max: its.reduce((s, i) => s + i.max, 0) }; }
  const total = (view = 'balanced') => {
    const pts = (SCORE_VIEWS[view] || SCORE_VIEWS.balanced).points;
    let s = 0, m = 0; for (const it of items) { const p = pts[it.key] || 0; s += (it.score / it.max) * p; m += p; }
    return m ? Math.round((s / m) * 1000) / 10 : 0;
  };
  /** 관점별 항목 기여도: [{ key, label, points, got }] */
  const breakdown = (view = 'balanced') => {
    const pts = (SCORE_VIEWS[view] || SCORE_VIEWS.balanced).points;
    return items.filter(it => pts[it.key]).map(it => ({ key: it.key, label: it.label, points: pts[it.key], got: Math.round((it.score / it.max) * pts[it.key] * 10) / 10, basis: it.basis }));
  };
  return { items, axes, total, breakdown, nearOwn: near, hub, complaint: complaintRisk(dc, text), manualCount: items.filter(i => i.manual != null).length };
}

/* ---------------- 회사 마스터: 개발사 · 운영사 · 시공사 ---------------- */
// 센터의 owner(개발사/발주처) · operator(운영사) · contractor(시공사) 자유 텍스트를
// data/companies.json의 회사명·별칭과 매칭해 회사별로 집계합니다.
export const ROLES = [
  { key: 'dev', field: 'owner', label: '개발사' },
  { key: 'op', field: 'operator', label: '운영사' },
  { key: 'con', field: 'contractor', label: '시공사' }
];
export const COMPANY_TYPES = ['통신·클라우드', 'IT서비스·플랫폼', '빅테크', '글로벌 DC사업자', '자산운용·펀드', '시행·개발', '대기업·그룹', '건설사', '에너지·기타'];
const OPERATING = ['운영중', '준공'];
export const normName = s => String(s || '').toLowerCase().replace(/㈜|\(주\)|주식회사/g, '').replace(/[\s·.,()\[\]&'’\-_/]/g, '');

export function normalizeCompany(c = {}) {
  const name = String(c.name || '').trim().slice(0, 60);
  if (!name) throw new Error('회사명을 입력하세요');
  const aliases = [...new Set((Array.isArray(c.aliases) ? c.aliases : String(c.aliases || '').split(','))
    .map(s => String(s).trim()).filter(s => s && s !== name && normName(s).length >= 2))].slice(0, 20);
  const roles = (Array.isArray(c.roles) ? c.roles : []).filter(r => ROLES.some(x => x.key === r));
  const type = COMPANY_TYPES.includes(c.type) ? c.type : '에너지·기타';
  const url = String(c.url || '').trim();
  if (url && !/^https?:\/\//.test(url)) throw new Error('홈페이지는 http(s)로 시작해야 합니다');
  return { name, aliases, type, roles, major: !!c.major, parent: String(c.parent || '').trim().slice(0, 60), note: String(c.note || '').trim().slice(0, 1000), url };
}

/** 텍스트에 등장하는 회사 id 목록. 더 긴 별칭에 포함되는 짧은 매칭은 버립니다. */
export function companyMatch(text, companies) {
  const t = normName(text);
  if (!t) return [];
  const hits = [];
  for (const c of companies) {
    let best = '';
    for (const n of [c.name, ...(c.aliases || [])]) { const k = normName(n); if (k.length >= 2 && t.includes(k) && k.length > best.length) best = k; }
    if (best) hits.push({ id: c.id, k: best });
  }
  return hits.filter(h => !hits.some(o => o !== h && o.k.length > h.k.length && o.k.includes(h.k))).map(h => h.id);
}

/** 매칭되지 않은 명칭 후보: 괄호를 떼고 '·', ',', '/'로 나눈 조각 중 회사에 매칭되지 않은 것 */
export function unmatchedNames(text, companies) {
  return String(text || '').replace(/\([^)]*\)/g, ' ').split(/\s*[·,/]\s*|\s+및\s+/).map(s => s.trim())
    .filter(s => normName(s).length >= 2 && !/^(시행|투자|AMC|PFV|선정 전|유력)/.test(s) && !companyMatch(s, companies).length);
}

/** 회사별 · 역할별 집계 */
export function companyIndex(dcs, companies) {
  const byId = Object.fromEntries(companies.map(c => [c.id, { company: c, roles: { dev: [], op: [], con: [] } }]));
  const unmatched = { dev: {}, op: {}, con: {} };
  for (const dc of dcs) for (const r of ROLES) {
    const txt = dc[r.field];
    if (!txt) continue;
    for (const id of companyMatch(txt, companies)) byId[id].roles[r.key].push(dc);
    for (const n of unmatchedNames(txt, companies)) (unmatched[r.key][n] ||= []).push(dc.id);
  }
  return { byId, unmatched };
}

const sumMw = (arr, k) => (arr.some(d => isNum(d[k])) ? Math.round(arr.reduce((s, d) => s + (isNum(d[k]) ? +d[k] : 0), 0) * 10) / 10 : null);
/** 센터 목록 요약 (회사 표 한 줄) */
export function companyStats(list) {
  const op = list.filter(d => OPERATING.includes(d.status)), dev = list.filter(d => !OPERATING.includes(d.status));
  const sido = {}; list.forEach(d => { const s = locOf(d).sido; if (s) sido[s] = (sido[s] || 0) + 1; });
  return {
    n: list.length, op: op.length, dev: dev.length,
    power: sumMw(list, 'power_mw'), it: sumMw(list, 'it_mw'), pipeline: sumMw(dev, 'power_mw'),
    unknown: list.filter(d => !isNum(d.power_mw) && !isNum(d.it_mw)).length,
    regions: Object.entries(sido).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => s),
    updated: list.reduce((m, d) => (String(d.updated_at || '') > m ? String(d.updated_at) : m), '')
  };
}

const cslug = s => normName(s).replace(/[^a-z0-9가-힣]/g, '').slice(0, 40) || 'co';
/** 회사 등록/수정. 변경 내역은 회사의 log(최근 50건)에 남깁니다. */
export function applyCompanyEdit(companies, input = {}, editor = '', now = new Date().toISOString()) {
  const next = normalizeCompany(input);
  const clash = companies.find(c => c.id !== input.id && [c.name, ...(c.aliases || [])].some(n => normName(n) === normName(next.name)));
  if (clash) throw new Error(`이미 등록된 이름입니다: ${clash.name}`);
  let cur = input.id ? companies.find(c => c.id === input.id) : null;
  if (input.id && !cur) throw new Error('회사를 찾을 수 없습니다');
  const changed = cur ? Object.keys(next).filter(k => !same(cur[k], next[k])) : Object.keys(next);
  if (cur && !changed.length) return { companies, id: cur.id, changed: [] };
  let id = cur?.id;
  if (!id) { id = cslug(next.name); let n = 2; while (companies.some(c => c.id === id)) id = `${cslug(next.name)}-${n++}`; }
  const entry = { at: now, editor, fields: changed, note: cur ? changed.map(k => `${k}: ${fmt(cur[k])} → ${fmt(next[k])}`).join(' / ').slice(0, 500) : '신규 등록' };
  const rec = { id, ...next, created_at: cur?.created_at || now, updated_at: now, updated_by: `user:${editor}`, log: [...(cur?.log || []), entry].slice(-50) };
  const list = cur ? companies.map(c => (c.id === id ? rec : c)) : [...companies, rec];
  return { companies: list.sort((a, b) => a.name.localeCompare(b.name, 'ko')), id, changed };
}

export function validateCompanies(companies = []) {
  const errs = [], ids = new Set(), names = new Map();
  for (const c of companies) {
    if (!c.id || ids.has(c.id)) errs.push(`회사 id 오류: ${c.id}`); ids.add(c.id);
    try { normalizeCompany(c); } catch (e) { errs.push(`${c.id}: ${e.message}`); }
    for (const n of [c.name, ...(c.aliases || [])]) { const k = normName(n); if (names.has(k) && names.get(k) !== c.id) errs.push(`회사 이름 중복: ${n} (${names.get(k)}, ${c.id})`); names.set(k, c.id); }
  }
  return errs;
}
