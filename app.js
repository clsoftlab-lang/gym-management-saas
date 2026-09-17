/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
 *
 * 짐매니저 — Gym Management SaaS (demo). Entry point + hash router.
 */

import { $, el, initModal, toast, confirmModal } from './js/util.js';
import { initStore, resetDemo, onChange } from './js/store.js';
import { destroyAll } from './js/charts.js';
import { renderDashboard } from './js/views/dashboard.js';
import { renderMembers, setMemberQuery } from './js/views/members.js';
import { renderAttendance } from './js/views/attendance.js';
import { renderSchedule } from './js/views/schedule.js';
import { renderLockers } from './js/views/lockers.js';
import { renderPayments } from './js/views/payments.js';
import { renderReminders } from './js/views/reminders.js';
import { renderPortal } from './js/views/portal.js';
import { renderAI } from './js/views/ai.js';

const ROUTES = [
  { id: 'dashboard', label: '대시보드', ic: '📊', render: renderDashboard, group: '운영' },
  { id: 'members', label: '회원 관리', ic: '👥', render: renderMembers, group: '운영' },
  { id: 'attendance', label: '출석 체크인', ic: '✅', render: renderAttendance, group: '운영' },
  { id: 'schedule', label: '수업·예약', ic: '📅', render: renderSchedule, group: '운영' },
  { id: 'lockers', label: '락커 관리', ic: '🔑', render: renderLockers, group: '자원' },
  { id: 'payments', label: '결제·매출', ic: '💰', render: renderPayments, group: '자원' },
  { id: 'reminders', label: '리마인더·알림', ic: '🔔', render: renderReminders, group: '자원' },
  { id: 'portal', label: '회원용 화면', ic: '📱', render: renderPortal, group: '회원' },
  { id: 'ai', label: 'AI 어시스턴트', ic: '🤖', render: renderAI, group: 'AI' },
];

let current = 'dashboard';

function buildNav() {
  const nav = $('#nav');
  nav.innerHTML = '';
  let lastGroup = null;
  for (const r of ROUTES) {
    if (r.group !== lastGroup) { nav.append(el('div', { class: 'nav-sep' }, r.group)); lastGroup = r.group; }
    nav.append(el('button', {
      class: 'nav-item' + (r.id === current ? ' active' : ''),
      dataset: { route: r.id },
      onClick: () => go(r.id),
    }, el('span', { class: 'ic' }, r.ic), r.label));
  }
}

function go(id) {
  if (!ROUTES.some((r) => r.id === id)) id = 'dashboard';
  current = id;
  if (location.hash !== '#' + id) location.hash = id;
  render();
  closeMobileNav();
}

function render() {
  const route = ROUTES.find((r) => r.id === current) || ROUTES[0];
  $('#page-title').textContent = route.label;
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.route === current));
  const view = $('#view');
  destroyAll();
  view.innerHTML = '';
  try {
    route.render(view, { go });
  } catch (e) {
    console.error('렌더 오류:', e);
    view.append(el('div', { class: 'empty' }, el('span', { class: 'big' }, '⚠️'), '화면을 표시하는 중 오류가 발생했습니다. 콘솔을 확인하세요.'));
  }
  view.scrollTo?.(0, 0);
  window.scrollTo(0, 0);
}

function openMobileNav() { $('#app').classList.add('nav-open'); $('#sidebar-backdrop').hidden = false; }
function closeMobileNav() { $('#app').classList.remove('nav-open'); $('#sidebar-backdrop').hidden = true; }

function wireChrome() {
  $('#menu-toggle').addEventListener('click', () => {
    $('#app').classList.contains('nav-open') ? closeMobileNav() : openMobileNav();
  });
  $('#sidebar-backdrop').addEventListener('click', closeMobileNav);

  const search = $('#global-search');
  search.addEventListener('input', () => {
    setMemberQuery(search.value);
    if (current !== 'members') go('members'); else render();
  });

  $('#reset-btn').addEventListener('click', () => {
    confirmModal('데모 데이터 초기화', '모든 변경사항을 지우고 초기 데모 데이터로 되돌립니다. 계속할까요?', async () => {
      await resetDemo();
      toast('데모 데이터가 초기화되었습니다.', 'ok');
      render();
    }, { danger: true, yesLabel: '초기화' });
  });

  window.addEventListener('hashchange', () => {
    const id = location.hash.replace('#', '');
    if (id && id !== current) go(id);
  });
}

async function boot() {
  initModal();
  wireChrome();
  buildNav();
  try {
    await initStore();
  } catch (e) {
    console.error(e);
    $('#view').append(el('div', { class: 'empty' }, el('span', { class: 'big' }, '⚠️'),
      '데모 데이터를 불러오지 못했습니다. 로컬 서버(예: python -m http.server)로 실행했는지 확인하세요.'));
    return;
  }
  onChange(() => { /* re-render handled by views individually; keep hook for future */ });
  const hashId = location.hash.replace('#', '');
  current = ROUTES.some((r) => r.id === hashId) ? hashId : 'dashboard';
  buildNav();
  render();
}

boot();
