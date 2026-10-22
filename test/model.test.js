import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addrCheck, applyEdit, applyAuto, addEvidence, validateData, playerOf, forecast, supplyTiming, ymKey } from '../lib/model.js';
import { syncPermits, pickPermit } from '../scripts/permits.mjs';

const dcs = JSON.parse(readFileSync(new URL('../data/dcs.json', import.meta.url)));
const NOW = '2026-10-20T01:00:00.000Z';

test('저장된 데이터는 검증을 통과한다', () => {
  const evidence = JSON.parse(readFileSync(new URL('../data/evidence.json', import.meta.url)));
  const history = JSON.parse(readFileSync(new URL('../data/history.json', import.meta.url)));
  assert.deepEqual(validateData({ dcs, evidence, history }), []);
});

test('주소 정합성', () => {
  assert.equal(addrCheck({ address: '경기도 안산시 단원구 신원로91번길 79', lat: 37.307, lng: 126.786 }).status, '정상');
  assert.equal(addrCheck({ address: '경기도 파주시', lat: 37.76, lng: 126.78 }).status, '부분');
  assert.equal(addrCheck({ address: '경기도 파주시 1', lat: 35.1, lng: 129 }).status, '불일치');
  assert.equal(addrCheck({ address: '서울 금천구 가산동 1' }).status, '좌표없음');
  assert.equal(addrCheck({ address: '어딘가' }).status, '주소불완전');
});

test('수동 수정은 필드를 고정하고 히스토리를 남긴다', () => {
  const r = applyEdit(dcs, [], { id: 'icn11', changes: { power_mw: '90', status: '준공' }, conf: { power_mw: '확정' }, editor: '재훈' }, NOW);
  const d = r.dcs.find(x => x.id === 'icn11');
  assert.equal(d.power_mw, 90); assert.equal(d.status, '준공'); assert.equal(d.phase, '개발');
  assert.equal(d.locked.power_mw, true); assert.equal(d.conf.power_mw, '확정');
  assert.equal(r.history.length, 2); assert.equal(r.history[0].editor, '재훈');
  assert.throws(() => applyEdit(dcs, [], { id: 'icn11', changes: { status: '공사중' }, editor: 'x' }), /상태/);
  assert.throws(() => applyEdit(dcs, [], { id: 'icn11', changes: { rfs_ym: '내년' }, editor: 'x' }), /형식/);
});

test('신규 등록', () => {
  const r = applyEdit(dcs, [], { changes: { name: 'Test Center', status: '설계중', category: '자체', it_mw: 10 }, editor: 'a' }, NOW);
  assert.equal(r.dcs.length, dcs.length + 1); assert.equal(r.history[0].field, '_create');
});

test('자동수집은 고정 필드를 덮어쓰지 않고 제안으로 남긴다', () => {
  const locked = applyEdit(dcs, [], { id: 'icn11', changes: { it_mw: 70 }, editor: 'a' }, NOW).dcs;
  const r = applyAuto(locked, [], 'icn11', { it_mw: { value: 64, conf: '확정' }, rfs_ym: { value: '2027-09', conf: '확정' } }, NOW);
  const d = r.dcs.find(x => x.id === 'icn11');
  assert.equal(d.it_mw, 70); assert.equal(d.rfs_ym, '2027-09');
  assert.equal(r.updated, 1); assert.equal(r.proposals, 1);
  assert.equal(r.history.find(h => h.field === 'it_mw').by, 'proposal');
});

test('근거 중복 방지', () => {
  const a = addEvidence([], [], { dc_id: 'icn11', url: 'https://x.y/1', title: 't' }, NOW, 'user', 'a');
  const b = addEvidence(a.evidence, a.history, { dc_id: 'icn11', url: 'https://x.y/1', title: 't' }, NOW, 'user', 'a');
  assert.equal(b.added, false); assert.equal(b.evidence.length, 1);
});

test('사업자 판정', () => {
  assert.equal(playerOf({ operator: 'KT클라우드' }), 'KT');
  assert.equal(playerOf({ operator: 'SK호라이즌' }), 'SK');
  assert.equal(playerOf({ owner: 'LG유플러스' }), 'LG유플러스');
  assert.equal(playerOf({ owner: '이지스자산운용', operator: 'LG CNS' }), 'LG CNS');
  assert.equal(playerOf({ owner: 'X', contractor: 'SK에코플랜트' }), '기타');
  assert.equal(playerOf({ owner: 'X', player: 'KT' }), 'KT');
  assert.ok(dcs.filter(d => playerOf(d) === 'KT').length >= 6);
});

