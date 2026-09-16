/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
 */

export const TODAY = '2026-09-17'; // fixed demo "today"

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** Escape for safe innerHTML interpolation. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const won = (n) => '₩' + Math.round(Number(n) || 0).toLocaleString('ko-KR');
export const wonShort = (n) => {
  n = Number(n) || 0;
  if (n >= 100000000) return '₩' + (n / 100000000).toFixed(1) + '억';
  if (n >= 10000) return '₩' + Math.round(n / 10000).toLocaleString('ko-KR') + '만';
  return '₩' + n.toLocaleString('ko-KR');
};

export function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
export function daysLeft(dateStr) {
  return daysBetween(TODAY, dateStr);
}
export function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
export function ym(dateStr) { return dateStr.slice(0, 7); }
export function fmtDate(dateStr) {
  if (!dateStr) return '-';
  return dateStr.replace(/-/g, '.').slice(2);
}
export function nowTime() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
export const uid = (p = 'X') => p + Date.now().toString(36).slice(-5) + Math.floor(Math.random() * 900 + 100);

const AV_COLORS = ['#4f7cff', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];
export function avatarColor(str) {
  let h = 0;
  for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}
export function avatar(name) {
  const initial = (name || '?').trim().slice(-2);
  return `<span class="avatar" style="background:${avatarColor(name)}">${esc(initial)}</span>`;
}

export function statusBadge(status) {
  const map = { active: ['active', '이용중'], expired: ['expired', '만료'], paused: ['paused', '일시정지'] };
  const [cls, label] = map[status] || ['muted', status];
  return `<span class="badge ${cls}">${label}</span>`;
}

/* ---------- Toast ---------- */
export function toast(msg, kind = '') {
  const root = $('#toast-root');
  if (!root) return;
  const t = el('div', { class: 'toast ' + kind }, msg);
  root.append(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2200);
  setTimeout(() => t.remove(), 2600);
}

/* ---------- Modal ---------- */
export function openModal(title, bodyNode) {
  const root = $('#modal-root');
  $('#modal-title').textContent = title;
  const body = $('#modal-body');
  body.innerHTML = '';
  body.append(bodyNode);
  root.hidden = false;
  document.body.style.overflow = 'hidden';
}
export function closeModal() {
  const root = $('#modal-root');
  if (root) root.hidden = true;
  document.body.style.overflow = '';
}
export function initModal() {
  const root = $('#modal-root');
  root.addEventListener('click', (e) => {
    if (e.target.hasAttribute('data-close')) closeModal();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
}

export function confirmModal(title, message, onYes, { danger = false, yesLabel = '확인' } = {}) {
  const body = el('div', {},
    el('p', { style: 'margin:0 0 18px;line-height:1.6' }, message),
    el('div', { class: 'modal-actions' },
      el('button', { class: 'btn', onClick: closeModal }, '취소'),
      el('button', {
        class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'),
        onClick: () => { closeModal(); onYes(); },
      }, yesLabel),
    ),
  );
  openModal(title, body);
}
