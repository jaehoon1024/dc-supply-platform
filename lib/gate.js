// 입장 비밀번호 공용 로직 (middleware.js · api/gate.js)
export const COOKIE = 'dcs_gate';
export const MAX_AGE = 60 * 60 * 24 * 30;

export async function tokenOf(pw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`dc-supply-gate:${pw}`));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// 한글 자판 상태로 친 입력을 영문 자판 키로 되돌립니다. (예: '유ㅐ2026' → 'dbo2026')
const CHO = 'rRseEfaqQtTdwWczxvg'.split('');
const JUNG = ['k', 'o', 'i', 'O', 'j', 'p', 'u', 'P', 'h', 'hk', 'ho', 'hl', 'y', 'n', 'nj', 'np', 'nl', 'b', 'm', 'ml', 'l'];
const JONG = ['', 'r', 'R', 'rt', 's', 'sw', 'sg', 'e', 'f', 'fr', 'fa', 'fq', 'ft', 'fx', 'fv', 'fg', 'a', 'q', 'qt', 't', 'T', 'd', 'w', 'c', 'z', 'x', 'v', 'g'];
const JAMO = { ㄱ: 'r', ㄲ: 'R', ㄳ: 'rt', ㄴ: 's', ㄵ: 'sw', ㄶ: 'sg', ㄷ: 'e', ㄸ: 'E', ㄹ: 'f', ㄺ: 'fr', ㄻ: 'fa', ㄼ: 'fq', ㄽ: 'ft', ㄾ: 'fx', ㄿ: 'fv', ㅀ: 'fg',
  ㅁ: 'a', ㅂ: 'q', ㅃ: 'Q', ㅄ: 'qt', ㅅ: 't', ㅆ: 'T', ㅇ: 'd', ㅈ: 'w', ㅉ: 'W', ㅊ: 'c', ㅋ: 'z', ㅌ: 'x', ㅍ: 'v', ㅎ: 'g',
  ㅏ: 'k', ㅐ: 'o', ㅑ: 'i', ㅒ: 'O', ㅓ: 'j', ㅔ: 'p', ㅕ: 'u', ㅖ: 'P', ㅗ: 'h', ㅘ: 'hk', ㅙ: 'ho', ㅚ: 'hl', ㅛ: 'y', ㅜ: 'n', ㅝ: 'nj', ㅞ: 'np', ㅟ: 'nl', ㅠ: 'b', ㅡ: 'm', ㅢ: 'ml', ㅣ: 'l' };
export function hangulToKeys(s) {
  let out = '';
  for (const ch of String(s)) {
    const c = ch.charCodeAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) { const i = c - 0xac00; out += CHO[Math.floor(i / 588)] + JUNG[Math.floor((i % 588) / 28)] + JONG[i % 28]; }
    else out += JAMO[ch] ?? ch;
  }
  return out;
}

/** 입력이 비밀번호와 맞는지: 앞뒤 공백·대소문자·한글 자판 입력을 허용합니다. */
export function matches(input, pw) {
  const a = String(input || '').normalize('NFC').trim(), b = String(pw || '').trim();
  if (!a || !b) return false;
  return [a, hangulToKeys(a)].some(x => x === b || x.toLowerCase() === b.toLowerCase());
}

export const safeNext = v => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/__gate') && !v.startsWith('/api/gate') ? v : '/');
