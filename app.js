import { STATUSES, CONF_FIELDS, LABEL, REGIONS, isNum, phaseOf, confOf, ymKey, regionOf, addrCheck, gmapUrl, PLAYERS, playerOf, watchOf, WATCH_NAMES, BUILDERS, forecast, locOf, SIDO_ORDER, METRO_SIDO, capacityOf, AREA_KW_PER_M2, STATUS_PROB, STATUS_LEAD_MONTHS, PUE_RATIO, PREP_STEPS, PREP_STAGES, PREP_PROB, prepOf, SCORE_AXES, SCORE_ITEMS, SCORE_VIEWS, valueScore, ROLES, COMPANY_TYPES, companyMatch, companyIndex, companyStats, DBO_TYPES, DBO_SCOPE, DBO_EXTERNAL, dboOf, dboLabel, CAMPUS_BASIS, campusPlans, COMPLAINT_TYPES, COMPLAINT_LEVELS, complaintRisk, SCORE_VIEW_ORDER, viewKey, lensOf } from '/lib/model.js';

const PLAYER_VAR = { LG유플러스: '--p-lgu', KT: '--p-kt', SK: '--p-sk', 'LG CNS': '--p-cns', 기타: '--p-etc' };
const pchip = dc => { const p = playerOf(dc); return (p === '기타' ? '' : `<span class="pchip" style="--pc:var(${PLAYER_VAR[p]})">${esc(p)}</span>`) + watchOf(dc).map(w => `<span class="wchip ${BUILDERS.includes(w) ? 'b' : ''}">${BUILDERS.includes(w) ? '시공 ' : ''}${esc(w)}</span>`).join(''); };

