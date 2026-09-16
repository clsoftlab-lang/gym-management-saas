/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
 */

import { db, byId, upsertMember, deleteMember, renewMember, toggleMemberPause, checkIn, checkedInToday, save } from '../store.js';
import { el, esc, won, fmtDate, daysLeft, addMonths, TODAY, avatar, statusBadge, toast, openModal, closeModal, confirmModal } from '../util.js';

const state = { q: '', status: 'all', plan: 'all', sort: 'name', dir: 1 };

export function setMemberQuery(q) { state.q = q; }

export function renderMembers(root, ctx) {
  const wrap = el('div', {});
  root.append(wrap);
  draw(wrap, ctx);
}

function filtered() {
  let rows = db.members.slice();
  const q = state.q.trim().toLowerCase();
  if (q) rows = rows.filter((m) => m.name.toLowerCase().includes(q) || (m.phone || '').includes(q) || m.id.toLowerCase().includes(q));
  if (state.status !== 'all') rows = rows.filter((m) => m.status === state.status);
  if (state.plan !== 'all') rows = rows.filter((m) => m.planId === state.plan);
  const s = state.sort, dir = state.dir;
  rows.sort((a, b) => {
    let av, bv;
    if (s === 'endDate' || s === 'startDate') { av = a[s]; bv = b[s]; }
    else if (s === 'left') { av = daysLeft(a.endDate); bv = daysLeft(b.endDate); }
    else { av = a[s]; bv = b[s]; }
    if (av < bv) return -1 * dir; if (av > bv) return 1 * dir; return 0;
  });
  return rows;
}

function draw(wrap, ctx) {
  wrap.innerHTML = '';
  const rows = filtered();
  const plans = db.plans;

  const toolbar = el('div', { class: 'toolbar' },
    el('div', { class: 'field' },
      el('label', {}, '검색'),
      el('input', { type: 'search', value: state.q, placeholder: '이름/전화/ID', oninput: (e) => { state.q = e.target.value; sync(wrap, ctx); } }),
    ),
    el('div', { class: 'field' },
      el('label', {}, '상태'),
      selectField(['all|전체', 'active|이용중', 'paused|일시정지', 'expired|만료'], state.status, (v) => { state.status = v; draw(wrap, ctx); }),
    ),
    el('div', { class: 'field' },
      el('label', {}, '이용권'),
      selectField(['all|전체', ...plans.map((p) => p.id + '|' + p.name)], state.plan, (v) => { state.plan = v; draw(wrap, ctx); }),
    ),
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn btn-primary', onClick: () => openMemberForm(null, wrap, ctx) }, '＋ 회원 등록'),
  );

  const table = el('table', { class: 'data' });
  const cols = [
    ['name', '회원'], ['plan', '이용권'], ['status', '상태'],
    ['startDate', '시작일'], ['endDate', '만료일'], ['left', '잔여'], ['actions', '관리'],
  ];
  const thead = el('tr', {});
  for (const [key, label] of cols) {
    const sortable = key !== 'actions';
    const ind = state.sort === key ? (state.dir === 1 ? ' ▲' : ' ▼') : '';
    thead.append(el('th', {
      class: sortable ? '' : 'no-sort',
      onClick: sortable ? () => { if (state.sort === key) state.dir *= -1; else { state.sort = key; state.dir = 1; } draw(wrap, ctx); } : null,
      html: esc(label) + (sortable ? `<span class="sort-ind">${ind}</span>` : ''),
    }));
  }
  table.append(el('thead', {}, thead));

  const tbody = el('tbody', {});
  if (!rows.length) {
    tbody.append(el('tr', {}, el('td', { colspan: cols.length }, el('div', { class: 'empty' }, el('span', { class: 'big' }, '🔍'), '조건에 맞는 회원이 없습니다.'))));
  }
  for (const m of rows) {
    const left = daysLeft(m.endDate);
    const leftBadge = m.status === 'expired' ? '<span class="badge expired">만료</span>'
      : left <= 14 ? `<span class="badge soon">D-${left}</span>`
      : `<span class="muted">${left}일</span>`;
    const ptInfo = m.ptTotal ? `<span class="badge pt">PT ${m.ptUsed}/${m.ptTotal}</span>` : '';
    const tr = el('tr', {},
      el('td', { html: `<div class="mem-cell">${avatar(m.name)}<span><b>${esc(m.name)}</b> ${ptInfo}<br><small class="muted">${esc(m.phone || '')}</small></span></div>` }),
      el('td', {}, m.plan),
      el('td', { html: statusBadge(m.status) }),
      el('td', {}, fmtDate(m.startDate)),
      el('td', {}, fmtDate(m.endDate)),
      el('td', { html: leftBadge }),
      el('td', {}),
    );
    const actions = el('div', { class: 'row-actions' },
      el('button', { class: 'link-btn', title: '출석 체크인', disabled: checkedInToday(m.id) || m.status !== 'active', onClick: () => { if (checkIn(m.id)) { toast(`${m.name} 님 체크인 완료`, 'ok'); draw(wrap, ctx); } } }, checkedInToday(m.id) ? '체크인✓' : '체크인'),
      el('button', { class: 'link-btn', onClick: () => openMemberDetail(m.id, wrap, ctx) }, '상세'),
      el('button', { class: 'link-btn', onClick: () => openMemberForm(m, wrap, ctx) }, '수정'),
    );
    tr.lastChild.append(actions);
    tbody.append(tr);
  }
  table.append(tbody);

  wrap.append(
    toolbar,
    el('p', { class: 'muted', style: 'font-size:13px;margin:0 0 10px' }, `총 ${rows.length}명 표시`),
    el('div', { class: 'panel', style: 'padding:8px' }, el('div', { class: 'table-wrap' }, table)),
  );
}

