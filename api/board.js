// POST /api/board — 게시판
// { op:'create', category, title, body, author }                       — 입장한 누구나(middleware가 입장 쿠키 확인)
// { op:'reply', id, status, reply, password, editor } / { op:'delete', id, password, editor } — 관리자(편집 비밀번호)
import { transact } from '../lib/store.js';
import { matches } from '../lib/gate.js';
import { applyBoardOp } from '../lib/model.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용됩니다' });
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch { return res.status(400).json({ error: '요청 형식 오류' }); }
  const op = body.op;
  if (!['create', 'reply', 'delete'].includes(op)) return res.status(400).json({ error: '알 수 없는 요청입니다' });
  const admin = op !== 'create';
  if (admin && !matches(String(body.password || ''), process.env.EDIT_PASSWORD || '')) return res.status(401).json({ error: '관리자(편집) 비밀번호가 맞지 않습니다' });
  const who = String(admin ? body.editor || '관리자' : body.author || '').trim().slice(0, 40);
  const now = new Date().toISOString();
  try {
    let id;
    const out = await transact(['board'], d => {
      const r = applyBoardOp(Array.isArray(d.board) ? d.board : [], op, body, who, now);
      id = r.id;
      if (r.unchanged) return { files: {}, message: '' };
      const p = r.board.find(x => x.id === r.id);
      return { files: { board: r.board }, message: `board(${op}): ${p ? p.title.slice(0, 40) : r.id} — ${who}` };
    });
    return res.status(200).json({ ok: true, id, committed: out.committed });
  } catch (e) {
    return res.status(e.status === 503 ? 503 : e.body ? 502 : 400).json({ error: e.message || '저장하지 못했습니다' });
  }
}
