/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
 */

import { db, revenueByMonth, attendanceByDay, planDistribution, expiringSoon, checkedInToday } from '../store.js';
import { el, won, wonShort, esc, avatar, fmtDate, TODAY } from '../util.js';
import { revenueChart, attendanceChart, planChart } from '../charts.js';

export function renderDashboard(root, { go }) {
  const members = db.members;
  const active = members.filter((m) => m.status === 'active').length;
  const paused = members.filter((m) => m.status === 'paused').length;
  const todayCheckins = db.attendance.filter((a) => a.date === TODAY).length;
  const monthKey = TODAY.slice(0, 7);
  const monthRevenue = db.payments.filter((p) => p.date.slice(0, 7) === monthKey).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const soon = expiringSoon(14);
  const todayBookings = db.bookings.filter((b) => b.date === TODAY && b.status === 'booked').length;

  const stat = (ic, label, value, sub) => el('div', { class: 'card stat' },
    el('div', { class: 'stat-label' }, el('span', { class: 'stat-ic' }, ic), label),
    el('div', { class: 'stat-value' }, value),
    sub ? el('div', { class: 'stat-sub' }, sub) : null,
  );

  root.append(
    el('div', { class: 'hint' , html: '<b>DEMO MODE</b> · 모든 데이터는 가상이며 브라우저(localStorage)에만 저장됩니다. 실결제·실문자·실개인정보 없음.' }),
    el('div', { class: 'cards', style: 'margin-bottom:16px' },
      stat('👥', '전체 회원', members.length, `이용중 ${active} · 일시정지 ${paused}`),
      stat('✅', '오늘 출석', todayCheckins + '명', `예약 수업 ${todayBookings}건`),
      stat('💰', '이번 달 매출', wonShort(monthRevenue), monthKey + ' 기준'),
      stat('⏰', '만료 임박(14일)', soon.length + '명', soon.length ? '리마인더 발송 권장' : '없음'),
    ),
    el('div', { class: 'two-col', style: 'margin-bottom:16px' },
      el('div', { class: 'panel' },
        el('div', { class: 'panel-head' },
          el('h3', { class: 'panel-title' }, '월별 매출'),
          el('span', { class: 'panel-sub' }, '최근 6개월 · demo'),
        ),
        el('div', { class: 'chart-box' }, el('canvas', { id: 'ch-rev' })),
      ),
      el('div', { class: 'panel' },
        el('div', { class: 'panel-head' }, el('h3', { class: 'panel-title' }, '이용권 구성')),
        el('div', { class: 'chart-box' }, el('canvas', { id: 'ch-plan' })),
      ),
    ),
    el('div', { class: 'two-col' },
      el('div', { class: 'panel' },
        el('div', { class: 'panel-head' },
          el('h3', { class: 'panel-title' }, '일별 출석 추이'),
          el('span', { class: 'panel-sub' }, '최근 14일'),
        ),
        el('div', { class: 'chart-box sm' }, el('canvas', { id: 'ch-att' })),
      ),
      expiringPanel(soon, go),
    ),
  );

  // draw charts after DOM insert
  requestAnimationFrame(() => {
    revenueChart('ch-rev', revenueByMonth(6), won);
    planChart('ch-plan', planDistribution());
    attendanceChart('ch-att', attendanceByDay(14));
  });
}

function expiringPanel(soon, go) {
  const panel = el('div', { class: 'panel' },
    el('div', { class: 'panel-head' },
      el('h3', { class: 'panel-title' }, '만료 임박 회원'),
      el('button', { class: 'link-btn', onClick: () => go('members') }, '전체 보기 →'),
    ),
  );
  if (!soon.length) {
    panel.append(el('div', { class: 'empty' }, el('span', { class: 'big' }, '🎉'), '14일 내 만료 예정 회원이 없습니다.'));
    return panel;
  }
  const list = el('div', {});
  for (const m of soon.slice(0, 6)) {
    list.append(el('div', { class: 'kv' },
      el('span', { class: 'mem-cell', html: avatar(m.name) + `<span><b>${esc(m.name)}</b><br><small class="muted">${esc(m.plan)} · ~${fmtDate(m.endDate)}</small></span>` }),
      el('span', { class: `badge ${m.left <= 3 ? 'expired' : 'soon'}` }, `D-${m.left}`),
    ));
  }
  panel.append(list);
  return panel;
}