const STATUS_VAR = { 설계중: '--s-design', 착공: '--s-start', 개발중: '--s-build', 준공: '--s-done', 운영중: '--s-run' };
const ADDR_COLOR = { 정상: '--ok', 부분: '--warn', 불일치: '--bad', 주소불완전: '--bad', 좌표없음: '--none', 미입력: '--none' };
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtMW = v => (isNum(v) ? (Number(v) >= 100 ? Number(v).toFixed(0) : Number(v).toFixed(1)) : '');
const pad = n => String(n).padStart(2, '0');
const fmtDate = iso => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? String(iso) : `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; };
const fmtDT = iso => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? String(iso) : `${fmtDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const store = {
  get: (k, s = localStorage) => { try { return s.getItem(k) || ''; } catch { return ''; } },
  set: (k, v, s = localStorage) => { try { s.setItem(k, v); } catch { /* 저장 불가 환경 */ } }
};

const state = {
  dcs: [], evidence: [], history: [], sources: [], runs: [], permits: [], grid: [], targets: [], companies: [],
  meta: { source: '', sha: '', repo: '', editable: false }, loaded: false, tab: 'list',
  filters: { cat: '', phase: '', conf: '', area: '', sido: '', sgg: '', player: '', prep: '', dbo: '', cm: '', company: null, status: new Set(), q: '', sort: 'power' },
  mapView: 'all', mapStatus: new Set(STATUSES), supMetric: 'it_mw', supSplit: 'player', supMode: 'weighted'
};

/* ---------------- data ---------------- */
async function load(fresh = false) {
  try {
    const r = await fetch(`/api/data${fresh ? `?t=${Date.now()}` : ''}`);
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    Object.assign(state, { dcs: j.dcs || [], evidence: j.evidence || [], history: j.history || [], sources: j.sources || [], runs: j.runs || [], permits: j.permits || [], grid: j.grid || [], targets: j.targets || [], companies: j.companies || [] });
    state.meta = { source: j.source, sha: j.sha, repo: j.repo || '', editable: !!j.editable };
  } catch {
    // API가 없는 환경(로컬 정적 미리보기)에서는 정적 data/ 파일을 읽습니다.
    const names = ['dcs', 'evidence', 'history', 'sources', 'runs', 'permits', 'grid', 'targets', 'companies'];
    const got = await Promise.all(names.map(n => fetch(`/data/${n}.json`).then(r => (r.ok ? r.json() : [])).catch(() => [])));
    names.forEach((n, i) => { state[n] = got[i]; });
    state.meta = { source: 'static', sha: '', repo: '', editable: false };
  }
  state.loaded = true;
  renderAll();
}

/* ---------------- common render ---------------- */
function val(dc, f, txt) {
  const v = txt ?? dc[f];
  if (v === null || v === undefined || v === '') return '<span style="color:var(--faint)">—</span>';
  return confOf(dc, f) === '확정' ? `<span>${esc(v)}</span>` : `<span class="est">${esc(v)}</span>`;
}
// 수전이 비어 있으면 IT·연면적 환산값을 흐린 글씨 + '환산' 표시로 구분 (입력값이 아님)
function powerCell(dc) {
  if (isNum(dc.power_mw)) return val(dc, 'power_mw', fmtMW(dc.power_mw));
  const c = capacityOf(dc, 'power_mw');
  if (c.mw === null) return val(dc, 'power_mw');
  return `<span class="conv" title="${c.how === '연면적 환산' ? `연면적 ${Number(dc.area_m2).toLocaleString()}㎡ × ${AREA_KW_PER_M2}kW/㎡` : `IT ${fmtMW(dc.it_mw)}MW × ${PUE_RATIO}`} (${c.how} · 참고용, 입력값 아님)">${fmtMW(c.mw)}<small>환산</small></span>`;
}
const PREP_ICON = { done: '●', doing: '◐', todo: '○', unknown: '·' };
function prepMini(dc) {
  const p = prepOf(dc);
  if (!p.known) return '<div class="prepmini unk">준비단계 미분류</div>';
  return `<div class="prepmini" title="${p.steps.map(s => `${s.label}: ${s.state || '미상'}${s.c ? ' (' + s.c + ')' : ''}`).join(' · ')}">${p.steps.map(s => `<span class="ps ${s.level}">${s.label.slice(0, 2)}</span>`).join('<i>›</i>')}</div>`;
}
const fmtPlan = mw => (mw >= 1000 ? `${Math.round(mw / 100) / 10}GW` : `${mw}MW`);
function campusChip(dc) {
  const c = dc.campus; if (!c || (!c.name && !c.phase)) return '';
  const g = c.name ? campusPlans(state.dcs).find(x => x.name === c.name) : null;
  const plan = g && g.plan_mw != null ? ` · 전체 ${fmtPlan(g.plan_mw)}${g.basis !== '미상' ? ' ' + g.basis : ''}` : '';
  return `<div class="campchip" title="${esc([c.name, c.note].filter(Boolean).join(' · '))}${g && g.unassigned ? esc(` · 미배정 ${g.unassigned}MW(공급 추정 제외)`) : ''}">캠퍼스 ${esc(c.phase || '')}${plan}</div>`;
}
function listCm(dc) { const c = complaintRisk(dc, dc.note || ''); return ['심각', '주의'].includes(c.level) ? ` <span class="cmchip l-${c.level}" title="${esc(c.basis)}">민원 ${c.level}</span>` : ''; }
function dboBadge(dc) {
  const d = dboOf(dc);
  if (d.type === '미상') return '';
  const scope = d.scope && d.scope.length ? ` (${d.scope.join('')})` : '';
  return `<div class="dbochip t-${DBO_TYPES.indexOf(d.type)}${d.c === '추정' ? ' guess' : ''}" title="${esc(dboLabel(d) + scope + (d.c ? ' · ' + d.c : '') + (d.note ? ' · ' + d.note : ''))}"><span class="dt">${esc(d.type)}</span>${d.provider && DBO_EXTERNAL.includes(d.type) ? ' ' + esc(d.provider) : ''}${scope}</div>`;
}
function prepStepper(dc) {
  const p = prepOf(dc);
  return `<ol class="stepper">${p.steps.map((s, i) => `<li class="${s.level}"><span class="n">${s.level === 'done' ? '✓' : i + 1}</span><div><b>${s.label}</b><div class="sub">${s.state ? esc(s.state) : '정보 없음'}${s.ym ? ' · ' + esc(s.ym) : ''}${s.c ? ` · <span class="${s.c === '확정' ? 'c' : 'est'}">${s.c}</span>` : ''}${s.inferred ? ' · 상태로부터' : ''}</div>${s.note ? `<div class="sub">${esc(s.note)}</div>` : ''}</div></li>`).join('')}<li class="${['착공', '개발중', '준공', '운영중'].includes(dc.status) ? 'done' : 'todo'}"><span class="n">→</span><div><b>착공</b><div class="sub">${esc(dc.start_ym || (['착공', '개발중', '준공', '운영중'].includes(dc.status) ? '착공함' : '—'))}</div></div></li></ol><div class="prepstage">현재: <b>${p.stage}</b>${dc.status === '설계중' && p.known ? ` · 공급 실현확률 ${Math.round((PREP_PROB[p.stage] ?? STATUS_PROB['설계중']) * 100)}%` : ''}</div>`;
}
const statusPill = st => `<span class="pill"><span class="dot" style="background:var(${STATUS_VAR[st] || '--none'})"></span>${esc(st || '—')}</span>`;
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

function renderHeader() {
  const b = $('#srcBadge'), m = state.meta;
  b.className = 'src-badge' + (m.source === 'github' ? ' gh' : '');
  b.textContent = m.source === 'github' ? `GitHub ${String(m.sha || '').slice(0, 7)}` : m.source === 'bundle' ? '배포본 데이터' : m.source === 'static' ? '정적 미리보기' : '—';
  b.title = m.source === 'github' ? '저장소 main 브랜치의 최신 커밋을 표시 중' : '저장 기능이 꺼진 상태입니다 (GITHUB_TOKEN 미설정)';
  const last = [...state.runs].sort((a, c) => String(c.at).localeCompare(String(a.at)))[0];
  $('#runinfo').innerHTML = last ? `<span class="dot" style="background:var(${(last.errors || 0) > 0 ? '--warn' : '--ok'})"></span><span>최근 수집 ${fmtDT(last.at)} · ${esc(last.kind || '')}</span>` : '<span class="dot"></span><span>수집 기록 없음</span>';
  $('#banner').innerHTML = state.loaded && !m.editable && m.source !== 'static'
    ? '<div class="banner">보기 전용입니다. 수정하려면 Vercel 환경변수 GITHUB_TOKEN, GITHUB_REPO, EDIT_PASSWORD를 설정하세요 (README 참고).</div>' : '';
}

function renderKpis() {
  const d = state.dcs;
  const op = d.filter(x => phaseOf(x.status) === '운영'), dev = d.filter(x => phaseOf(x.status) !== '운영');
  const sum = (arr, f) => arr.reduce((s, x) => s + (isNum(x[f]) ? +x[f] : 0), 0);
  const unk = (arr, f) => arr.filter(x => !isNum(x[f])).length;
  let cf = 0, tot = 0;
  d.forEach(x => CONF_FIELDS.forEach(f => { if (x[f] !== undefined && x[f] !== null && x[f] !== '') { tot++; if (confOf(x, f) === '확정') cf++; } }));
  const addrBad = d.filter(x => addrCheck(x).status !== '정상').length;
  const n = d.length || 1;
  $('#kpis').innerHTML = `
    <div class="kpi"><div class="k">전체 센터</div><div class="v">${d.length}</div><div class="bar">${STATUSES.map(s => { const c = d.filter(x => x.status === s).length; return `<span style="width:${c / n * 100}%;background:var(${STATUS_VAR[s]})" title="${s} ${c}"></span>`; }).join('')}</div><div class="d">운영 ${op.length} · 개발 ${dev.length}</div></div>
    <div class="kpi"><div class="k">운영 수전</div><div class="v">${fmtMW(sum(op, 'power_mw')) || 0}<small>MW</small></div><div class="d">IT ${fmtMW(sum(op, 'it_mw')) || 0} MW · 수전 미상 ${unk(op, 'power_mw')}</div></div>
    <div class="kpi"><div class="k">개발 파이프라인 수전</div><div class="v">${fmtMW(sum(dev, 'power_mw')) || 0}<small>MW</small></div><div class="d">IT ${fmtMW(sum(dev, 'it_mw')) || 0} MW · 수전 미상 ${unk(dev, 'power_mw')}</div></div>
    <div class="kpi"><div class="k">자체 / 상용</div><div class="v">${d.filter(x => x.category === '자체').length}<small>/</small>${d.filter(x => x.category === '상용').length}</div><div class="d">센터 수 기준</div></div>
    <div class="kpi"><div class="k">확정 근거 비율</div><div class="v">${tot ? Math.round(cf / tot * 100) : 0}<small>%</small></div><div class="d">입력된 ${tot}개 값 중 ${cf}개 확정</div></div>
    <div class="kpi"><div class="k">주소 검토 필요</div><div class="v">${addrBad}</div><div class="d">정상 외 (부분·불일치 등)</div></div>`;
}

/* ---------------- list ---------------- */
function filtered() {
  const f = state.filters, q = f.q.trim().toLowerCase();
  const arr = state.dcs.filter(dc => {
    if (f.cat && dc.category !== f.cat) return false;
    if (f.phase && phaseOf(dc.status) !== f.phase) return false;
    if (f.conf && (!isNum(dc.power_mw) || confOf(dc, 'power_mw') !== f.conf)) return false;
    const loc = locOf(dc);
    if (f.area && loc.area !== f.area) return false;
    if (f.sido && loc.sido !== f.sido) return false;
    if (f.sgg && loc.sigungu !== f.sgg) return false;
    if (f.player.startsWith('w:')) { const w = watchOf(dc); if (f.player === 'w:*' ? !w.length : !w.includes(f.player.slice(2))) return false; }
    else if (f.player === '핵심' ? !PLAYERS.includes(playerOf(dc)) : f.player && playerOf(dc) !== f.player) return false;
    if (f.company && !ROLES.some(r => (!f.company.role || f.company.role === r.key) && companyMatch(dc[r.field], state.companies).includes(f.company.id))) return false;
    if (f.status.size && !f.status.has(dc.status)) return false;
    if (f.prep) { const p = prepOf(dc); if (f.prep === '미분류' ? (dc.status !== '설계중' || p.known) : p.stage !== f.prep || (dc.status === '설계중' && !p.known)) return false; }
    if (f.cm) { const c = complaintRisk(dc, dc.note || '').level; if (f.cm === 'risk' ? !['심각', '주의'].includes(c) : c !== f.cm) return false; }
    if (f.dbo) { const t = dboOf(dc).type; if (f.dbo === 'ext' ? !DBO_EXTERNAL.includes(t) : t !== f.dbo) return false; }
    if (q && ![dc.name, dboOf(dc).provider, dc.campus?.name, (dc.aliases || []).join(' '), watchOf(dc).join(' '), dc.owner, dc.contractor, dc.operator, dc.address, playerOf(dc), locOf(dc).sido, locOf(dc).sigungu, locOf(dc).area].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
  const s = f.sort, num = (x, k) => (isNum(x[k]) ? +x[k] : -1);
  return arr.sort((a, b) => (s === 'power' ? num(b, 'power_mw') - num(a, 'power_mw') || num(b, 'it_mw') - num(a, 'it_mw')
    : s === 'it' ? num(b, 'it_mw') - num(a, 'it_mw')
      : s === 'rfs' ? (ymKey(a.rfs_ym || a.complete_ym) || '9999').localeCompare(ymKey(b.rfs_ym || b.complete_ym) || '9999')
        : s === 'updated' ? String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
          : String(a.name).localeCompare(String(b.name), 'ko')));
}
function renderList() {
  const tb = $('#tbody'), arr = filtered();
  $('#countLbl').textContent = `${arr.length} / ${state.dcs.length}개`;
  renderCoFilterChip();
  const empty = (b, t) => `<tr><td colspan="11"><div class="empty"><b>${b}</b>${t}</div></td></tr>`;
  if (!state.loaded) { tb.innerHTML = empty('데이터를 불러오는 중입니다', 'GitHub 저장소의 최신 데이터를 읽고 있습니다.'); return; }
  if (!state.dcs.length) { tb.innerHTML = empty('아직 등록된 데이터센터가 없습니다', "'센터 추가'로 첫 항목을 등록하세요."); return; }
  if (!arr.length) { tb.innerHTML = empty('조건에 맞는 센터가 없습니다', '필터를 줄이거나 검색어를 바꿔 보세요.'); return; }
  tb.innerHTML = arr.map(dc => {
    const ac = addrCheck(dc);
    return `<tr data-id="${esc(dc.id)}" tabindex="0">
      <td><div class="name">${esc(dc.name)}${pchip(dc)}</div>${(dc.aliases || []).length ? `<div class="alias">${esc(dc.aliases.join(' · '))}</div>` : ''}${campusChip(dc)}</td>
      <td><span class="cat">${esc(dc.category || '—')}</span></td>
      <td>${statusPill(dc.status)}<div class="phase">${phaseOf(dc.status)}</div>${dc.status === '설계중' ? prepMini(dc) : ''}</td>
      <td><div>${esc(locOf(dc).sido)} ${esc(locOf(dc).sigungu)}${locOf(dc).area ? `<span class="atag ${locOf(dc).area === '수도권' ? 'm' : ''}">${locOf(dc).area === '수도권' ? '수도권' : '지방·' + esc(locOf(dc).region)}</span>` : ''}</div><span class="addr"><span class="dot" style="background:var(${ADDR_COLOR[ac.status]})"></span>${esc(ac.status)}</span></td>
      <td class="r num">${powerCell(dc)}</td>
      <td class="r num">${val(dc, 'it_mw', fmtMW(dc.it_mw))}</td>
      <td class="num">${val(dc, 'start_ym')}</td><td class="num">${val(dc, 'complete_ym')}</td><td class="num">${val(dc, 'rfs_ym')}</td>
      <td class="parties"><div><b>개발</b>${val(dc, 'owner')}</div><div><b>시공</b>${val(dc, 'contractor')}</div><div><b>운영</b>${val(dc, 'operator')}</div>${dboBadge(dc)}${listCm(dc)}</td>
      <td class="num" style="font-size:12px;color:var(--muted)">${fmtDate(dc.updated_at)}</td></tr>`;
  }).join('');
}

/* ---------------- map (Leaflet + OSM) ---------------- */
let map, dcLayer, gridLayer;
function ensureMap() {
  if (map || !window.L) return !!map;
  map = L.map('map', { scrollWheelZoom: false, zoomSnap: 0.5 }).setView([36.3, 127.8], 7);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  dcLayer = L.layerGroup().addTo(map); gridLayer = L.layerGroup().addTo(map);
  map.on('popupopen', e => { const b = e.popup.getElement().querySelector('[data-open]'); if (b) b.onclick = () => openDetail(b.dataset.open); });
  return true;
}
function renderMap() {
  if (!ensureMap()) { setTimeout(() => state.tab === 'map' && renderMap(), 300); return; }
  setTimeout(() => map.invalidateSize(), 0);
  dcLayer.clearLayers(); gridLayer.clearLayers();
  state.dcs.filter(d => isNum(d.lat) && isNum(d.lng) && state.mapStatus.has(d.status))
    .sort((a, b) => (+(b.power_mw || b.it_mw || 0)) - (+(a.power_mw || a.it_mw || 0)))
    .forEach(d => {
      const mw = +(d.power_mw || d.it_mw || 5), color = cssVar(STATUS_VAR[d.status] || '--none');
      L.circleMarker([+d.lat, +d.lng], { radius: Math.max(5, Math.sqrt(mw) * 1.6), color, weight: 1.5, fillColor: color, fillOpacity: 0.5 })
        .bindPopup(`<b>${esc(d.name)}</b><br>${esc(d.status)} · ${esc(d.category)}<br>수전 ${fmtMW(d.power_mw) || '—'} MW · IT ${fmtMW(d.it_mw) || '—'} MW<br>RFS ${esc(d.rfs_ym || d.complete_ym || '—')}<br><span style="color:#666">${esc(d.address)}</span><br><a href="${gmapUrl(d)}" target="_blank" rel="noopener">구글 지도에서 보기</a><br><button class="pop-btn" data-open="${esc(d.id)}">상세 · 수정</button>`)
        .addTo(dcLayer);
    });
  $('#gridToggleWrap').hidden = !state.grid.length;
  if (state.grid.length && $('#gridToggle').checked) {
    state.grid.filter(g => isNum(g.lat) && isNum(g.lng)).forEach(g => {
      const spare = +g.spare_mw || 0;
      L.circleMarker([+g.lat, +g.lng], { radius: spare > 0 ? Math.max(4, Math.sqrt(spare)) : 4, color: spare > 0 ? '#2c9443' : '#c9372c', weight: 1, dashArray: '3 3', fillOpacity: 0.08 })
        .bindPopup(`<b>${esc(g.name)}</b> (345kV)<br>추가 여유 ${spare} MW<br><span style="color:#666">${esc(g.source || '')} ${esc(g.as_of || '')}</span>`).addTo(gridLayer);
    });
  }
  const agg = arr => { const op = arr.filter(d => d.status === '운영중').length; const sum = f => arr.reduce((t, d) => t + (isNum(d[f]) ? +d[f] : 0), 0);
    return `<span>${arr.length}개 <span style="color:var(--muted)">(${op}/${arr.length - op})</span></span><span class="num">${fmtMW(sum('power_mw')) || '—'}</span><span class="num">${fmtMW(sum('it_mw')) || '—'}</span>`; };
  const regs = ['수도권', '지방'].map(area => {
    const inArea = state.dcs.filter(d => locOf(d).area === area);
    const sidos = SIDO_ORDER.filter(sd => (area === '수도권') === METRO_SIDO.includes(sd)).map(sd => [sd, inArea.filter(d => locOf(d).sido === sd)]).filter(([, l]) => l.length).sort((x, y) => y[1].length - x[1].length);
    return `<div class="region sub row" data-area="${area}"><b>${area}</b>${agg(inArea)}</div>` + sidos.map(([sd, l]) => `<div class="region row" data-area="${area}" data-sido="${sd}"><b>　${sd}</b>${agg(l)}</div>`).join('');
  }).join('');
  $('#regions').innerHTML = regs;
  const bad = state.dcs.map(d => [d, addrCheck(d)]).filter(([, a]) => a.status !== '정상');
  $('#mlist').innerHTML = bad.length ? bad.map(([d, a]) => `<div class="mrow" data-id="${esc(d.id)}"><span><span class="dot" style="background:var(${ADDR_COLOR[a.status]});margin-right:6px"></span>${esc(d.name)}</span><span style="font-size:12px;color:var(--muted)">${esc(a.status)} · ${esc(a.note)}</span></div>`).join('') : '<div class="note">모든 센터의 주소가 정상입니다.</div>';
}
function fitMap() {
  if (!map) return;
  if (state.mapView === 'metro') map.fitBounds([[37.0, 126.4], [37.95, 127.6]]);
  else map.setView([36.3, 127.8], 7);
}

/* ---------------- supply forecast (to 2031) ---------------- */
const FROM = 2026, TO = 2031;
const GROUPS = {
  player: { keys: [...PLAYERS, '기타'], color: k => PLAYER_VAR[k] },
  metro: { keys: ['수도권', '지방'], color: k => (k === '수도권' ? '--s-build' : '--s-done') },
  cat: { keys: ['상용', '자체'], color: k => (k === '상용' ? '--accent' : '--s-run') },
  conf: { keys: ['확정', '추정'], color: k => (k === '확정' ? '--accent' : '--est') }
};
function groupOf(split, dc, cap) {
  if (split === 'player') return playerOf(dc);
  if (split === 'metro') return locOf(dc).area === '수도권' ? '수도권' : '지방';
  if (split === 'cat') return dc.category === '자체' ? '자체' : '상용';
  return cap && cap.how === '확정' ? '확정' : '추정';
}
function runForecast(metric = state.supMetric, split = state.supSplit) {
  return forecast(state.dcs, { metric, from: FROM, to: TO, groupBy: (dc, cap) => groupOf(split, dc, cap) });
}
const yv = (b, g, mode) => { const x = b.groups[g]; return x ? x[mode] : 0; };

function renderPlayerCards() {
  const fc = runForecast(state.supMetric, 'player'), mode = state.supMode, unit = state.supMetric === 'it_mw' ? 'IT' : '수전';
  $('#playerCards').innerHTML = PLAYERS.map(p => {
    const mine = state.dcs.filter(d => playerOf(d) === p);
    const op = mine.filter(d => d.status === '운영중').length;
    const unknown = mine.filter(d => capacityOf(d, state.supMetric).mw === null).length;
    const cum = (fc.base.groups[p] || 0) + fc.years.reduce((s, y) => s + yv(fc.byYear[y], p, mode), 0);
    const t = state.targets.find(x => x.player === p && x.target_mw);
    return `<div class="pcard" style="--pc:var(${PLAYER_VAR[p]})" data-player="${esc(p)}" tabindex="0" role="button" aria-label="${esc(p)} 센터 목록 보기">
      <h4><span>${esc(p)}</span><span class="note">${mine.length}곳 · 운영 ${op}</span></h4>
      <div class="note">2031 누적 ${unit} (${mode === 'weighted' ? '가중' : '계획'})</div>
      <div class="big">${fmtMW(cum) || 0}<small class="note"> MW</small></div>
      ${(() => { const rt = state.targets.find(x => x.player === p && x.reported_mw); const known = mine.filter(d => d.status === '운영중').reduce((s, d) => s + (isNum(d.power_mw) ? +d.power_mw : 0), 0); return rt ? `<div class="row2"><span>보도 총량 ${rt.reported_mw}MW · ${rt.reported_n}개</span><span title="${esc(rt.reported_basis)}">입력 운영 수전 ${fmtMW(known) || 0}</span></div>` : ''; })()}
      <div class="row2"><span>${t ? `목표 ${t.target_mw}MW (${t.year})` : '공개 목표 없음'}</span><span>${t ? Math.round(cum / t.target_mw * 100) + '%' : ''}</span></div>
      ${t ? `<div class="bar"><span style="width:${Math.min(100, cum / t.target_mw * 100)}%;background:var(--pc)"></span></div>` : ''}
      <div class="row2" style="margin-top:6px"><span>용량 미상 ${unknown}곳</span><span>${unknown ? '추정에서 제외' : ''}</span></div></div>`;
  }).join('');
  $('#playerCards').querySelectorAll('[data-player]').forEach(c => {
    const go = () => { state.filters.player = c.dataset.player; $('#fPlayer').value = c.dataset.player; setTab('list'); renderList(); };
    c.addEventListener('click', go); c.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  });
}

// 주요 회사(회사 탭 ★) × 역할(개발사·운영사·시공사)별 공급. 한 센터가 여러 회사에 걸리면 각 회사 행에 모두 셉니다(합계 아님).
function renderWatch() {
  const metric = state.supMetric, mode = state.supMode, unit = metric === 'it_mw' ? 'IT' : '수전';
  const idx = companyIndex(state.dcs, state.companies);
  const sum = (arr, k) => (arr.some(d => isNum(d[k])) ? arr.reduce((t, d) => t + (isNum(d[k]) ? +d[k] : 0), 0) : null);
  const cumOf = list => { if (!list.length) return 0; const fc = forecast(list, { metric, from: FROM, to: TO, groupBy: () => 'x' }); return (fc.base.groups.x || 0) + fc.years.reduce((t, y) => t + yv(fc.byYear[y], 'x', mode), 0); };
  const role = state.watchRole || 'dev';
  const rows = state.companies.filter(c => c.major).map(c => ({ c, list: idx.byId[c.id].roles[role] })).filter(r => r.list.length)
    .map(r => ({ ...r, cum: cumOf(r.list), dev: cumOf(r.list.filter(d => phaseOf(d.status) === '개발')) })).sort((a, b) => b.cum - a.cum || b.list.length - a.list.length);
  $('#watchTable').innerHTML = `<div class="seg" id="watchRole" style="margin-bottom:8px">${ROLES.map(r => `<button data-v="${r.key}" aria-pressed="${r.key === role}">${r.label}</button>`).join('')}</div>
    <table class="ftable"><thead><tr><th>회사 (★ 주요)</th><th class="r">센터</th><th class="r">운영 / 개발</th><th class="r">수전 MW</th><th class="r">IT MW</th><th class="r">2031 누적 ${unit}<br><span class="of">${mode === 'weighted' ? '가중' : '계획'}</span></th><th class="r">그중 개발 중</th><th class="r">용량 미상</th></tr></thead><tbody>${rows.map(({ c, list, cum, dev }) => `<tr data-co="${esc(c.id)}" tabindex="0"><td class="name">${esc(c.name)} <span class="of">${esc(c.type)}</span></td><td class="r num">${list.length}</td><td class="r num">${list.filter(d => d.status === '운영중').length} / ${list.filter(d => phaseOf(d.status) === '개발').length}</td><td class="r num">${fmtMW(sum(list, 'power_mw')) || '—'}</td><td class="r num">${fmtMW(sum(list, 'it_mw')) || '—'}</td><td class="r num"><b>${cum > 0 ? fmtMW(cum) : '—'}</b></td><td class="r num">${dev > 0 ? fmtMW(dev) : '—'}</td><td class="r num">${list.filter(d => capacityOf(d, metric).mw === null).length}</td></tr>`).join('') || `<tr><td colspan="8" class="of">★ 주요 회사 중 ${ROLE_LABEL[role]}로 연결된 센터가 없습니다.</td></tr>`}</tbody></table>
    <p class="note" style="margin-top:6px">회사 탭에서 ★(주요)로 표시한 회사만 나옵니다 · ${ROLE_LABEL[role]} 칸에 회사명·별칭이 들어간 센터 기준 · 공동 사업은 참여 회사마다 모두 세므로 행을 더하면 중복됩니다 · 2031 누적은 위 공급 추정과 같은 방식(기존 운영 + 연도별 공급)으로 계산 · 행을 누르면 목록에서 해당 센터만 봅니다</p>`;
  $('#watchTable').querySelectorAll('#watchRole button').forEach(b => b.onclick = () => { state.watchRole = b.dataset.v; renderWatch(); });
  $('#watchTable').querySelectorAll('tr[data-co]').forEach(tr => { const go = () => { state.filters.company = { id: tr.dataset.co, role }; setTab('list'); renderList(); }; tr.onclick = go; tr.onkeydown = e => { if (e.key === 'Enter') go(); }; });
}
/* ---------------- 가치점수 ---------------- */
const scoreOf = dc => valueScore(dc, { dcs: state.dcs, evidence: state.evidence });
function renderValue() {
  const view = viewKey(state.valView || 'total'), scope = state.valScope || '';
  let arr = filtered();
  if (scope === 'dev') arr = arr.filter(d => phaseOf(d.status) === '개발');
  if (scope === 'pre') arr = arr.filter(d => d.status === '설계중');
  const rows = arr.map(dc => ({ dc, s: scoreOf(dc) })).map(r => ({ ...r, t: r.s.total(view) })).sort((a, b) => b.t - a.t);
  const V = SCORE_VIEWS[view];
  $('#valNote').textContent = `${rows.length}곳 · ${V.label} 순`;
  const bar = (v, m) => `<span class="vbar"><i style="width:${Math.max(0, Math.min(100, v / m * 100))}%"></i></span>`;
  const LENS = ['feasibility', 'asset', 'win'];
  const chips = k => SCORE_ITEMS.filter(it => SCORE_VIEWS[k].points[it.key]).sort((a, b) => SCORE_VIEWS[k].points[b.key] - SCORE_VIEWS[k].points[a.key]).map(it => `<span title="${esc(VALUE_RULE[it.key])}">${esc(it.label)} <b>${SCORE_VIEWS[k].points[it.key]}</b></span>`).join('');
  $('#valDef').innerHTML = `<div class="lenses">${LENS.map(k => `<div class="lens ${view === k || view === 'total' ? 'on' : ''}"><div class="lq"><b>${esc(SCORE_VIEWS[k].label)}</b> ${esc(SCORE_VIEWS[k].q)}</div><div class="ld">${esc(SCORE_VIEWS[k].d)}</div><div class="vpts">${chips(k)}</div></div>`).join('')}</div>
    <p class="note" style="margin:6px 0 12px">각 질문은 100점 만점 · 점수 = Σ(항목 점수 ÷ 만점 × 배점) · <b>종합</b> = 세 점수의 평균 · 항목 이름에 마우스를 올리면 산정 방식이 보입니다.</p>`;
  const col = (r, k) => { const v = r.s.total(k); return `<td class="r ${view === k ? 'sel' : ''}" title="${esc(r.s.breakdown(k).map(b => `${b.label} ${b.got}/${b.points} · ${b.basis}`).join('\n'))}"><b class="${k === 'total' ? 'vtot' : 'num'}">${v.toFixed(1)}</b>${bar(v, 100)}</td>`; };
  $('#valTable').innerHTML = rows.length ? `<table class="vtable"><thead><tr><th>#</th><th>센터</th><th>상태</th>${SCORE_VIEW_ORDER.map(k => `<th class="r ${view === k ? 'sel' : ''}">${esc(SCORE_VIEWS[k].label)}<span class="wt">${esc(SCORE_VIEWS[k].q)}</span></th>`).join('')}<th>민원</th><th>보정</th></tr></thead><tbody>${rows.map((r, i) => `<tr data-open="${esc(r.dc.id)}" tabindex="0"><td class="num">${i + 1}</td><td><div class="name">${esc(r.dc.name)}${pchip(r.dc)}</div><div class="alias">${esc(locOf(r.dc).sido)} ${esc(locOf(r.dc).sigungu)}</div></td><td>${statusPill(r.dc.status)}</td>${SCORE_VIEW_ORDER.map(k => col(r, k)).join('')}<td>${cmBadge(r.s.complaint)}</td><td>${r.s.manualCount ? `<span class="mtag">수동 ${r.s.manualCount}</span>` : '<span class="of">자동</span>'}</td></tr>`).join('')}</tbody></table>` : '<div class="empty"><b>대상 센터가 없습니다</b>필터를 줄여 보세요.</div>';
  $('#valTable').querySelectorAll('[data-open]').forEach(tr => tr.onclick = () => openDetail(tr.dataset.open));
  $('#valSpec').innerHTML = `<div class="spec"><table><thead><tr><th>질문</th><th>항목</th><th class="r">배점</th><th>항목 점수 산정 방식 (항목 만점 기준)</th></tr></thead><tbody>${LENS.map(k => SCORE_ITEMS.filter(it => SCORE_VIEWS[k].points[it.key]).sort((a, b) => SCORE_VIEWS[k].points[b.key] - SCORE_VIEWS[k].points[a.key]).map((it, n, all) => `<tr>${n === 0 ? `<td rowspan="${all.length}"><b>${esc(SCORE_VIEWS[k].label)}</b><br><span class="of">${esc(SCORE_VIEWS[k].q)}</span></td>` : ''}<td>${it.label} <span class="of">/${it.max}</span></td><td class="r num">${SCORE_VIEWS[k].points[it.key]}</td><td>${VALUE_RULE[it.key]}</td></tr>`).join('')).join('')}</tbody></table></div>
    <p class="note" style="margin-top:8px">예) 실현 가능성의 '전력 확보'가 10점 만점에 8점이면 8÷10×25 = 20점이 들어갑니다. 상세 화면에서 항목 점수를 직접 넣으면 자동값 대신 쓰이고(비우면 자동 복귀), 수정 이력이 남습니다.</p>`;
}
const cmBadge = c => (!c || c.level === '없음' ? '<span class="of">—</span>' : `<span class="cmchip l-${esc(c.level)}" title="${esc(c.basis)}">${esc(c.level)}</span>`);
const VALUE_RULE = {
  power_size: '수전 100MW↑10 · 50↑8 · 30↑6 · 10↑4 · 그 외 2 (IT만 있으면 ×1.4 환산, 추정값 ×0.85)',
  power_secure: '준비단계 전기확보: 확보(확정·착공 이후)10 · 확보(추정)8 · 협의중5 · 미확보1 · 정보 없음3',
  region: '서울6 · 수도권5 · 광역시/세종3 · 기타2',
  own_distance: '최근접 LG유플러스 센터: 5km 이내8 · 15km6 · 30km4 · 60km2 · 그 이상0 (좌표 기준 직선거리)',
  access: '최근접 업무·고객 거점(서울 도심·강남·판교·부산·대전·광주·대구): 10km6 · 25km5 · 45km3 · 80km2 · 그 이상1',
  complaint: '① 상세 화면의 민원 기록 우선: 진행 중 심각1 · 주의4 · 경미6 · 모두 해소7(운영·준공이면 9), 착공 이후 진행 중이면 +1 ② 기록이 없으면 비고·근거 자동 감지: 반려·소송·행정심판·집단민원·비대위 등 2 · 민원·전자파·소음·반대 4~5 · 해소·합의 언급 7 ③ 언급도 없으면 상태 기본값: 운영중10 · 준공9 · 착공/개발중8 · 설계중6(미확인 리스크)',
  stage: '운영중10 · 준공9 · 개발중8 · 착공7 · 설계중은 준비단계(착공 대기6 · 건축허가4 · 전기확보3 · 부지확보/미분류2)',
  evidence: '입력 필드 중 확정 근거 비율 × 5',
  finance: '본PF·투자 확정5 · 착공 이후/자체 투자4 · 브릿지론3 · 정보 없음1',
  tenant: '자체 사용8 · 임차확약·장기임대·위탁운영 등 계약6 · 운영중6 · 임차 협의/MOU4 · 정보 없음2',
  timing: '공급 시점 2027~2029년7 · 운영중/올해5 · 2030년 이후4 · 미상2',
  ai_ready: 'AI·GPU·액침·D2C·고밀도·하이퍼스케일 언급5, 없으면2',
  efficiency: 'PUE·Tier·LEED·Uptime 언급4, 없으면2',
  dbo_room: '착공 전·운영사 미정5 · 착공 전·운영사 있음3 · 착공·운영사 미정3 · 공사 중1 · 운영중/준공0',
  competitor: '핵심 경쟁사(KT·SK·LG CNS) 미점유5 · 자사3 · 경쟁사 점유1'
};

function renderCampusPlans() {
  const el = $('#supCampus'); if (!el) return;
  const plans = campusPlans(state.dcs).filter(g => g.plan_mw != null);
  const tot = plans.reduce((s, g) => s + (g.unassigned || 0), 0);
  el.innerHTML = plans.length ? `<p class="note" style="margin:0 0 8px">사이트 전체 계획 중 아직 단계(센터)로 등록되지 않은 용량입니다. 시점·확률이 불확실해 위 공급 추정에는 넣지 않았습니다. 합계 <b>${Math.round(tot).toLocaleString()}MW</b></p>
    <table class="ftable"><thead><tr><th>캠퍼스</th><th>등록 단계</th><th class="r">계획</th><th class="r">등록</th><th class="r">미배정</th><th>목표</th></tr></thead><tbody>${plans.map(g => `<tr>
      <td>${esc(g.name)}</td><td>${g.members.map(m => `<a href="#dc/${esc(m.id)}" data-open="${esc(m.id)}">${esc(m.campus?.phase || m.name)}</a>`).join(' · ')}</td>
      <td class="r num">${fmtPlan(g.plan_mw)}${g.basis !== '미상' ? ' <span class="of">' + g.basis + '</span>' : ''}</td><td class="r num">${g.assigned}</td><td class="r num"><b>${g.unassigned}</b></td><td class="num">${esc(g.plan_year || '—')}</td></tr>`).join('')}</tbody></table>`
    : '<p class="note" style="margin:0">캠퍼스 계획 용량이 기록된 센터가 없습니다.</p>';
  el.querySelectorAll('[data-open]').forEach(a => a.onclick = e => { e.preventDefault(); openDetail(a.dataset.open); });
}

function renderSupply() {
  renderPlayerCards(); renderWatch(); renderCampusPlans();
  const metric = state.supMetric, split = state.supSplit, mode = state.supMode, G = GROUPS[split];
  const fc = runForecast(metric, split), unit = metric === 'it_mw' ? 'IT Load' : '수전';
  const cols = ['기존', ...fc.years];
  const val = (c, g) => (c === '기존' ? fc.base.groups[g] || 0 : yv(fc.byYear[c], g, mode));
  const tot = c => G.keys.reduce((s, g) => s + val(c, g), 0);
  const cum = cols.map((c, i) => cols.slice(0, i + 1).reduce((s, x) => s + tot(x), 0));
  // chart
  const W = 780, H = 330, L0 = 48, R0 = 56, B = 32, T = 34, cw = (W - L0 - R0) / cols.length, bw = Math.min(54, cw * 0.58);
  const nice = m => { const st = m > 2000 ? 500 : m > 800 ? 200 : m > 400 ? 100 : m > 160 ? 50 : m > 60 ? 20 : 10; return [Math.ceil(m / st) * st || st, st]; };
  const [topL, stL] = nice(Math.max(10, ...cols.map(tot))), [topR, stR] = nice(Math.max(10, ...cum));
  const yL = v => H - B - (v / topL) * (H - B - T), yR = v => H - B - (v / topR) * (H - B - T);
  let svg = '';
  for (let t = 0; t <= topL + 0.001; t += stL) svg += `<line x1="${L0}" x2="${W - R0}" y1="${yL(t)}" y2="${yL(t)}" stroke="var(--line-2)"/><text x="${L0 - 6}" y="${yL(t) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${t}</text>`;
  for (let t = 0; t <= topR + 0.001; t += stR) svg += `<text x="${W - R0 + 6}" y="${yR(t) + 4}" font-size="11" fill="var(--faint)">${t}</text>`;
  svg += `<text x="${L0 - 6}" y="${T - 14}" text-anchor="end" font-size="10" fill="var(--muted)">신규</text><text x="${W - R0 + 6}" y="${T - 14}" font-size="10" fill="var(--faint)">누적</text>`;
  cols.forEach((c, i) => {
    const x = L0 + i * cw + (cw - bw) / 2; let acc = 0;
    G.keys.forEach(g => { const v = val(c, g); if (!v) return; svg += `<rect x="${x.toFixed(1)}" y="${yL(acc + v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(yL(acc) - yL(acc + v)).toFixed(1)}" fill="var(${G.color(g)})" ${c === '기존' ? 'fill-opacity=".45"' : ''}><title>${c} ${g} ${fmtMW(v)} MW</title></rect>`; acc += v; });
    if (acc) svg += `<text x="${(x + bw / 2).toFixed(1)}" y="${(yL(acc) - 5).toFixed(1)}" text-anchor="middle" font-size="11" font-family="var(--font-data)" fill="var(--ink)">${fmtMW(acc)}</text>`;
    svg += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 11}" text-anchor="middle" font-size="11" fill="var(--muted)">${c === '기존' ? '~2025' : c}</text>`;
  });
  const pts = cols.map((c, i) => [L0 + i * cw + cw / 2, yR(cum[i])]);
  svg += `<polyline points="${pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="var(--ink)" stroke-width="1.6" stroke-dasharray="${mode === 'weighted' ? '0' : '4 3'}"/>`;
  svg += pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i === pts.length - 1 ? 4 : 2.5}" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.5"><title>${cols[i]} 누적 ${fmtMW(cum[i])} MW</title></circle>`).join('');
  const last = pts[pts.length - 1];
  svg += `<text x="${(last[0] - 6).toFixed(1)}" y="${(last[1] - 9).toFixed(1)}" text-anchor="end" font-size="12" font-weight="600" font-family="var(--font-data)" fill="var(--ink)">2031 누적 ${fmtMW(cum[cum.length - 1])}</text>`;
  const legend = G.keys.map((g, j) => `<g transform="translate(${L0 + j * 96},8)"><rect width="10" height="10" fill="var(${G.color(g)})"/><text x="15" y="9" font-size="11" fill="var(--muted)">${g}</text></g>`).join('') +
    `<g transform="translate(${W - R0 - 96},8)"><line x1="0" x2="16" y1="5" y2="5" stroke="var(--ink)" stroke-width="1.6"/><text x="21" y="9" font-size="11" fill="var(--muted)">누적(우축)</text></g>`;
  $('#supChart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="2031년까지 연도별 공급 추정">${legend}${svg}</svg>`;
  $('#supTitle').textContent = `2031년까지 연도별 공급 추정 · ${unit} MW · ${mode === 'weighted' ? '상태별 실현확률 가중' : '계획 일정 그대로'}`;
  // table
  const td = v => `<td class="r num">${v ? fmtMW(v) : '<span style="color:var(--faint)">—</span>'}</td>`;
  $('#supTable').innerHTML = `<table class="ftable"><thead><tr><th>${split === 'player' ? '사업자' : '구분'}</th><th class="r">~2025 기존</th>${fc.years.map(y => `<th class="r">${y}</th>`).join('')}<th class="r">2031 누적</th></tr></thead><tbody>${
    G.keys.map(g => `<tr style="cursor:default"><td><span class="dot" style="background:var(${G.color(g)});margin-right:6px"></span>${esc(g)}</td>${cols.map(c => td(val(c, g))).join('')}${td(cols.reduce((s, c) => s + val(c, g), 0))}</tr>`).join('')}
    <tr class="tot" style="cursor:default"><td>신규 합계</td>${cols.map(c => td(tot(c))).join('')}${td(cum[cum.length - 1])}</tr>
    <tr style="cursor:default"><td>누적</td>${cum.map(v => td(v)).join('')}<td></td></tr></tbody></table>
    <p class="note">용량 미상 ${fc.unknown.length}곳은 제외 · 2032년 이후 ${fc.later.length}곳 · ${unit} 값이 없고 다른 지표만 있으면 PUE ${PUE_RATIO}로 환산(추정)</p>`;
  // evidence rows
  const rows = fc.rows.filter(r => r.year !== 'base' && r.year >= FROM).sort((a, b) => a.year - b.year || b.mw - a.mw);
  $('#supList').innerHTML = rows.map(r => `<div class="mrow" data-id="${esc(r.dc.id)}"><span>${r.year} · ${esc(r.dc.name)}${pchip(r.dc)}</span><span class="note num">${fmtMW(r.mw)}MW${r.cap.how === '환산' ? '(환산)' : r.cap.how === '연면적 환산' ? '(연면적 환산)' : r.cap.how === '추정' ? '(추정)' : ''} × ${Math.round(r.prob * 100)}% · ${esc(r.timing.how === '리드타임 추정' ? `${r.dc.status} → ${r.timing.ym} 추정` : `${r.timing.how} ${r.timing.ym}`)}</span></div>`).join('') || '<div class="note">해당 기간 공급 예정 센터가 없습니다.</div>';
  $('#supAssume').innerHTML = `
    <p><b>공급 시점</b> RFS → 없으면 준공월 → 없으면 오늘 기준 상태별 소요기간(${Object.entries(STATUS_LEAD_MONTHS).map(([k, v]) => `${k} ${v}개월`).join(', ')})으로 추정합니다. 분기·반기 표기는 그 기간의 마지막 달로 봅니다.</p>
    <p><b>가중 추정</b> 개발 중인 센터는 상태별 실현확률을 곱합니다: ${Object.entries(STATUS_PROB).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', ')}. 설계중 센터는 준비단계 정보가 있으면 진척도로 보정합니다: ${Object.entries(PREP_PROB).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', ')}. '계획 그대로'는 확률을 적용하지 않습니다.</p>
    <p><b>기존 공급</b> 2025년 이전에 RFS·준공했거나, 운영중인데 일정이 비어 있는 센터는 '~2025 기존'에 넣습니다.</p>
    <p><b>용량 환산</b> 선택한 지표가 없고 다른 지표만 있으면 수전 ≈ IT × ${PUE_RATIO}로 환산해 추정으로 다룹니다.</p>
    <p><b>한계</b> 핵심 4사 기존 센터 상당수가 센터별 용량을 공개하지 않아 추정에서 빠집니다. 상세 화면에서 용량을 입력하면 바로 반영됩니다. 사업자 목표(카드의 '목표')는 회사 발표치이며 추정에 더하지 않습니다.</p>`;
}

/* ---------------- permits ---------------- */
let permitLive = null, permitLoading = false;
async function loadPermitsLive() {
  if (permitLoading || permitLive) return;
  permitLoading = true; renderPermits();
  // 서버가 센터를 묶음(batch)으로 나눠 조회하므로 next가 없을 때까지 차례로 받아 합칩니다.
  let failed = false;
  const acc = { configured: true, ok: true, fetched_at: null, checked: 0, total: 0, linked: [], candidates: [], errors: [] };
  try {
    for (let b = 0; b !== null && b !== undefined;) {
      const r = await fetch(`/api/permits?batch=${b}`);
      const j = r.ok ? await r.json() : { configured: null, error: `HTTP ${r.status}` };
      if (j.configured !== true || j.ok === false || j.error) { permitLive = j; failed = true; break; }
      acc.fetched_at = acc.fetched_at || j.fetched_at; acc.checked += j.checked || 0; acc.total = j.total ?? acc.checked;
      acc.linked.push(...(j.linked || [])); acc.errors.push(...(j.errors || []));
      (j.candidates || []).forEach(c => { if (!acc.candidates.some(x => x.id === c.id)) acc.candidates.push(c); });
      acc.progress = j.next == null ? null : `${j.batch + 1}/${j.batches}`;
      permitLive = { ...acc }; renderPermits();
      b = j.next;
    }
    if (!failed) {
      const linkedIds = new Set(acc.linked.map(p => p.id));
      permitLive = { ...acc, progress: null, candidates: acc.candidates.filter(c => !linkedIds.has(c.id)) };
    }
  } catch { permitLive = acc.checked ? { ...acc, progress: null, errors: [...acc.errors, '일부 묶음 조회 중 연결이 끊겼습니다'] } : { configured: null, error: '실시간 조회 API에 연결할 수 없습니다(미리보기 환경)' }; }
  permitLoading = false; renderPermits();
}
function renderPermits() {
  const name = id => (state.dcs.find(d => d.id === id) || {}).name || id;
  const L = permitLive || {};
  const byId = new Map();
  state.permits.forEach(p => byId.set(p.id, { ...p, src: '저장' }));
  (L.linked || []).forEach(p => byId.set(p.id, { ...(byId.get(p.id) || {}), ...p, src: '실시간' }));
  const rows = [...byId.values()].sort((a, b) => String(b.archPmsDay).localeCompare(String(a.archPmsDay)));
  const nRef = state.dcs.filter(d => d.permit_ref?.sigunguCd).length, nBun = state.dcs.filter(d => d.permit_ref?.bun).length;
  const status = permitLoading ? `<span class="note">건축HUB 실시간 조회 중…${L.progress ? ` (${L.progress} 묶음 완료 · 연결 센터 ${L.checked}/${L.total}곳)` : ''}</span>`
    : !permitLive ? ''
    : L.configured === false ? '<div class="warnbox"><b>data.go.kr 인증키가 아직 등록되지 않았습니다.</b> ① data.go.kr에서 「국토교통부_건축HUB_건축인허가정보 서비스」 활용신청 → ② 발급된 일반 인증키(Decoding)를 Vercel → Settings → Environment Variables에 <code>BUILDING_HUB_KEY</code>(Sensitive)로 등록 → ③ Redeploy. 등록 즉시 이 탭에서 실시간 조회됩니다.</div>'
    : L.ok === false || L.error ? `<div class="warnbox"><b>건축HUB 조회 실패</b> ${esc(L.error || '')} <span class="note">· 활용신청 승인(보통 1~2시간)·인증키(Decoding 값) 확인</span></div>`
    : `<span class="note">건축HUB 실시간 · ${esc(fmtDT(L.fetched_at))} 기준 · 연결 센터 ${L.checked}곳 조회 → ${(L.linked || []).length}건 일치${(L.errors || []).length ? ` · 오류 ${L.errors.length}건` : ''} · 12시간 캐시</span>`;
  const tbl = list => `<div class="tablebox" style="border:0"><table style="min-width:960px"><thead><tr><th>건물명</th><th>위치</th><th>단계</th><th>허가일</th><th>착공일</th><th>사용승인일</th><th class="r">연면적(㎡)</th><th>주용도</th><th>연결 센터</th></tr></thead><tbody>${list.map(x => `<tr ${x.dc_id ? `data-id="${esc(x.dc_id)}"` : ''}><td class="name">${esc(x.bldNm || '—')}</td><td>${esc(x.platPlc)}</td><td>${esc(x.stage)}</td><td class="num">${esc(x.archPmsDay)}</td><td class="num">${esc(x.realStcnsDay)}</td><td class="num">${esc(x.useAprDay)}</td><td class="r num">${x.totArea ? Number(x.totArea).toLocaleString() : '—'}</td><td>${esc(x.mainPurpsCdNm)}</td><td>${x.dc_id ? `${esc(name(x.dc_id))}${x.level ? ` <span class="of">(${x.level})</span>` : ''}` : `<button type="button" class="btn sm" data-reg="${esc(x.id)}">센터로 등록</button>`}</td></tr>`).join('')}</tbody></table></div>`;
  const cands = L.candidates || [];
  $('#permitBody').innerHTML = `<div class="permit-meta"><span class="note">인허가 연결 센터 ${nRef}곳(지번 단위 ${nBun} · 법정동 단위 ${nRef - nBun}) · 주소에서 자동 변환, 상세 화면에서 수정 가능</span><button type="button" class="btn sm" id="permitReload">다시 조회</button></div>${status}
    <h4 class="psub">센터와 연결된 인허가 ${rows.length}건</h4>${rows.length ? tbl(rows) : '<div class="empty" style="padding:18px"><b>연결된 인허가가 없습니다</b>인증키 등록 후 조회되거나, 매일 08:00 자동 동기화로 저장됩니다.</div>'}
    ${cands.length ? `<h4 class="psub">신규 후보: 같은 법정동의 데이터센터성 인허가 ${cands.length}건 <span class="note">(방송통신시설·데이터·IDC 등 · 목록에 없는 건)</span></h4>${tbl(cands)}` : ''}`;
  $('#permitBody').querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => openDetail(tr.dataset.id));
  $('#permitBody').querySelectorAll('[data-reg]').forEach(b => b.onclick = () => {
    const c = cands.find(x => x.id === b.dataset.reg); if (!c) return;
    openDetail(null, { name: c.bldNm || `${c.platPlc} 데이터센터`, address: c.platPlc, status: c.useAprDay ? '준공' : c.realStcnsDay ? '착공' : '설계중',
      start_ym: (c.realStcnsDay || '').slice(0, 7), complete_ym: (c.useAprDay || '').slice(0, 7), note: `건축HUB 인허가 후보: 허가 ${c.archPmsDay || '-'}, 연면적 ${c.totArea || '-'}㎡, ${c.mainPurpsCdNm}` });
  });
  const rl = $('#permitReload'); if (rl) rl.onclick = () => { permitLive = null; loadPermitsLive(); };
}

/* ---------------- sources ---------------- */
function renderSources() {
  const groups = {};
  state.sources.slice().sort((a, b) => (a.no || 0) - (b.no || 0)).forEach(s => (groups[s.group] = groups[s.group] || []).push(s));
  $('#srcList').innerHTML = Object.entries(groups).map(([g, arr]) => `<div class="srcgrp"><h3>${esc(g)} · ${arr.length}</h3><div style="overflow-x:auto"><table style="min-width:520px"><tbody>${arr.map(s => `
    <tr style="cursor:default"><td class="num" style="width:32px;color:var(--faint)">${pad(s.no)}</td><td style="width:34px"><span class="tier ${esc(s.tier)}">${esc(s.tier)}</span></td>
    <td><div style="font-weight:600">${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)}</div><div style="font-size:12px;color:var(--muted)">${esc(s.collects)}</div></td>
    <td style="font-size:12px;color:var(--muted);white-space:nowrap">${esc(s.method)}<div class="num">${s.last_run ? fmtDate(s.last_run) + ' · ' + (s.last_hits ?? 0) + '건' : '수집 전'}</div></td>
    <td style="font-size:12px;width:44px;color:${s.enabled === false ? 'var(--faint)' : 'var(--ok)'}">${s.enabled === false ? '꺼짐' : '사용'}</td></tr>`).join('')}</tbody></table></div></div>`).join('') || '<div class="note">등록된 소스가 없습니다.</div>';
  const runs = state.runs.slice().sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 40);
  $('#runList').innerHTML = runs.length ? runs.map(r => `<div class="runrow"><div><div class="num" style="font-weight:500">${fmtDT(r.at)}</div><div style="font-size:12px;color:var(--muted)">${esc(r.kind || '자동수집')}</div></div>
    <div style="min-width:0"><div class="runstats"><span>소스 <b>${r.checked ?? 0}</b></span><span>신규 <b>${r.new_dcs ?? 0}</b></span><span>갱신 <b>${r.updated ?? 0}</b></span><span>근거 <b>${r.evidence ?? 0}</b></span><span>제안 <b>${r.proposals ?? 0}</b></span><span>오류 <b>${r.errors ?? 0}</b></span></div><div style="font-size:13px;margin-top:4px;overflow-wrap:anywhere">${esc(r.summary || '')}</div></div></div>`).join('') : '<div class="note">아직 수집 기록이 없습니다.</div>';
  const cl = $('#commitsLink');
  if (state.meta.repo) { cl.href = `https://github.com/${state.meta.repo}/commits/main/data`; cl.textContent = '· GitHub 변경 이력'; } else cl.textContent = '';
}

