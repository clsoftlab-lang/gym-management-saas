/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
 *
 * portal.js — member-facing view (내 이용권/예약/출석).
 */

import { db, byId, className, instructorName, checkIn, checkedInToday, classBookings, book, cancelBooking } from '../store.js';
import { el, esc, won, fmtDate, daysLeft, TODAY, toast, avatar } from '../util.js';

const DOW = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
function nextDateForDay(day) {
  const base = new Date(TODAY);
  for (let off = 0; off <= 7; off++) {
    const d = new Date(base); d.setDate(d.getDate() + off);
    if (d.getDay() === DOW[day]) return d.toISOString().slice(0, 10);
  }
  return TODAY;
}

let currentId = null;

export function renderPortal(root) {
  const active = db.members.filter((m) => m.status !== 'expired');
  if (!currentId || !byId('members', currentId)) currentId = (active[0] || db.members[0] || {}).id;
  const wrap = el('div', {});
  root.append(wrap);
  draw(wrap);
}

function draw(wrap) {
  wrap.innerHTML = '';
  const m = byId('members', currentId);

  const picker = el('div', { class: 'toolbar' },
    el('div', { class: 'field' }, el('label', {}, '회원 계정 전환 (데모)'),
      (() => {
        const sel = el('select', { class: 'select-inline', onChange: (e) => { currentId = e.target.value; draw(wrap); } });
        for (const mm of db.members) {
          const o = el('option', { value: mm.id }, `${mm.name} (${mm.plan})`);
          if (mm.id === currentId) o.selected = true;
          sel.append(o);
        }
        return sel;
      })()),
  );
  wrap.append(el('div', { class: 'hint', html: '이 화면은 <b>회원용 뷰</b>입니다. 실서비스에서는 로그인한 본인 정보만 표시됩니다.' }), picker);

  if (!m) { wrap.append(el('div', { class: 'empty' }, '회원 데이터가 없습니다.')); return; }

  const left = daysLeft(m.endDate);
  const hero = el('div', { class: 'portal-hero' });
  hero.innerHTML = `<h2>안녕하세요, ${esc(m.name)}님 👋</h2>
    <p>${esc(m.plan)} · ${left >= 0 ? `${left}일 남았습니다 (~${fmtDate(m.endDate)})` : '이용권이 만료되었습니다'}</p>`;
  wrap.append(hero);

  // stat cards
  const myAtt = db.attendance.filter((a) => a.memberId === m.id);
  const thisMonthAtt = myAtt.filter((a) => a.date.slice(0, 7) === TODAY.slice(0, 7)).length;
  const myBookings = db.bookings.filter((b) => b.memberId === m.id && b.status === 'booked' && b.date >= TODAY);
  wrap.append(el('div', { class: 'cards', style: 'margin-bottom:16px' },
    stat('🎫', '내 이용권', m.plan, `~${fmtDate(m.endDate)}`),
    stat('📅', '이달 출석', thisMonthAtt + '회', `누적 ${myAtt.length}회`),
    stat('📌', '예정 예약', myBookings.length + '건'),
    m.ptTotal ? stat('💪', 'PT 잔여', (m.ptTotal - m.ptUsed) + '회', `총 ${m.ptTotal}회 중`) : stat('🔑', '락커', m.lockerId ? (byId('lockers', m.lockerId) || {}).number : '미사용'),
  ));

  // check-in button
  const done = checkedInToday(m.id);
  wrap.append(el('div', { class: 'panel', style: 'margin-bottom:16px;text-align:center' },
    el('h3', { class: 'panel-title', style: 'margin-bottom:12px' }, '오늘 출석하셨나요?'),
    el('button', {
      class: 'btn ' + (done ? '' : 'btn-primary'), style: 'font-size:16px;padding:12px 28px',
      disabled: done || m.status !== 'active',
      onClick: () => { if (checkIn(m.id)) { toast('출석 체크인 완료! 오늘도 화이팅 💪', 'ok'); draw(wrap); } },
    }, done ? '오늘 출석 완료 ✓' : m.status !== 'active' ? '이용권 확인 필요' : '✅ 체크인하기'),
  ));

  // my bookings
  const bPanel = el('div', { class: 'panel', style: 'margin-bottom:16px' },
    el('div', { class: 'panel-head' }, el('h3', { class: 'panel-title' }, '내 예약')));
  if (!myBookings.length) bPanel.append(el('p', { class: 'muted', style: 'font-size:13px' }, '예정된 예약이 없습니다. 아래에서 수업을 예약해 보세요.'));
  for (const b of myBookings.sort((a, c) => a.date.localeCompare(c.date))) {
    const c = byId('classes', b.classId) || {};
    bPanel.append(el('div', { class: 'kv' },
      el('span', {}, `${fmtDate(b.date)} · ${esc(c.time || '')} `, el('b', {}, esc(c.name || className(b.classId))), ` (${esc(instructorName(c.instructorId))})`),
      el('button', { class: 'link-btn danger', onClick: () => { cancelBooking(b.id); toast('예약이 취소되었습니다.'); draw(wrap); } }, '취소'),
    ));
  }
  wrap.append(bPanel);

  // bookable classes
  const cPanel = el('div', { class: 'panel' },
    el('div', { class: 'panel-head' }, el('h3', { class: 'panel-title' }, '수업 예약하기'), el('span', { class: 'panel-sub' }, '이번 주 예약 가능 수업')));
  const grid = el('div', { class: 'cards' });
  for (const c of db.classes.slice().sort((a, b) => a.day.localeCompare(b.day) || a.time.localeCompare(b.time))) {
    const date = nextDateForDay(c.day);
    const booked = classBookings(c.id, date).length;
    const mine = db.bookings.some((b) => b.memberId === m.id && b.classId === c.id && b.date === date && b.status === 'booked');
    const full = booked >= c.capacity;
    grid.append(el('div', { class: 'card' },
      el('div', { html: `<b>${esc(c.name)}</b> ${c.type === 'pt' ? '<span class="badge pt">PT</span>' : ''}` }),
      el('div', { class: 'muted', style: 'font-size:12.5px;margin:4px 0' }, `${c.day} ${c.time} · ${esc(instructorName(c.instructorId))} · ${booked}/${c.capacity}`),
      el('button', {
        class: 'btn btn-sm btn-block ' + (mine ? '' : 'btn-primary'),
        disabled: (full && !mine) || m.status !== 'active',
        onClick: () => {
          if (mine) return;
          const r = book(m.id, c.id, date);
          toast(r.msg, r.ok ? 'ok' : 'err');
          if (r.ok) draw(wrap);
        },
      }, mine ? '예약됨 ✓' : full ? '마감' : '예약'),
    ));
  }
  cPanel.append(grid);
  wrap.append(cPanel);
}

function stat(ic, label, value, sub) {
  return el('div', { class: 'card stat' },
    el('div', { class: 'stat-label' }, el('span', { class: 'stat-ic' }, ic), label),
    el('div', { class: 'stat-value', style: 'font-size:20px' }, value),
    sub ? el('div', { class: 'stat-sub' }, sub) : null,
  );
}
