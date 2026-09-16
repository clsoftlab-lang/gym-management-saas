/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
 *
 * check.mjs — repo validator used by CI and locally.
 *  1) every data/*.json parses
 *  2) `node --check` each .js / .mjs source file
 *  3) index.html contains the required root elements
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
let failures = 0;
const ok = (m) => console.log('  ✓ ' + m);
const bad = (m) => { console.error('  ✗ ' + m); failures++; };

function walk(dir, filter, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.git')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, filter, acc);
    else if (filter(name)) acc.push(full);
  }
  return acc;
}

// 1) JSON
console.log('[1/3] data/*.json 파싱 검사');
const dataDir = join(ROOT, 'data');
const jsonFiles = walk(dataDir, (n) => n.endsWith('.json'));
if (!jsonFiles.length) bad('data/ 에 JSON 파일이 없습니다');
for (const f of jsonFiles) {
  try {
    const parsed = JSON.parse(readFileSync(f, 'utf8'));
    const n = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
    ok(`${relative(ROOT, f)} (${n} entries)`);
  } catch (e) {
    bad(`${relative(ROOT, f)} — ${e.message}`);
  }
}

// 2) node --check on JS/MJS
console.log('[2/3] JS/MJS 구문 검사 (node --check)');
const jsFiles = walk(ROOT, (n) => n.endsWith('.js') || n.endsWith('.mjs'));
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    ok(relative(ROOT, f));
  } catch (e) {
    bad(`${relative(ROOT, f)} — ${(e.stderr || e.message).toString().trim().split('\n')[0]}`);
  }
}

// 3) index.html required elements
console.log('[3/3] index.html 필수 요소 검사');
let html = '';
try { html = readFileSync(join(ROOT, 'index.html'), 'utf8'); }
catch { bad('index.html 을 찾을 수 없습니다'); }
const REQUIRED = ['id="app"', 'id="nav"', 'id="view"', 'id="sidebar"', 'id="modal-root"', 'id="toast-root"', 'app.js'];
for (const token of REQUIRED) {
  if (html.includes(token)) ok(`요소 존재: ${token}`);
  else bad(`요소 누락: ${token}`);
}

console.log('');
if (failures) { console.error(`FAILED: ${failures}개 검사 실패`); process.exit(1); }
console.log('ALL CHECKS PASSED ✓');