test('공급 추정', () => {
  const now = new Date('2026-10-20');
  assert.equal(ymKey('2027-H2'), '2027-12');
  assert.deepEqual(supplyTiming({ status: '설계중' }, now), { ym: '2029-10', how: '리드타임 추정' });
  assert.equal(supplyTiming({ status: '운영중' }, now).how, 'base');
  const f = forecast([
    { status: '운영중', it_mw: 10 },
    { status: '개발중', it_mw: 100, rfs_ym: '2027-06' },
    { status: '설계중', power_mw: 140, complete_ym: '2030' }
  ], { metric: 'it_mw', now });
  assert.equal(f.base.nominal, 10);
  assert.equal(f.byYear[2027].weighted, 90);
  assert.equal(Math.round(f.byYear[2030].nominal), 100); // 140/1.4 환산
  assert.equal(Math.round(f.byYear[2031].cumWeighted), 10 + 90 + 50);
});

test('건축HUB 동기화: 착공·사용승인 반영', async () => {
  const data = { dcs: dcs.map(d => (d.id === 'ansan-our' ? { ...d, status: '착공', permit_ref: { sigunguCd: '41273', bjdongCd: '10100', bun: '79', ji: '' } } : d)), evidence: [], history: [], permits: [], runs: [] };
  const fake = async url => {
    assert.match(url, /ArchPmsHubService\/getApBasisOulnInfo/);
    assert.match(url, /bun=0079/);
    return new Response(JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: { item: [
      { mgmPmsrgstPk: 'P1', bldNm: '안산 OUR 데이터센터', mainPurpsCdNm: '방송통신시설', totArea: '8800', archPmsDay: '20260301', realStcnsDay: '20261012', useAprDay: '20271020', platPlc: '경기도 안산시 단원구' },
      { mgmPmsrgstPk: 'P2', bldNm: '창고', mainPurpsCdNm: '창고시설', totArea: '100' }] } } } }));
  };
  const out = await syncPermits(data, { key: 'k', fetchImpl: fake, now: NOW, log: () => {} });
  const d = out.dcs.find(x => x.id === 'ansan-our');
  assert.equal(d.status, '준공'); assert.equal(d.complete_ym, '2027-10'); assert.equal(d.conf.complete_ym, '확정');
  assert.equal(out.permits[0].stage, '준공'); assert.equal(out.evidence[0].grade, 'A');
  assert.equal(out.runs.at(-1).kind, '건축HUB 동기화');
  assert.equal(pickPermit([{ bldNm: '창고', mainPurpsCdNm: '창고시설' }], d), null);
});

test('행정구역: 수도권/지방', async () => {
  const { locOf } = await import('../lib/model.js');
  assert.deepEqual(locOf({ address: '경기도 김포시 구래동' }), { sido: '경기', sigungu: '김포시', area: '수도권', region: '수도권' });
  assert.equal(locOf({ address: '울산광역시 남구' }).area, '지방');
  assert.equal(locOf({ address: '세종특별자치시 집현동' }).sigungu, '세종');
  const metro = dcs.filter(d => locOf(d).area === '수도권').length, local = dcs.filter(d => locOf(d).area === '지방').length;
  assert.equal(metro + local, dcs.filter(d => d.address).length);
});

test('주요 개발·운영사 매칭', async () => {
  const { watchOf } = await import('../lib/model.js');
  assert.deepEqual(watchOf({ name: '케이스퀘어 데이터센터 가산', owner: '코람코자산운용' }), ['코람코']);
  assert.deepEqual(watchOf({ name: 'Digital Edge SEL2', owner: 'Digital Edge' }), ['디지털엣지']);
  assert.deepEqual(watchOf({ name: 'X', owner: '이지스자산운용' }), []);
  for (const w of ['코람코', '퍼시픽', '이도', '디지털엣지', '디지털리얼티', '삼성SDS', '액티스', '원아시아', 'SC제우스', '롯데이노베이트', '카카오', '네이버', 'CJ']) assert.ok(dcs.some(d => watchOf(d).includes(w)), w);
});

test('시공사는 시공사 필드로만 매칭', async () => {
  const { watchOf } = await import('../lib/model.js');
  assert.deepEqual(watchOf({ name: '현대건설 사옥 IDC', contractor: 'GS건설' }), ['GS건설']);
  assert.ok(dcs.some(d => watchOf(d).includes('현대건설')) && dcs.some(d => watchOf(d).includes('자이C&A')));
});

