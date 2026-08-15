/* ---------- Guided query explorer over the raw parquet tables ---------- */
const PALETTE = ['#1d4ed8', '#0e9f8a', '#e9820c', '#be185d', '#6d28d9', '#0891b2', '#4d7c0f', '#b45309', '#475569', '#be123c', '#0369a1', '#a21caf'];

const $ = id => document.getElementById(id);
let CAT = null;              // /api/tables payload
let current = { cols: [], rows: [], headers: [], note: '' };
let askFilter = null;        // optional value filter set by /api/ask
let asking = false;          // an ask flow is in progress (shows the step list)

function fmt(n) {
  const a = Math.abs(n);
  const trim = x => parseFloat(x.toFixed(2)).toString();
  if (a >= 1e7) return trim(n / 1e7) + ' Cr';
  if (a >= 1e5) return trim(n / 1e5) + ' Lakh';
  if (a >= 1e3) return Math.round(n).toLocaleString('en-IN');
  return Math.round(n).toString();
}
function inr(v) { return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
const baseScales = { x: { grid: { color: 'rgba(16,24,40,0.07)' }, ticks: { color: '#5f6b7d', font: { size: 11 } } }, y: { grid: { color: 'rgba(16,24,40,0.07)' }, ticks: { color: '#5f6b7d', font: { size: 11 } } } };
let chartInst = null;

function colMeta(table, name) {
  const t = CAT.tables.find(x => x.table === table);
  return t && t.columns.find(c => c.name === name);
}
const NUMERIC = ['BIGINT', 'INTEGER', 'DOUBLE', 'FLOAT', 'DECIMAL', 'HUGEINT', 'UBIGINT', 'SMALLINT'];

async function init() {
  try {
    CAT = await fetch('/api/tables').then(r => r.json());
  } catch (e) {
    $('xTable').innerHTML = '<option>Could not load tables</option>';
    $('xNote').textContent = 'Cannot reach /api/tables. Restart serve.py (stop old python.exe processes first).';
    return;
  }
  if (!CAT || !CAT.tables || !CAT.tables.length) {
    $('xTable').innerHTML = '<option>No tables found</option>';
    $('xNote').textContent = 'The server returned no tables. Run aggregate_for_web.py and restart serve.py.';
    return;
  }
  const sel = $('xTable');
  CAT.tables.forEach(t => {
    const o = document.createElement('option');
    o.value = t.table; o.textContent = t.table + '  (' + t.rows.toLocaleString('en-IN') + ' rows)';
    sel.appendChild(o);
  });
  sel.addEventListener('change', () => { askFilter = null; onTableChange(); run(); });
  $('xDim2').addEventListener('change', () => { if ($('xDim2').value === $('xDim').value) $('xDim2').value = ''; });
  $('xRun').addEventListener('click', run);
  $('xCsv').addEventListener('click', downloadCsv);
  $('xState').addEventListener('change', run);
  $('xSector').addEventListener('change', run);
  $('xAskGo').addEventListener('click', () => ask($('xAsk').value));
  $('xAsk').addEventListener('keydown', e => { if (e.key === 'Enter') ask($('xAsk').value); });
  document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
    $('xAsk').value = c.textContent.trim();
    $('xAsk').focus();
  }));
  onTableChange();  // populate the pickers; wait for the user to ask
}

