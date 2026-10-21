import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 가짜 GitHub API: 메모리 저장소에서 ref/contents/trees/commits/refs 를 흉내 냅니다.
function fakeGitHub(files) {
  let head = 'c0'; const commits = { c0: { tree: 't0', files: { ...files } } }; const trees = { t0: { ...files } }; let n = 0; const log = [];
  const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url); const p = u.pathname; const m = opts.method || 'GET'; log.push(`${m} ${p}`);
    if (p.endsWith('/git/ref/heads/main')) return json({ object: { sha: head } });
    if (p.includes('/contents/data/')) {
      const name = p.split('/contents/')[1]; const ref = u.searchParams.get('ref'); const f = commits[ref].files[name];
      return f === undefined ? json({ message: 'Not Found' }, 404) : json({ encoding: 'base64', content: Buffer.from(f).toString('base64'), sha: 'b' });
    }
    if (p.endsWith('/git/trees') && m === 'POST') { const b = JSON.parse(opts.body); const id = `t${++n}`; trees[id] = { ...trees[commits[head].tree], ...Object.fromEntries(b.tree.map(t => [t.path, t.content])) }; return json({ sha: id }); }
    if (/\/git\/commits\/[^/]+$/.test(p) && m === 'GET') return json({ tree: { sha: commits[p.split('/').pop()].tree } });
    if (p.endsWith('/git/commits') && m === 'POST') { const b = JSON.parse(opts.body); const id = `c${++n}`; commits[id] = { tree: b.tree, files: trees[b.tree], message: b.message, parent: b.parents[0] }; return json({ sha: id }); }
    if (p.endsWith('/git/refs/heads/main') && m === 'PATCH') { const b = JSON.parse(opts.body); if (commits[b.sha].parent !== head) return json({ message: 'not ff' }, 422); head = b.sha; return json({}); }
    return json({ message: `unhandled ${m} ${p}` }, 500);
  };
  return { get head() { return commits[head]; }, log };
}

const resMock = () => { const r = { code: 0, body: null, headers: {} }; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; }; return r; };
const read = n => readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8');

test('api/save: 비밀번호 확인 → dcs·history를 한 커밋으로 저장', async () => {
  Object.assign(process.env, { GITHUB_TOKEN: 't', GITHUB_REPO: 'me/repo', EDIT_PASSWORD: 'pw' });
  const gh = fakeGitHub({ 'data/dcs.json': read('dcs'), 'data/history.json': read('history'), 'data/evidence.json': read('evidence') });
  const { default: save } = await import('../api/save.js');
  let r = resMock(); await save({ method: 'POST', body: { password: 'nope', editor: 'a', id: 'icn11', changes: { it_mw: 70 } } }, r);
  assert.equal(r.code, 401);
  r = resMock(); await save({ method: 'POST', body: { password: 'pw', editor: '재훈', id: 'icn11', changes: { it_mw: 70 } } }, r);
  assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(r.body.committed, true);
  assert.match(gh.head.message, /edit\(icn11\): IT Load\(MW\) — 재훈/);
  const saved = JSON.parse(gh.head.files['data/dcs.json']).find(d => d.id === 'icn11');
  assert.equal(saved.it_mw, 70); assert.equal(saved.locked.it_mw, true);
  assert.ok(JSON.parse(gh.head.files['data/history.json']).some(h => h.editor === '재훈' && h.field === 'it_mw'));
  r = resMock(); await save({ method: 'POST', body: { password: 'pw', editor: '재훈', id: 'icn11', changes: { status: '없음' } } }, r);
  assert.equal(r.code, 400);
  r = resMock(); await save({ method: 'POST', body: { password: 'pw', editor: '재훈', action: 'evidence', evidence: { dc_id: 'icn11', url: 'https://example.com/a', title: '테스트', grade: 'A' } } }, r);
  assert.equal(r.code, 200); assert.equal(r.body.committed, true);
});

test('api/data: GitHub 최신 커밋을 읽는다', async () => {
  Object.assign(process.env, { GITHUB_TOKEN: 't', GITHUB_REPO: 'me/repo' });
  fakeGitHub({ 'data/dcs.json': read('dcs') });
  const { default: data } = await import('../api/data.js');
  const r = resMock(); await data({ method: 'GET' }, r);
  assert.equal(r.code, 200); assert.equal(r.body.source, 'github'); assert.ok(r.body.dcs.length > 40); assert.deepEqual(r.body.permits, []);
});

test('api/permits: 묶음(batch) 단위로 나눠 조회하고 next로 이어진다', async () => {
  const { LIMIT } = await import('../scripts/permits.mjs'); Object.assign(LIMIT, { gapMs: 0 });
  delete process.env.GITHUB_TOKEN; process.env.BUILDING_HUB_KEY = 'k';
  const n = JSON.parse(read('dcs')).filter(d => d.permit_ref?.sigunguCd && d.permit_ref?.bjdongCd).length;
  globalThis.fetch = async () => new Response(JSON.stringify({ response: { header: { resultCode: '00' }, body: { totalCount: 0, items: '' } } }));
  const { default: permits } = await import('../api/permits.js');
  let b = 0, checked = 0, rounds = 0;
  while (b != null) {
    const r = resMock(); await permits({ url: `/api/permits?batch=${b}`, headers: {} }, r);
    assert.equal(r.code, 200); assert.equal(r.body.ok, true); assert.ok(r.body.checked <= 6);
    checked += r.body.checked; b = r.body.next; rounds++;
  }
  assert.equal(checked, n); assert.equal(rounds, Math.max(1, Math.ceil(n / 6)));
  delete process.env.BUILDING_HUB_KEY;
});
