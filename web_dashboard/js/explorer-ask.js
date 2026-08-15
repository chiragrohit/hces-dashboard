/* Explorer ask flow: populating the pickers, "ask in English" via /api/ask,
 * and applying the returned config. */

import { X } from './explorer-state.js';
import { $, NUMERIC } from './explorer-util.js';
import { colMeta, run } from './explorer-query.js';

const meaningText = m => typeof m === 'string' ? m
  : (m && typeof m === 'object' ? Object.entries(m).map(([k, v]) => k + '=' + v).join(', ') : '');

export function onTableChange() {
  const table = $('xTable').value;
  const t = X.cat.tables.find(x => x.table === table);
  const cols = t.columns;

  const fill = (selId, list, first) => {
    const sel = $(selId);
    sel.innerHTML = '';
    list.forEach(({ value, label }) => {
      const o = document.createElement('option');
      o.value = value; o.textContent = label; sel.appendChild(o);
    });
    sel.value = first;
  };

  // dimensions: low-cardinality text columns first
  const dims = cols
    .filter(c => c.distinct != null && c.distinct <= 300 && !NUMERIC.includes(c.type) && c.name !== 'Multiplier')
    .map(c => ({ value: c.name, label: c.name + (c.meaning ? ' — ' + meaningText(c.meaning) : '') }));
  const textCols = cols.filter(c => !NUMERIC.includes(c.type) && c.name !== 'Multiplier').map(c => c.name);
  const defaultDim = dims.find(c => /sector|state/i.test(c.name))
    ? dims.find(c => /sector|state/i.test(c.name)).value
    : dims.length ? dims[0].value : (textCols[0] || cols[0].name);
  fill('xDim', dims, defaultDim);
  fill('xDim2', [{ value: '', label: '— None —' }].concat(dims), '');

  // measures: numeric columns + Multiplier (only where a sane scale exists) + row count
  const measures = [];
  const mult = colMeta(table, 'Multiplier');
  const scale = X.cat.scales[table];
  if (mult && scale) measures.push({ value: 'Multiplier', label: 'Weighted count (people/households, national estimate)' });
  cols.filter(c => NUMERIC.includes(c.type) && c.name !== 'Multiplier').forEach(c =>
    measures.push({ value: c.name, label: c.name + (c.meaning ? ' — ' + meaningText(c.meaning) : '') }));
  measures.push({ value: 'COUNT_STAR', label: 'Row count' });
  fill('xMeasure', measures, measures[0].value);

  // sector filter (names or codes, depending on the table)
  const sector = colMeta(table, 'Sector');
  const sSel = $('xSector');
  sSel.innerHTML = '<option value="">All sectors</option>';
  if (sector && sector.values) {
    if (sector.values.some(v => v.value === 'Rural')) { sSel.innerHTML += '<option value="Rural">Rural</option><option value="Urban">Urban</option>'; }
    else if (sector.values.some(v => v.value === '1')) { sSel.innerHTML += '<option value="1">Rural (code 1)</option><option value="2">Urban (code 2)</option>'; }
  }

  // state filter
  const state = colMeta(table, 'State');
  const stSel = $('xState');
  stSel.innerHTML = '<option value="">All states</option>';
  if (state && state.values) state.values.forEach(v => {
    const o = document.createElement('option'); o.value = v.value; o.textContent = v.value; stSel.appendChild(o);
  });
}

export function setConfig(cfg) {
  $('xTable').value = cfg.table;
  onTableChange();
  $('xDim').value = cfg.dim;
  $('xDim2').value = cfg.dim2 || '';
  $('xMeasure').value = cfg.measure;
  $('xAgg').value = cfg.agg;
  $('xSector').value = cfg.sector || '';
  $('xState').value = cfg.state || '';
  X.askFilter = (cfg.filter && cfg.filter.col) ? cfg.filter : null;
  run();
}

export async function ask(q) {
  q = (q || '').trim();
  if (!q) return;
  const note = $('xNote');
  const btn = $('xAskGo');
  btn.disabled = true;
  X.asking = true;
  $('xSteps').hidden = true;
  note.textContent = 'Understanding your question…';
  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q }),
    }).then(r => r.json());
    if (res.error) { note.textContent = 'Could not answer: ' + res.error; return; }
    note.textContent = '';
    setConfig(res.config);
    $('xTitle').textContent = res.config.title || 'Result';
  } catch (e) {
    note.textContent = 'Could not answer: ' + (e.message || e);
  } finally {
    btn.disabled = false;
    X.asking = false;
  }
}
