import { readData, repoIsPrivate, githubEnabled } from '../lib/store.js';

let vis = { at: 0, v: null }; // 저장소 공개 여부 10분 캐시
const privateRepo = async () => { if (!githubEnabled()) return null; if (Date.now() - vis.at > 600000) vis = { at: Date.now(), v: await repoIsPrivate() }; return vis.v; };
import { matches } from '../lib/gate.js';
import { redactSales, salesData } from '../lib/model.js';

// GET /api/data — 최신 데이터(GitHub main 브랜치 기준)를 한 번에 반환
// GET /api/data?full=1 + 헤더 x-edit-password — 판매 단가·내부 정보까지 포함(캐시하지 않음)
export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const wantFull = url.searchParams.get('full') === '1';
    const full = wantFull && matches(String(req.headers['x-edit-password'] || ''), process.env.EDIT_PASSWORD || '');
    if (wantFull && !full) return res.status(401).json({ error: '편집 비밀번호가 맞지 않습니다' });
    const { source, sha, data } = await readData();
    data.sales = full ? { ...salesData(data.sales), redacted: false, hidden: 0 } : redactSales(data.sales);
    res.setHeader('Cache-Control', full ? 'private, no-store' : 'public, s-maxage=20, stale-while-revalidate=120');
    res.status(200).json({ source, sha, fetched_at: new Date().toISOString(), editable: !!process.env.EDIT_PASSWORD && source === 'github', repo: process.env.GITHUB_REPO || '', repo_private: await privateRepo(), ...data });
  } catch (e) {
    res.status(502).json({ error: '데이터를 읽지 못했습니다', detail: String(e.message || e) });
  }
}