test('준비단계: 부지→전기→건축허가', async () => {
  const { prepOf, probOf, normalizePrep, applyEdit } = await import('../lib/model.js');
  assert.equal(prepOf({ status: '설계중' }).known, false);
  assert.equal(probOf({ status: '설계중' }), 0.5);
  const a = { status: '설계중', prep: { site: { state: '확보', c: '확정' } } };
  assert.equal(prepOf(a).stage, '전기확보 단계'); assert.equal(probOf(a), 0.45);
  const b = { status: '설계중', prep: { site: { state: '확보' }, power: { state: '확보' }, permit: { state: '허가', ym: '2026-10' } } };
  assert.equal(prepOf(b).stage, '착공 대기'); assert.equal(probOf(b), 0.7);
  assert.equal(prepOf({ status: '운영중' }).done, 3);
  assert.throws(() => normalizePrep({ site: { state: '확정' } }), /부지확보/);
  const r = applyEdit(dcs, [], { id: 'icn11', changes: { prep: { power: { state: '협의중', c: '추정' } } }, editor: 'a' }, NOW);
  assert.equal(r.dcs.find(x => x.id === 'icn11').prep.power.state, '협의중'); assert.equal(r.history[0].field, 'prep');
});

test('가치점수: 자동 산정 + 수동 보정', async () => {
  const { valueScore, normalizeScoreManual, SCORE_ITEMS, applyEdit } = await import('../lib/model.js');
  const evidence = JSON.parse(readFileSync(new URL('../data/evidence.json', import.meta.url)));
  const d = dcs.find(x => x.id === 'kamsquare-dc');
  const s = valueScore(d, { dcs, evidence });
  assert.equal(s.items.length, SCORE_ITEMS.length);
  const { SCORE_VIEWS } = await import('../lib/model.js');
  for (const v of Object.values(SCORE_VIEWS)) if (!v.combo) assert.equal(Object.values(v.points).reduce((a, b) => a + b, 0), 100);
  const owner = {}; for (const [k, v] of Object.entries(SCORE_VIEWS)) for (const it of Object.keys(v.points)) { assert.ok(!owner[it], `${it} 중복`); owner[it] = k; }
  assert.equal(Object.keys(owner).length, SCORE_ITEMS.length);
  assert.equal(Math.round(s.total('total')), Math.round((s.total('feasibility') + s.total('asset') + s.total('win')) / 3));
  assert.equal(s.total('invest'), s.total('feasibility'));
  assert.equal(s.breakdown('feasibility').reduce((a, b) => a + b.points, 0), 100);
  assert.ok(s.nearOwn && s.nearOwn.km > 0);
  const t = s.total('total'); assert.ok(t > 0 && t <= 100);
  const m = valueScore({ ...d, score_manual: { complaint: 0 } }, { dcs, evidence });
  assert.equal(m.items.find(i => i.key === 'complaint').score, 0); assert.ok(m.total() < t);
  assert.throws(() => normalizeScoreManual({ complaint: 11 }), /민원/);
  const r = applyEdit(dcs, [], { id: d.id, changes: { score_manual: { access: 6, note: '현장 확인' } }, editor: 'a' }, NOW);
  assert.equal(r.dcs.find(x => x.id === d.id).score_manual.access, 6);
});

test('회사 마스터: 개발사·운영사·시공사 매칭과 등록', async () => {
  const M = await import('../lib/model.js');
  let cos = M.applyCompanyEdit([], { name: 'KT클라우드', aliases: ['KT Cloud'], type: '통신·클라우드', roles: ['dev', 'op'] }, 'a', NOW).companies;
  cos = M.applyCompanyEdit(cos, { name: 'GS건설', type: '건설사', roles: ['con'] }, 'a', NOW).companies;
  cos = M.applyCompanyEdit(cos, { name: '자이C&A', aliases: ['자이씨앤에이'], type: '건설사', roles: ['con'] }, 'a', NOW).companies;
  assert.deepEqual(M.companyMatch('KT클라우드 (KT AI 컨소시엄)', cos), ['kt클라우드']);
  assert.deepEqual(M.companyMatch('GS건설 (선정 전, 유력)', cos), ['gs건설']);
  const dcs = [{ id: 'a', owner: '코람코자산운용 (PFV: GS건설 참여)', operator: 'KT클라우드', contractor: '자이씨앤에이', status: '착공', power_mw: 40 }];
  const idx = M.companyIndex(dcs, cos);
  assert.equal(idx.byId['kt클라우드'].roles.op.length, 1);
  assert.equal(idx.byId['gs건설'].roles.dev.length, 1);
  assert.equal(idx.byId['자이ca'].roles.con.length, 1);
  assert.deepEqual(Object.keys(idx.unmatched.dev), ['코람코자산운용']);
  assert.throws(() => M.applyCompanyEdit(cos, { name: 'kt cloud' }, 'a', NOW), /이미 등록/);
  const r = M.applyCompanyEdit(cos, { id: 'gs건설', name: 'GS건설', type: '건설사', roles: ['con', 'dev'], major: true }, 'b', NOW);
  assert.deepEqual(r.changed.sort(), ['major', 'roles']); assert.equal(r.companies.find(c => c.id === 'gs건설').log.at(-1).editor, 'b');
  assert.deepEqual(M.validateCompanies(r.companies), []);
  assert.deepEqual(M.validateCompanies(JSON.parse(readFileSync('data/companies.json', 'utf8'))), []);
});