function onTableChange() {
  const table = $('xTable').value;
  const t = CAT.tables.find(x => x.table === table);
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

  // dimensions: low-cardinality columns first
  const dims = cols
    .filter(c => c.distinct != null && c.distinct <= 300 && !NUMERIC.includes(c.type) && c.name !== 'Multiplier')
    .map(c => ({ value: c.name, label: c.name + (c.meaning ? ' — ' + c.meaning : '') }));
  const textCols = cols.filter(c => !NUMERIC.includes(c.type) && c.name !== 'Multiplier').map(c => c.name);
  const defaultDim = dims.find(c => /sector|state/i.test(c.name)) ? dims.find(c => /sector|state/i.test(c.name)).value
    : dims.length ? dims[0].value : (textCols[0] || cols[0].name);
  fill('xDim', dims, defaultDim);
  fill('xDim2', [{ value: '', label: '— None —' }].concat(dims), '');

  // measures: numeric columns + Multiplier (only where SUM(Multiplier) is a sane population/household total)
  const measures = [];
  const mult = colMeta(table, 'Multiplier');
  const scale = CAT.scales[table];
  if (mult && scale) {
    const target = /individual/.test(table) ? 1428000000 : 304000000;
    const raw = target / scale;
    if (raw / target >= 0.25 && raw / target <= 4) measures.push({ value: 'Multiplier', label: 'Weighted count (people/households, national estimate)' });
  }
  cols.filter(c => NUMERIC.includes(c.type) && c.name !== 'Multiplier').forEach(c =>
    measures.push({ value: c.name, label: c.name + (c.meaning ? ' — ' + c.meaning : '') }));
  measures.push({ value: 'COUNT_STAR', label: 'Row count' });
  fill('xMeasure', measures, measures[0].value);

  // sector filter (1=2= codes or names)
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

/* ---------- "Ask in English" via /api/ask ---------- */
function stepsShow() { const el = $('xSteps'); el.hidden = false; [1, 2, 3, 4].forEach(i => $('st' + i).className = ''); }
function setStep(n, cls) { $('st' + n).className = cls; }

async function ask(q) {
  q = (q || '').trim();
  if (!q) return;
  const note = $('xNote');
  const btn = $('xAskGo');
  btn.disabled = true;
  asking = true;
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
    asking = false;
  }
}

function setConfig(cfg) {
  $('xTable').value = cfg.table;
  onTableChange();
  $('xDim').value = cfg.dim;
  $('xDim2').value = cfg.dim2 || '';
  $('xMeasure').value = cfg.measure;
  $('xAgg').value = cfg.agg;
  $('xSector').value = cfg.sector || '';
  $('xState').value = cfg.state || '';
  askFilter = (cfg.filter && cfg.filter.col) ? cfg.filter : null;
  run();
}