/* Update only the search input result without losing focus */
function sync(wrap, ctx) {
  const active = document.activeElement;
  draw(wrap, ctx);
  const inp = wrap.querySelector('input[type=search]');
  if (inp && active && active.type === 'search') { inp.focus(); inp.setSelectionRange(state.q.length, state.q.length); }
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

/* ---------- Add / Edit form ---------- */
function openMemberForm(m, wrap, ctx) {
  const isEdit = !!m;
  const plans = db.plans;
  const firstPlan = plans[0];
  const g = (k, d) => (m && m[k] != null ? m[k] : d);

  const form = el('form', {});
  form.innerHTML = `
    <div class="form-grid">
      <div class="field"><label>이름 *</label><input name="name" required value="${esc(g('name', ''))}" placeholder="홍길동"></div>
      <div class="field"><label>연락처</label><input name="phone" value="${esc(g('phone', ''))}" placeholder="010-0000-0000"></div>
      <div class="field"><label>성별</label><select name="gender">
        <option value="F"${g('gender','F')==='F'?' selected':''}>여성</option>
        <option value="M"${g('gender','')==='M'?' selected':''}>남성</option></select></div>
      <div class="field"><label>이용권 *</label><select name="planId">${plans.map((p) => `<option value="${p.id}" data-price="${p.price}" data-months="${p.months}" data-pt="${p.pt||0}"${g('planId', firstPlan.id) === p.id ? ' selected' : ''}>${esc(p.name)} · ${won(p.price)}</option>`).join('')}</select></div>
      <div class="field"><label>시작일 *</label><input type="date" name="startDate" required value="${g('startDate', TODAY)}"></div>
      <div class="field"><label>만료일 (자동계산)</label><input type="date" name="endDate" value="${g('endDate', addMonths(TODAY, firstPlan.months))}"></div>
      <div class="field full"><label>운동 메모</label><textarea name="memo" placeholder="부상/목표 등">${esc(g('memo', ''))}</textarea></div>
      <div class="field full"><label>식단 메모</label><textarea name="diet" placeholder="식단 관리 내용">${esc(g('diet', ''))}</textarea></div>
    </div>
    <div class="modal-actions">
      ${isEdit ? '<button type="button" class="btn btn-danger" data-del>삭제</button>' : ''}
      <button type="button" class="btn" data-cancel>취소</button>
      <button type="submit" class="btn btn-primary">${isEdit ? '저장' : '등록'}</button>
    </div>`;

  const planSel = form.querySelector('[name=planId]');
  const startInp = form.querySelector('[name=startDate]');
  const endInp = form.querySelector('[name=endDate]');
  function recalc() {
    const opt = planSel.selectedOptions[0];
    endInp.value = addMonths(startInp.value || TODAY, Number(opt.dataset.months) || 1);
  }
  planSel.addEventListener('change', recalc);
  startInp.addEventListener('change', recalc);

  form.querySelector('[data-cancel]').addEventListener('click', closeModal);
  const del = form.querySelector('[data-del]');
  if (del) del.addEventListener('click', () => {
    confirmModal('회원 삭제', `${m.name} 님을 삭제할까요? 예약/락커 배정도 함께 해제됩니다.`, () => {
      deleteMember(m.id); toast('삭제되었습니다.'); draw(wrap, ctx);
    }, { danger: true, yesLabel: '삭제' });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const opt = planSel.selectedOptions[0];
    const data = {
      name: fd.get('name').trim(),
      phone: fd.get('phone').trim(),
      gender: fd.get('gender'),
      planId: fd.get('planId'),
      plan: opt.textContent.split(' · ')[0],
      planPrice: Number(opt.dataset.price) || 0,
      ptTotal: Number(opt.dataset.pt) || 0,
      startDate: fd.get('startDate'),
      endDate: fd.get('endDate'),
      memo: fd.get('memo').trim(),
      diet: fd.get('diet').trim(),
      status: 'active',
    };
    if (!data.name) { toast('이름을 입력하세요.', 'err'); return; }
    if (isEdit) { data.id = m.id; data.ptUsed = m.ptUsed; data.lockerId = m.lockerId; }
    upsertMember(data);
    closeModal();
    toast(isEdit ? '수정되었습니다.' : '회원이 등록되었습니다.', 'ok');
    draw(wrap, ctx);
  });

  openModal(isEdit ? '회원 정보 수정' : '신규 회원 등록', form);
}

/* ---------- Detail ---------- */
function openMemberDetail(id, wrap, ctx) {
  const m = byId('members', id);
  if (!m) return;
  const left = daysLeft(m.endDate);
  const atts = db.attendance.filter((a) => a.memberId === id).sort((a, b) => b.date.localeCompare(a.date));
  const books = db.bookings.filter((b) => b.memberId === id && b.status === 'booked');
  const pays = db.payments.filter((p) => p.memberId === id).sort((a, b) => b.date.localeCompare(a.date));
  const locker = m.lockerId ? byId('lockers', m.lockerId) : null;

  const body = el('div', {});
  body.innerHTML = `
    <div class="mem-cell" style="margin-bottom:14px">${avatar(m.name)}
      <div><div style="font-size:18px;font-weight:800">${esc(m.name)} ${statusBadge(m.status)}</div>
      <small class="muted">${esc(m.phone || '')} · ${esc(m.id)}</small></div></div>
    <div class="kv"><span class="k">이용권</span><span><b>${esc(m.plan)}</b> · ${won(m.planPrice)}</span></div>
    <div class="kv"><span class="k">기간</span><span>${fmtDate(m.startDate)} ~ ${fmtDate(m.endDate)} ${left>=0?`(D-${left})`:'(만료)'}</span></div>
    ${m.ptTotal ? `<div class="kv"><span class="k">PT 세션</span><span>${m.ptUsed} / ${m.ptTotal}회 사용</span></div>` : ''}
    <div class="kv"><span class="k">락커</span><span>${locker ? esc(locker.number) + ' (' + esc(locker.zone) + ')' : '미배정'}</span></div>
    <div class="kv"><span class="k">누적 출석</span><span>${atts.length}회</span></div>
    <div class="kv"><span class="k">예정 예약</span><span>${books.length}건</span></div>
    ${m.memo ? `<div class="kv"><span class="k">운동 메모</span><span style="max-width:60%;text-align:right">${esc(m.memo)}</span></div>` : ''}
    ${m.diet ? `<div class="kv"><span class="k">식단 메모</span><span style="max-width:60%;text-align:right">${esc(m.diet)}</span></div>` : ''}
    <div style="margin-top:12px;font-weight:700;font-size:13px;color:var(--text-dim)">최근 결제</div>
    <div class="table-wrap"><table class="data" style="min-width:auto"><tbody>
      ${pays.slice(0,4).map((p)=>`<tr><td>${fmtDate(p.date)}</td><td>${esc(p.type)}</td><td class="num">${won(p.amount)}</td></tr>`).join('') || '<tr><td class="muted">내역 없음</td></tr>'}
    </tbody></table></div>`;

  const actions = el('div', { class: 'modal-actions' },
    el('button', { class: 'btn', onClick: () => { toggleMemberPause(id); toast(m.status === 'paused' ? '이용 재개' : '일시정지 처리'); closeModal(); draw(wrap, ctx); } }, m.status === 'paused' ? '이용 재개' : '일시정지'),
    el('button', { class: 'btn', disabled: checkedInToday(id) || m.status !== 'active', onClick: () => { if (checkIn(id)) { toast('체크인 완료', 'ok'); closeModal(); draw(wrap, ctx); } } }, '출석 체크인'),
    el('button', { class: 'btn btn-primary', onClick: () => openRenew(id, wrap, ctx) }, '이용권 연장/재등록'),
  );
  body.append(actions);
  openModal('회원 상세', body);
}

function openRenew(id, wrap, ctx) {
  const plans = db.plans;
  const form = el('form', {});
  form.innerHTML = `
    <p class="muted" style="margin-top:0">연장할 이용권을 선택하세요. 기존 만료일에 이어서 연장됩니다.</p>
    <div class="field"><label>이용권</label><select name="planId">${plans.map((p)=>`<option value="${p.id}">${esc(p.name)} · ${won(p.price)}</option>`).join('')}</select></div>
    <div class="modal-actions"><button type="button" class="btn" data-cancel>취소</button><button type="submit" class="btn btn-primary">연장 처리</button></div>`;
  form.querySelector('[data-cancel]').addEventListener('click', closeModal);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    renewMember(id, new FormData(form).get('planId'));
    closeModal(); toast('연장/재등록이 완료되었습니다.', 'ok'); draw(wrap, ctx);
  });
  openModal('이용권 연장 · 재등록', form);
}
