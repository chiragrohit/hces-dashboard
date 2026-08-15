/* Data catalog page (metadata.html): renders metadata.json as expandable
 * table cards with live search filtering. Plain script (kept global for
 * the inline oninput handler in metadata.html). */

let CATALOG = null;

function fmtRows(n) {
  if (n >= 1e7) return (n / 1e7).toFixed(1) + ' Cr';
  if (n >= 1e5) return (n / 1e5).toFixed(1) + ' L';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + ' K';
  return n;
}

function meaningText(col) {
  if (!col.meaning) return '';
  return '<div class="meaning">' + Object.entries(col.meaning).map(([k, v]) => k + ' = ' + v).join(' · ') + '</div>';
}

function renderTable(t) {
  const card = document.createElement('div');
  card.className = 'table-card';
  card.dataset.name = t.table.toLowerCase();
  card.dataset.cols = t.columns.map(c => c.name.toLowerCase()).join(' ');

  card.innerHTML = `
    <div class="table-head" onclick="this.parentElement.querySelector('.columns').classList.toggle('open')">
      <div>
        <h3>${t.table}</h3>
        <div class="desc">${t.description}</div>
      </div>
      <div style="display:flex;align-items:center;gap:20px">
        <div class="meta"><span class="big">${fmtRows(t.rows)}</span> rows · ${t.columns.length} cols · ${t.size_mb} MB</div>
        <span class="expand">Expand ▾</span>
      </div>
    </div>
    <div class="columns">
      <div class="table-scroll">
        <table>
          <thead><tr><th style="width:26%">Column</th><th style="width:12%">Type</th><th style="width:9%">Null %</th><th style="width:9%">Distinct</th><th>Sample values (count)</th></tr></thead>
          <tbody>
            ${t.columns.map(c => `
              <tr>
                <td><span class="col-name">${c.name}</span>${meaningText(c)}</td>
                <td class="type">${c.type}</td>
                <td class="${c.null_pct > 30 ? 'warn' : 'num'}">${c.null_pct}%</td>
                <td class="num">${c.distinct}</td>
                <td class="vals">${c.values && c.values.length
                  ? c.values.slice(0, 10).map(v => `<span>${v.value === null ? 'NULL' : v.value} <span class="c">(${fmtRows(v.count)})</span></span>`).join('')
                  : '<span class="hi">high cardinality — numeric / continuous</span>'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  return card;
}

function applyFilter() {
  const q = document.getElementById('search').value.trim().toLowerCase();
  let shown = 0, colMatches = 0;
  document.querySelectorAll('.table-card').forEach(card => {
    if (!q) { card.style.display = ''; shown++; return; }
    const nameHit = card.dataset.name.includes(q);
    const colHit = card.dataset.cols.includes(q);
    if (nameHit || colHit) { card.style.display = ''; shown++; if (colHit && !nameHit) colMatches++; }
    else card.style.display = 'none';
  });
  document.getElementById('summary').textContent =
    `${shown} of ${CATALOG.tables.length} tables${colMatches ? ` · ${colMatches} matched by column` : ''}`;
}

(async () => {
  try {
    const r = await fetch('data/metadata.json');
    CATALOG = await r.json();
    const list = document.getElementById('list');
    CATALOG.tables.forEach(t => list.appendChild(renderTable(t)));
    const totalRows = CATALOG.tables.reduce((s, t) => s + t.rows, 0);
    const totalCols = CATALOG.tables.reduce((s, t) => s + t.columns.length, 0);
    document.getElementById('summary').textContent =
      `${CATALOG.tables.length} tables · ${totalCols} columns · ${fmtRows(totalRows)} rows total`;
  } catch (e) {
    document.getElementById('summary').textContent = 'Failed to load catalog.';
  }
})();