test('건축HUB: 법정동 단위 매칭은 보수적으로', async () => {
  const { pickPermit, isDcPermit } = await import('../scripts/permits.mjs');
  const dc = { name: '부천 내동 데이터센터' };
  const a = { bldNm: '부천 내동 데이터센터', mainPurpsCdNm: '방송통신시설', totArea: 55000 };
  const b = { bldNm: '물류창고', mainPurpsCdNm: '창고시설', totArea: 90000 };
  const c = { bldNm: '', mainPurpsCdNm: '방송통신시설', totArea: 20000 };
  assert.equal(pickPermit([a, b, c], dc, { dongLevel: true }), a);
  assert.equal(pickPermit([b, c], { name: '다른 센터' }, { dongLevel: true }), c);
  assert.equal(pickPermit([b, c, { ...c, bldNm: 'X' }], { name: '다른 센터' }, { dongLevel: true }), null);
  assert.ok(isDcPermit(c) && !isDcPermit(b));
});

test('건축HUB 429: 대기 후 재시도해서 성공', async () => {
  const { LIMIT, fetchPermits } = await import('../scripts/permits.mjs');
  const saved = { ...LIMIT }; Object.assign(LIMIT, { gapMs: 0, backoffMs: 1 });
  let calls = 0;
  const fake = async () => { calls++; return calls < 3
    ? new Response('{"error":"per-second limit"}', { status: 429 })
    : new Response(JSON.stringify({ response: { header: { resultCode: '00' }, body: { totalCount: 1, items: { item: [{ mgmPmsrgstPk: 'X' }] } } } })); };
  try {
    const items = await fetchPermits({ sigunguCd: '1', bjdongCd: '2', bun: '3' }, 'k', fake);
    assert.equal(calls, 3); assert.equal(items[0].mgmPmsrgstPk, 'X');
    calls = -10; // 재시도 한도 초과 시 오류
    await assert.rejects(fetchPermits({ sigunguCd: '1', bjdongCd: '2', bun: '3' }, 'k', fake), /HTTP 429/);
  } finally { Object.assign(LIMIT, saved); }
});

test('건축HUB 빈 응답·XML 한도 초과도 재시도', async () => {
  const { LIMIT, fetchPermits } = await import('../scripts/permits.mjs');
  const saved = { ...LIMIT }; Object.assign(LIMIT, { gapMs: 0, backoffMs: 1 });
  const seq = ['', '<OpenAPI_ServiceResponse><returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR</returnAuthMsg></OpenAPI_ServiceResponse>',
    JSON.stringify({ response: { header: { resultCode: '00' }, body: { totalCount: 0, items: '' } } })];
  let i = 0; const fake = async () => new Response(seq[i++]);
  try { assert.deepEqual(await fetchPermits({ sigunguCd: '1', bjdongCd: '2', bun: '3' }, 'k', fake), []); assert.equal(i, 3); }
  finally { Object.assign(LIMIT, saved); }
});

test('자동수집 반영(ingest): 신규·갱신·고정 필드 제안·근거 중복 방지', async () => {
  const { ingest } = await import('../scripts/ingest.mjs');
  const read = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url)));
  const base = { dcs: read('dcs'), evidence: read('evidence'), history: read('history'), sources: read('sources'), runs: read('runs') };
  const target = base.dcs[0];
  base.dcs = base.dcs.map(d => (d.id === target.id ? { ...d, locked: { ...(d.locked || {}), owner: true } } : d));
  const ev = { url: 'https://example.com/a', title: 't', publisher: 'p', pub_date: '2026-10-21', grade: 'B', fields: ['상태'], excerpt: 'x', source_id: 's01' };
  const findings = { sources: [{ id: 's01', hits: 2 }], summary: '테스트', items: [
    { dc_id: target.id, updates: { owner: { value: '다른회사', conf: '추정', note: 'n' }, rfs_ym: { value: '2028-Q2', conf: '추정', note: 'n' } }, evidence: [ev, ev] },
    { new: { name: '테스트 신규 데이터센터', category: '상용', address: '경기도 화성시', status: '착공', it_mw: 40 }, evidence: [ev] }] };
  const out = ingest(base, findings, NOW);
  assert.deepEqual(validateData(out), []);
  assert.equal(out.stats.new_dcs, 1); assert.equal(out.stats.proposals, 1); assert.equal(out.stats.evidence, 2);
  assert.equal(out.dcs.find(d => d.id === target.id).owner, target.owner); // 고정 필드 유지
  const nd = out.dcs.find(d => d.name === '테스트 신규 데이터센터');
  assert.equal(nd.status, '착공'); assert.equal(nd.it_mw, 40); assert.equal(nd.sido, '경기');
  assert.equal(out.sources.find(s => s.id === 's01').last_hits, 2);
  assert.equal(out.runs.at(-1).kind, '자동수집');
});

