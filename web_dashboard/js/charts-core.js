/* Chart.js scaffolding: theme, shared scales, and the makeChart wrapper.
 * Requires the Chart.js global (loaded via CDN before this module).
 * Zoom/pan (chartjs-plugin-zoom, loaded via CDN) applies to cartesian
 * charts: scroll-wheel zooms, drag pans, double-click resets. */

import { fmt, getVal } from './util.js';

export const THEME = {
  grid: '#eef1f5', tick: '#5f6b7d', legend: '#344054', ink: '#101828',
  palette: ['#1d4ed8', '#0e9f8a', '#b45309', '#be123c', '#6d28d9', '#0d9488', '#c2410c', '#4f46e5', '#a16207', '#be185d'],
};

export const baseScales = {
  x: { ticks: { color: THEME.tick }, grid: { color: THEME.grid }, border: { color: THEME.grid } },
  y: { ticks: { color: THEME.tick }, grid: { color: THEME.grid }, border: { display: false } },
};

const charts = {};
let focusChart = null; // when set, only that chart id renders (detail page)

/* Zoom/pan config shared by all cartesian charts.
 * chartjs-plugin-zoom expects wheel/pinch/drag under `zoom`, pan at top. */
export const ZOOM = {
  zoom: { wheel: { enabled: true, speed: 0.05 }, mode: 'xy' },
  pan: { enabled: true, mode: 'xy' },
};

function onReady(chart) {
  /* double-click resets zoom */
  const el = chart.canvas;
  if (el && el._zoomReset) return;
  el._zoomReset = () => { if (chart.zoom) chart.resetZoom(); };
  el.addEventListener('dblclick', el._zoomReset);
}

/* Called by the detail page before rendering so only its chart mounts. */
export function setFocusChart(id) { focusChart = id; }

if (globalThis.Chart) {
  Chart.defaults.font.family = 'Segoe UI, system-ui, sans-serif';
  Chart.defaults.font.size = 12;
  Chart.defaults.color = THEME.tick;
}

export function makeChart(id, cfg) {
  if (charts[id]) charts[id].destroy();
  const el = document.getElementById(id);
  if (!el) return;
  if (focusChart && focusChart !== id) return;
  charts[id] = new Chart(el, {
    ...cfg,
    options: {
      responsive: true, maintainAspectRatio: false, ...cfg.options,
      plugins: {
        legend: { labels: { color: THEME.legend, usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 18 }, ...(cfg.options?.plugins?.legend || {}) },
        tooltip: {
          backgroundColor: '#101828', padding: 10, cornerRadius: 8, titleColor: '#e5e7eb', bodyColor: '#d1d5db',
          callbacks: { label: ctx => ' ' + fmt(getVal(ctx)) },
          ...(cfg.options?.plugins?.tooltip || {}),
        },
        ...(cfg.options?.scales ? { zoom: { ...ZOOM, ...(cfg.options?.plugins?.zoom || {}) } } : {}),
      },
    },
  });
  onReady(charts[id]);
}
