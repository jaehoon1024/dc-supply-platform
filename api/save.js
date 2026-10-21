import { transact } from '../lib/store.js';
import { matches } from '../lib/gate.js';
import { applyEdit, addEvidence, validateData, LABEL, applyCompanyEdit, validateCompanies } from '../lib/model.js';

// 편집 비밀번호: 입장 비밀번호와 같은 규칙(앞뒤 공백·대소문자·한글 자판 입력 허용)
const okPassword = p => matches(p, process.env.EDIT_PASSWORD || '');

// POST /api/save
// { password, editor, action:'edit', id?, changes, conf, locked }
// { password, editor, action:'evidence', evidence:{dc_id,title,url,publisher,pub_date,grade,fields,excerpt} }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용됩니다' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (!okPassword(body.password)) return res.status(401).json({ error: '편집 비밀번호가 맞지 않습니다' });
  const editor = String(body.editor || '').trim().slice(0, 40);
  if (!editor) return res.status(400).json({ error: '편집자 이름을 입력하세요' });
  const now = new Date().toISOString();
  try {
    if (body.action === 'evidence') {
      const out = await transact(['dcs', 'evidence', 'history'], d => {
        if (!d.dcs.some(x => x.id === body.evidence?.dc_id)) throw Object.assign(new Error('센터를 찾을 수 없습니다'), { status: 404 });
        const r = addEvidence(d.evidence, d.history, body.evidence || {}, now, 'user', editor);
        if (!r.added) return { files: {}, message: '' };
        return { files: { evidence: r.evidence, history: r.history }, message: `evidence(${body.evidence.dc_id}): ${r.evidence.at(-1).title || r.evidence.at(-1).url} — ${editor}` };
      });
      return res.status(200).json({ ok: true, committed: out.committed, sha: out.sha });
    }
    if (body.action === 'company') {
      let saved;
      const out = await transact(['companies'], d => {
        const r = applyCompanyEdit(Array.isArray(d.companies) ? d.companies : [], body.company || {}, editor, now);
        saved = r;
        if (!r.changed.length) return { files: {}, message: '' };
        const errs = validateCompanies(r.companies);
        if (errs.length) throw Object.assign(new Error(errs.slice(0, 3).join(' / ')), { status: 400 });
        return { files: { companies: r.companies }, message: `company(${r.id}): ${r.changed.join(', ')} — ${editor}` };
      });
      return res.status(200).json({ ok: true, id: saved.id, changed: saved.changed, committed: out.committed, sha: out.sha });
    }
    let saved;
    const out = await transact(['dcs', 'evidence', 'history'], d => {
      const r = applyEdit(d.dcs, d.history, { id: body.id, changes: body.changes, conf: body.conf, locked: body.locked, editor }, now);
      saved = r;
      if (!r.changed.length && body.id) return { files: {}, message: '' };
      const errs = validateData({ dcs: r.dcs, evidence: d.evidence, history: r.history });
      if (errs.length) throw Object.assign(new Error(errs.slice(0, 3).join(' / ')), { status: 400 });
      const what = r.changed.map(f => LABEL[f.replace('lock:', '')] || f).join(', ') || '신규 등록';
      return { files: { dcs: r.dcs, history: r.history }, message: `edit(${r.id}): ${what} — ${editor}` };
    });
    return res.status(200).json({ ok: true, id: saved.id, changed: saved.changed, committed: out.committed, sha: out.sha });
  } catch (e) {
    // 입력 검증 오류(status 없음)는 400, GitHub 오류는 502, 설정 누락은 503
    const status = !e.status ? 400 : e.status === 503 ? 503 : (e.status === 400 || e.status === 404) && !e.body ? e.status : 502;
    return res.status(status).json({ error: e.message || '저장하지 못했습니다' });
  }
}
