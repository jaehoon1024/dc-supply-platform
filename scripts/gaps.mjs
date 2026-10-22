// 빈 칸 보강 대상 고르기 — 매일 자동수집이 이 목록의 센터를 집중 조사합니다.
// 사용: node scripts/gaps.mjs [N=5]
// 대상: 수전 용량이 없거나(IT·연면적도 없으면 우선), 주소에 지번이 없는 센터.
// 순서: 최근에 보강 조사한 적 없는 센터(gap_checked_at 오래된 순) → 빈 칸이 많은 순 → 개발 단계 우선.
// 조사 후 findings.json의 "gap_checked": ["센터 id", ...]에 넣으면, 값을 못 찾았어도 조사일이 기록되어 다음 순번으로 넘어갑니다.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseSido, isNum } from '../lib/model.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

export function gapsOf(dc) {
  const g = [];
  if (!isNum(dc.power_mw)) g.push(isNum(dc.it_mw) || isNum(dc.area_m2) ? '수전(환산만 있음)' : '수전·IT 모두 없음');
  if (!isNum(dc.area_m2)) g.push('연면적');
  if (!/\d/.test(parseSido(dc.address).rest)) g.push('주소 지번');
  return g;
}

export function pickGaps(dcs, n = 5) {
  const w = g => (g.includes('수전·IT 모두 없음') ? 3 : g.some(x => x.startsWith('수전')) ? 2 : 0) + (g.includes('주소 지번') ? 2 : 0) + (g.includes('연면적') ? 0.5 : 0);
  return dcs.map(dc => ({ dc, gaps: gapsOf(dc) }))
    .filter(x => x.gaps.some(g => g !== '연면적'))
    .sort((a, b) => String(a.dc.gap_checked_at || '').localeCompare(String(b.dc.gap_checked_at || ''))
      || w(b.gaps) - w(a.gaps) || (a.dc.status === '운영중') - (b.dc.status === '운영중') || a.dc.id.localeCompare(b.dc.id))
    .slice(0, n);
}

async function main() {
  const n = Number(process.argv[2] || 5);
  const dcs = JSON.parse(await readFile(path.join(ROOT, 'data', 'dcs.json'), 'utf8'));
  const all = dcs.filter(dc => gapsOf(dc).some(g => g !== '연면적')).length;
  const out = pickGaps(dcs, n).map(({ dc, gaps }) => ({ id: dc.id, name: dc.name, aliases: dc.aliases, status: dc.status, address: dc.address,
    owner: dc.owner, operator: dc.operator, power_mw: dc.power_mw, it_mw: dc.it_mw, area_m2: dc.area_m2 ?? null, gaps, last_checked: dc.gap_checked_at || null }));
  console.log(JSON.stringify({ remaining: all, picked: out }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
