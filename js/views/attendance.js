/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
 */

import { db, byId, checkIn, checkedInToday } from '../store.js';
import { el, esc, avatar, fmtDate, TODAY, toast, statusBadge } from '../util.js';

export function renderAttendance(root) {
  const wrap = el('div', {});
  root.append(wrap);
  draw(wrap);
}

function draw(wrap) {
  wrap.innerHTML = '';
  const todays = db.attendance.filter((a) => a.date === TODAY).sort((a, b) => b.time.localeCompare(a.time));
  const activeCount = db.members.filter((m) => m.status === 'active').length;

  const search = el('input', {
    type: 'search', class: 'search-input', style: 'width:100%;font-size:15px;padding:12px 16px',
    placeholder: '회원 이름 또는 전화번호로 검색하여 체크인…', autocomplete: 'off',
    oninput: (e) => renderResults(e.target.value),
  });
  const results = el('div', { style: 'margin-top:10px;display:grid;gap:8px' });

  function renderResults(q) {
    results.innerHTML = '';
    q = q.trim().toLowerCase();
    if (!q) return;
    const found = db.members.filter((m) => m.name.toLowerCase().includes(q) || (m.phone || '').includes(q)).slice(0, 6);
    if (!found.length) { results.append(el('div', { class: 'muted', style: 'padding:8px' }, '검색 결과 없음')); return; }
    for (const m of found) {
      const done = checkedInToday(m.id);
      results.append(el('div', { class: 'card', style: 'display:flex;align-items:center;gap:12px;padding:12px' },
        el('span', { html: avatar(m.name) }),
        el('div', { style: 'flex:1', html: `<b>${esc(m.name)}</b> ${statusBadge(m.status)}<br><small class="muted">${esc(m.plan)} · ~${fmtDate(m.endDate)}</small>` }),
        el('button', {
          class: 'btn ' + (done ? '' : 'btn-primary'),
          disabled: done || m.status !== 'active',
          onClick: () => { if (checkIn(m.id)) { toast(`${m.name} 님 체크인!`, 'ok'); search.value = ''; results.innerHTML = ''; draw(wrap); } },
        }, done ? '체크인 완료✓' : m.status !== 'active' ? '이용불가' : '체크인'),
      ));
    }
  }

  const list = el('div', { class: 'table-wrap' });
  const table = el('table', { class: 'data' });
  table.innerHTML = `<thead><tr><th>시간</th><th>회원</th><th>이용권</th><th>상태</th></tr></thead>`;
  const tbody = el('tbody', {});
  if (!todays.length) tbody.append(el('tr', {}, el('td', { colspan: 4 }, el('div', { class: 'empty' }, el('span', { class: 'big' }, '📋'), '오늘 체크인한 회원이 없습니다.'))));
  for (const a of todays) {
    const m = byId('members', a.memberId) || { name: '(삭제됨)', plan: '-', status: 'expired' };
    tbody.append(el('tr', {},
      el('td', {}, el('b', {}, a.time)),
      el('td', { html: `<div class="mem-cell">${avatar(m.name)}<span>${esc(m.name)}</span></div>` }),
      el('td', {}, m.plan),
      el('td', { html: statusBadge(m.status) }),
    ));
  }
  table.append(tbody);
  list.append(table);

  wrap.append(
    el('div', { class: 'cards', style: 'margin-bottom:16px' },
      card('✅', '오늘 출석', todays.length + '명'),
      card('👥', '이용중 회원', activeCount + '명'),
      card('📈', '출석률', activeCount ? Math.round(todays.length / activeCount * 100) + '%' : '0%'),
    ),
    el('div', { class: 'panel', style: 'margin-bottom:16px' },
      el('div', { class: 'panel-head' }, el('h3', { class: 'panel-title' }, '⚡ 빠른 체크인')),
      search, results,
    ),
    el('div', { class: 'panel' },
      el('div', { class: 'panel-head' }, el('h3', { class: 'panel-title' }, `오늘 출석 현황 · ${fmtDate(TODAY)}`)),
      list,
    ),
  );
}

function card(ic, label, value) {
  return el('div', { class: 'card stat' },
    el('div', { class: 'stat-label' }, el('span', { class: 'stat-ic' }, ic), label),
    el('div', { class: 'stat-value' }, value),
  );
}
