// 사이트 입장 비밀번호 (Vercel Routing Middleware)
// - 모든 페이지·데이터·API 요청 전에 실행됩니다. 비밀번호는 Vercel 환경변수 SITE_PASSWORD(Sensitive)에만 있습니다.
// - 맞게 입력하면 30일간 유지되는 쿠키를 발급합니다. 쿠키에는 비밀번호가 아닌 해시만 들어갑니다.
// - 비밀번호를 바꾸면(SITE_PASSWORD 변경 후 Redeploy) 기존 쿠키는 모두 무효가 됩니다.
// - Vercel Cron(인허가 동기화)은 api/permits.js가 자체 확인하므로 통과시킵니다.
// - SITE_PASSWORD가 없으면 잠긴 상태로 안내만 보여 줍니다(실수로 공개되지 않도록).

export const config = { matcher: '/((?!favicon\\.ico).*)' };

const COOKIE = 'dcs_gate';
const MAX_AGE = 60 * 60 * 24 * 30;

async function tokenOf(pw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`dc-supply-gate:${pw}`));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const cookieOf = (req, name) => {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : '';
};

const safeNext = v => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/__gate') ? v : '/');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function page({ next = '/', error = '', locked = false } = {}) {
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>DC공급현황</title>
<style>
:root{--bg:#f5f6f8;--card:#fff;--ink:#14171c;--sub:#5c6470;--line:#d9dde3;--acc:#e6007e;--err:#c62828}
@media (prefers-color-scheme:dark){:root{--bg:#111316;--card:#1a1d22;--ink:#eef0f3;--sub:#9aa3ae;--line:#2c3138;--err:#ff6b6b}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);
font-family:"Pretendard","Noto Sans KR",system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px}
.card{width:100%;max-width:360px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:32px 28px}
h1{margin:0 0 4px;font-size:22px;letter-spacing:-.02em}p{margin:0 0 22px;color:var(--sub);font-size:14px}
label{display:block;font-size:13px;color:var(--sub);margin-bottom:6px}
input{width:100%;font:inherit;font-size:16px;padding:11px 12px;border:1px solid var(--line);border-radius:9px;background:transparent;color:var(--ink)}
input:focus{outline:2px solid var(--acc);outline-offset:1px;border-color:transparent}
button{width:100%;margin-top:14px;font:inherit;font-weight:600;padding:11px;border:0;border-radius:9px;background:var(--acc);color:#fff;cursor:pointer}
.err{color:var(--err);font-size:13px;margin-top:10px;min-height:1em}
</style></head><body><main class="card">
<h1>DC공급현황</h1><p>대한민국 데이터센터 공급 관리</p>
${locked ? '<div class="err">입장 비밀번호가 설정되지 않았습니다. 관리자에게 문의하세요.</div>' : `
<form method="post" action="/__gate" autocomplete="off">
<input type="hidden" name="next" value="${esc(next)}">
<label for="pw">비밀번호</label><input id="pw" name="pw" type="password" required autofocus>
<button type="submit">들어가기</button><div class="err" role="alert">${esc(error)}</div></form>`}
</main></body></html>`;
  return new Response(html, { status: locked ? 503 : 401, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const pw = process.env.SITE_PASSWORD || '';

  // Vercel Cron 동기화: api/permits.js가 Cron 여부를 다시 확인합니다.
  if (url.pathname === '/api/permits' && url.searchParams.get('sync') === '1') return;

  if (!pw) return page({ locked: true });
  const token = await tokenOf(pw);

  if (url.pathname === '/__gate') {
    if (request.method !== 'POST') return Response.redirect(new URL('/', url), 303);
    const form = await request.formData().catch(() => null);
    const next = safeNext(form?.get('next'));
    if (form && String(form.get('pw') || '') === pw) {
      return new Response(null, { status: 303, headers: {
        location: next, 'cache-control': 'no-store',
        'set-cookie': `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`
      } });
    }
    await new Promise(r => setTimeout(r, 800)); // 무차별 대입 완화
    return page({ next, error: '비밀번호가 올바르지 않습니다.' });
  }

  if (url.pathname === '/__logout') {
    return new Response(null, { status: 303, headers: { location: '/', 'set-cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } });
  }

  if (cookieOf(request, COOKIE) === token) return; // 통과

  // API·데이터 요청은 화면 대신 401 JSON
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/data/')) {
    return new Response(JSON.stringify({ error: '로그인이 필요합니다' }), { status: 401, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
  return page({ next: url.pathname + url.search });
}
