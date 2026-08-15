/* Chart.js scaffolding: theme, shared scales, and the makeChart wrapper.
 * Requires the Chart.js global (loaded via CDN before this module). */

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

/* Tap-toggle: on touch screens, tapping the same slice/bar again dismisses
 * its tooltip (Chart.js only shows it, never hides on re-tap). Tapping empty
 * chart space also dismisses. Uses a native canvas click listener instead of
 * chart.options.onClick, which Chart.js does not reliably fire for touch taps
 * (its tooltip activates on touchstart; the second tap may hit the tooltip
 * region). Desktop hover behaviour is unchanged. */
export function wireTapToggle(chart) {
  let last = null;
  const hide = () => { chart.tooltip.setActiveElements([], { x: 0, y: 0 }); chart.update(); };
  chart.canvas.addEventListener('click', (e) => {
    const els = chart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false);
    const pos = Chart.helpers.getRelativePosition(e, chart);
    if (!els[0]) { hide(); last = null; return; } // tap on empty chart space
    const key = els[0].datasetIndex + ':' + els[0].index;
    const now = Date.now();
    if (last && last.key === key && now - last.t < 1200) { // same slice re-tapped -> toggle off
      hide();
      last = null;
    } else {
      last = { key, t: now };
    }
  });
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
      },
    },
  });
  wireTapToggle(charts[id]);
}
