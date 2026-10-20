// 데이터 파일 검증 — 모든 push/PR에서 GitHub Actions로 실행됩니다.
import { readFile } from 'node:fs/promises';
import { validateData, validateCompanies } from '../lib/model.js';

const load = async n => JSON.parse(await readFile(`data/${n}.json`, 'utf8'));
const [dcs, evidence, history] = await Promise.all(['dcs', 'evidence', 'history'].map(load));
const companies = await load('companies').catch(() => []);
const errs = [...validateData({ dcs, evidence, history }), ...validateCompanies(companies)];
if (errs.length) { console.error(`데이터 오류 ${errs.length}건:\n- ` + errs.join('\n- ')); process.exit(1); }
console.log(`OK — 센터 ${dcs.length}, 근거 ${evidence.length}, 히스토리 ${history.length}, 회사 ${companies.length}`);
