// POST /api/gate — 입장 비밀번호 확인 후 쿠키 발급 (화면은 middleware.js가 그립니다)
import { COOKIE, MAX_AGE, tokenOf, matches, safeNext } from '../lib/gate.js';

async function readForm(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (!raw) { const chunks = []; for await (const c of req) chunks.push(c); raw = Buffer.concat(chunks).toString('utf8'); }
  return Object.fromEntries(new URLSearchParams(raw));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.statusCode = 303; res.setHeader('Location', '/'); return res.end(); }
  const pw = process.env.SITE_PASSWORD || '';
  const form = await readForm(req).catch(() => ({}));
  const next = safeNext(form.next);
  if (pw && matches(form.pw, pw)) {
    res.setHeader('Set-Cookie', `${COOKIE}=${await tokenOf(pw)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`);
    res.statusCode = 303; res.setHeader('Location', next); return res.end();
  }
  await new Promise(r => setTimeout(r, 800)); // 무차별 대입 완화
  res.statusCode = 303; res.setHeader('Location', `${next}${next.includes('?') ? '&' : '?'}gate=fail`); return res.end();
}
