// 데이터 저장소: GitHub 저장소의 data/*.json 파일.
// - 읽기: GITHUB_TOKEN이 있으면 GitHub API로 최신 커밋을 읽고, 없으면 배포 번들의 data/ 폴더를 읽습니다.
// - 쓰기: Git Data API로 여러 파일을 하나의 커밋으로 원자적으로 반영합니다(충돌 시 재시도).
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const DATA_FILES = ['dcs', 'evidence', 'history', 'sources', 'runs', 'permits', 'grid', 'targets', 'companies', 'sales'];
const API = 'https://api.github.com';

const cfg = () => ({
  token: process.env.GITHUB_TOKEN,
  repo: process.env.GITHUB_REPO,            // 예: myname/dc-supply-platform
  branch: process.env.GITHUB_BRANCH || 'main'
});

async function gh(p, opts = {}, fetchImpl = fetch) {
  const { token } = cfg();
  const res = await fetchImpl(`${API}${p}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'dc-supply-platform', ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) }
  });
  if (!res.ok) { const e = new Error(`GitHub ${res.status} ${p}`); e.status = res.status; e.body = await res.text().catch(() => ''); throw e; }
  return res.status === 204 ? null : res.json();
}

export const githubEnabled = () => !!(cfg().token && cfg().repo);

/** 저장소 공개 여부 (단가·내부 정보 저장 전 확인). 확인할 수 없으면 공개로 간주합니다. */
export async function repoIsPrivate(fetchImpl = fetch) {
  if (!githubEnabled()) return false;
  try { return !!(await gh(`/repos/${cfg().repo}`, {}, fetchImpl)).private; } catch { return false; }
}

async function headSha(fetchImpl) {
  const { repo, branch } = cfg();
  return (await gh(`/repos/${repo}/git/ref/heads/${branch}`, {}, fetchImpl)).object.sha;
}

async function readAt(sha, names, fetchImpl) {
  const { repo } = cfg();
  const out = {};
  await Promise.all(names.map(async n => {
    try {
      const f = await gh(`/repos/${repo}/contents/data/${n}.json?ref=${sha}`, {}, fetchImpl);
      let text;
      if (f.content && f.encoding === 'base64') text = Buffer.from(f.content, 'base64').toString('utf8');
      else { // 1MB 초과 파일은 blob API로 읽기
        const b = await gh(`/repos/${repo}/git/blobs/${f.sha}`, {}, fetchImpl);
        text = Buffer.from(b.content, 'base64').toString('utf8');
      }
      out[n] = JSON.parse(text);
    } catch (e) { if (e.status === 404) out[n] = []; else throw e; }
  }));
  return out;
}

async function readLocal(names) {
  const out = {};
  await Promise.all(names.map(async n => {
    try { out[n] = JSON.parse(await readFile(path.join(process.cwd(), 'data', `${n}.json`), 'utf8')); } catch { out[n] = []; }
  }));
  return out;
}

/** 최신 데이터 읽기 */
export async function readData(names = DATA_FILES, fetchImpl = fetch) {
  if (!githubEnabled()) return { source: 'bundle', sha: null, data: await readLocal(names) };
  const sha = await headSha(fetchImpl);
  return { source: 'github', sha, data: await readAt(sha, names, fetchImpl) };
}

export const toJson = v => JSON.stringify(v, null, 2) + '\n';

/**
 * 읽기-수정-커밋. mutate(data) → { files:{name:value}, message } 를 반환해야 합니다.
 * 다른 커밋이 먼저 들어와 fast-forward가 안 되면 최신본으로 다시 시도합니다.
 */
export async function transact(names, mutate, fetchImpl = fetch, attempts = 4) {
  if (!githubEnabled()) throw Object.assign(new Error('GITHUB_TOKEN/GITHUB_REPO 환경변수가 없어 저장할 수 없습니다'), { status: 503 });
  const { repo, branch } = cfg();
  for (let i = 0; i < attempts; i++) {
    const parent = await headSha(fetchImpl);
    const data = await readAt(parent, names, fetchImpl);
    const result = await mutate(data);
    if (!result || !result.files || !Object.keys(result.files).length) return { sha: parent, result, committed: false };
    const commit = await gh(`/repos/${repo}/git/commits/${parent}`, {}, fetchImpl);
    const tree = await gh(`/repos/${repo}/git/trees`, { method: 'POST', body: JSON.stringify({
      base_tree: commit.tree.sha,
      tree: Object.entries(result.files).map(([n, v]) => ({ path: `data/${n}.json`, mode: '100644', type: 'blob', content: toJson(v) }))
    }) }, fetchImpl);
    const created = await gh(`/repos/${repo}/git/commits`, { method: 'POST', body: JSON.stringify({ message: result.message, tree: tree.sha, parents: [parent] }) }, fetchImpl);
    try {
      await gh(`/repos/${repo}/git/refs/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha: created.sha, force: false }) }, fetchImpl);
      return { sha: created.sha, result, committed: true };
    } catch (e) {
      if (e.status === 422 && i < attempts - 1) { await new Promise(r => setTimeout(r, 300 + Math.random() * 500)); continue; }
      throw e;
    }
  }
  throw new Error('동시에 다른 수정이 있어 저장하지 못했습니다. 다시 시도하세요.');
}
