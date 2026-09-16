/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
 *
 * charts.js — thin wrappers over Chart.js (loaded from CDN). Theme-aware.
 */

const registry = new Map();

function css(varName, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v || fallback;
}
function theme() {
  return {
    text: css('--text-dim', '#64708a'),
    grid: css('--border', '#e4e8f0'),
    primary: css('--primary', '#4f7cff'),
  };
}
const PALETTE = ['#4f7cff', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#dc2626'];

function make(canvasId, config) {
  if (!window.Chart) { console.warn('Chart.js 미로딩'); return null; }
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  if (registry.has(canvasId)) { registry.get(canvasId).destroy(); registry.delete(canvasId); }
  const t = theme();
  window.Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  window.Chart.defaults.color = t.text;
  const chart = new window.Chart(canvas, config);
  registry.set(canvasId, chart);
  return chart;
}

export function destroyAll() {
  for (const c of registry.values()) c.destroy();
  registry.clear();
}

export function revenueChart(canvasId, data, labelFmt) {
  const t = theme();
  return make(canvasId, {
    type: 'bar',
    data: {
      labels: data.map((d) => d.month.slice(5) + '월'),
      datasets: [{
        label: '매출',
        data: data.map((d) => d.total),
        backgroundColor: t.primary,
        borderRadius: 6, maxBarThickness: 46,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => labelFmt(c.parsed.y) } },
      },
      scales: {
        x: { grid: { display: false }, border: { color: t.grid } },
        y: { grid: { color: t.grid }, border: { display: false }, ticks: { callback: (v) => labelFmt(v) } },
      },
    },
  });
}

export function attendanceChart(canvasId, data) {
  const t = theme();
  return make(canvasId, {
    type: 'line',
    data: {
      labels: data.map((d) => d.date.slice(5)),
      datasets: [{
        label: '출석',
        data: data.map((d) => d.count),
        borderColor: t.primary,
        backgroundColor: 'rgba(79,124,255,.14)',
        fill: true, tension: .35, pointRadius: 2, borderWidth: 2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, border: { color: t.grid }, ticks: { maxTicksLimit: 8 } },
        y: { grid: { color: t.grid }, border: { display: false }, beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  });
}

export function planChart(canvasId, data) {
  return make(canvasId, {
    type: 'doughnut',
    data: {
      labels: data.map((d) => d.plan),
      datasets: [{ data: data.map((d) => d.count), backgroundColor: PALETTE, borderWidth: 0 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '62%',
      plugins: { legend: { position: 'right', labels: { boxWidth: 12, padding: 10, font: { size: 11 } } } },
    },
  });
}
