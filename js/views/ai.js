/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
 *
 * ai.js — AI 어시스턴트 화면. 세 가지 AI 기능을 탭으로 제공한다.
 *   (1) AI 트레이너 코치 챗봇
 *   (2) 이탈 위험 요약 + 맞춤 리텐션 메시지
 *   (3) 공지/문자 문구 자동 작성
 * 데모는 내장 목업으로 동작하고, AI_ENDPOINT 설정 시 실제 프록시로 스위칭된다.
 */

import { db, expiringSoon } from '../store.js';
import { el, esc, fmtDate, daysLeft, TODAY, toast } from '../util.js';
import { AI_ENDPOINT } from '../../ai/config.js';
import { askAI } from '../../ai/ai.js';

const MODE = AI_ENDPOINT && String(AI_ENDPOINT).trim()
  ? { text: '실 연동 모드 · 백엔드 프록시 사용', cls: 'active' }
  : { text: '데모(목업) 모드 · 브라우저 내장 AI, 서버·키 불필요', cls: 'soon' };

let activeTab = 'coach';

const TABS = [
  { id: 'coach', label: '🏋️ 코치 챗봇' },
  { id: 'retention', label: '🎯 이탈 리텐션' },
  { id: 'notice', label: '✍️ 공지 작성' },
];

export function renderAI(root) {
  root.append(
    el('div', {
      class: 'hint',
      html: `<b>🤖 AI 기능</b> — API 연동 패턴 데모. <span class="badge ${MODE.cls}">${esc(MODE.text)}</span><br>`
        + '실제 Claude를 붙이려면 <code>server/</code> 프록시를 운영자 키로 배포하고 <code>ai/config.js</code>의 <code>AI_ENDPOINT</code>만 설정하세요. '
        + '<b>API 키는 서버에만 두며 브라우저·저장소에는 절대 저장하지 않습니다.</b>',
    }),
  );

  const tabbar = el('div', { class: 'toolbar' });
  for (const t of TABS) {
    tabbar.append(el('button', {
      class: 'btn btn-sm ' + (t.id === activeTab ? 'btn-primary' : ''),
      onClick: () => { activeTab = t.id; render(); },
    }, t.label));
  }
  root.append(tabbar);

  const host = el('div', {});
  root.append(host);

  function render() {
    for (const b of tabbar.querySelectorAll('button')) {
      const on = b.textContent === TABS.find((t) => t.id === activeTab).label;
      b.classList.toggle('btn-primary', on);
    }
    host.innerHTML = '';
    if (activeTab === 'coach') host.append(coachPanel());
    else if (activeTab === 'retention') host.append(retentionPanel());
    else host.append(noticePanel());
  }
  render();
}

/* ---------- shared output area + run helper ---------- */
function outputBox() {
  const pre = el('pre', {
    class: 'ai-output',
    style: 'white-space:pre-wrap;word-break:break-word;background:var(--surface-2);'
      + 'border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px;'
      + 'min-height:120px;margin:0;font-family:inherit;font-size:13.5px;line-height:1.65',
  }, '');
  return pre;
}

