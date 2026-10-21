// GET /api/permits?batch=N — 건축HUB 인허가 실시간 조회(12시간 캐시). 센터를 BATCH_SIZE개씩 나눠 N번째 묶음만 조회합니다.
//                            응답의 next가 null이 될 때까지 batch를 올려 호출하면 전체 결과가 됩니다(요청 한도·함수 시간 초과 방지).
// GET /api/permits?sync=1 — (Vercel Cron 전용) 조회 결과를 착공·준공·상태에 반영해 GitHub에 커밋
// 필요: 환경변수 BUILDING_HUB_KEY (data.go.kr '국토교통부_건축HUB_건축인허가정보 서비스' 일반 인증키, Decoding)
import { readData, transact, githubEnabled } from '../lib/store.js';
import { fetchPermits, pickPermit, toPermit, isDcPermit, syncPermits } from '../scripts/permits.mjs';

const BATCH_SIZE = 6;

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const x = items[i++]; await fn(x); } }));
}

export default async function handler(req, res) {
  const key = process.env.BUILDING_HUB_KEY;
  if (!key) return res.status(200).json({ configured: false, message: 'BUILDING_HUB_KEY 환경변수가 없습니다' });
  const url = new URL(req.url, 'http://localhost');
  const now = new Date().toISOString();

  if (url.searchParams.get('sync') === '1') {
    const auth = req.headers.authorization || '', ua = String(req.headers['user-agent'] || '');
    const cronOk = process.env.CRON_SECRET ? auth === `Bearer ${process.env.CRON_SECRET}` : /vercel-cron/i.test(ua);
    if (!cronOk) return res.status(401).json({ error: '동기화는 예약 작업만 실행할 수 있습니다' });
    if (!githubEnabled()) return res.status(200).json({ synced: false, reason: 'GITHUB_TOKEN/GITHUB_REPO가 없어 결과를 저장할 수 없습니다' });
    try {
      let summary = '';
      const out = await transact(['dcs', 'evidence', 'history', 'permits', 'runs'], async d => {
        const r = await syncPermits({ ...d, permits: d.permits || [], runs: d.runs || [] }, { key, now });
        summary = r.runs.at(-1)?.summary || '';
        return { files: { dcs: r.dcs, evidence: r.evidence, history: r.history, permits: r.permits, runs: r.runs }, message: `data: 건축HUB 인허가 동기화 ${now.slice(0, 10)}` };
      });
      return res.status(200).json({ synced: true, committed: out.committed, summary });
    } catch (e) { return res.status(502).json({ synced: false, error: String(e.message || e) }); }
  }

  try {
    const { data } = await readData(['dcs']);
    const all = (data.dcs || []).filter(d => d.permit_ref?.sigunguCd && d.permit_ref?.bjdongCd)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const batches = Math.ceil(all.length / BATCH_SIZE);
    const batch = Math.min(Math.max(0, parseInt(url.searchParams.get('batch') || '0', 10) || 0), Math.max(0, batches - 1));
    const targets = all.slice(batch * BATCH_SIZE, (batch + 1) * BATCH_SIZE);
    const page = { total: all.length, batch, batches, next: batch + 1 < batches ? batch + 1 : null };
    if (!targets.length) return res.status(200).json({ configured: true, ok: true, checked: 0, ...page, next: null, linked: [], candidates: [], errors: [] });
    // 인증키·활용신청 확인용 (첫 묶음에서만, 실패 시 중단)
    if (batch === 0) {
      try { await fetchPermits(targets[0].permit_ref, key, fetch, 1); }
      catch (e) { return res.status(200).json({ configured: true, ok: false, error: String(e.message || e) }); }
    }
    const cache = new Map();
    const get = ref => { const k = JSON.stringify(ref); if (!cache.has(k)) cache.set(k, fetchPermits(ref, key, fetch, ref.bun ? 1 : 3)); return cache.get(k); };
    const share = {}; all.forEach(d => { const k = d.permit_ref.sigunguCd + d.permit_ref.bjdongCd; share[k] = (share[k] || 0) + 1; });
    const linked = [], errors = [], seen = new Set();
    await pool(targets, 2, async dc => {
      const ref = dc.permit_ref.bun ? dc.permit_ref : { sigunguCd: dc.permit_ref.sigunguCd, bjdongCd: dc.permit_ref.bjdongCd };
      try {
        const it = pickPermit(await get(ref), dc, { dongLevel: !ref.bun, shared: share[ref.sigunguCd + ref.bjdongCd] });
        if (it) { const p = toPermit(it, dc.id, now); p.level = ref.bun ? '지번' : '법정동'; linked.push(p); seen.add(p.id); }
      } catch (e) { errors.push(`${dc.name}: ${e.message}`); }
    });
    const candidates = [];
    for (const [k, pr] of cache) {
      if (JSON.parse(k).bun) continue;
      for (const it of await pr.catch(() => [])) {
        if (!isDcPermit(it)) continue;
        const p = toPermit(it, null, now);
        if (!seen.has(p.id) && !candidates.some(c => c.id === p.id)) candidates.push(p);
      }
    }
    res.setHeader('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=86400');
    return res.status(200).json({ configured: true, ok: true, fetched_at: now, checked: targets.length, ...page, linked, candidates, errors: errors.slice(0, 20) });
  } catch (e) { return res.status(502).json({ configured: true, ok: false, error: String(e.message || e) }); }
}
