/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
 *
 * server/index.mjs — REFERENCE backend proxy for the 짐매니저 AI layer.
 *
 *  The OPERATOR deploys this with THEIR OWN ANTHROPIC_API_KEY. It exposes
 *  POST /api/ai  { task, payload }  and streams Claude's text back to the
 *  browser, so the API key NEVER leaves the server (never in the browser,
 *  never in the repo, never in ai/config.js).
 *
 *  Run:  ANTHROPIC_API_KEY=... npm start
 *  Then set ai/config.js -> AI_ENDPOINT to this server's public /api/ai URL.
 *
 *  Model: claude-opus-5 (adaptive thinking, streaming).
 *  NOTE: The demo does NOT run this file — the browser uses a built-in mock.
 */

import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';

const PORT = process.env.PORT || 8787;
// CORS origin for the GitHub Pages demo; override with ALLOW_ORIGIN if needed.
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';
const MODEL = 'claude-opus-5';

// Reads ANTHROPIC_API_KEY from the environment. NEVER hardcode a key here.
const client = new Anthropic();

/* ------------------------------------------------------------------ *
 *  Per-task prompt builders (system + user)
 * ------------------------------------------------------------------ */
const TASKS = {
  coach: {
    system:
      '당신은 헬스장 운영 SaaS "짐매니저"에 내장된 친절한 퍼스널 트레이닝 코치입니다. '
      + '회원/매니저의 운동·식단·이용권·예약 질문에 한국어로 간결하고 실용적으로 답하세요. '
      + '의료 진단은 하지 말고, 통증/부상은 전문의 상담을 권하세요. 제공된 회원 컨텍스트가 있으면 반영하세요.',
    user: (p) => {
      const m = p.member;
      const ctx = m
        ? `\n\n[회원 컨텍스트]\n이름:${m.name}, 이용권:${m.plan}, 만료까지 D-${m.left}, `
          + `PT잔여:${m.ptLeft || 0}회, 최근30일출석:${m.attendanceCount ?? '-'}회`
          + (m.memo ? `, 메모:${m.memo}` : '')
        : '';
      return `질문: ${p.question || '(질문 없음 — 무엇을 도와줄 수 있는지 안내해 주세요)'}${ctx}`;
    },
  },
  retention: {
    system:
      '당신은 헬스장 회원 리텐션 전문가입니다. 주어진 회원 데이터로 (1) 이탈 위험 요약과 '
      + '(2) 재등록을 유도하는 따뜻하고 개인화된 리텐션 문자(SMS) 초안을 한국어로 작성하세요. '
      + '과장·허위 혜택은 쓰지 말고, 발송은 실제로 이뤄지지 않는 초안임을 전제로 합니다.',
    user: (p) => {
      const m = p.member || {};
      return '[대상 회원]\n'
        + `이름:${m.name}, 이용권:${m.plan}, 만료까지 D-${m.left}, 만료일:${m.endDate}, `
        + `최근30일출석:${m.attendanceCount ?? '-'}회\n\n`
        + '위 회원의 이탈 위험 요약(위험도·근거)과 맞춤 리텐션 문자 초안을 작성하세요.';
    },
  },
  notice: {
    system:
      '당신은 헬스장 공지/안내 문구 작성 도우미입니다. 짧은 브리핑을 받아 (1) 게시/공지용 문구와 '
      + '(2) 문자(SMS) 축약본을 한국어로 작성하세요. 지정된 채널과 톤을 반영하세요.',
    user: (p) =>
      `[브리핑]\n${p.brief || '(내용 없음)'}\n\n채널:${p.channel || '문자'} / 톤:${p.tone || '정중'}\n`
      + '위 내용으로 공지 문구와 문자 축약본을 작성하세요.',
  },
};

/* ------------------------------------------------------------------ *
 *  HTTP server
 * ------------------------------------------------------------------ */
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Vary', 'Origin');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1_000_000) reject(new Error('payload too large'));
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, model: MODEL }));
    return;
  }

  if (req.method !== 'POST' || req.url !== '/api/ai') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }

  try {
    const { task, payload = {} } = JSON.parse((await readBody(req)) || '{}');
    const spec = TASKS[task];
    if (!spec) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: `unknown task: ${task}` }));
      return;
    }

    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });

    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      system: spec.system,
      messages: [{ role: 'user', content: spec.user(payload) }],
    });

    stream.on('text', (delta) => res.write(delta));
    await stream.finalMessage();
    res.end();
  } catch (err) {
    console.error('AI proxy error:', err);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'AI 요청 처리 중 오류가 발생했습니다.' }));
  }
});

server.listen(PORT, () => {
  console.log(`짐매니저 AI 프록시 실행 중 → http://localhost:${PORT}/api/ai (model: ${MODEL})`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️ ANTHROPIC_API_KEY 환경변수가 없습니다. 실제 호출 전에 반드시 설정하세요.');
  }
});
