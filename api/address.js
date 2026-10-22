// GET /api/address?sync=1 — (Vercel Cron 전용, 매일 07시대) 도로명주소 API로 주소 표준화·지번 보완·인허가 연결 후 GitHub에 커밋
// GET /api/address?dry=1  — (로그인 사용자) 저장하지 않고 결과만 미리 보기 (최대 60초 조회)
// 필요: 환경변수 JUSO_KEY (행정안전부 도로명주소 검색 API 승인키), 선택: JUSO_COORD_KEY (좌표제공 API — 좌표 보정)
import { readData, transact, githubEnabled } from '../lib/store.js';
import { refineAddresses } from '../scripts/address.mjs';

export default async function handler(req, res) {
  const key = process.env.JUSO_KEY;
  if (!key) return res.status(200).json({ configured: false, message: 'JUSO_KEY 환경변수가 없습니다' });
  const url = new URL(req.url, 'http://localhost');
  const now = new Date().toISOString();

  if (url.searchParams.get('sync') === '1') {
    const auth = req.headers.authorization || '', ua = String(req.headers['user-agent'] || '');
    const cronOk = process.env.CRON_SECRET ? auth === `Bearer ${process.env.CRON_SECRET}` : /vercel-cron/i.test(ua);
    if (!cronOk) return res.status(401).json({ error: '동기화는 예약 작업만 실행할 수 있습니다' });
    if (!githubEnabled()) return res.status(200).json({ synced: false, reason: 'GITHUB_TOKEN/GITHUB_REPO가 없어 결과를 저장할 수 없습니다' });
    try {
      let summary = '';
      const out = await transact(['dcs', 'evidence', 'history', 'runs'], async d => {
        const r = await refineAddresses({ ...d, runs: d.runs || [] }, { key, coordKey: process.env.JUSO_COORD_KEY || '', now, budgetMs: 150000 });
        summary = r.runs.at(-1)?.summary || '';
        return { files: { dcs: r.dcs, evidence: r.evidence, history: r.history, runs: r.runs }, message: `data: 도로명주소 정제 ${now.slice(0, 10)}` };
      });
      return res.status(200).json({ synced: true, committed: out.committed, summary });
    } catch (e) { return res.status(502).json({ synced: false, error: String(e.message || e) }); }
  }

  // 미리 보기 (입장 비밀번호 쿠키가 있어야 middleware를 통과)
  try {
    const { data } = await readData(['dcs', 'evidence', 'history', 'runs']);
    const before = new Map(data.dcs.map(d => [d.id, d]));
    const r = await refineAddresses(data, { key, coordKey: process.env.JUSO_COORD_KEY || '', now, budgetMs: 60000 });
    const changes = r.dcs.filter(d => d.addr_std && (d.addr_std.at === now || d.addr_std.coord_at === now)).map(d => ({ id: d.id, name: d.name, before: before.get(d.id)?.address, after: d.address,
      road: d.addr_std.road || '', jibun: d.addr_std.jibun || '', bdNm: d.addr_std.bdNm || '', how: d.addr_std.how, status: d.addr_std.status || '일치',
      permit_ref_added: !before.get(d.id)?.permit_ref && !!d.permit_ref,
      coord_before: [before.get(d.id)?.lat ?? null, before.get(d.id)?.lng ?? null], coord_after: [d.lat ?? null, d.lng ?? null] }));
    return res.status(200).json({ configured: true, dry: true, summary: r.runs.at(-1)?.summary, changes });
  } catch (e) { return res.status(502).json({ configured: true, ok: false, error: String(e.message || e) }); }
}