function renderAll() {
  renderHeader(); renderKpis(); renderLocFilters(); renderCoDatalist(); renderList(); renderSources(); renderPermits();
  if (state.tab === 'map') renderMap();
  if (state.tab === 'supply') renderSupply();
  if (state.tab === 'value') renderValue();
  if (state.tab === 'company') renderCompanies();
  if (csheet && csheet.id && !csheetDirty()) { const c = state.companies.find(x => x.id === csheet.id); if (c) { csheet.orig = structuredClone(c); csheet.draft = structuredClone(c); renderCSheet(); } }
  if (sheet && sheet.id) { const dc = state.dcs.find(d => d.id === sheet.id); if (dc && !isDirty()) { sheet.orig = structuredClone(dc); sheet.draft = structuredClone(dc); normDraft(); renderSheet(); } else { renderEvidence(); renderHistory(); } }
}

/* ---------------- tabs & filters ---------------- */
const TABS = ['list', 'map', 'supply', 'value', 'company', 'permits', 'sources', 'design'];
function setTab(t) {
  state.tab = t;
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  TABS.forEach(k => { $('#v-' + k).hidden = k !== t; });
  $('#kpis').hidden = !['list', 'map', 'supply'].includes(t);
  if (t === 'map') renderMap();
  if (t === 'supply') renderSupply();
  if (t === 'value') renderValue();
  if (t === 'company') renderCompanies();
  if (t === 'permits') loadPermitsLive();
  if (location.hash.slice(1) !== t && !location.hash.startsWith('#dc/')) history.replaceState(null, '', '#' + t);
}
$('#tabs').addEventListener('click', e => { const b = e.target.closest('.tab'); if (b) setTab(b.dataset.tab); });
function bindSeg(id, fn) { $(id).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; $(id).querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); fn(b.dataset.v); }); }
bindSeg('#fCat', v => { state.filters.cat = v; renderList(); });
bindSeg('#fPhase', v => { state.filters.phase = v; renderList(); });
bindSeg('#fConf', v => { state.filters.conf = v; renderList(); });
$('#fPrep').addEventListener('change', e => { state.filters.prep = e.target.value; renderList(); });
$('#fDbo').addEventListener('change', e => { state.filters.dbo = e.target.value; renderList(); });
$('#fCm').addEventListener('change', e => { state.filters.cm = e.target.value; renderList(); });
bindSeg('#mapView', v => { state.mapView = v; fitMap(); });
bindSeg('#supMetric', v => { state.supMetric = v; renderSupply(); });
bindSeg('#supSplit', v => { state.supSplit = v; renderSupply(); });
bindSeg('#supMode', v => { state.supMode = v; renderSupply(); });
bindSeg('#valView', v => { state.valView = v; renderValue(); });
bindSeg('#valScope', v => { state.valScope = v; renderValue(); });
function renderLocFilters() {
  const f = state.filters, base = state.dcs.filter(d => !f.area || locOf(d).area === f.area);
  const sum = (arr, k) => fmtMW(arr.reduce((t, d) => t + (isNum(d[k]) ? +d[k] : 0), 0)) || 0;
  $('#fArea').innerHTML = [['', '전국'], ['수도권', '수도권 (서울·인천·경기)'], ['지방', '지방']].map(([v, t]) => {
    const l = state.dcs.filter(d => !v || locOf(d).area === v);
    return `<button type="button" data-v="${v}" aria-pressed="${f.area === v}"><span class="t">${t}</span><span class="s">${l.length}곳 · 수전 ${sum(l, 'power_mw')} · IT ${sum(l, 'it_mw')} MW</span></button>`;
  }).join('');
  const sidos = SIDO_ORDER.filter(sd => base.some(d => locOf(d).sido === sd));
  if (f.sido && !sidos.includes(f.sido)) f.sido = '';
  const grp = a => sidos.filter(sd => (a === '수도권') === METRO_SIDO.includes(sd)).map(sd => `<option value="${sd}" ${sd === f.sido ? 'selected' : ''}>${sd} (${base.filter(d => locOf(d).sido === sd).length})</option>`).join('');
  $('#fSido').innerHTML = `<option value="">전체</option>${f.area !== '지방' && grp('수도권') ? `<optgroup label="수도권">${grp('수도권')}</optgroup>` : ''}${f.area !== '수도권' && grp('지방') ? `<optgroup label="지방">${grp('지방')}</optgroup>` : ''}`;
  const sggs = [...new Set(base.filter(d => locOf(d).sido === f.sido).map(d => locOf(d).sigungu).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
  if (f.sgg && !sggs.includes(f.sgg)) f.sgg = '';
  $('#fSgg').disabled = !f.sido;
  $('#fSgg').innerHTML = `<option value="">전체</option>` + sggs.map(g => `<option ${g === f.sgg ? 'selected' : ''}>${esc(g)}</option>`).join('');
}
$('#fArea').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.filters.area = b.dataset.v; renderLocFilters(); renderList(); });
$('#fSido').addEventListener('change', e => { state.filters.sido = e.target.value; state.filters.sgg = ''; renderLocFilters(); renderList(); });
$('#fSgg').addEventListener('change', e => { state.filters.sgg = e.target.value; renderList(); });
$('#regions').addEventListener('click', e => { const r = e.target.closest('[data-area]'); if (!r) return; Object.assign(state.filters, { area: r.dataset.area, sido: r.dataset.sido || '', sgg: '' }); setTab('list'); renderLocFilters(); renderList(); });
$('#fPlayer').addEventListener('change', e => { state.filters.player = e.target.value; renderList(); });
$('#fSort').addEventListener('change', e => { state.filters.sort = e.target.value; renderList(); });
$('#fQ').addEventListener('input', e => { state.filters.q = e.target.value; renderList(); });
STATUSES.forEach(s => {
  $('#fStatus').insertAdjacentHTML('beforeend', `<button class="stchip" data-s="${s}" aria-pressed="false"><span class="dot" style="background:var(${STATUS_VAR[s]})"></span>${s}</button>`);
  $('#mapStatus').insertAdjacentHTML('beforeend', `<button class="stchip" data-s="${s}" aria-pressed="true"><span class="dot" style="background:var(${STATUS_VAR[s]})"></span>${s}</button>`);
});
$('#fStatus').addEventListener('click', e => { const b = e.target.closest('.stchip'); if (!b) return; const s = b.dataset.s, on = !state.filters.status.has(s); on ? state.filters.status.add(s) : state.filters.status.delete(s); b.setAttribute('aria-pressed', String(on)); renderList(); });
$('#mapStatus').addEventListener('click', e => { const b = e.target.closest('.stchip'); if (!b) return; const s = b.dataset.s, on = !state.mapStatus.has(s); on ? state.mapStatus.add(s) : state.mapStatus.delete(s); b.setAttribute('aria-pressed', String(on)); renderMap(); });
$('#gridToggle').addEventListener('change', renderMap);
for (const id of ['#tbody', '#mlist', '#supList', '#permitBody']) {
  $(id).addEventListener('click', e => { const r = e.target.closest('[data-id]'); if (r && r.dataset.id) openDetail(r.dataset.id); });
}
$('#tbody').addEventListener('keydown', e => { if (e.key === 'Enter') { const tr = e.target.closest('tr[data-id]'); if (tr) openDetail(tr.dataset.id); } });
$('#btnAdd').addEventListener('click', () => openDetail(null));

