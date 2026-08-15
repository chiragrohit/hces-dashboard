/* Explorer query engine: builds SQL from the picker state, runs it against
 * /api/query, and renders the result. Also hosts the step-progress helpers
 * used while an ask flow runs. */

import { X } from './explorer-state.js';
import { $, NUMERIC } from './explorer-util.js';
import { drawChart, drawTable, drawProv } from './explorer-chart.js';

export function colMeta(table, name) {
  const t = X.cat.tables.find(x => x.table === table);
  return t && t.columns.find(c => c.name === name);
}

export function quote(c) { return '"' + c.replace(/"/g, '""') + '"'; }

/* ---------- step progress (shown once a query actually fires) ---------- */
export function stepsShow() {
  const el = $('xSteps');
  el.hidden = false;
  [1, 2, 3, 4].forEach(i => $('st' + i).className = '');
}
export function setStep(n, cls) { $('st' + n).className = cls; }

export function buildSql() {
  const table = $('xTable').value;
  const dim = $('xDim').value;
  const dim2 = $('xDim2').value;
  const meas = $('xMeasure').value;
  const agg = $('xAgg').value;
  const where = [];
  const sv = $('xSector').value;
  if (sv) where.push(quote('Sector') + " = '" + sv.replace(/'/g, "''") + "'");
  const st = $('xState').value;
  if (st) where.push(quote('State') + " = '" + st.replace(/'/g, "''") + "'");
  if (X.askFilter) where.push(quote(X.askFilter.col) + " = '" + String(X.askFilter.value).replace(/'/g, "''") + "'");

  let expr;
  if (meas === 'Multiplier') expr = 'SUM(Multiplier)';
  else if (meas === 'COUNT_STAR') expr = 'COUNT(*)';
  else if (agg === 'sum') expr = 'SUM(' + quote(meas) + ')';
  else if (agg === 'avg') expr = 'AVG(' + quote(meas) + ')';
  else if (agg === 'count_distinct') expr = 'COUNT(DISTINCT ' + quote(meas) + ')';
  else expr = 'COUNT(*)';

  const cols = quote(dim) + (dim2 ? ', ' + quote(dim2) : '');
  return 'SELECT ' + cols + ', ' + expr + ' AS v FROM ' + quote(table)
    + (where.length ? ' WHERE ' + where.join(' AND ') : '')
    + ' GROUP BY 1' + (dim2 ? ', 2' : '') + ' ORDER BY v DESC LIMIT 500';
}

export async function run() {
  const show = X.asking;
  if (show) { stepsShow(); setStep(1, 'done'); setStep(2, 'done'); setStep(3, 'on'); }
  const sql = buildSql();
  const res = await fetch('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  }).then(r => r.json());
  const note = $('xNote');
  if (res.error) {
    note.textContent = 'Query error: ' + res.error;
    if (show) $('xSteps').hidden = true;
    $('xChartCard').hidden = true;
    $('xTableCard').hidden = true;
    return;
  }
  note.textContent = '';
  const table = $('xTable').value;
  const dim = $('xDim').value;
  const dim2 = $('xDim2').value;
  const meas = $('xMeasure').value;
  const scale = (meas === 'Multiplier' && X.cat.scales[table]) ? X.cat.scales[table] : 1;
  const rows = res.rows.map(r => ({ d1: r[0], d2: dim2 ? r[1] : null, v: (dim2 ? r[2] : r[1]) * scale }));
  X.current = { rows, headers: [dim, dim2, meas], sql, scale, table };
  drawChart(rows, dim, dim2, meas);
  drawTable(rows, dim, dim2, meas);
  drawProv(sql, table, dim, dim2, meas, scale);
  if (show) { setStep(3, 'done'); setStep(4, 'done'); }
  $('xChartCard').hidden = false;
  $('xTableCard').hidden = false;
  $('xCsv').disabled = false;
}
