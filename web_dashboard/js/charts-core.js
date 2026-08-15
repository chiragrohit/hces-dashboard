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
let SHOW_VALUES = false;

export function setShowValues(v) { SHOW_VALUES = !!v; }
export function showValues() { return SHOW_VALUES; }

/* Draws the value of each bar / pie slice on the chart itself. A tiny
 * dependency-free stand-in for chartjs-plugin-datalabels: enabled via the
 * global "Show values" toggle, driven by the chart's own tooltip label
 * callback so money formatting matches the tooltip exactly. */
const valueLabels = {
  id: 'valueLabels',
  afterDatasetsDraw(chart, args, opts) {
    if (!opts || !opts.enabled) return;
    const { ctx } = chart;
    const horiz = chart.options.indexAxis === 'y';
    const isPie = chart.config.type === 'doughnut' || chart.config.type === 'pie';
    const fmtFn = opts.fmt || (c => ' ' + fmt(getVal(c)));
    ctx.save();
    ctx.font = '600 10px Segoe UI, system-ui, sans-serif';
    ctx.fillStyle = THEME.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      const useAbs = ds.data.some(x => x < 0); // mirrored bars (pyramid)
      ds.data.forEach((v, i) => {
        if (v == null) return;
        const el = meta.data[i];
        if (!el || el.hidden) return;
        if (isPie) {
          const total = ds.data.reduce((s, x) => s + x, 0);
          if (total && Math.abs(v) / total < 0.04) return; // skip tiny slices
          const a = (el.startAngle + el.endAngle) / 2;
          const r = (el.innerRadius + el.outerRadius) / 2;
          const val = useAbs ? Math.abs(v) : v;
          const txt = String(fmtFn({ chart, dataIndex: i, dataset: ds, parsed: val, raw: v })).trim();
          if (!txt) return;
          ctx.fillText(txt, el.x + Math.cos(a) * r, el.y + Math.sin(a) * r);
        } else {
          const val = useAbs ? Math.abs(v) : v;
          const txt = String(fmtFn({ chart, dataIndex: i, dataset: ds, parsed: horiz ? { x: val, y: i } : { x: i, y: val }, raw: v })).trim();
          if (!txt) return;
          if (horiz) {
            ctx.textAlign = 'left';
            ctx.fillText(txt, Math.min(el.x, chart.chartArea.right) + 4, el.y);
            ctx.textAlign = 'center';
          } else {
            ctx.fillText(txt, el.x, Math.max(el.y - 5, chart.chartArea.top + 6));
          }
        }
      });
    });
    ctx.restore();
  },
};

if (globalThis.Chart) Chart.register(valueLabels);

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
        valueLabels: { enabled: SHOW_VALUES, fmt: cfg.options?.plugins?.tooltip?.callbacks?.label || null },
      },
    },
  });
}