/* ---------------- CSV ---------------- */
$('#btnCsv').addEventListener('click', () => {
  const cols = ['id', 'name', 'category', 'status', 'phase', 'owner', 'contractor', 'operator', 'address', 'sido', 'sigungu', 'lat', 'lng', 'power_mw', 'it_mw', 'area_m2', 'start_ym', 'complete_ym', 'rfs_ym', 'note'];
  const head = cols.map(c => LABEL[c] || c).concat(CONF_FIELDS.map(f => `${LABEL[f]} 근거`));
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [head.map(q).join(',')].concat(filtered().map(d => cols.map(c => q(Array.isArray(d[c]) ? d[c].join(' ') : d[c])).concat(CONF_FIELDS.map(f => q(confOf(d, f)))).join(',')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `DC공급현황_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

/* ---------------- editor identity ---------------- */
const editor = () => ({ name: store.get('dc-editor'), pw: store.get('dc-pw', sessionStorage) });
function askEditor() {
  return new Promise(resolve => {
    const dlg = $('#editorDlg'); $('#edName').value = editor().name; $('#edPw').value = editor().pw;
    dlg.returnValue = ''; dlg.showModal();
    dlg.addEventListener('close', () => {
      if (dlg.returnValue === 'ok') { store.set('dc-editor', $('#edName').value.trim()); store.set('dc-pw', $('#edPw').value, sessionStorage); resolve(true); } else resolve(false);
    }, { once: true });
  });
}
$('#btnEditor').addEventListener('click', askEditor);

async function post(body) {
  let ed = editor();
  if (!ed.name || !ed.pw) { if (!(await askEditor())) throw new Error('편집자 이름과 비밀번호가 필요합니다'); ed = editor(); }
  const r = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, editor: ed.name, password: ed.pw }) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) store.set('dc-pw', '', sessionStorage);
  if (!r.ok) throw new Error(j.error || `저장 실패 (${r.status})`);
  return j;
}

/* ---------------- detail sheet ---------------- */
let sheet = null;
const normDraft = () => { sheet.draft.conf = { ...(sheet.draft.conf || {}) }; sheet.draft.locked = { ...(sheet.draft.locked || {}) }; };
function closeDetail() { sheet = null; $('#sheetRoot').innerHTML = ''; document.removeEventListener('keydown', escClose); if (location.hash.startsWith('#dc/')) history.replaceState(null, '', '#' + state.tab); }
function escClose(e) { if (e.key === 'Escape' && !$('#editorDlg').open) closeDetail(); }

function openDetail(id, preset = null) {
  if (csheet) closeCompany();
  const dc = id ? state.dcs.find(d => d.id === id) : null;
  if (id && !dc) return;
  const orig = dc ? structuredClone(dc) : { id: null, name: '', aliases: [], category: '상용', status: '설계중', conf: {}, locked: {}, permit_ref: null };
  sheet = { id, orig, draft: structuredClone(orig) }; normDraft();
  if (!id && preset) Object.assign(sheet.draft, preset);
  if (id) history.replaceState(null, '', `#dc/${encodeURIComponent(id)}`);
  $('#sheetRoot').innerHTML = `<div class="scrim" id="scrim"></div><aside class="sheet" role="dialog" aria-modal="true" aria-labelledby="shTitle">
    <div class="sheet-h"><div style="flex:1;min-width:0"><h2 id="shTitle"></h2><div class="meta" id="shMeta"></div></div><button class="btn" id="shClose" type="button">닫기</button></div>
    <div class="sheet-b" id="shBody"></div>
    <div class="sheet-f"><span class="msg" id="shMsg"></span><button class="btn" id="shReset" type="button">되돌리기</button><button class="btn primary" id="shSave" type="button">변경사항 저장</button></div></aside>`;
  $('#scrim').onclick = closeDetail; $('#shClose').onclick = closeDetail; document.addEventListener('keydown', escClose);
  $('#shReset').onclick = () => { sheet.draft = structuredClone(sheet.orig); normDraft(); renderSheet(); };
  $('#shSave').onclick = saveDetail;
  renderSheet();
}

const EDIT_KEYS = ['name', 'aliases', 'category', 'status', 'owner', 'contractor', 'operator', 'power_mw', 'it_mw', 'area_m2', 'start_ym', 'complete_ym', 'rfs_ym', 'address', 'lat', 'lng', 'note', 'permit_ref', 'player', 'prep', 'score_manual', 'dbo', 'campus', 'complaints'];
const same = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');
function diff() {
  const d = sheet.draft, o = sheet.orig, changes = {}, conf = {}, locked = {};
  EDIT_KEYS.forEach(k => { if (!same(d[k], o[k])) changes[k] = d[k]; });
  CONF_FIELDS.forEach(k => { if (confOf(d, k) !== confOf(o, k)) conf[k] = confOf(d, k); });
  Object.keys({ ...d.locked, ...(o.locked || {}) }).forEach(k => { if (!!d.locked[k] !== !!(o.locked || {})[k] && !(k in changes) && !(k in conf)) locked[k] = !!d.locked[k]; });
  return { changes, conf, locked, n: Object.keys(changes).length + Object.keys(conf).length + Object.keys(locked).length };
}
const isDirty = () => !!sheet && diff().n > 0;

function fieldHTML(f, type, opts = {}) {
  const d = sheet.draft, v = d[f] ?? '';
  const dirty = !same(d[f], sheet.orig[f]) || (CONF_FIELDS.includes(f) && confOf(d, f) !== confOf(sheet.orig, f));
  let input;
  if (type === 'select') input = `<select id="f_${f}" data-f="${f}">${opts.options.map(o => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
  else if (type === 'textarea') input = `<textarea id="f_${f}" data-f="${f}">${esc(v)}</textarea>`;
  else input = `<input class="inp ${type === 'number' ? 'num' : ''}" id="f_${f}" data-f="${f}" ${type === 'number' ? 'inputmode="decimal"' : ''} value="${esc(Array.isArray(v) ? v.join(', ') : v)}" placeholder="${esc(opts.ph || '')}">`;
  const conf = CONF_FIELDS.includes(f) ? `<span class="cf" data-cf="${f}">${['확정', '추정'].map(c => `<button type="button" data-v="${c}" aria-pressed="${confOf(d, f) === c}">${c}</button>`).join('')}</span>` : '';
  const lockable = CONF_FIELDS.includes(f) || ['name', 'category', 'lat', 'lng'].includes(f);
  const lock = lockable ? `<button type="button" class="lock ${d.locked[f] ? '' : 'off'}" data-lock="${f}" title="${d.locked[f] ? '고정: 자동수집이 덮어쓰지 않습니다. 눌러서 해제' : '자동수집 갱신 허용. 눌러서 고정'}">${d.locked[f] ? '고정' : '자동'}</button>` : '';
  return `<div class="fld ${opts.full ? 'full' : ''} ${dirty ? 'dirty' : ''}"><label for="f_${f}">${LABEL[f]} ${lock}</label><div class="row">${input}${conf}</div></div>`;
}

function renderSheet() {
  if (!sheet) return;
  const d = sheet.draft, ac = addrCheck({ ...d, sido: '' }), pr = d.permit_ref || {};
  $('#shTitle').textContent = sheet.id ? (d.name || '이름 없음') : '새 데이터센터';
  $('#shMeta').innerHTML = `${statusPill(d.status)}<span class="cat">${esc(d.category || '')}</span><span>${phaseOf(d.status)}</span>${sheet.orig.updated_at ? `<span>· 최근 변경 ${fmtDT(sheet.orig.updated_at)} (${esc(String(sheet.orig.updated_by || '').replace('user:', ''))})</span>` : ''}`;
  const gm = gmapUrl(d), ga = d.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.address)}` : '';
  const permit = sheet.id ? state.permits.filter(p => p.dc_id === sheet.id) : [];
  $('#shBody').innerHTML = `
    <section class="sec"><h3>기본 정보 <span class="hint">수정한 필드는 '고정'되어 자동수집이 덮어쓰지 않습니다</span></h3><div class="frm">
      ${fieldHTML('name', 'text', { full: true })}${fieldHTML('aliases', 'text', { full: true, ph: '쉼표로 구분 (예: ICN11, 디지털서울2)' })}
      ${fieldHTML('category', 'select', { options: ['자체', '상용'] })}${fieldHTML('status', 'select', { options: STATUSES })}
      ${fieldHTML('owner', 'text', { ph: '개발사·발주처(사업주)' })}${fieldHTML('contractor', 'text', { ph: '시공사' })}${fieldHTML('operator', 'text', { ph: '운영사' })}
      <div class="fld"><label for="f_player">사업자 <span class="note">(자동 판정: ${esc(playerOf({ ...d, player: '' }))})</span></label><select id="f_player" data-f="player">${['', ...PLAYERS, '기타'].map(o => `<option value="${o}" ${o === (d.player || '') ? 'selected' : ''}>${o || '자동 판정 사용'}</option>`).join('')}</select></div>
      <div class="fld"><label>단계 (상태에서 자동)</label><div class="inp" style="background:var(--surface-2);border:1px solid var(--line);border-radius:6px;padding:7px 9px">${phaseOf(d.status)}</div></div>
      <div class="fld full"><label>회사 매칭 <span class="note">(회사 탭의 회사명·별칭 기준 자동 · 눌러서 회사 정보)</span></label><div class="comatch" id="coMatch">${coMatchHTML(d)}</div></div>
    </div></section>
    ${dboSection(d)}
    ${campusSection(d)}
    ${complaintSection(d)}
    <section class="sec"><h3>준비단계 <span class="hint">부지확보 → 전기확보 → 건축허가 → 착공 · 설계중 센터의 공급 확률에 반영</span></h3>
      ${prepStepper(d)}
      <div class="frm prepfrm">${PREP_STEPS.map(st => { const x = (d.prep || {})[st.key] || {}; const dirty = !same(x, ((sheet.orig.prep || {})[st.key]) || {}); return `<div class="fld full ${dirty ? 'dirty' : ''}"><label>${st.label}</label><div class="row">
        <select data-prep="${st.key}" data-k="state" aria-label="${st.label} 상태"><option value="">정보 없음</option>${st.states.map(o => `<option ${o === x.state ? 'selected' : ''}>${o}</option>`).join('')}</select>
        <input class="inp num" data-prep="${st.key}" data-k="ym" value="${esc(x.ym || '')}" placeholder="시점 YYYY-MM" aria-label="${st.label} 시점" style="max-width:130px">
        <span class="cf" data-prepc="${st.key}">${['확정', '추정'].map(c => `<button type="button" data-v="${c}" aria-pressed="${(x.c || '') === c}">${c}</button>`).join('')}</span></div>
        <input class="inp" data-prep="${st.key}" data-k="note" value="${esc(x.note || '')}" placeholder="메모·근거 요약" aria-label="${st.label} 메모" style="margin-top:6px"></div>`; }).join('')}</div>
    </section>
    ${sheet.id ? valueSection(d) : ''}
    <section class="sec"><h3>용량 · 일정</h3><div class="frm">
      ${fieldHTML('power_mw', 'number', { ph: 'MW' })}${fieldHTML('it_mw', 'number', { ph: 'MW' })}${fieldHTML('area_m2', 'number', { ph: '㎡ (건축HUB 자동)' })}
      ${!isNum(d.power_mw) && capacityOf(d, 'power_mw').mw !== null ? `<div class="full note">수전 미상 → 참고 환산 ${fmtMW(capacityOf(d, 'power_mw').mw)}MW (${capacityOf(d, 'power_mw').how}${capacityOf(d, 'power_mw').how === '연면적 환산' ? ` · ${AREA_KW_PER_M2}kW/㎡` : ` · IT×${PUE_RATIO}`}). 공급 추정에 '환산'으로 들어갑니다.</div>` : ''}
      ${fieldHTML('start_ym', 'text', { ph: 'YYYY-MM' })}${fieldHTML('complete_ym', 'text', { ph: 'YYYY-MM / YYYY-Q4 / YYYY-H2' })}${fieldHTML('rfs_ym', 'text', { ph: 'YYYY-MM / YYYY-Q4 / YYYY-H2' })}
    </div></section>
    <section class="sec"><h3>위치 · 주소 정합성</h3><div class="frm">
      ${fieldHTML('address', 'text', { full: true, ph: '예: 경기도 김포시 구래동 6880-1' })}${fieldHTML('lat', 'number', { ph: '37.xxxx' })}${fieldHTML('lng', 'number', { ph: '127.xxxx' })}
      <div class="full checkbox"><span class="dot" style="background:var(${ADDR_COLOR[ac.status]})"></span><b>${esc(ac.status)}</b><span style="color:var(--muted)">${esc(ac.note)}${ac.sido ? ` · 인식: ${esc(ac.sido)} ${esc(ac.sigungu || '')}` : ''}</span></div>
      <div class="full maplinks">${gm ? `<a href="${gm}" target="_blank" rel="noopener">구글 지도에서 좌표 보기</a>` : ''}${ga ? `<a href="${ga}" target="_blank" rel="noopener">구글 지도에서 주소 검색</a>` : ''}<span style="color:var(--faint)">두 위치가 다르면 좌표나 주소를 고친 뒤 저장하세요</span></div>
    </div></section>
    <section class="sec"><h3>인허가 연결 <span class="hint">건축HUB 일일 동기화 대상 · 코드는 행정표준코드(법정동코드) 앞 5자리/뒤 5자리</span></h3><div class="frm">
      <div class="fld"><label for="p_sigunguCd">시군구코드</label><input class="inp num" id="p_sigunguCd" data-p="sigunguCd" value="${esc(pr.sigunguCd || '')}" placeholder="예: 41570" inputmode="numeric"></div>
      <div class="fld"><label for="p_bjdongCd">법정동코드</label><input class="inp num" id="p_bjdongCd" data-p="bjdongCd" value="${esc(pr.bjdongCd || '')}" placeholder="예: 10600" inputmode="numeric"></div>
      <div class="fld"><label for="p_bun">번</label><input class="inp num" id="p_bun" data-p="bun" value="${esc(pr.bun || '')}" inputmode="numeric"></div>
      <div class="fld"><label for="p_ji">지</label><input class="inp num" id="p_ji" data-p="ji" value="${esc(pr.ji || '')}" inputmode="numeric"></div>
      ${permit.length ? `<div class="full">${permit.map(p => `<dl class="kv"><dt>건물명</dt><dd>${esc(p.bldNm)}</dd><dt>허가 · 착공 · 사용승인</dt><dd class="num">${esc(p.archPmsDay || '—')} · ${esc(p.realStcnsDay || '—')} · ${esc(p.useAprDay || '—')}</dd><dt>연면적</dt><dd class="num">${p.totArea ? Number(p.totArea).toLocaleString() + '㎡' : '—'}</dd><dt>동기화</dt><dd>${fmtDT(p.fetched_at)}</dd></dl>`).join('')}</div>` : ''}
    </div></section>
    <section class="sec">${fieldHTML('note', 'textarea', { full: true })}</section>
    ${sheet.id ? `<section class="sec"><h3>근거 <span class="hint" id="evCount"></span></h3><div id="evList"></div>
      <details id="evAdd"><summary style="cursor:pointer;font-size:13px;color:var(--accent);margin-top:8px">근거 추가</summary>
        <div class="addform">
          <div class="fld full"><label for="e_title">제목</label><input class="inp" id="e_title"></div>
          <div class="fld full"><label for="e_url">URL</label><input class="inp" id="e_url" placeholder="https://"></div>
          <div class="fld"><label for="e_pub">출처(매체·기관)</label><input class="inp" id="e_pub"></div>
          <div class="fld"><label for="e_date">발행일</label><input class="inp" id="e_date" placeholder="YYYY-MM-DD"></div>
          <div class="fld"><label for="e_grade">등급</label><select id="e_grade"><option value="A">A 공공·공시·사업자 1차</option><option value="B" selected>B 언론·리서치</option><option value="C">C 보조·전언</option></select></div>
          <div class="fld"><label for="e_fields">뒷받침 필드</label><input class="inp" id="e_fields" placeholder="예: 수전용량, RFS"></div>
          <div class="fld full"><label for="e_ex">발췌</label><textarea id="e_ex"></textarea></div>
          <div class="full"><button class="btn primary" type="button" id="e_save">근거 저장</button></div>
        </div></details></section>
      <section class="sec"><h3>히스토리 <span class="hint" id="hCount"></span></h3><div class="hist" id="hList"></div></section>` : ''}`;
  bindSheet(); updateFooter(); renderEvidence(); renderHistory();
}

function valueSection(d) {
  const s = valueScore(d, { dcs: state.dcs, evidence: state.evidence }), m = d.score_manual || {}, om = sheet.orig.score_manual || {};
  return `<section class="sec"><h3>가치점수 <span class="hint">자동 산정 · 칸에 숫자를 넣으면 수동 보정(비우면 자동)</span></h3>
    <div class="vsum">${SCORE_VIEW_ORDER.map(k => `<div><span>${SCORE_VIEWS[k].label}<br><small class="of">${esc(SCORE_VIEWS[k].q)}</small></span><b>${s.total(k).toFixed(1)}</b></div>`).join('')}${s.nearOwn ? `<div><span>최근접 자사센터</span><b style="font-size:13px">${esc(s.nearOwn.name)} · ${s.nearOwn.km.toFixed(1)}km</b></div>` : ''}</div>
    <table class="vitems"><colgroup><col style="width:34%"><col style="width:10%"><col><col style="width:78px"></colgroup><thead><tr><th>항목</th><th class="r">자동</th><th>근거</th><th>수동</th></tr></thead><tbody>${['feasibility', 'asset', 'win'].map(k => s.items.filter(i => lensOf(i.key) === k).map((i, n) => `<tr class="${String(m[i.key] ?? '') !== String(om[i.key] ?? '') ? 'dirty' : ''}"><td>${n === 0 ? `<span class="ax">${SCORE_VIEWS[k].label}</span>` : ''}${i.label} <span class="of">/${i.max} · 배점 ${SCORE_VIEWS[k].points[i.key]}</span></td><td class="r num">${i.auto}</td><td class="basis">${esc(i.basis)}</td><td><input class="inp num vin" data-score="${i.key}" inputmode="decimal" value="${m[i.key] ?? ''}" placeholder="${i.auto}" aria-label="${i.label} 수동 점수"></td></tr>`).join('')).join('')}</tbody></table>
    <input class="inp" data-score="note" style="width:100%;margin-top:8px" value="${esc(m.note || '')}" placeholder="보정 사유 (예: 현장 확인 결과 주민 민원 없음)" aria-label="보정 사유">
  </section>`;
}

function dboSection(d) {
  const x = d.dbo || {}, dirty = !same(d.dbo || null, sheet.orig.dbo || null);
  return `<section class="sec"><h3>DBO <span class="hint">DBO=설계(D)·구축(B)·운영(O) 일괄 · 부분 DBO=일부(운영만=위탁운영) · 마스터리스=운영사가 건물 전체 장기 임차 · 수정하면 고정되어 자동수집이 덮어쓰지 않습니다</span></h3>
    <div class="frm"><div class="fld full ${dirty ? 'dirty' : ''}"><div class="row dborow">
      <select data-dbo="type" aria-label="DBO 구분">${DBO_TYPES.map(t => `<option ${t === (x.type || '미상') ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <input class="inp" data-dbo="provider" list="coNames" value="${esc(x.provider || '')}" placeholder="DBO 사업자·마스터리스 임차인 (예: KT클라우드)" aria-label="DBO 사업자">
      <span class="cf scope" data-dboscope>${DBO_SCOPE.map(s => `<button type="button" data-v="${s.key}" aria-pressed="${(x.scope || []).includes(s.key)}" title="${s.label}">${s.key} ${s.label}</button>`).join('')}</span>
      <span class="cf" data-dboc>${['확정', '추정'].map(c => `<button type="button" data-v="${c}" aria-pressed="${(x.c || '') === c}">${c}</button>`).join('')}</span></div>
      <input class="inp" data-dbo="note" value="${esc(x.note || '')}" placeholder="메모·근거 요약 (예: 2026-02 설계·구축·운영 수주)" aria-label="DBO 메모" style="margin-top:6px"></div></div></section>`;
}

function campusSection(d) {
  const x = d.campus || {}, dirty = !same(d.campus || null, sheet.orig.campus || null);
  const g = x.name ? campusPlans(state.dcs.map(dc => (dc.id === sheet.id ? { ...dc, ...d } : dc)).concat(sheet.id ? [] : [d])).find(p => p.name === x.name) : null;
  const sum = g ? `<div class="full campsum">등록된 단계 ${g.members.length}곳 · 합계 ${g.assigned}MW${g.plan_mw != null ? ` / 계획 ${g.plan_mw}MW → <b>미배정 ${g.unassigned}MW</b> (공급 추정 제외)` : ''}${g.members.length > 1 ? `<div class="camplist">${g.members.map(m => `<button type="button" class="btn sm" data-goto="${esc(m.id)}">${esc(m.campus?.phase || m.name)}</button>`).join('')}</div>` : ''}</div>` : '';
  return `<section class="sec"><h3>캠퍼스 · 단계 <span class="hint">여러 동·단계로 나눠 짓는 사이트 · 이 센터는 현재 확정된 단계, 아래는 사이트 전체 계획 · 다음 단계가 구체화되면 같은 캠퍼스명으로 센터 추가</span></h3>
    <div class="frm ${dirty ? 'dirty' : ''}">
      <div class="fld"><label for="c_name">캠퍼스명</label><input class="inp" id="c_name" data-camp="name" value="${esc(x.name || '')}" placeholder="예: GS 동해 AI 데이터센터 캠퍼스"></div>
      <div class="fld"><label for="c_phase">이 센터의 단계</label><input class="inp" id="c_phase" data-camp="phase" value="${esc(x.phase || '')}" placeholder="예: 1단계, 1차, 1~2동"></div>
      <div class="fld"><label for="c_plan">캠퍼스 전체 계획 용량 (MW)</label><div class="row dborow"><input class="inp num" id="c_plan" data-camp="plan_mw" value="${esc(x.plan_mw ?? '')}" placeholder="예: 1000" inputmode="decimal">
        <select data-camp="basis" aria-label="용량 기준">${CAMPUS_BASIS.map(b => `<option ${b === (x.basis || '미상') ? 'selected' : ''}>${b}</option>`).join('')}</select></div></div>
      <div class="fld"><label for="c_year">전체 완성 목표</label><div class="row dborow"><input class="inp num" id="c_year" data-camp="plan_year" value="${esc(x.plan_year || '')}" placeholder="YYYY / YYYY-H2">
        <span class="cf" data-campc>${['확정', '추정'].map(c => `<button type="button" data-v="${c}" aria-pressed="${(x.c || '') === c}">${c}</button>`).join('')}</span></div></div>
      <div class="fld full"><label for="c_note">단계 계획 메모</label><input class="inp" id="c_note" data-camp="note" value="${esc(x.note || '')}" placeholder="예: 2~5단계 940MW, 2027년 이후 순차 착공"></div>
      ${sum}
    </div></section>`;
}

function complaintSection(d) {
  const list = d.complaints || [], dirty = !same(d.complaints || null, sheet.orig.complaints || null);
  const r = complaintRisk(d, [d.note, ...(state.evidence.filter(e => e.dc_id === sheet.id).map(e => `${e.title || ''} ${e.excerpt || ''}`))].join(' '));
  const row = (c, i) => `<div class="cmrow" data-cm="${i}">
      <select data-cmk="type" aria-label="유형">${COMPLAINT_TYPES.map(t => `<option ${t === c.type ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <select data-cmk="level" aria-label="심각도">${COMPLAINT_LEVELS.map(t => `<option ${t === c.level ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <select data-cmk="status" aria-label="상태">${['진행', '해소'].map(t => `<option ${t === (c.status || '진행') ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <input class="inp num" data-cmk="ym" value="${esc(c.ym || '')}" placeholder="YYYY-MM" aria-label="시점" style="max-width:96px">
      <input class="inp" data-cmk="note" value="${esc(c.note || '')}" placeholder="내용 (예: 초교 200m·아파트 54m, 비대위 반대)" aria-label="내용">
      <input class="inp" data-cmk="url" value="${esc(c.url || '')}" placeholder="근거 URL" aria-label="근거 URL" style="max-width:200px">
      <button type="button" class="btn sm" data-cmdel="${i}" aria-label="삭제">삭제</button></div>`;
  return `<section class="sec"><h3>민원·인허가 리스크 <span class="hint">주민 반대·전자파·송전선로·학교 인접·행정심판·인허가 반려 등을 건별로 기록 · 가치점수 '민원·인허가 리스크' 항목에 바로 반영</span></h3>
    <div class="cmsum">현재 판정: ${cmBadge(r)} <b>${r.v}/10</b> <span class="of">${esc(r.basis)}</span></div>
    <div class="cmlist ${dirty ? 'dirty' : ''}">${list.map(row).join('') || '<div class="of" style="font-size:13px">기록된 민원이 없습니다.</div>'}</div>
    <button type="button" class="btn sm" id="cmAdd" style="margin-top:8px">+ 민원·인허가 이슈 추가</button></section>`;
}

function bindSheet() {
  const body = $('#shBody');
  ['owner', 'operator', 'contractor'].forEach(f => { const el = $('#f_' + f); if (el) el.setAttribute('list', 'coNames'); });
  bindCoChips($('#coMatch'));
  body.querySelectorAll('[data-f]').forEach(el => {
    const f = el.dataset.f;
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
      let v = el.value;
      if (f === 'aliases') v = v.split(',').map(s => s.trim()).filter(Boolean);
      else if (['power_mw', 'it_mw', 'area_m2', 'lat', 'lng'].includes(f)) v = v.trim() === '' ? null : (isNum(v) ? Number(v) : v);
      sheet.draft[f] = v;
      const changed = !same(v, sheet.orig[f]);
      sheet.draft.locked[f] = changed ? true : !!(sheet.orig.locked || {})[f];
      el.closest('.fld').classList.toggle('dirty', changed);
      if (['status', 'category', 'address', 'lat', 'lng'].includes(f)) {
        const pos = el.selectionStart; renderSheet(); const n = $('#f_' + f);
        if (n) { n.focus(); try { if (pos != null) n.setSelectionRange(pos, pos); } catch { /* select */ } }
      } else {
        const lk = body.querySelector(`[data-lock="${f}"]`);
        if (lk) { lk.classList.toggle('off', !sheet.draft.locked[f]); lk.textContent = sheet.draft.locked[f] ? '고정' : '자동'; }
        updateFooter();
        if (['owner', 'operator', 'contractor'].includes(f)) { $('#coMatch').innerHTML = coMatchHTML(sheet.draft); bindCoChips($('#coMatch')); }
      }
    });
  });
  body.querySelectorAll('[data-p]').forEach(el => el.addEventListener('input', () => {
    const cur = { sigunguCd: '', bjdongCd: '', bun: '', ji: '', ...(sheet.draft.permit_ref || {}) };
    cur[el.dataset.p] = el.value.trim();
    sheet.draft.permit_ref = (cur.sigunguCd || cur.bjdongCd || cur.bun || cur.ji) ? cur : null;
    updateFooter();
  }));
  const setPrep = (key, k, v, rerender) => {
    const prep = structuredClone(sheet.draft.prep || {}), st = PREP_STEPS.find(s => s.key === key);
    const x = prep[key] || { state: '', ym: '', c: '추정' }; x[k] = v;
    if (!x.state && !x.ym && !x.note) delete prep[key]; else { if (!x.state) x.state = st.states[0]; prep[key] = x; }
    sheet.draft.prep = Object.keys(prep).length ? prep : null; sheet.draft.locked.prep = true;
    if (rerender) renderSheet(); else updateFooter();
  };
  body.querySelectorAll('[data-prep]').forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => setPrep(el.dataset.prep, el.dataset.k, el.value.trim(), el.tagName === 'SELECT')));
  body.querySelectorAll('[data-prepc]').forEach(g => g.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setPrep(g.dataset.prepc, 'c', b.dataset.v, true); }));
  const setDbo = (k, v, rerender) => {
    const x = { type: '미상', provider: '', scope: [], c: '추정', ...(sheet.draft.dbo || {}) };
    if (k === 'scope') x.scope = x.scope.includes(v) ? x.scope.filter(s => s !== v) : DBO_SCOPE.map(s => s.key).filter(s => s === v || x.scope.includes(s));
    else x[k] = v;
    if (k === 'type' && v === 'DBO' && !x.scope.length) x.scope = ['D', 'B', 'O'];
    if (k === 'type' && v === '마스터리스') x.scope = [];
    if (!x.note) delete x.note;
    sheet.draft.dbo = x.type === '미상' && !x.provider && !x.note ? null : x; sheet.draft.locked.dbo = true;
    if (rerender) renderSheet(); else updateFooter();
  };
  body.querySelectorAll('[data-dbo]').forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => setDbo(el.dataset.dbo, el.value.trim(), el.tagName === 'SELECT')));
  body.querySelector('[data-dboscope]')?.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setDbo('scope', b.dataset.v, true); });
  body.querySelector('[data-dboc]')?.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setDbo('c', b.dataset.v, true); });
  const setCamp = (k, v, rerender) => {
    const x = { name: '', phase: '', plan_mw: null, basis: '미상', plan_year: '', c: '추정', ...(sheet.draft.campus || {}) };
    x[k] = k === 'plan_mw' ? (v === '' ? null : (isNum(v) ? Number(v) : v)) : v;
    if (!x.note) delete x.note;
    sheet.draft.campus = !x.name && !x.phase && x.plan_mw == null && !x.note ? null : x; sheet.draft.locked.campus = true;
    if (rerender) renderSheet(); else updateFooter();
  };
  body.querySelectorAll('[data-camp]').forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => setCamp(el.dataset.camp, el.value.trim(), el.tagName === 'SELECT')));
  body.querySelector('[data-campc]')?.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setCamp('c', b.dataset.v, true); });
  body.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => { if (b.dataset.goto !== sheet.id) openDetail(b.dataset.goto); }));
  const setCm = (fn, rerender) => { const list = structuredClone(sheet.draft.complaints || []); fn(list); sheet.draft.complaints = list.length ? list : null; sheet.draft.locked.complaints = true; if (rerender) renderSheet(); else updateFooter(); };
  body.querySelectorAll('[data-cm]').forEach(rw => rw.querySelectorAll('[data-cmk]').forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => setCm(l => { l[+rw.dataset.cm][el.dataset.cmk] = el.value.trim(); }, el.tagName === 'SELECT'))));
  body.querySelectorAll('[data-cmdel]').forEach(b => b.addEventListener('click', () => setCm(l => l.splice(+b.dataset.cmdel, 1), true)));
  $('#cmAdd')?.addEventListener('click', () => setCm(l => l.push({ type: '주민 반대·집단민원', level: '주의', status: '진행', ym: '', note: '' }), true));
  body.querySelectorAll('[data-score]').forEach(el => el.addEventListener('input', () => {
    const k = el.dataset.score, cur = { ...(sheet.draft.score_manual || {}) }, v = el.value.trim();
    if (!v) delete cur[k]; else cur[k] = k === 'note' ? v : (isNum(v) ? Number(v) : v);
    sheet.draft.score_manual = Object.keys(cur).length ? cur : null; sheet.draft.locked.score_manual = true;
    el.closest('tr')?.classList.toggle('dirty', String((sheet.draft.score_manual || {})[k] ?? '') !== String((sheet.orig.score_manual || {})[k] ?? ''));
    updateFooter();
  }));
  body.querySelectorAll('[data-cf]').forEach(g => g.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; sheet.draft.conf[g.dataset.cf] = b.dataset.v; sheet.draft.locked[g.dataset.cf] = true; renderSheet(); }));
  body.querySelectorAll('[data-lock]').forEach(b => b.addEventListener('click', () => { const f = b.dataset.lock; sheet.draft.locked[f] = !sheet.draft.locked[f]; renderSheet(); }));
  const es = $('#e_save'); if (es) es.onclick = saveEvidence;
}