function quote(c) { return '"' + c.replace(/"/g, '""') + '"'; }

function buildSql() {
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
  if (askFilter) where.push(quote(askFilter.col) + " = '" + String(askFilter.value).replace(/'/g, "''") + "'");

  let expr;
  if (meas === 'Multiplier') expr = 'SUM(Multiplier)';
  else if (meas === 'COUNT_STAR') expr = 'COUNT(*)';
  else if (agg === 'sum') expr = 'SUM(' + quote(meas) + ')';
  else if (agg === 'avg') expr = 'AVG(' + quote(meas) + ')';
  else if (agg === 'count_distinct') expr = 'COUNT(DISTINCT ' + quote(meas) + ')';
  else expr = 'COUNT(*)';

  const cols = quote(dim) + (dim2 ? ', ' + quote(dim2) : '');
  const sql = 'SELECT ' + cols + ', ' + expr + ' AS v FROM ' + quote(table)
    + (where.length ? ' WHERE ' + where.join(' AND ') : '')
    + ' GROUP BY 1' + (dim2 ? ', 2' : '') + ' ORDER BY v DESC LIMIT 500';
  return sql;
}

async function run() {
  const show = asking;
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
  const scale = (meas === 'Multiplier' && CAT.scales[table]) ? CAT.scales[table] : 1;
  let rows = res.rows.map(r => ({ d1: r[0], d2: dim2 ? r[1] : null, v: (dim2 ? r[2] : r[1]) * scale }));
  current = { rows, headers: [dim, dim2, meas], sql, scale, table };
  drawChart(rows, dim, dim2, meas);
  drawTable(rows, dim, dim2, meas);
  drawProv(sql, table, dim, dim2, meas, scale);
  if (show) { setStep(3, 'done'); setStep(4, 'done'); }
  $('xChartCard').hidden = false;
  $('xTableCard').hidden = false;
  $('xCsv').disabled = false;
}

function moneyCol(name) { return /value|expenditure|amount|consumption|rent|spend|price|cost/i.test(name); }

function drawChart(rows, dim, dim2, meas) {
  if (chartInst) chartInst.destroy();
  const money = moneyCol(meas);
  const tick = v => money ? inr(v) : fmt(v);
  let labels, datasets, type = 'bar';
  if (dim2) {
    const d1 = [...new Set(rows.map(r => r.d1))];
    const d2 = [...new Set(rows.map(r => r.d2))];
    labels = d1;
    datasets = d2.map((k, i) => ({ label: String(k), data: d1.map(x => (rows.find(r => r.d1 === x && r.d2 === k) || { v: 0 }).v), backgroundColor: PALETTE[i % PALETTE.length], borderRadius: 3, maxBarThickness: 24 }));
  } else {
    labels = rows.map(r => String(r.d1));
    if (labels.length <= 6 && !money) type = 'doughnut';
    datasets = [{ label: meas, data: rows.map(r => r.v), backgroundColor: labels.length <= 6 ? PALETTE : PALETTE[0], borderWidth: 0, hoverOffset: 6, borderRadius: 4, borderSkipped: false, maxBarThickness: 30 }];
  }
  const options = { responsive: true, maintainAspectRatio: false };
  if (type === 'bar') {
    options.indexAxis = labels.length > 10 ? 'y' : 'x';
    options.scales = { ...baseScales };
    if (options.indexAxis === 'y') {
      options.scales.x = { ...baseScales.x, ticks: { ...baseScales.x.ticks, callback: tick } };
      options.scales.y = { ...baseScales.y, ticks: { ...baseScales.y.ticks, font: { size: 11 } } };
    } else {
      options.scales.x = { ...baseScales.x, ticks: { ...baseScales.x.ticks, maxRotation: 45, font: { size: 10 } } };
      options.scales.y = { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: tick } };
    }
    options.plugins = { tooltip: { callbacks: { label: c => (money ? inr(c.parsed[options.indexAxis === 'y' ? 'x' : 'y']) : fmt(c.parsed[options.indexAxis === 'y' ? 'x' : 'y'])) } } };
  } else {
    options.cutout = '60%';
    options.plugins = { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => c.label + ': ' + fmt(c.parsed) } } };
  }
  chartInst = new Chart($('xChart'), { type, data: { labels, datasets }, options });
}

function drawTable(rows, dim, dim2, meas) {
  const headers = [dim, dim2, meas].filter(Boolean);
  const tbl = $('xResult');
  tbl.innerHTML = '';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  headers.forEach(h => { const th = document.createElement('th'); th.textContent = h; hr.appendChild(th); });
  thead.appendChild(hr);
  const tbody = document.createElement('tbody');
  rows.forEach(r => {
    const tr = document.createElement('tr');
    [r.d1, r.d2, r.v].forEach((v, i) => {
      const td = document.createElement('td');
      if (typeof v === 'number') { td.classList.add('num'); td.textContent = moneyCol(headers[i]) ? inr(v) : fmt(v); }
      else td.textContent = v == null ? '' : String(v);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  tbl.appendChild(thead); tbl.appendChild(tbody);
  $('xCount').textContent = rows.length + ' rows' + (current.scale !== 1 ? ' · weighted counts scaled to national estimate' : '');
}

function drawProv(sql, table, dim, dim2, meas, scale) {
  const t = CAT.tables.find(x => x.table === table);
  $('xProv').innerHTML = `
    <div class="prov-row"><span class="prov-k">Table</span><code>${table}.parquet</code><span class="hint">${t.rows.toLocaleString('en-IN')} rows</span></div>
    <div class="prov-row"><span class="prov-k">Category</span><code>${dim}</code>${dim2 ? '<code>' + dim2 + '</code>' : ''}</div>
    <div class="prov-row"><span class="prov-k">Measure</span><code>${meas}</code>${scale !== 1 ? '<span class="hint">· multiplied by ' + scale + ' to national estimate</span>' : ''}</div>
    <div class="prov-row"><span class="prov-k">Query</span><code style="white-space:normal">${sql.replace(/</g, '&lt;')}</code></div>
    <p class="prov-note">Survey weights (<code>Multiplier</code>) are normalized to national estimates. Many columns store codes, not words — see the <a href="/metadata">data catalog</a> for value meanings.</p>`;
  $('xProvCard').hidden = false;
  $('xQueryHint').textContent = sql;
}

function downloadCsv() {
  const { rows, headers } = current;
  if (!rows.length) return;
  const lines = [headers, ...rows.map(r => [r.d1, r.d2, r.v].filter((_, i) => i < headers.length).map(v => typeof v === 'number' ? v : '"' + String(v).replace(/"/g, '""') + '"'))];
  const csv = '\uFEFF' + lines.map(r => r.join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'explore-' + $('xTable').value + '.csv';
  a.click();
}

/* modal wiring (same pattern as the dashboard) */
const modal = document.getElementById('infoModal');
document.getElementById('modalClose').addEventListener('click', () => modal.close());
modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });
document.getElementById('exploreInfo').addEventListener('click', () => modal.showModal());

init();
