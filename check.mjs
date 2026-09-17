/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
 *
 * check.mjs — repo validator used by CI and locally.
 *  1) every data/*.json parses
 *  2) `node --check` each .js / .mjs source file
 *  3) index.html contains the required root elements
 *  4) AI layer: `node --check` every file under ai/ and server/, AI_ENDPOINT default empty
 *  5) security: no Anthropic API key string committed anywhere in the repo
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
console.log('[1/5] data/*.json 파싱 검사');
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
console.log('[2/5] JS/MJS 구문 검사 (node --check)');
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
console.log('[3/5] index.html 필수 요소 검사');
let html = '';
try { html = readFileSync(join(ROOT, 'index.html'), 'utf8'); }
catch { bad('index.html 을 찾을 수 없습니다'); }
const REQUIRED = ['id="app"', 'id="nav"', 'id="view"', 'id="sidebar"', 'id="modal-root"', 'id="toast-root"', 'app.js'];
for (const token of REQUIRED) {
  if (html.includes(token)) ok(`요소 존재: ${token}`);
  else bad(`요소 누락: ${token}`);
}

// 4) AI layer: node --check ai/ and server/, and AI_ENDPOINT default empty
console.log('[4/5] AI 레이어 검사 (ai/ + server/)');
for (const sub of ['ai', 'server']) {
  const dir = join(ROOT, sub);
  let files = [];
  try { files = walk(dir, (n) => n.endsWith('.js') || n.endsWith('.mjs')); }
  catch { bad(`${sub}/ 디렉터리를 찾을 수 없습니다`); continue; }
  if (!files.length) bad(`${sub}/ 에 JS/MJS 파일이 없습니다`);
  for (const f of files) {
    try {
      execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
      ok(`node --check ${relative(ROOT, f)}`);
    } catch (e) {
      bad(`${relative(ROOT, f)} — ${(e.stderr || e.message).toString().trim().split('\n')[0]}`);
    }
  }
}
try {
  const cfg = readFileSync(join(ROOT, 'ai', 'config.js'), 'utf8');
  if (/export\s+const\s+AI_ENDPOINT\s*=\s*(['"`])\1\s*;?/.test(cfg)) ok('AI_ENDPOINT 기본값이 빈 문자열(목업 사용)');
  else bad('AI_ENDPOINT 기본값이 비어 있지 않습니다 (배포 데모는 빈 값이어야 함)');
} catch (e) {
  bad(`ai/config.js 를 읽을 수 없습니다 — ${e.message}`);
}

// 5) security: no committed API key anywhere in the repo
console.log('[5/5] 보안 검사 (API 키 미포함)');
// Match a REAL Anthropic key (sk-ant-…) — built by concatenation so this file
// itself never contains the literal prefix and never trips its own scan.
const KEY_RE = new RegExp('sk-' + 'ant-[A-Za-z0-9_-]{20,}');
const TEXT_EXT = ['.js', '.mjs', '.json', '.md', '.html', '.css', '.txt', '.yml', '.yaml', '.toml', '.example', '.env'];
const isText = (n) => TEXT_EXT.some((e) => n.endsWith(e)) || n.startsWith('.env');
const textFiles = walk(ROOT, isText);
let hits = 0;
for (const f of textFiles) {
  try {
    if (KEY_RE.test(readFileSync(f, 'utf8'))) { bad(`실제 API 키 문자열 발견: ${relative(ROOT, f)}`); hits++; }
  } catch { /* ignore unreadable */ }
}
if (!hits) ok(`저장소 어디에도 실제 API 키(sk-ant-…)가 없습니다 (${textFiles.length} files scanned)`);

console.log('');
if (failures) { console.error(`FAILED: ${failures}개 검사 실패`); process.exit(1); }
console.log('ALL CHECKS PASSED ✓');
