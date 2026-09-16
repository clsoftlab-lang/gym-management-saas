/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
 *
 * store.js — loads seed JSON, persists edits to localStorage (demo only, not a real DB).
 */

import { TODAY, daysLeft, uid, nowTime } from './util.js';

const LS_KEY = 'gymmanager.v1';
const COLLECTIONS = ['plans', 'instructors', 'classes', 'members', 'payments', 'lockers', 'attendance', 'bookings'];

export const db = {
  plans: [], instructors: [], classes: [], members: [],
  payments: [], lockers: [], attendance: [], bookings: [], meta: {},
};

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn(); }

async function fetchSeed() {
  const out = {};
  for (const name of [...COLLECTIONS, 'meta']) {
    const res = await fetch(`data/${name}.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`데이터 로드 실패: ${name}.json (${res.status})`);
    out[name] = await res.json();
  }
  return out;
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('localStorage 읽기 실패, 시드 데이터 사용:', e);
    return null;
  }
}

export function save() {
  try {
    const payload = {};
    for (const name of COLLECTIONS) payload[name] = db[name];
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('localStorage 저장 실패 (변경은 세션 내에서만 유지):', e);
  }
  emit();
}

function assign(src) {
  for (const name of COLLECTIONS) db[name] = Array.isArray(src[name]) ? src[name] : [];
  if (src.meta) db.meta = src.meta;
}

/** Load persisted data, or fall back to seed JSON. */
export async function initStore() {
  const seed = await fetchSeed();
  db.meta = seed.meta || {};
  const local = loadLocal();
  if (local && Array.isArray(local.members) && local.members.length) {
    assign(local);
  } else {
    assign(seed);
    save();
  }
  refreshDerived();
  return db;
}

/** Reset localStorage back to the shipped seed data. */
export async function resetDemo() {
  try { localStorage.removeItem(LS_KEY); } catch (e) { /* ignore */ }
  const seed = await fetchSeed();
  db.meta = seed.meta || {};
  assign(seed);
  refreshDerived();
  save();
}

/** Recompute member status from end date (expired if past, keep paused). */
export function refreshDerived() {
  for (const m of db.members) {
    if (m.status === 'paused') continue;
    m.status = daysLeft(m.endDate) < 0 ? 'expired' : 'active';
  }
}

/* ---------- Lookups ---------- */
export const byId = (coll, id) => db[coll].find((x) => x.id === id);
export const memberName = (id) => (byId('members', id) || {}).name || '(알수없음)';
export const instructorName = (id) => (byId('instructors', id) || {}).name || '-';
export const className = (id) => (byId('classes', id) || {}).name || '-';

/* ---------- Members ---------- */
export function upsertMember(data) {
  if (data.id) {
    const idx = db.members.findIndex((m) => m.id === data.id);
    if (idx >= 0) db.members[idx] = { ...db.members[idx], ...data };
  } else {
    data.id = uid('M');
    data.joinDate = data.startDate;
    data.ptUsed = data.ptUsed || 0;
    data.lockerId = null;
    db.members.push(data);
    // record a payment for new registration
    db.payments.push({
      id: uid('P'), memberId: data.id, date: data.startDate,
      amount: Number(data.planPrice) || 0, method: '카드', plan: data.plan, type: '신규등록',
    });
  }
  refreshDerived();
  save();
  return data;
}
export function deleteMember(id) {
  db.members = db.members.filter((m) => m.id !== id);
  db.bookings = db.bookings.filter((b) => b.memberId !== id);
  for (const l of db.lockers) if (l.memberId === id) { l.status = 'empty'; l.memberId = null; delete l.expireDate; }
  save();
}
export function renewMember(id, planId, extraPt = 0) {
  const m = byId('members', id);
  const plan = byId('plans', planId);
  if (!m || !plan) return;
  const base = daysLeft(m.endDate) > 0 ? m.endDate : TODAY;
  const d = new Date(base);
  d.setMonth(d.getMonth() + plan.months);
  m.endDate = d.toISOString().slice(0, 10);
  m.plan = plan.name; m.planId = plan.id; m.planPrice = plan.price;
  m.status = 'active';
  if (plan.pt) { m.ptTotal = (m.ptTotal || 0) + plan.pt; }
  db.payments.push({
    id: uid('P'), memberId: id, date: TODAY, amount: plan.price,
    method: '카드', plan: plan.name, type: '재등록',
  });
  refreshDerived();
  save();
}
export function toggleMemberPause(id) {
  const m = byId('members', id);
  if (!m) return;
  m.status = m.status === 'paused' ? (daysLeft(m.endDate) < 0 ? 'expired' : 'active') : 'paused';
  save();
}

/* ---------- Attendance ---------- */
export function checkedInToday(memberId) {
  return db.attendance.some((a) => a.memberId === memberId && a.date === TODAY);
}
export function checkIn(memberId) {
  if (checkedInToday(memberId)) return false;
  db.attendance.push({ id: uid('A'), memberId, date: TODAY, time: nowTime() });
  save();
  return true;
}

/* ---------- Bookings ---------- */
export function classBookings(classId, date) {
  return db.bookings.filter((b) => b.classId === classId && b.date === date && b.status === 'booked');
}
export function book(memberId, classId, date) {
  const cls = byId('classes', classId);
  if (!cls) return { ok: false, msg: '수업을 찾을 수 없습니다.' };
  const existing = db.bookings.find((b) => b.memberId === memberId && b.classId === classId && b.date === date && b.status === 'booked');
  if (existing) return { ok: false, msg: '이미 예약된 수업입니다.' };
  if (classBookings(classId, date).length >= cls.capacity) return { ok: false, msg: '정원이 마감되었습니다.' };
  db.bookings.push({ id: uid('B'), memberId, classId, date, status: 'booked' });
  save();
  return { ok: true, msg: '예약이 완료되었습니다.' };
}
export function cancelBooking(bookingId) {
  const b = byId('bookings', bookingId);
  if (b) { b.status = 'cancelled'; save(); }
}

/* ---------- Lockers ---------- */
export function assignLocker(lockerId, memberId) {
  const locker = byId('lockers', lockerId);
  const member = byId('members', memberId);
  if (!locker || !member) return;
  if (member.lockerId) { const old = byId('lockers', member.lockerId); if (old) { old.status = 'empty'; old.memberId = null; delete old.expireDate; } }
  locker.status = 'occupied'; locker.memberId = memberId; locker.expireDate = member.endDate;
  member.lockerId = lockerId;
  save();
}
export function releaseLocker(lockerId) {
  const locker = byId('lockers', lockerId);
  if (!locker) return;
  const member = byId('members', locker.memberId);
  if (member) member.lockerId = null;
  locker.status = 'empty'; locker.memberId = null; delete locker.expireDate;
  save();
}

/* ---------- Derived stats ---------- */
export function expiringSoon(days = 14) {
  return db.members
    .filter((m) => m.status !== 'expired')
    .map((m) => ({ ...m, left: daysLeft(m.endDate) }))
    .filter((m) => m.left >= 0 && m.left <= days)
    .sort((a, b) => a.left - b.left);
}
export function revenueByMonth(months = 6) {
  const map = new Map();
  const now = new Date(TODAY);
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    map.set(d.toISOString().slice(0, 7), 0);
  }
  for (const p of db.payments) {
    const key = p.date.slice(0, 7);
    if (map.has(key)) map.set(key, map.get(key) + (Number(p.amount) || 0));
  }
  return [...map.entries()].map(([month, total]) => ({ month, total }));
}
export function attendanceByDay(days = 14) {
  const map = new Map();
  const now = new Date(TODAY);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    map.set(d.toISOString().slice(0, 10), 0);
  }
  for (const a of db.attendance) if (map.has(a.date)) map.set(a.date, map.get(a.date) + 1);
  return [...map.entries()].map(([date, count]) => ({ date, count }));
}
export function planDistribution() {
  const map = new Map();
  for (const m of db.members) {
    if (m.status === 'expired') continue;
    map.set(m.plan, (map.get(m.plan) || 0) + 1);
  }
  return [...map.entries()].map(([plan, count]) => ({ plan, count })).sort((a, b) => b.count - a.count);
}
