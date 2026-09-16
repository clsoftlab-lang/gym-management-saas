/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
 */

import { db, expiringSoon } from '../store.js';
import { el, esc, fmtDate, avatar, toast } from '../util.js';

const sent = new Set(); // session-only mock "sent" tracking

export function renderReminders(root) {
  const wrap = el('div', {});
  root.append(wrap);
  draw(wrap);
}

function template(m) {
  return `[짐매니저] ${m.name}님, 이용권(${m.plan})이 ${fmtDate(m.endDate)}에 만료됩니다. 재등록 시 혜택을 확인해 보세요! (본 문자는 데모입니다)`;
}

function draw(wrap) {
  wrap.innerHTML = '';
  const soon7 = expiringSoon(7);
  const soon30 = expiringSoon(30);
  const expired = db.members.filter((m) => m.status === 'expired');

  wrap.append(
    el('div', { class: 'hint', html: '<b>모의 알림</b> — 실제 문자/푸시는 발송되지 않습니다. 실배포 시 SMS/알림톡 게이트웨이 연동이 필요합니다.' }),
    el('div', { class: 'cards', style: 'margin-bottom:16px' },
      stat('🔴', '7일 내 만료', soon7.length + '명'),
      stat('🟡', '30일 내 만료', soon30.length + '명'),
      stat('⚫', '이미 만료', expired.length + '명'),
    ),
  );

  const panel = el('div', { class: 'panel' },
    el('div', { class: 'panel-head' },
      el('h3', { class: 'panel-title' }, '만료 임박 회원 리마인더'),
      el('button', { class: 'btn btn-primary btn-sm', disabled: !soon30.length, onClick: () => {
        soon30.forEach((m) => sent.add(m.id));
        toast(`${soon30.length}명에게 리마인더 발송(모의)`, 'ok'); draw(wrap);
      } }, '전체 발송(모의)'),
    ),
  );

  if (!soon30.length) {
    panel.append(el('div', { class: 'empty' }, el('span', { class: 'big' }, '🎉'), '30일 내 만료 예정 회원이 없습니다.'));
  }
  const list = el('div', {});
  for (const m of soon30) {
    const isSent = sent.has(m.id);
    const row = el('div', { class: 'card', style: 'display:flex;align-items:center;gap:12px;margin-bottom:10px' },
      el('span', { html: avatar(m.name) }),
      el('div', { style: 'flex:1;min-width:0' },
        el('div', { html: `<b>${esc(m.name)}</b> <span class="badge ${m.left <= 7 ? 'expired' : 'soon'}">D-${m.left}</span> <small class="muted">${esc(m.phone || '')}</small>` }),
        el('div', { class: 'muted', style: 'font-size:12px;margin-top:4px;white-space:normal' }, template(m)),
      ),
      el('button', { class: 'btn btn-sm ' + (isSent ? '' : 'btn-primary'), disabled: isSent, onClick: () => { sent.add(m.id); toast(`${m.name}님께 발송(모의)`, 'ok'); draw(wrap); } }, isSent ? '발송됨✓' : '문자 발송'),
    );
    list.append(row);
  }
  panel.append(list);
  wrap.append(panel);
}

function stat(ic, label, value) {
  return el('div', { class: 'card stat' },
    el('div', { class: 'stat-label' }, el('span', { class: 'stat-ic' }, ic), label),
    el('div', { class: 'stat-value' }, value),
  );
}
