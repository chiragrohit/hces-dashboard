/* Raw-data browser (dataset.html): one parquet table as a paginated,
 * filterable HTML table. Filters and pagination live in the URL so any
 * view is shareable/deep-linkable. Codes are decoded to words for display
 * using the catalog maps; the raw values stay in the URL and API calls.
 *
 * Plain script (no modules), same style as metadata.js. */

let META = null;          // full catalog (metadata.json)
let ENTRY = null;         // this table's catalog entry
let FILTER_COLS = [];     // [{name, options:[{v,label}]}] -> filter dropdowns
let PROV_COLS = null;     // ?cols= from a chart deep-link (preferred columns)
let SELECTED_COLS = null; // null = all columns, else array of names

const $ = id => document.getElementById(id);

function fmtRows(n) {
  if (n >= 1e7) return (n / 1e7).toFixed(1) + ' Cr';
  if (n >= 1e5) return (n / 1e5).toFixed(1) + ' L';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + ' K';
  return n;
}

function mapsFor(col) {
  const d = {};
  if (col.meaning) Object.assign(d, col.meaning);
  if (col.state_meaning) Object.assign(d, col.state_meaning);
  if (col.item_meaning) Object.assign(d, col.item_meaning);
  return d;
}

function decode(col, v) {
  if (v === null || v === undefined) return null;
  const m = mapsFor(col);
  return m && String(v) in m ? m[String(v)] : String(v);
}

/* ---- URL state ------------------------------------------------------- */

function readParams() {
  const q = new URLSearchParams(location.search);
  const filters = {};
  for (const col of FILTER_COLS) {
    const v = q.get(col.name);
    if (v) filters[col.name] = v;
  }
  const page = Math.max(1, parseInt(q.get('page') || '1', 10) || 1);
  const perRaw = parseInt(q.get('per') || '50', 10);
  const per = [25, 50, 100, 200].includes(perRaw) ? perRaw : 50;
  return { filters, page, per };
}

function readColsFromUrl() {
  const cols = new URLSearchParams(location.search).get('cols');
  return cols ? cols.split(',').map(s => s.trim()).filter(Boolean) : null;
}

/* filters straight from the dropdowns (source of truth during interaction) */
function currentFilters() {
  const filters = {};
  for (const col of FILTER_COLS) {
    const sel = document.querySelector(`#f-${CSS.escape(col.name)}`);
    if (sel && sel.value) filters[col.name] = sel.value;
  }
  return filters;
}

function writeParams(filters, page, per) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) q.set(k, v);
  q.set('page', page);
  q.set('per', per);
  if (SELECTED_COLS && SELECTED_COLS.length && SELECTED_COLS.length < ENTRY.columns.length) {
    q.set('cols', SELECTED_COLS.join(','));
  }
  const url = location.pathname + '?' + q.toString();
  history.pushState({}, '', url);
  return url;
}

/* ---- data fetching --------------------------------------------------- */

async function fetchPage(filters, page, per) {
  const q = new URLSearchParams({ table: ENTRY.table, page, per });
  for (const [k, v] of Object.entries(filters)) if (v) q.set(k, v);
  if (SELECTED_COLS && SELECTED_COLS.length && SELECTED_COLS.length < ENTRY.columns.length) {
    q.set('cols', SELECTED_COLS.join(','));
  }
  const res = await fetch('/api/rows?' + q.toString());
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

/* ---- rendering ------------------------------------------------------- */

function renderPageHead() {
  $('pageHead').innerHTML = `
    <div>
      <h1><code>${ENTRY.table}</code></h1>
      <div class="desc">${ENTRY.description || ''}</div>
    </div>
    <div class="meta">
      <span class="big">${fmtRows(ENTRY.rows)}</span> rows · ${ENTRY.columns.length} cols · ${ENTRY.size_mb} MB
      <br>Original release: microdata rows, codes as-is
    </div>`;
}

function buildFilters() {
  const panel = $('filters');
  // only categorical columns with a label map get dropdowns; sampling
  // identifiers (Stratum, Sample_Household_No, ...) and plain counts have
  // no survey labels and are left as table columns, not filters
  FILTER_COLS = ENTRY.columns
    .filter(c => c.values && c.values.length && c.distinct > 1 && c.distinct <= 60)
    .filter(c => c.meaning || c.state_meaning || c.item_meaning)
    .sort((a, b) => a.distinct - b.distinct);

  panel.innerHTML = FILTER_COLS.map(c => `
    <div class="field">
      <label for="f-${c.name}">${c.name}</label>
      <select id="f-${c.name}" data-col="${c.name}" onchange="onFilterChange('${c.name}')">
        <option value="">All</option>
        ${c.values.map(v => `<option value="${String(v.value).replace(/"/g, '&quot;')}">${decode(c, v.value)}</option>`).join('')}
      </select>
    </div>`).join('');

  // set select values from URL params
  const { filters } = readParams();
  for (const [k, v] of Object.entries(filters)) {
    const sel = document.querySelector(`#f-${CSS.escape(k)}`);
    if (sel) sel.value = v;
  }
}

function buildColPicker() {
  const grid = $('colGrid');
  grid.innerHTML = ENTRY.columns.map(c => `
    <label><input type="checkbox" data-col="${c.name}" ${(!SELECTED_COLS || SELECTED_COLS.includes(c.name)) ? 'checked' : ''}>
      <span>${c.name} <span class="t">(${c.type})</span></span>
    </label>`).join('');
}