function updateFooter() {
  if (!sheet) return;
  const { n } = diff(), btn = $('#shSave'), msg = $('#shMsg');
  if (!state.meta.editable) { btn.disabled = true; msg.textContent = '보기 전용 배포입니다 (저장 설정 전)'; return; }
  btn.disabled = !n || (!sheet.id && !String(sheet.draft.name || '').trim());
  msg.textContent = n ? `${n}개 항목 변경됨` : sheet.id ? '변경 사항 없음' : '센터명을 입력하세요';
}

async function saveDetail() {
  const btn = $('#shSave'), msg = $('#shMsg');
  const { changes, conf, locked } = diff();
  if (!sheet.id) { // 신규: 입력된 값 전체를 changes로 보냄
    EDIT_KEYS.forEach(k => { if (sheet.draft[k] !== undefined && sheet.draft[k] !== '' && sheet.draft[k] !== null) changes[k] = sheet.draft[k]; });
    changes.category = sheet.draft.category; changes.status = sheet.draft.status;
  }
  btn.disabled = true; msg.textContent = 'GitHub에 커밋하는 중…';
  try {
    const r = await post({ action: 'edit', id: sheet.id, changes, conf, locked });
    toast(r.committed ? '저장했습니다 · GitHub에 커밋됨' : '변경 사항이 없습니다');
    await load(true);
    openDetail(r.id);
  } catch (e) { btn.disabled = false; msg.innerHTML = `<span class="err">${esc(e.message)}</span>`; }
}

