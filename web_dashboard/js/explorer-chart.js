/* Explorer rendering: chart, data table, provenance card, CSV export. */

import { X } from './explorer-state.js';
import { PALETTE, baseScales, $, fmt, inr, moneyCol } from './explorer-util.js';

export function drawChart(rows, dim, dim2, meas) {
  if (X.chartInst) X.chartInst.destroy();
  const money = moneyCol(meas);
  const tick = v => money ? inr(v) : fmt(v);
  let labels, datasets, type = 'bar';
  if (dim2) {
    const d1 = [...new Set(rows.map(r => r.d1))];
    const d2 = [...new Set(rows.map(r => r.d2))];
    labels = d1;
    datasets = d2.map((k, i) => ({
      label: String(k), data: d1.map(x => (rows.find(r => r.d1 === x && r.d2 === k) || { v: 0 }).v),
      backgroundColor: PALETTE[i % PALETTE.length], borderRadius: 3, maxBarThickness: 24,
    }));
  } else {
    labels = rows.map(r => String(r.d1));
    if (labels.length <= 6 && !money) type = 'doughnut';
    datasets = [{
      label: meas, data: rows.map(r => r.v),
      backgroundColor: labels.length <= 6 ? PALETTE : PALETTE[0], borderWidth: 0,
      hoverOffset: 6, borderRadius: 4, borderSkipped: false, maxBarThickness: 30,
    }];
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
  X.chartInst = new Chart($('xChart'), { type, data: { labels, datasets }, options });
}

export function drawTable(rows, dim, dim2, meas) {
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
  $('xCount').textContent = rows.length + ' rows' + (X.current.scale !== 1 ? ' · weighted counts scaled to national estimate' : '');
}

export function drawProv(sql, table, dim, dim2, meas, scale) {
  const t = X.cat.tables.find(x => x.table === table);
  $('xProv').innerHTML = `
    <div class="prov-row"><span class="prov-k">Table</span><code>${table}.parquet</code><span class="hint">${t.rows.toLocaleString('en-IN')} rows</span></div>
    <div class="prov-row"><span class="prov-k">Category</span><code>${dim}</code>${dim2 ? '<code>' + dim2 + '</code>' : ''}</div>
    <div class="prov-row"><span class="prov-k">Measure</span><code>${meas}</code>${scale !== 1 ? '<span class="hint">· multiplied by ' + scale + ' to national estimate</span>' : ''}</div>
    <div class="prov-row"><span class="prov-k">Query</span><code style="white-space:normal">${sql.replace(/</g, '&lt;')}</code></div>
    <p class="prov-note">Survey weights (<code>Multiplier</code>) are normalized to national estimates. Many columns store codes, not words — see the <a href="/metadata">data catalog</a> for value meanings.</p>`;
  $('xProvCard').hidden = false;
  $('xQueryHint').textContent = sql;
}

export function downloadCsv() {
  const { rows, headers } = X.current;
  if (!rows.length) return;
  const lines = [headers, ...rows.map(r => [r.d1, r.d2, r.v].filter((_, i) => i < headers.length).map(v => typeof v === 'number' ? v : '"' + String(v).replace(/"/g, '""') + '"'))];
  const csv = '\uFEFF' + lines.map(r => r.join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'explore-' + X.current.table + '.csv';
  a.click();
}
