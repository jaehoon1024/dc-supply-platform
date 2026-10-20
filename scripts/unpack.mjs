// Vercel 빌드 단계: (1) 압축 번들(bundle.*.part)이 있으면 풀고 (2) 정적 파일을 public/으로 복사합니다.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync, existsSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import path from 'node:path';
const parts = readdirSync('.').filter(f => /^bundle\.\d+\.part$/.test(f)).sort((a, b) => parseInt(a.split('.')[1]) - parseInt(b.split('.')[1]));
if (parts.length) {
  const files = JSON.parse(brotliDecompressSync(Buffer.concat(parts.map(p => readFileSync(p)))).toString('utf8'));
  for (const [name, content] of Object.entries(files)) { mkdirSync(path.dirname(name), { recursive: true }); writeFileSync(name, content); }
  console.log(`번들에서 파일 ${Object.keys(files).length}개 복원`);
}
mkdirSync('public/lib', { recursive: true });
for (const f of ['index.html', 'app.js', 'styles.css']) cpSync(f, 'public/' + f);
cpSync('lib/model.js', 'public/lib/model.js');
if (existsSync('data')) cpSync('data', 'public/data', { recursive: true });
console.log('public/ 준비 완료');