test('플레이어 업데이트(ingest): 회사 프로필·핵심 4사 목표, 사람이 고친 필드는 유지', async () => {
  const { ingest } = await import('../scripts/ingest.mjs');
  const read = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url)));
  const base = { dcs: read('dcs'), evidence: read('evidence'), history: read('history'), sources: read('sources'), runs: read('runs'), companies: read('companies'), targets: read('targets') };
  const c0 = base.companies[0], c1 = base.companies[1];
  base.companies = base.companies.map(c => (c.id === c1.id ? { ...c, log: [...(c.log || []), { at: NOW, editor: '홍길동', fields: ['note'], note: '' }] } : c));
  const out = ingest(base, { kind: '플레이어 업데이트', summary: '주간', companies: [
    { id: c0.id, note: '최근 동향: 신규 캠퍼스 발표', url: 'https://example.com' },
    { id: c1.id, note: '자동이 덮으면 안 됨' },
    { name: '테스트신규자산운용', type: '자산운용·펀드', roles: ['dev'] }],
    targets: [{ player: 'KT', reported_mw: 170, reported_n: 16 }, { player: '없는회사', target_mw: 1 }] }, NOW);
  assert.equal(out.companies.find(c => c.id === c0.id).note, '최근 동향: 신규 캠퍼스 발표');
  assert.equal(out.companies.find(c => c.id === c0.id).updated_by, 'auto');
  assert.equal(out.companies.find(c => c.id === c1.id).note, c1.note);
  assert.ok(out.companies.some(c => c.name === '테스트신규자산운용'));
  assert.equal(out.targets.find(t => t.player === 'KT').reported_mw, 170);
  assert.equal(out.stats.targets, 1); assert.equal(out.stats.errors, 1); assert.equal(out.stats.proposals, 1);
  assert.equal(out.runs.at(-1).kind, '플레이어 업데이트');
  const { validateCompanies } = await import('../lib/model.js'); assert.deepEqual(validateCompanies(out.companies), []);
});

test('캠퍼스: 계획 용량 중 등록 단계 합계를 빼 미배정 용량 계산', async () => {
  const { campusPlans, normalizeCampus } = await import('../lib/model.js');
  const dcs = [{ id: 'a', power_mw: 60, campus: { name: 'X', phase: '1단계', plan_mw: 1000, basis: '수전' } },
    { id: 'b', power_mw: 100, campus: { name: 'X', phase: '2단계' } }, { id: 'c', it_mw: 10 }];
  const [g] = campusPlans(dcs);
  assert.equal(g.members.length, 2); assert.equal(g.assigned, 160); assert.equal(g.unassigned, 840);
  assert.throws(() => normalizeCampus({ name: 'X', plan_mw: -1 }));
  assert.equal(normalizeCampus({}), null);
});

test('DBO 구분: 마스터리스 허용, 예전 위탁운영은 부분 DBO로 변환', async () => {
  const { normalizeDbo } = await import('../lib/model.js');
  assert.equal(normalizeDbo({ type: '마스터리스', provider: 'KT클라우드' }).type, '마스터리스');
  assert.equal(normalizeDbo({ type: '위탁운영', provider: 'LG CNS', scope: ['O'] }).type, '부분 DBO');
  assert.throws(() => normalizeDbo({ type: '임대' }));
});

test('민원·인허가 리스크: 기록 우선, 없으면 비고 자동 감지·상태 기본값', async () => {
  const { complaintRisk, normalizeComplaints } = await import('../lib/model.js');
  assert.equal(complaintRisk({ status: '설계중', complaints: [{ type: '주민 반대·집단민원', level: '심각', status: '진행', note: 'x' }] }).v, 1);
  assert.equal(complaintRisk({ status: '착공', complaints: [{ type: '전자파·소음·열', level: '주의', status: '진행', note: 'x' }] }).v, 5);
  assert.equal(complaintRisk({ status: '운영중', complaints: [{ type: '행정심판·소송', level: '심각', status: '해소', note: 'x' }] }).v, 9);
  assert.equal(complaintRisk({ status: '설계중' }, '착공신고 반려').level, '심각');
  assert.equal(complaintRisk({ status: '설계중' }, '').v, 6);
  assert.equal(complaintRisk({ status: '운영중' }, '').v, 10);
  assert.equal(normalizeComplaints([{ type: '없는유형', note: 'a' }])[0].type, '기타');
  assert.throws(() => normalizeComplaints([{ note: 'a', url: 'ftp://x' }]));
});

