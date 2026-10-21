import { readFileSync } from 'node:fs';
const list = JSON.parse(readFileSync('tools/geocode-addr.json', 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = [];
for (const it of list) {
  let hit = null;
  for (const q of it.q) {
    const u = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({ q, format: 'json', limit: '1', countrycodes: 'kr', 'accept-language': 'ko' });
    try { const r = await fetch(u, { headers: { 'User-Agent': 'dc-supply-platform/1.0 (internal data quality check)' } }); const j = await r.json(); if (j[0]) { hit = { lat: +j[0].lat, lng: +j[0].lon, q, type: j[0].type, cls: j[0].class }; } } catch (e) { hit = { err: String(e) }; }
    await sleep(1200);
    if (hit && !hit.err) break;
  }
  res.push({ id: it.id, ...hit });
}
console.log('RESULT' + JSON.stringify(res));