function renderTable(data) {
  $('body').innerHTML = `
    <div class="table-scroll">
      <table>
        <thead><tr>
          <th class="num">#</th>
          ${data.columns.map(c => `<th class="${isNum(data, c) ? 'num' : ''}">${c}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${data.rows.map((r, i) => `
            <tr>
              <td class="num raw">${(data.page - 1) * data.per + i + 1}</td>
              ${r.map((v, j) => {
                const col = ENTRY.columns.find(c => c.name === data.columns[j]);
                const label = col ? decode(col, v) : String(v ?? '');
                const cls = v === null || v === undefined ? 'null'
                  : (col && isNum(data, data.columns[j]) ? 'num' : '');
                return `<td class="${cls}">${label === null ? 'NULL' : label}</td>`;
              }).join('')}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  const from = (data.page - 1) * data.per + (data.rows.length ? 1 : 0);
  const to = (data.page - 1) * data.per + data.rows.length;
  const total = data.total.toLocaleString('en-IN');
  const nSel = data.columns.length;
  $('summary').innerHTML = `Showing <b>${from.toLocaleString('en-IN')}–${to.toLocaleString('en-IN')}</b> of <b>${total}</b> rows
    <span class="raw">· ${nSel}/${ENTRY.columns.length} columns</span>`;

  const pages = Math.max(1, Math.ceil(data.total / data.per));
  $('pageInfo').innerHTML = `Page <b>${data.page}</b> of <b>${pages.toLocaleString('en-IN')}</b>`;
  $('prevBtn').disabled = data.page <= 1;
  $('nextBtn').disabled = data.page >= pages;
  $('perSel').value = String(data.per);
  $('pager').hidden = false;
}

function isNum(data, col) {
  const c = ENTRY.columns.find(x => x.name === col);
  return c && ['BIGINT', 'INTEGER', 'DOUBLE', 'FLOAT', 'DECIMAL', 'HUGEINT', 'UBIGINT', 'SMALLINT', 'TINYINT'].includes(c.type);
}

/* ---- interactions ---------------------------------------------------- */

function onFilterChange(name) {
  const filters = currentFilters();
  const { per } = readParams();
  writeParams(filters, 1, per);
  load({ filters, page: 1, per });
}

function goto(page) {
  const { filters, per } = readParams();
  writeParams(filters, page, per);
  load({ filters: { ...filters }, page, per });
}

function setPer(per) {
  const { filters } = readParams();
  writeParams(filters, 1, per);
  load({ filters: { ...filters }, page: 1, per });
}

function toggleCols() {
  $('colpick').classList.toggle('open');
  $('colBtn').classList.toggle('active');
}

function setAllCols(on) {
  document.querySelectorAll('#colGrid input').forEach(i => { i.checked = on; });
}

function setProvCols() {
  document.querySelectorAll('#colGrid input').forEach(i => {
    i.checked = PROV_COLS ? PROV_COLS.includes(i.dataset.col) : false;
  });
}

function applyCols() {
  const picked = [...document.querySelectorAll('#colGrid input:checked')].map(i => i.dataset.col);
  SELECTED_COLS = picked.length < ENTRY.columns.length ? picked : null;
  const filters = currentFilters();
  const { per } = readParams();
  writeParams(filters, 1, per);
  load({ filters, page: 1, per });
}

/* ---- boot ------------------------------------------------------------ */

async function load({ filters, page, per }) {
  const hasTable = !!$('body').querySelector('table');
  if (hasTable) {
    $('body').classList.add('loading-blur');   // keep the old table on screen
    $('summary').classList.add('busy');
  } else {
    $('body').innerHTML = '<div class="loading">Loading rows…</div>';
  }
  try {
    const data = await fetchPage(filters, page, per);
    renderTable(data);
  } catch (e) {
    $('body').innerHTML = `<div class="error">Could not load data: ${e.message}</div>`;
  } finally {
    $('body').classList.remove('loading-blur');
    $('summary').classList.remove('busy');
  }
}

(async function init() {
  const table = location.pathname.split('/').filter(Boolean).pop();
  try {
    META = await (await fetch('/data/metadata.json')).json();
    ENTRY = META.tables.find(t => t.table === table);
    if (!ENTRY) throw new Error('Unknown dataset: ' + table);

    renderPageHead();
    buildFilters();
    SELECTED_COLS = readColsFromUrl();
    PROV_COLS = SELECTED_COLS;
    buildColPicker();
    document.querySelectorAll('#colGrid input').forEach(i =>
      i.addEventListener('change', applyCols));
    // read the URL after FILTER_COLS exists so filters are picked up
    const { filters, page, per } = readParams();
    window.addEventListener('popstate', () => {
      const s = readParams();
      for (const col of FILTER_COLS) {
        const sel = document.querySelector(`#f-${CSS.escape(col.name)}`);
        if (sel) sel.value = s.filters[col.name] || '';
      }
      SELECTED_COLS = readColsFromUrl();
      buildColPicker();
      load({ filters: s.filters, page: s.page, per: s.per });
    });
    load({ filters, page, per });
  } catch (e) {
    $('pageHead').innerHTML = '';
    $('body').innerHTML = `<div class="error">${e.message}</div>`;
  }
})();