test('건축HUB 동기화: 시간 제한에 걸리면 cursor를 남기고 다음 실행에서 이어서 조회', async () => {
  const { syncPermits, LIMIT } = await import('../scripts/permits.mjs');
  const saved = { ...LIMIT }; Object.assign(LIMIT, { gapMs: 0 });
  const mk = (id, bun) => ({ ...dcs[0], id, name: id, permit_ref: { sigunguCd: '11111', bjdongCd: '22222', bun, ji: '' } });
  const base = { dcs: [mk('a', '1'), mk('b', '2'), mk('c', '3')], evidence: [], history: [], permits: [], runs: [] };
  let n = 0;
  const fake = async () => { n++; await new Promise(r => setTimeout(r, 30)); return new Response(JSON.stringify({ response: { header: { resultCode: '00' }, body: { totalCount: 0, items: '' } } })); };
  try {
    const r1 = await syncPermits(base, { key: 'k', fetchImpl: fake, now: NOW, log: () => {}, budgetMs: 40 });
    const run1 = r1.runs.at(-1); assert.ok(run1.checked >= 1 && run1.checked < 3); assert.ok(run1.cursor > 0);
    const r2 = await syncPermits({ ...base, runs: r1.runs }, { key: 'k', fetchImpl: fake, now: NOW, log: () => {} });
    assert.equal(r2.runs.at(-1).cursor, 0); assert.equal(r2.runs.at(-1).checked, 3);
  } finally { Object.assign(LIMIT, saved); }
});

test('수전 환산: 수전 없으면 IT×1.4, 둘 다 없으면 연면적×1.0kW/㎡ (참고용 표시)', async () => {
  const { capacityOf } = await import('../lib/model.js');
  assert.deepEqual(capacityOf({ power_mw: 30 }, 'power_mw'), { mw: 30, how: '추정' });
  assert.equal(capacityOf({ it_mw: 10 }, 'power_mw').how, '환산');
  const a = capacityOf({ area_m2: 26445 }, 'power_mw');
  assert.equal(a.how, '연면적 환산'); assert.equal(a.mw, 26.4);
  assert.equal(capacityOf({ area_m2: 26445 }, 'it_mw').mw, 18.9);
  assert.equal(capacityOf({}, 'power_mw').mw, null);
});

test('빈 칸 보강 대상: 조사 안 한 센터 먼저, gap_checked 기록 후 다음 순번', async () => {
  const { pickGaps } = await import('../scripts/gaps.mjs');
  const { ingest } = await import('../scripts/ingest.mjs');
  const list = [
    { id: 'a', status: '운영중', address: '서울특별시 강남구', power_mw: null, it_mw: null },
    { id: 'b', status: '설계중', address: '경기도 김포시 구래동 6880-1', power_mw: null, it_mw: 10 },
    { id: 'c', status: '운영중', address: '서울특별시 강남구 역삼동 1', power_mw: 20, it_mw: null, area_m2: 1 }
  ];
  assert.deepEqual(pickGaps(list, 5).map(x => x.dc.id), ['a', 'b']);
  const out = ingest({ dcs: list, evidence: [], history: [], sources: [], runs: [] }, { gap_checked: ['a'] }, NOW);
  assert.equal(out.dcs.find(d => d.id === 'a').gap_checked_at, NOW);
  assert.deepEqual(pickGaps(out.dcs, 5).map(x => x.dc.id), ['b', 'a']);
});

test('건축HUB 동기화: 연면적 반영, 지번 없는 주소는 대지위치로 보완', async () => {
  const dc = { ...dcs[0], id: 'x1', status: '운영중', address: '서울특별시 영등포구 여의도동', area_m2: null, locked: {}, conf: {},
    permit_ref: { sigunguCd: '11560', bjdongCd: '11000', bun: '', ji: '' }, prep: null };
  const item = { mgmPmsrgstPk: 'P1', bldNm: '여의도 데이터센터', platPlc: '서울특별시 영등포구 여의도동 18번지', mainPurpsCdNm: '방송통신시설', totArea: '132331.77' };
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: { item: [item] }, totalCount: 1 } } }) });
  const out = await syncPermits({ dcs: [dc], evidence: [], history: [], permits: [], runs: [] }, { key: 'k', fetchImpl, now: NOW, log: () => {} });
  const d = out.dcs[0];
  assert.equal(d.area_m2, 132331.77); assert.equal(d.conf.area_m2, '확정');
  assert.equal(d.address, '서울특별시 영등포구 여의도동 18'); assert.equal(d.conf.address, '확정');
});

