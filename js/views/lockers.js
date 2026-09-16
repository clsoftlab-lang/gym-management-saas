/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
 */

import { db, byId, memberName, assignLocker, releaseLocker } from '../store.js';
import { el, esc, fmtDate, toast, openModal, closeModal } from '../util.js';

export function renderLockers(root) {
  const wrap = el('div', {});
  root.append(wrap);
  draw(wrap);
}

function draw(wrap) {
  wrap.innerHTML = '';
  const total = db.lockers.length;
  const occupied = db.lockers.filter((l) => l.status === 'occupied').length;
  const zones = [...new Set(db.lockers.map((l) => l.zone))];

  wrap.append(el('div', { class: 'cards', style: 'margin-bottom:16px' },
    stat('🔑', '전체 락커', total + '개'),
    stat('🟦', '사용중', occupied + '개'),
    stat('⬜', '빈 락커', (total - occupied) + '개'),
    stat('📊', '가동률', total ? Math.round(occupied / total * 100) + '%' : '0%'),
  ));

  for (const zone of zones) {
    const panel = el('div', { class: 'panel', style: 'margin-bottom:16px' },
      el('div', { class: 'panel-head' }, el('h3', { class: 'panel-title' }, zone)),
    );
    const grid = el('div', { class: 'locker-grid' });
    for (const l of db.lockers.filter((x) => x.zone === zone)) {
      const cell = el('div', {
        class: 'locker ' + l.status,
        title: l.status === 'occupied' ? memberName(l.memberId) : '빈 락커',
        onClick: () => openLocker(l, wrap),
      },
        esc(l.number),
        l.status === 'occupied' ? el('small', {}, memberName(l.memberId).slice(-2)) : el('small', {}, '비어있음'),
      );
      grid.append(cell);
    }
    panel.append(grid);
    wrap.append(panel);
  }
}

function stat(ic, label, value) {
  return el('div', { class: 'card stat' },
    el('div', { class: 'stat-label' }, el('span', { class: 'stat-ic' }, ic), label),
    el('div', { class: 'stat-value' }, value),
  );
}

function openLocker(l, wrap) {
  const body = el('div', {});
  if (l.status === 'occupied') {
    const m = byId('members', l.memberId);
    body.innerHTML = `
      <div class="kv"><span class="k">락커 번호</span><span><b>${esc(l.number)}</b> (${esc(l.zone)})</span></div>
      <div class="kv"><span class="k">사용 회원</span><span>${esc(memberName(l.memberId))}</span></div>
      <div class="kv"><span class="k">이용권 만료</span><span>${l.expireDate ? fmtDate(l.expireDate) : '-'}</span></div>`;
    body.append(el('div', { class: 'modal-actions' },
      el('button', { class: 'btn', onClick: closeModal }, '닫기'),
      el('button', { class: 'btn btn-danger', onClick: () => { releaseLocker(l.id); toast('락커가 반납되었습니다.'); closeModal(); draw(wrap); } }, '반납 처리'),
    ));
  } else {
    const free = db.members.filter((m) => m.status === 'active' && !m.lockerId);
    const sel = el('select', { style: 'width:100%' }, el('option', { value: '' }, '배정할 회원 선택…'),
      ...free.map((m) => el('option', { value: m.id }, `${m.name} (${m.phone || m.id})`)));
    body.append(
      el('p', { html: `<b>${esc(l.number)}</b> · ${esc(l.zone)} — 빈 락커` }),
      el('div', { class: 'field' }, el('label', {}, '회원 배정'), sel),
      el('div', { class: 'modal-actions' },
        el('button', { class: 'btn', onClick: closeModal }, '취소'),
        el('button', { class: 'btn btn-primary', onClick: () => {
          if (!sel.value) { toast('회원을 선택하세요.', 'err'); return; }
          assignLocker(l.id, sel.value); toast('락커가 배정되었습니다.', 'ok'); closeModal(); draw(wrap);
        } }, '배정'),
      ),
    );
  }
  openModal('락커 ' + l.number, body);
}
