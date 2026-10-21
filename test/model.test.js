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
  assert.equal(SCORE_ITEMS.reduce((a, i) => a + i.max, 0), 100);
  assert.ok(s.nearOwn && s.nearOwn.km > 0);
  const t = s.total('balanced'); assert.ok(t > 0 && t <= 100);
  const m = valueScore({ ...d, score_manual: { complaint: 0 } }, { dcs, evidence });
  assert.equal(m.items.find(i => i.key === 'complaint').score, 0); assert.ok(m.total() < t);
  assert.throws(() => normalizeScoreManual({ complaint: 9 }), /민원/);
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