test('도로명주소 정제: 번지 주소는 표준화·인허가 연결, 시군구만 있으면 건물명으로 지번 보완(추정)', async () => {
  const { refineAddresses, cleanKeyword, pickByName, LIMIT } = await import('../scripts/address.mjs');
  LIMIT.gapMs = 0;
  // 다른 시·도의 같은 이름 구(대구 서구 ↔ 인천 서구)는 후보에서 제외
  assert.equal(pickByName([{ siNm: '대구광역시', sggNm: '서구', bdNm: '청라중학교', jibunAddr: '대구광역시 서구 비산동 228', admCd: '1', lnbrMnnm: '228' }], { name: '청라 데이터센터', aliases: [] }, '서구', '인천'), null);
  assert.equal(cleanKeyword('경기도 부천시 오정구 내동 222-13 외 10필지'), '경기도 부천시 오정구 내동 222-13');
  const J = (o) => ({ roadAddrPart1: '', jibunAddr: '', bdNm: '', admCd: '', lnbrMnnm: '', lnbrSlno: '0', mtYn: '0', rn: '', buldMnnm: '', buldSlno: '0', emdNm: '', sggNm: '', ...o });
  const db = {
    '서울특별시 영등포구 여의도동 18': [J({ roadAddrPart1: '서울특별시 영등포구 국제금융로 10', jibunAddr: '서울특별시 영등포구 여의도동 18', admCd: '1156011000', lnbrMnnm: '18', emdNm: '여의도동', rn: '국제금융로', buldMnnm: '10', sggNm: '영등포구', rnMgtSn: 'R1' }),
      J({ jibunAddr: '서울특별시 영등포구 여의도동 182', admCd: '1156011000', lnbrMnnm: '182', emdNm: '여의도동' })],
    '안산시 에포크': [J({ roadAddrPart1: '경기도 안산시 단원구 해봉로 1', jibunAddr: '경기도 안산시 단원구 성곡동 700-1', bdNm: '에포크 안산 데이터센터', admCd: '4127310300', lnbrMnnm: '700', lnbrSlno: '1', sggNm: '안산시 단원구', siNm: '경기도' })]
  };
  const fetchImpl = async u => { const q = new URL(u).searchParams;
    if (u.includes('addrCoordApi')) return { ok: true, status: 200, text: async () => JSON.stringify({ results: { common: { errorCode: '0' }, juso: q.get('rnMgtSn') === 'R1' ? [{ entX: '953898.449', entY: '1952035.979' }] : [] } }) };
    const kw = q.get('keyword'); const juso = db[kw] || [];
    return { ok: true, status: 200, text: async () => JSON.stringify({ results: { common: { errorCode: '0', errorMessage: '정상' }, juso } }) }; };
  const base = { status: '운영중', category: '상용', conf: {}, locked: {}, aliases: [], permit_ref: null };
  const data = { dcs: [
    { ...base, id: 'a', name: 'KT 여의도', address: '서울특별시 영등포구 여의도동 18' },
    { ...base, id: 'b', name: '액티스 안산 데이터센터', aliases: ['에포크 안산'], address: '경기도 안산시' },
    { ...base, id: 'c', name: '어딘가 센터', address: '경기도 화성시' }
  ], evidence: [], history: [], runs: [] };
  const out = await refineAddresses(data, { key: 'k', coordKey: 'c', fetchImpl, now: NOW });
  const [a, b, c] = out.dcs;
  assert.equal(a.addr_std.road, '서울특별시 영등포구 국제금융로 10'); assert.equal(a.address, '서울특별시 영등포구 여의도동 18');
  assert.deepEqual(a.permit_ref, { sigunguCd: '11560', bjdongCd: '11000', bun: '18', ji: '' });
  assert.equal(a.lat, 37.566535); assert.equal(a.lng, 126.977969); // UTM-K → WGS84 변환
  const { toUtmk, fromUtmk } = await import('../lib/utmk.js');
  const p = toUtmk(35.1796, 129.0756); const q = fromUtmk(p.x, p.y); assert.ok(Math.abs(q.lat - 35.1796) < 1e-6 && Math.abs(q.lng - 129.0756) < 1e-6);
  // 건물명 일치는 자동 반영하지 않고 후보로만 기록
  assert.equal(b.address, '경기도 안산시'); assert.equal(b.addr_std.status, '후보');
  assert.equal(b.addr_std.candidate.jibun, '경기도 안산시 단원구 성곡동 700-1'); assert.equal(b.permit_ref, null);
  assert.equal(c.addr_std.status, '미일치'); assert.equal(c.address, '경기도 화성시');
  // 주소가 그대로면 다음 실행에서 다시 조회하지 않음
  const again = await refineAddresses({ ...out, runs: [] }, { key: 'k', coordKey: 'c', fetchImpl, now: NOW });
  assert.equal(again.stats.checked, 0);
});

