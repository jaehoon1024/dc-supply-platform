import { readData } from '../lib/store.js';

// GET /api/data — 최신 데이터(GitHub main 브랜치 기준)를 한 번에 반환
export default async function handler(req, res) {
  try {
    const { source, sha, data } = await readData();
    res.setHeader('Cache-Control', 'public, s-maxage=20, stale-while-revalidate=120');
    res.status(200).json({ source, sha, fetched_at: new Date().toISOString(), editable: !!process.env.EDIT_PASSWORD && source === 'github', repo: process.env.GITHUB_REPO || '', ...data });
  } catch (e) {
    res.status(502).json({ error: '데이터를 읽지 못했습니다', detail: String(e.message || e) });
  }
}
