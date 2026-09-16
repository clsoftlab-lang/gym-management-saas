/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
 */

import { db, byId, instructorName, classBookings, book, cancelBooking, memberName } from '../store.js';
import { el, esc, fmtDate, TODAY, toast, openModal, closeModal, avatar } from '../util.js';

const DAYS = ['월', '화', '수', '목', '금', '토'];
const DOW = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

function nextDateForDay(day) {
  const target = DOW[day];
  const base = new Date(TODAY);
  for (let off = 0; off <= 7; off++) {
    const d = new Date(base); d.setDate(d.getDate() + off);
    if (d.getDay() === target) return d.toISOString().slice(0, 10);
  }
  return TODAY;
}

export function renderSchedule(root) {
  const wrap = el('div', {});
  root.append(wrap);
  draw(wrap);
}

function draw(wrap) {
  wrap.innerHTML = '';
  const grid = el('div', { class: 'sched-grid' });
  for (const day of DAYS) {
    const date = nextDateForDay(day);
    const dayCol = el('div', { class: 'sched-day' }, el('h4', {}, `${day} · ${fmtDate(date)}`));
    const classes = db.classes.filter((c) => c.day === day).sort((a, b) => a.time.localeCompare(b.time));
    if (!classes.length) dayCol.append(el('p', { class: 'muted', style: 'font-size:12px;text-align:center' }, '수업 없음'));
    for (const c of classes) {
      const ins = byId('instructors', c.instructorId) || {};
      const booked = classBookings(c.id, date).length;
      const full = booked >= c.capacity;
      const fillPct = Math.round(booked / c.capacity * 100);
      const card = el('div', {
        class: 'cls-card', style: `border-left-color:${ins.color || 'var(--primary)'}`,
        onClick: () => openClass(c, date, wrap),
      },
        el('div', { class: 't' }, c.name, c.type === 'pt' ? el('span', { class: 'badge pt', style: 'margin-left:6px' }, 'PT') : ''),
        el('div', { class: 'meta' }, `${c.time} · ${c.duration}분 · ${esc(ins.name || '-')}`),
        el('div', { class: 'meta' }, esc(c.room)),
        el('div', { class: 'progress', style: 'margin-top:6px' }, el('i', { style: `width:${fillPct}%;background:${full ? 'var(--danger)' : 'var(--primary)'}` })),
        el('div', { class: 'cls-fill muted' }, `${booked}/${c.capacity} 예약${full ? ' · 마감' : ''}`),
      );
      dayCol.append(card);
    }
    grid.append(dayCol);
  }

  wrap.append(
    el('div', { class: 'hint', html: '카드를 클릭하면 예약 명단 확인 및 회원 예약/취소가 가능합니다. 표시 날짜는 오늘 이후 가장 가까운 해당 요일입니다.' }),
    el('div', { class: 'panel' },
      el('div', { class: 'panel-head' },
        el('h3', { class: 'panel-title' }, '주간 수업 시간표'),
        el('span', { class: 'panel-sub' }, `강사 ${db.instructors.length}명 · 수업 ${db.classes.length}개`),
      ),
      grid,
    ),
    instructorPanel(),
  );
}

function instructorPanel() {
  const panel = el('div', { class: 'panel', style: 'margin-top:16px' },
    el('div', { class: 'panel-head' }, el('h3', { class: 'panel-title' }, '강사진')),
  );
  const cards = el('div', { class: 'cards' });
  for (const ins of db.instructors) {
    const cnt = db.classes.filter((c) => c.instructorId === ins.id).length;
    cards.append(el('div', { class: 'card', style: 'display:flex;align-items:center;gap:12px' },
      el('span', { class: 'avatar', style: `background:${ins.color};width:42px;height:42px;font-size:15px` }, ins.name.slice(-2)),
      el('div', {}, el('div', { html: `<b>${esc(ins.name)}</b>` }), el('small', { class: 'muted' }, `${esc(ins.specialty)} · 담당 ${cnt}개`)),
    ));
  }
  panel.append(cards);
  return panel;
}

function openClass(c, date, wrap) {
  const ins = byId('instructors', c.instructorId) || {};
  const bookings = classBookings(c.id, date);
  const body = el('div', {});
  body.innerHTML = `
    <div class="kv"><span class="k">강사</span><span>${esc(ins.name || '-')} · ${esc(ins.specialty || '')}</span></div>
    <div class="kv"><span class="k">일시</span><span>${fmtDate(date)} ${esc(c.day)} ${esc(c.time)} (${c.duration}분)</span></div>
    <div class="kv"><span class="k">장소</span><span>${esc(c.room)}</span></div>
    <div class="kv"><span class="k">예약 현황</span><span>${bookings.length} / ${c.capacity}명</span></div>`;

  const listTitle = el('div', { style: 'margin:14px 0 8px;font-weight:700;font-size:13px;color:var(--text-dim)' }, '예약 명단');
  const list = el('div', {});
  if (!bookings.length) list.append(el('p', { class: 'muted', style: 'font-size:13px' }, '예약자가 없습니다.'));
  for (const b of bookings) {
    list.append(el('div', { class: 'kv' },
      el('span', { class: 'mem-cell', html: avatar(memberName(b.memberId)) + '<span>' + esc(memberName(b.memberId)) + '</span>' }),
      el('button', { class: 'link-btn danger', onClick: () => { cancelBooking(b.id); toast('예약 취소됨'); closeModal(); openClass(c, date, wrap); draw(wrap); } }, '취소'),
    ));
  }

  // Add booking
  const activeMembers = db.members.filter((m) => m.status === 'active');
  const addRow = el('div', { style: 'display:flex;gap:8px;margin-top:14px' });
  const sel = el('select', { style: 'flex:1' }, el('option', { value: '' }, '회원 선택하여 예약 추가…'),
    ...activeMembers.map((m) => el('option', { value: m.id }, `${m.name} (${m.phone || m.id})`)));
  const addBtn = el('button', {
    class: 'btn btn-primary', disabled: bookings.length >= c.capacity,
    onClick: () => {
      if (!sel.value) { toast('회원을 선택하세요.', 'err'); return; }
      const r = book(sel.value, c.id, date);
      toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { closeModal(); openClass(c, date, wrap); draw(wrap); }
    },
  }, bookings.length >= c.capacity ? '마감' : '예약');
  addRow.append(sel, addBtn);

  body.append(listTitle, list, addRow);
  openModal(c.name, body);
}