test('판매 현황: 계약 합계·잔여·판매율, 단가·내부 비공개 처리, 자동수집은 단가 제외·사람이 고친 항목 보호', async () => {
  const { applySalesOp, redactSales, salesOf, validateSales, emptySales } = await import('../lib/model.js');
  const { ingest } = await import('../scripts/ingest.mjs');
  let s = emptySales();
  s = applySalesOp(s, { kind: 'contract', item: { dc_id: 'x', customer: '고객A', mw: 10, price: 18, src: '내부', status: '계약' } }, '재훈', NOW).sales;
  s = applySalesOp(s, { kind: 'contract', item: { dc_id: 'x', customer: '고객B', mw: 14, basis: '수전', price: 15, status: '계약' } }, '재훈', NOW).sales;
  s = applySalesOp(s, { kind: 'contract', item: { dc_id: 'x', customer: '고객C', mw: 5, status: '협상' } }, '재훈', NOW).sales;
  const v = salesOf({ id: 'x', it_mw: 40 }, s);
  assert.equal(v.sold, 20); assert.equal(v.nego, 5); assert.equal(v.remain, 20); assert.equal(v.pct, 50); assert.equal(v.avgPrice, 16.5);
  const r = redactSales(s);
  assert.equal(r.contracts.length, 2); assert.ok(r.contracts.every(c => c.price === null)); assert.equal(r.hidden, 1);
  assert.ok(!JSON.stringify(r).includes('고객A'));
  // 임대율만 있으면 용량 × 임대율
  const s2 = applySalesOp(emptySales(), { kind: 'occupancy', item: { dc_id: 'y', pct: 90, ym: '2026-06' } }, 'auto', NOW).sales;
  assert.equal(salesOf({ id: 'y', it_mw: 30 }, s2).remain, 3);
  assert.deepEqual(validateSales(s, new Set(['x'])), []);
  assert.throws(() => applySalesOp(emptySales(), { kind: 'contract', item: { dc_id: 'x', customer: '', mw: 1 } }), /고객명/);
  // 자동수집: 단가·내부 제거, 같은 고객은 갱신, 사람이 고친 항목은 제안
  const base = { dcs: [{ id: 'x', name: 'X', status: '운영중', category: '상용', phase: '운영', conf: {}, locked: {} }], evidence: [], history: [], sources: [], runs: [], sales: s };
  const out = ingest(base, { sales: { contracts: [{ dc_id: 'x', customer: '고객B', mw: 20, price: 99, src: '내부' }, { dc_id: 'x', customer: '고객D', mw: 3, price: 99, src: '내부' }] } }, NOW);
  const d = out.sales.contracts.find(c => c.customer === '고객D');
  assert.equal(d.price, null); assert.equal(d.src, '공개'); assert.equal(out.stats.proposals, 1);
  assert.equal(out.sales.contracts.find(c => c.customer === '고객B').mw, 14);
});

test('건축HUB 관리번호(20자리)는 문자열로 보존', async () => {
  const pk = '10000000000000031234';
  const body = `{"response":{"header":{"resultCode":"00"},"body":{"items":{"item":[{"mgmPmsrgstPk":${pk},"bldNm":"데이터센터","platPlc":"경기도 부천시 오정구 내동 222-13번지","mainPurpsCdNm":"방송통신시설","totArea":"100"}]},"totalCount":1}}}`;
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => body });
  const dc = { ...dcs[0], id: 'pk1', status: '설계중', locked: {}, conf: {}, permit_ref: { sigunguCd: '41194', bjdongCd: '10500', bun: '222', ji: '13' } };
  const out = await syncPermits({ dcs: [dc], evidence: [], history: [], permits: [{ id: '1.0000000000000003e+21', dc_id: 'pk1' }], runs: [] }, { key: 'k', fetchImpl, now: NOW, log: () => {} });
  assert.deepEqual(out.permits.map(p => p.id), [pk]);
});

test('게시판: 등록 → 관리자 처리(상태·답변) → 삭제', async () => {
  const { applyBoardOp } = await import('../lib/model.js');
  assert.throws(() => applyBoardOp([], 'create', { title: '', author: 'a' }), /제목/);
  let r = applyBoardOp([], 'create', { title: '용인 센터 추가 요청', body: '내용', author: '홍길동', category: '요청' }, '', NOW);
  const id = r.id; let b = r.board;
  assert.equal(b[0].status, '접수'); assert.equal(b[0].category, '요청');
  r = applyBoardOp(b, 'reply', { id, status: '완료', reply: '추가했습니다' }, '재훈', NOW); b = r.board;
  assert.equal(b[0].status, '완료'); assert.equal(b[0].reply, '추가했습니다'); assert.equal(b[0].replied_by, '재훈'); assert.equal(b[0].log.length, 2);
  assert.ok(applyBoardOp(b, 'reply', { id, status: '완료', reply: '추가했습니다' }, '재훈', NOW).unchanged);
  assert.equal(applyBoardOp(b, 'delete', { id }).board.length, 0);
});
