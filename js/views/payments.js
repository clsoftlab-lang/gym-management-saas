/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
 */

import { db, memberName, revenueByMonth } from '../store.js';
import { el, esc, won, wonShort, fmtDate, TODAY } from '../util.js';
import { revenueChart } from '../charts.js';

const state = { month: 'all', method: 'all' };

export function renderPayments(root) {
  const wrap = el('div', {});
  root.append(wrap);
  draw(wrap);
}

function draw(wrap) {
  wrap.innerHTML = '';
  const months = [...new Set(db.payments.map((p) => p.date.slice(0, 7)))].sort().reverse();
  const methods = [...new Set(db.payments.map((p) => p.method))];

  let rows = db.payments.slice().sort((a, b) => b.date.localeCompare(a.date));
  if (state.month !== 'all') rows = rows.filter((p) => p.date.slice(0, 7) === state.month);
  if (state.method !== 'all') rows = rows.filter((p) => p.method === state.method);

  const total = rows.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const monthKey = TODAY.slice(0, 7);
  const thisMonth = db.payments.filter((p) => p.date.slice(0, 7) === monthKey).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const avg = rows.length ? total / rows.length : 0;

  wrap.append(el('div', { class: 'cards', style: 'margin-bottom:16px' },
    stat('💰', '이번 달 매출', wonShort(thisMonth), monthKey),
    stat('🧾', '표시 매출 합계', wonShort(total), `${rows.length}건`),
    stat('📊', '건당 평균', wonShort(avg)),
  ));

  wrap.append(el('div', { class: 'panel', style: 'margin-bottom:16px' },
    el('div', { class: 'panel-head' }, el('h3', { class: 'panel-title' }, '월별 매출 추이'), el('span', { class: 'panel-sub' }, '최근 6개월 · demo')),
    el('div', { class: 'chart-box sm' }, el('canvas', { id: 'ch-pay' })),
  ));

  const toolbar = el('div', { class: 'toolbar' },
    el('div', { class: 'field' }, el('label', {}, '월'),
      selectField(['all|전체', ...months.map((m) => m + '|' + m)], state.month, (v) => { state.month = v; draw(wrap); })),
    el('div', { class: 'field' }, el('label', {}, '결제수단'),
      selectField(['all|전체', ...methods.map((m) => m + '|' + m)], state.method, (v) => { state.method = v; draw(wrap); })),
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn', onClick: () => exportCsv(rows) }, '⬇ CSV 내보내기'),
  );

  const table = el('table', { class: 'data' });
  table.innerHTML = `<thead><tr><th>날짜</th><th>회원</th><th>구분</th><th>이용권</th><th>수단</th><th class="num">금액</th></tr></thead>`;
  const tbody = el('tbody', {});
  if (!rows.length) tbody.append(el('tr', {}, el('td', { colspan: 6 }, el('div', { class: 'empty' }, '결제 내역이 없습니다.'))));
  for (const p of rows.slice(0, 200)) {
    tbody.append(el('tr', {},
      el('td', {}, fmtDate(p.date)),
      el('td', {}, memberName(p.memberId)),
      el('td', { html: `<span class="tag-inline">${esc(p.type)}</span>` }),
      el('td', {}, p.plan),
      el('td', {}, p.method),
      el('td', { class: 'num', html: `<b>${won(p.amount)}</b>` }),
    ));
  }
  table.append(tbody);

  wrap.append(el('div', { class: 'panel', style: 'padding:8px' },
    el('div', { style: 'padding:8px 8px 0' }, toolbar),
    el('div', { class: 'table-wrap' }, table),
    rows.length > 200 ? el('p', { class: 'muted', style: 'padding:8px' }, `최근 200건만 표시 (총 ${rows.length}건)`) : null,
  ));

  requestAnimationFrame(() => revenueChart('ch-pay', revenueByMonth(6), won));
}

function stat(ic, label, value, sub) {
  return el('div', { class: 'card stat' },
    el('div', { class: 'stat-label' }, el('span', { class: 'stat-ic' }, ic), label),
    el('div', { class: 'stat-value' }, value),
    sub ? el('div', { class: 'stat-sub' }, sub) : null,
  );
}

function selectField(opts, value, onChange) {
  const sel = el('select', { onChange: (e) => onChange(e.target.value) });
  for (const o of opts) {
    const [v, label] = o.split('|');
    const opt = el('option', { value: v }, label);
    if (v === value) opt.selected = true;
    sel.append(opt);
  }
  return sel;
}

function exportCsv(rows) {
  const header = ['날짜', '회원', '구분', '이용권', '수단', '금액'];
  const lines = [header.join(',')];
  for (const p of rows) {
    lines.push([p.date, memberName(p.memberId), p.type, p.plan, p.method, p.amount].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(','));
  }
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `payments_${TODAY}.csv`; a.click();
  URL.revokeObjectURL(url);
}