async function run(btn, out, task, payload) {
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = '생성 중…';
  out.textContent = '';
  try {
    await askAI(task, payload, { onToken: (chunk) => { out.textContent += chunk; } });
  } catch (e) {
    console.error('AI 오류:', e);
    out.textContent = '⚠️ AI 응답 생성 중 오류가 발생했습니다: ' + (e && e.message ? e.message : e);
    toast('AI 응답 실패', 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

function copyBtn(out) {
  return el('button', {
    class: 'btn btn-sm',
    onClick: async () => {
      const text = out.textContent || '';
      if (!text) return;
      try { await navigator.clipboard.writeText(text); toast('복사되었습니다.', 'ok'); }
      catch { toast('복사 실패 — 직접 선택해 주세요.', 'err'); }
    },
  }, '📋 복사');
}

/* ---------- (1) Coach chatbot ---------- */
function coachPanel() {
  const panel = el('div', { class: 'panel' },
    el('div', { class: 'panel-head' },
      el('h3', { class: 'panel-title' }, 'AI 트레이너 코치 챗봇'),
      el('span', { class: 'panel-sub' }, '운동·식단·이용권 질문에 답합니다'),
    ),
  );

  const memberSel = el('select', { class: 'select-inline' },
    el('option', { value: '' }, '회원 컨텍스트 없음(일반 질문)'));
  for (const m of db.members) {
    memberSel.append(el('option', { value: m.id }, `${m.name} (${m.plan})`));
  }

  const input = el('input', { type: 'text', placeholder: '예: 다이어트 식단 짜줘 / 무릎이 아픈데 하체 가능? / PT 예약은?' });
  const out = outputBox();

  const ask = () => {
    const m = db.members.find((x) => x.id === memberSel.value);
    const payload = { question: input.value, member: m ? memberContext(m) : null };
    run(askBtn, out, 'coach', payload);
  };
  const askBtn = el('button', { class: 'btn btn-primary', onClick: ask }, '질문하기');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ask(); });

  const chips = el('div', { class: 'toolbar', style: 'margin:6px 0' });
  for (const q of ['다이어트 식단 추천', '근육 늘리는 분할 루틴', '무릎이 아픈데 운동 가능?', 'PT 예약 방법']) {
    chips.append(el('button', { class: 'chip', onClick: () => { input.value = q; ask(); } }, q));
  }

  panel.append(
    el('div', { class: 'toolbar' },
      el('div', { class: 'field' }, el('label', {}, '회원(선택)'), memberSel),
    ),
    el('div', { class: 'field', style: 'margin-bottom:8px' }, el('label', {}, '질문'), input),
    chips,
    el('div', { class: 'toolbar' }, askBtn, copyBtn(out)),
    out,
  );
  return panel;
}

function memberContext(m) {
  const left = daysLeft(m.endDate);
  const from = new Date(TODAY); from.setDate(from.getDate() - 30);
  const fromKey = from.toISOString().slice(0, 10);
  const attendanceCount = db.attendance.filter((a) => a.memberId === m.id && a.date >= fromKey).length;
  return {
    id: m.id, name: m.name, plan: m.plan, endDate: m.endDate, left,
    ptLeft: m.ptTotal ? (m.ptTotal - (m.ptUsed || 0)) : 0,
    attendanceCount, memo: m.memo || '',
  };
}

/* ---------- (2) Retention ---------- */
function atRiskMembers() {
  const from = new Date(TODAY); from.setDate(from.getDate() - 30);
  const fromKey = from.toISOString().slice(0, 10);
  const countAtt = (id) => db.attendance.filter((a) => a.memberId === id && a.date >= fromKey).length;
  const soon = expiringSoon(30).map((m) => ({ m, left: m.left, att: countAtt(m.id), reason: '만료 임박' }));
  const seen = new Set(soon.map((x) => x.m.id));
  const lowAtt = db.members
    .filter((m) => m.status === 'active' && !seen.has(m.id) && countAtt(m.id) <= 2)
    .map((m) => ({ m, left: daysLeft(m.endDate), att: countAtt(m.id), reason: '출석 저조' }));
  return [...soon, ...lowAtt].sort((a, b) => (a.left) - (b.left)).slice(0, 20);
}

function retentionPanel() {
  const panel = el('div', { class: 'panel' },
    el('div', { class: 'panel-head' },
      el('h3', { class: 'panel-title' }, '이탈 위험 회원 요약 + 리텐션 메시지'),
      el('span', { class: 'panel-sub' }, '만료 임박·출석 저조 회원 진단'),
    ),
  );

  const risky = atRiskMembers();
  const out = outputBox();

  if (!risky.length) {
    panel.append(el('div', { class: 'empty' }, el('span', { class: 'big' }, '🎉'), '현재 이탈 위험 회원이 없습니다.'));
    return panel;
  }

  const sel = el('select', { class: 'select-inline' });
  for (const r of risky) {
    const dtxt = r.left >= 0 ? `D-${r.left}` : '만료';
    sel.append(el('option', { value: r.m.id }, `${r.m.name} · ${r.reason} · ${dtxt} · 30일출석 ${r.att}회`));
  }

  const gen = () => {
    const r = risky.find((x) => x.m.id === sel.value) || risky[0];
    const m = r.m;
    const payload = {
      member: {
        id: m.id, name: m.name, plan: m.plan, endDate: m.endDate,
        left: r.left, phone: m.phone, attendanceCount: r.att,
      },
    };
    run(genBtn, out, 'retention', payload);
  };
  const genBtn = el('button', { class: 'btn btn-primary', onClick: gen }, '🎯 AI 요약 + 문자 생성');

  panel.append(
    el('div', { class: 'cards', style: 'margin-bottom:12px' },
      stat('🔴', '위험 회원', risky.length + '명'),
      stat('⏰', '7일내 만료', risky.filter((r) => r.left >= 0 && r.left <= 7).length + '명'),
      stat('😴', '출석 저조(≤2)', risky.filter((r) => r.att <= 2).length + '명'),
    ),
    el('div', { class: 'toolbar' },
      el('div', { class: 'field' }, el('label', {}, '위험 회원 선택'), sel),
    ),
    el('div', { class: 'toolbar' }, genBtn, copyBtn(out)),
    out,
  );
  return panel;
}

/* ---------- (3) Notice generator ---------- */
function noticePanel() {
  const panel = el('div', { class: 'panel' },
    el('div', { class: 'panel-head' },
      el('h3', { class: 'panel-title' }, '공지/문자 문구 자동 작성'),
      el('span', { class: 'panel-sub' }, '한 줄 브리핑 → 공지·안내 문구'),
    ),
  );

  const brief = el('textarea', { placeholder: '예: 추석 연휴 9/26~9/28 휴관, 9/29 정상 운영 / 신규 스피닝 클래스 매주 화·목 20시 오픈' });
  const channel = el('select', { class: 'select-inline' },
    el('option', {}, '문자'), el('option', {}, '앱푸시'), el('option', {}, '게시판'));
  const tone = el('select', { class: 'select-inline' },
    el('option', {}, '정중'), el('option', {}, '친근'), el('option', {}, '긴급'));
  const out = outputBox();

  const gen = () => run(genBtn, out, 'notice', { brief: brief.value, channel: channel.value, tone: tone.value });
  const genBtn = el('button', { class: 'btn btn-primary', onClick: gen }, '✍️ 문구 생성');

  panel.append(
    el('div', { class: 'field', style: 'margin-bottom:8px' }, el('label', {}, '브리핑(핵심 내용 한두 줄)'), brief),
    el('div', { class: 'toolbar' },
      el('div', { class: 'field' }, el('label', {}, '채널'), channel),
      el('div', { class: 'field' }, el('label', {}, '톤'), tone),
    ),
    el('div', { class: 'toolbar' }, genBtn, copyBtn(out)),
    out,
  );
  return panel;
}

/* ---------- small stat card ---------- */
function stat(ic, label, value) {
  return el('div', { class: 'card stat' },
    el('div', { class: 'stat-label' }, el('span', { class: 'stat-ic' }, ic), label),
    el('div', { class: 'stat-value' }, value),
  );
}