async function saveEvidence() {
  const v = id => ($('#' + id).value || '').trim();
  try {
    const r = await post({ action: 'evidence', evidence: { dc_id: sheet.id, title: v('e_title'), url: v('e_url'), publisher: v('e_pub'), pub_date: v('e_date'), grade: $('#e_grade').value, fields: v('e_fields'), excerpt: v('e_ex') } });
    toast(r.committed ? '근거를 추가했습니다' : '이미 등록된 근거입니다');
    await load(true);
  } catch (e) { toast(e.message); }
}

function renderEvidence() {
  const el = $('#evList'); if (!el || !sheet) return;
  const ev = state.evidence.filter(e => e.dc_id === sheet.id).sort((a, b) => String(b.pub_date || '').localeCompare(String(a.pub_date || '')));
  $('#evCount').textContent = ev.length ? `${ev.length}건 · 최신순` : '';
  el.innerHTML = ev.length ? ev.map(e => `<div class="ev"><div class="grade ${esc(e.grade)}" title="등급 ${esc(e.grade)}">${esc(e.grade || '?')}</div><div style="min-width:0">
    <div class="t">${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title || e.url)}</a>` : esc(e.title)}</div>
    <div class="m">${esc(e.publisher || '')}${e.pub_date ? ' · ' + esc(e.pub_date) : ''}${String(e.added_by || '').startsWith('user:') ? ' · ' + esc(e.added_by.slice(5)) + ' 추가' : ''}</div>
    ${(e.fields || []).length ? `<div class="tags">${e.fields.map(f => `<span class="tag">${esc(f)}</span>`).join('')}</div>` : ''}
    ${e.excerpt ? `<div class="x">${esc(e.excerpt)}</div>` : ''}</div></div>`).join('') : '<div style="color:var(--muted);font-size:13px">등록된 근거가 없습니다. 아래에서 추가하세요.</div>';
}

function renderHistory() {
  const el = $('#hList'); if (!el || !sheet) return;
  const hs = state.history.filter(h => h.dc_id === sheet.id).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  $('#hCount').innerHTML = `${hs.length ? hs.length + '건' : ''}${state.meta.repo ? ` · <a href="https://github.com/${esc(state.meta.repo)}/commits/main/data/dcs.json" target="_blank" rel="noopener">GitHub 커밋</a>` : ''}`;
  const by = h => (h.by === 'user' ? `${h.editor || '사용자'} · 수동` : h.by === 'proposal' ? '자동수집 · 제안(미반영)' : '자동수집');
  el.innerHTML = hs.length ? hs.map(h => {
    const lbl = LABEL[h.field] || h.field;
    const chg = ['_create', '_evidence'].includes(h.field) ? `<b>${esc(lbl)}</b> ${esc(h.new)}` : `<b>${esc(lbl)}</b> ${h.old !== '' && h.old != null ? `<span class="old">${esc(h.old)}</span> → ` : ''}${esc(h.new)}`;
    return `<div class="h ${h.by === 'user' ? 'user' : ''}"><div class="when">${fmtDT(h.at)}</div><div class="chg">${chg}</div><div class="by">${esc(by(h))}${h.note ? ' · ' + esc(h.note) : ''}${h.evidence_url ? ` · <a href="${esc(h.evidence_url)}" target="_blank" rel="noopener">근거</a>` : ''}</div></div>`;
  }).join('') : '<div style="color:var(--muted);font-size:13px">기록이 없습니다.</div>';
}

/* ---------------- 회사: 개발사 · 운영사 · 시공사 ---------------- */
const ROLE_LABEL = Object.fromEntries(ROLES.map(r => [r.key, r.label]));
const coById = id => state.companies.find(c => c.id === id);
function coMatchHTML(d) {
  return ROLES.map(r => {
    const ids = companyMatch(d[r.field], state.companies);
    return `<span class="cmrow"><b>${r.label}</b>${ids.length ? ids.map(id => `<button type="button" class="cochip" data-co="${esc(id)}">${esc(coById(id)?.name || id)}</button>`).join('') : `<span class="of">${d[r.field] ? '미등록' : '—'}</span>`}</span>`;
  }).join('');
}
function bindCoChips(root) { root?.querySelectorAll('[data-co]').forEach(b => b.onclick = () => openCompany(b.dataset.co)); }
function renderCoDatalist() {
  let dl = $('#coNames');
  if (!dl) { dl = document.createElement('datalist'); dl.id = 'coNames'; document.body.appendChild(dl); }
  dl.innerHTML = state.companies.map(c => `<option value="${esc(c.name)}">`).join('');
}
function renderCoFilterChip() {
  const el = $('#coFilter'); if (!el) return;
  const f = state.filters.company, c = f && coById(f.id);
  el.innerHTML = c ? `<span class="cofchip">회사: <b>${esc(c.name)}</b>${f.role ? ' · ' + ROLE_LABEL[f.role] : ''}<button type="button" aria-label="회사 필터 해제" id="coFilterX">✕</button></span>` : '';
  if (c) $('#coFilterX').onclick = () => { state.filters.company = null; renderList(); };
}
function showInList(id, role) { state.filters.company = { id, role }; closeCompany(); setTab('list'); renderList(); }

function renderCompanies() {
  renderCoDatalist();
  const role = state.coRole || 'dev', scope = state.coScope ?? 'major', type = state.coType || '', q = (state.coQ || '').trim().toLowerCase();
  const idx = companyIndex(state.dcs, state.companies);
  const rows = state.companies.map(c => ({ c, list: idx.byId[c.id].roles[role] }))
    .filter(({ c, list }) => list.length || (c.roles || []).includes(role))
    .filter(({ c }) => scope !== 'major' || c.major)
    .filter(({ c }) => !type || c.type === type)
    .filter(({ c }) => !q || [c.name, ...(c.aliases || []), c.parent, c.note].join(' ').toLowerCase().includes(q))
    .map(r => ({ ...r, s: companyStats(r.list), dbo: state.dcs.filter(d => { const x = dboOf(d); return DBO_EXTERNAL.includes(x.type) && x.provider && companyMatch(x.provider, state.companies).includes(r.c.id); }) }))
    .sort((a, b) => b.s.n - a.s.n || (b.s.power || 0) - (a.s.power || 0) || a.c.name.localeCompare(b.c.name, 'ko'));
  const tot = rows.reduce((t, r) => t + r.s.n, 0);
  $('#coNote').textContent = `${ROLE_LABEL[role]} ${rows.length}곳 · 연결 센터 ${tot}건`;
  const mw = v => (v == null ? '<span class="of">—</span>' : fmtMW(v));
  $('#coTable').innerHTML = rows.length ? `<table class="ctable"><thead><tr><th>회사</th><th>유형</th><th class="r">센터</th><th class="r">운영 / 개발</th><th class="r">수전 MW</th><th class="r">IT MW</th><th class="r">개발 중 수전</th><th class="r" title="DBO·부분 DBO 사업자 또는 마스터리스 임차인으로 기록된 센터 수">DBO 수행</th><th>주요 지역</th><th>최근 변경</th></tr></thead><tbody>${rows.map(({ c, s, dbo }) => `<tr data-co="${esc(c.id)}" tabindex="0">
    <td><div class="name">${c.major ? '<span class="star" title="주요 회사">★</span>' : ''}${esc(c.name)}</div><div class="alias">${esc([c.parent && '그룹 ' + c.parent, ...(c.roles || []).filter(r => r !== role).map(r => ROLE_LABEL[r] + ' 겸업')].filter(Boolean).join(' · '))}</div></td>
    <td><span class="cotype">${esc(c.type)}</span></td>
    <td class="r num">${s.n || '<span class="of">0</span>'}</td><td class="r num">${s.op} / ${s.dev}</td>
    <td class="r num">${mw(s.power)}</td><td class="r num">${mw(s.it)}</td><td class="r num">${mw(s.pipeline)}</td>
    <td class="r num" title="${esc(dbo.map(d => d.name + ' (' + dboOf(d).type + ')').join('\n'))}">${dbo.length || '<span class="of">0</span>'}</td>
    <td style="font-size:12px">${esc(s.regions.join(' · ')) || '<span class="of">—</span>'}</td>
    <td class="num" style="font-size:12px;color:var(--muted)">${fmtDate(s.updated)}</td></tr>`).join('')}</tbody></table>`
    : '<div class="empty"><b>조건에 맞는 회사가 없습니다</b>범위를 \'전체\'로 바꾸거나 검색어를 지워 보세요.</div>';
  $('#coTable').querySelectorAll('tr[data-co]').forEach(tr => { tr.onclick = () => openCompany(tr.dataset.co); tr.onkeydown = e => { if (e.key === 'Enter') openCompany(tr.dataset.co); }; });
  const um = Object.entries(idx.unmatched[role]).sort((a, b) => b[1].length - a[1].length);
  $('#coUnmatched').innerHTML = um.length ? `<p class="note" style="margin:0 0 8px">센터의 ${ROLE_LABEL[role]} 칸에 적혀 있지만 회사로 등록되지 않은 명칭입니다. 등록하면 집계에 포함됩니다. 기존 회사의 다른 이름이면 그 회사의 별칭에 추가하세요.</p><div class="umlist">${um.map(([n, ids]) => `<span class="um"><span>${esc(n)}</span><span class="of">${ids.length}곳</span><button type="button" class="btn sm" data-um="${esc(n)}">등록</button></span>`).join('')}</div>`
    : `<p class="note" style="margin:0">${ROLE_LABEL[role]} 칸의 명칭이 모두 회사와 연결되어 있습니다.</p>`;
  $('#coUnmatched').querySelectorAll('[data-um]').forEach(b => b.onclick = () => openCompany(null, { name: b.dataset.um, roles: [role] }));
}

let csheet = null;
const csheetDirty = () => !!csheet && JSON.stringify(coFields(csheet.draft)) !== JSON.stringify(coFields(csheet.orig));
const coFields = c => ({ name: c.name || '', aliases: c.aliases || [], type: c.type || '', roles: [...(c.roles || [])].sort(), major: !!c.major, parent: c.parent || '', url: c.url || '', note: c.note || '' });
function closeCompany() { csheet = null; $('#sheetRoot').innerHTML = ''; document.removeEventListener('keydown', escCompany); }
function escCompany(e) { if (e.key === 'Escape' && !$('#editorDlg').open) closeCompany(); }
function openCompany(id, preset = {}) {
  if (sheet) closeDetail();
  const c = id ? coById(id) : null;
  if (id && !c) return;
  const orig = c ? structuredClone(c) : { id: null, name: '', aliases: [], type: COMPANY_TYPES[0], roles: [], major: false, parent: '', url: '', note: '', ...preset };
  csheet = { id, orig: c ? orig : { ...orig, name: '' }, draft: structuredClone(orig) };
  $('#sheetRoot').innerHTML = `<div class="scrim" id="scrim"></div><aside class="sheet" role="dialog" aria-modal="true" aria-labelledby="csTitle">
    <div class="sheet-h"><div style="flex:1;min-width:0"><h2 id="csTitle"></h2><div class="meta" id="csMeta"></div></div><button class="btn" id="csClose" type="button">닫기</button></div>
    <div class="sheet-b" id="csBody"></div>
    <div class="sheet-f"><span class="msg" id="csMsg"></span><button class="btn" id="csReset" type="button">되돌리기</button><button class="btn primary" id="csSave" type="button">${id ? '변경사항 저장' : '회사 등록'}</button></div></aside>`;
  $('#scrim').onclick = closeCompany; $('#csClose').onclick = closeCompany; document.addEventListener('keydown', escCompany);
  $('#csReset').onclick = () => { csheet.draft = structuredClone(csheet.orig); renderCSheet(); };
  $('#csSave').onclick = saveCompany;
  renderCSheet();
}
function renderCSheet() {
  if (!csheet) return;
  const d = csheet.draft, idx = csheet.id ? companyIndex(state.dcs, state.companies).byId[csheet.id] : null;
  const preview = !csheet.id && d.name ? { roles: Object.fromEntries(ROLES.map(r => [r.key, state.dcs.filter(dc => companyMatch(dc[r.field], [{ id: '_new', name: d.name, aliases: d.aliases }]).includes('_new'))])) } : idx;
  $('#csTitle').textContent = csheet.id ? d.name : '새 회사 등록';
  $('#csMeta').innerHTML = csheet.id ? `<span class="cotype">${esc(csheet.orig.type)}</span>${csheet.orig.major ? '<span class="star">★ 주요</span>' : ''}<span>· 최근 변경 ${fmtDT(csheet.orig.updated_at)} (${esc(String(csheet.orig.updated_by || '').replace('user:', ''))})</span>` : '<span>회사명과 별칭으로 센터의 개발사·운영사·시공사 칸을 자동 매칭합니다</span>';
  const f = (k, lab, inp) => `<div class="fld ${['note', 'aliases'].includes(k) ? 'full' : ''} ${JSON.stringify(coFields(d)[k]) !== JSON.stringify(coFields(csheet.orig)[k]) ? 'dirty' : ''}"><label for="c_${k}">${lab}</label><div class="row">${inp}</div></div>`;
  const roleSec = preview ? ROLES.map(r => {
    const list = preview.roles[r.key] || [], s = companyStats(list);
    return `<section class="sec"><h3>${r.label}로 참여한 센터 <span class="hint">${s.n}곳${s.n ? ` · 운영 ${s.op} · 개발 ${s.dev} · 수전 ${fmtMW(s.power) || '—'} MW · IT ${fmtMW(s.it) || '—'} MW` : ''}</span>${s.n && csheet.id ? `<button type="button" class="btn sm" style="margin-left:auto" data-inlist="${r.key}">목록에서 보기</button>` : ''}</h3>
      ${s.n ? `<div class="colist">${list.slice().sort((a, b) => (+b.power_mw || 0) - (+a.power_mw || 0)).map(dc => `<button type="button" class="corow" data-open="${esc(dc.id)}"><span class="name">${esc(dc.name)}</span>${statusPill(dc.status)}<span class="of">${esc(locOf(dc).sido)} ${esc(locOf(dc).sigungu)}</span><span class="num">${fmtMW(dc.power_mw) ? fmtMW(dc.power_mw) + ' MW' : ''}</span></button>`).join('')}</div>` : '<div class="of" style="font-size:13px">연결된 센터가 없습니다.</div>'}</section>`;
  }).join('') : '';
  const log = (csheet.orig.log || []).slice().reverse();
  $('#csBody').innerHTML = `<section class="sec"><h3>회사 정보 <span class="hint">별칭은 쉼표로 구분 · 센터 칸에 별칭이 포함되면 이 회사로 집계됩니다</span></h3><div class="frm">
      ${f('name', '회사명', `<input class="inp" id="c_name" data-c="name" value="${esc(d.name)}" placeholder="예: 코람코자산운용">`)}
      ${f('type', '유형', `<select id="c_type" data-c="type">${COMPANY_TYPES.map(t => `<option ${t === d.type ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
      ${f('aliases', '별칭', `<input class="inp" id="c_aliases" data-c="aliases" value="${esc((d.aliases || []).join(', '))}" placeholder="예: 코람코, KORAMCO">`)}
      ${f('roles', '주 역할', `<div class="chk">${ROLES.map(r => `<label><input type="checkbox" data-role="${r.key}" ${(d.roles || []).includes(r.key) ? 'checked' : ''}> ${r.label}</label>`).join('')}</div>`)}
      ${f('major', '관리 등급', `<div class="chk"><label><input type="checkbox" id="c_major" ${d.major ? 'checked' : ''}> ★ 주요 회사로 관리</label></div>`)}
      ${f('parent', '모회사·그룹', `<input class="inp" id="c_parent" data-c="parent" value="${esc(d.parent)}" placeholder="예: SK그룹">`)}
      ${f('url', '홈페이지', `<input class="inp" id="c_url" data-c="url" value="${esc(d.url)}" placeholder="https://">`)}
      ${f('note', '메모', `<textarea id="c_note" data-c="note" placeholder="사업 방향, 담당자 접점, 협력 이력 등">${esc(d.note)}</textarea>`)}
    </div></section>${roleSec}
    ${csheet.id ? `<section class="sec"><h3>변경 이력 <span class="hint">${log.length}건${state.meta.repo ? ` · <a href="https://github.com/${esc(state.meta.repo)}/commits/main/data/companies.json" target="_blank" rel="noopener">GitHub 커밋</a>` : ''}</span></h3>${log.map(h => `<div class="h ${h.editor !== 'auto' ? 'user' : ''}"><div class="when">${fmtDT(h.at)}</div><div class="chg">${esc(h.note)}</div><div class="by">${esc(h.editor === 'auto' ? '자동' : h.editor + ' · 수동')}</div></div>`).join('')}</section>` : ''}`;
  const body = $('#csBody');
  body.querySelectorAll('[data-c]').forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
    const k = el.dataset.c; csheet.draft[k] = k === 'aliases' ? el.value.split(',').map(x => x.trim()).filter(Boolean) : el.value;
    el.closest('.fld').classList.toggle('dirty', JSON.stringify(coFields(csheet.draft)[k]) !== JSON.stringify(coFields(csheet.orig)[k]));
    if (!csheet.id && ['name', 'aliases'].includes(k)) { clearTimeout(csheet.t); csheet.t = setTimeout(() => { const pos = el.selectionStart; renderCSheet(); const n = $('#c_' + k); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch { /* */ } } }, 400); }
    updateCFooter();
  }));
  body.querySelectorAll('[data-role]').forEach(el => el.onchange = () => { const set = new Set(csheet.draft.roles || []); el.checked ? set.add(el.dataset.role) : set.delete(el.dataset.role); csheet.draft.roles = ROLES.map(r => r.key).filter(k => set.has(k)); renderCSheet(); });
  $('#c_major').onchange = e => { csheet.draft.major = e.target.checked; renderCSheet(); };
  body.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { const id = b.dataset.open; closeCompany(); openDetail(id); });
  body.querySelectorAll('[data-inlist]').forEach(b => b.onclick = () => showInList(csheet.id, b.dataset.inlist));
  updateCFooter();
}
function updateCFooter() {
  if (!csheet) return;
  const btn = $('#csSave'), msg = $('#csMsg'), dirty = csheetDirty();
  if (!state.meta.editable) { btn.disabled = true; msg.textContent = '보기 전용 배포입니다 (저장 설정 전)'; return; }
  btn.disabled = !dirty || !String(csheet.draft.name || '').trim();
  msg.textContent = !String(csheet.draft.name || '').trim() ? '회사명을 입력하세요' : dirty ? '변경됨' : '변경 사항 없음';
}
async function saveCompany() {
  const btn = $('#csSave'), msg = $('#csMsg');
  btn.disabled = true; msg.textContent = 'GitHub에 커밋하는 중…';
  try {
    const r = await post({ action: 'company', company: { id: csheet.id, ...coFields(csheet.draft) } });
    toast(r.committed ? '회사 정보를 저장했습니다 · GitHub에 커밋됨' : '변경 사항이 없습니다');
    await load(true);
    openCompany(r.id);
  } catch (e) { btn.disabled = false; msg.innerHTML = `<span class="err">${esc(e.message)}</span>`; }
}
bindSeg('#coRole', v => { state.coRole = v; renderCompanies(); });
bindSeg('#coScope', v => { state.coScope = v; renderCompanies(); });
$('#coType').innerHTML = `<option value="">전체</option>${COMPANY_TYPES.map(t => `<option>${t}</option>`).join('')}`;
$('#coType').addEventListener('change', e => { state.coType = e.target.value; renderCompanies(); });
$('#coQ').addEventListener('input', e => { state.coQ = e.target.value; renderCompanies(); });
$('#coAdd').addEventListener('click', () => openCompany(null, { roles: [state.coRole || 'dev'] }));

/* ---------------- boot ---------------- */
const h0 = location.hash.slice(1);
if (TABS.includes(h0)) setTab(h0);
renderAll();
load().then(() => { if (h0.startsWith('dc/')) openDetail(decodeURIComponent(h0.slice(3))); });
window.addEventListener('focus', () => { if (!isDirty()) load(); });
window.addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (h.startsWith('dc/')) { const id = decodeURIComponent(h.slice(3)); if (!sheet || sheet.id !== id) openDetail(id); }
  else if (TABS.includes(h) && h !== state.tab) setTab(h);
});
