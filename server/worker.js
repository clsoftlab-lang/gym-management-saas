/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
 *
 * server/worker.js — Cloudflare Workers variant of the 짐매니저 AI proxy.
 *
 *  Same contract as index.mjs: POST /api/ai { task, payload } → text/plain reply.
 *  Runs on Cloudflare's FREE tier — no server to babysit, so real AI stays
 *  "무인(autonomous)": nothing to keep alive, patch, or restart.
 *
 *  Calls the Anthropic REST API directly (no SDK — Workers is a lean runtime):
 *    POST https://api.anthropic.com/v1/messages
 *    headers: x-api-key: <Worker secret ANTHROPIC_API_KEY>, anthropic-version: 2023-06-01
 *
 *  🔒 The API key is a Worker SECRET (`wrangler secret put ANTHROPIC_API_KEY`).
 *     It never reaches the browser and is never committed to the repo.
 *
 *  Config (wrangler.toml [vars] or secrets):
 *    ANTHROPIC_API_KEY  (secret, required)
 *    AI_MODEL           (default claude-haiku-4-5; raise to claude-sonnet-5 / claude-opus-5)
 *    AI_MAX_TOKENS      (default 700)
 *    AI_EFFORT          (default low; non-Haiku models only)
 *    ALLOW_ORIGIN       (default *)
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

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
  briefing: {
    system:
      '당신은 헬스장 운영 매니저를 돕는 AI 비서입니다. 주어진 오늘의 운영 데이터로 '
      + '(1) 만료 임박, (2) 이탈 위험, (3) 매출/출석 현황을 3~5줄로 간결히 요약하고, '
      + '매니저가 오늘 바로 취할 액션 1~2가지를 제안하세요. 한국어로 실용적이고 담백하게 작성하세요.',
    user: (p) =>
      `[오늘의 운영 데이터]\n${JSON.stringify(p || {}, null, 2)}\n\n`
      + '위 데이터로 오늘의 운영 브리핑을 작성하세요.',
  },
};

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': (env && env.ALLOW_ORIGIN) || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    Vary: 'Origin',
  };
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const model = (env && env.AI_MODEL) || 'claude-haiku-4-5';
    const maxTokens = Number(env && env.AI_MAX_TOKENS) || 700;
    const effort = (env && env.AI_EFFORT) || 'low';

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, model, maxTokens }, 200, cors);
    }

    if (request.method !== 'POST' || url.pathname !== '/api/ai') {
      return json({ error: 'not found' }, 404, cors);
    }

    if (!env || !env.ANTHROPIC_API_KEY) {
      // Missing key → tell the browser to fall back to its built-in mock.
      return json({ fallback: true, reason: 'no_api_key' }, 429, cors);
    }

    let task; let payload = {};
    try {
      const body = await request.json();
      task = body.task; payload = body.payload || {};
    } catch {
      return json({ error: 'invalid JSON' }, 400, cors);
    }

    const spec = TASKS[task];
    if (!spec) return json({ error: `unknown task: ${task}` }, 400, cors);

    const reqBody = {
      model,
      max_tokens: maxTokens,
      // Prompt caching: stable system prompt as a cacheable block cuts repeat input cost.
      system: [{ type: 'text', text: spec.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: spec.user(payload) }],
    };
    // Haiku 4.5 does NOT accept adaptive thinking/effort — send neither (avoids 400s).
    if (!model.startsWith('claude-haiku')) {
      reqBody.thinking = { type: 'adaptive' };
      reqBody.output_config = { effort };
    }

    let upstream;
    try {
      upstream = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(reqBody),
      });
    } catch (e) {
      // Network error reaching Anthropic → fall back to the mock in the browser.
      return json({ fallback: true, reason: 'upstream_network' }, 429, cors);
    }

    if (!upstream.ok) {
      // Upstream 4xx/5xx (incl. 429) → let the browser fall back to the mock.
      return json({ fallback: true, reason: `upstream_${upstream.status}` }, 429, cors);
    }

    const data = await upstream.json();
    const text = Array.isArray(data.content)
      ? data.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
      : '';

    return new Response(text, {
      status: 200,
      headers: { ...cors, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });
}
