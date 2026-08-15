/* Info modal: explanations + provenance for chart info buttons. */

import { INFO, PROV } from './content.js';

let META_CACHE = null;

async function meta() {
  if (!META_CACHE) META_CACHE = await (await fetch('/data/metadata.json')).json();
  return META_CACHE;
}

/* Turn a dashboard/detail-page filter value into a raw survey code.
 * Sector and State come from <select>s that hold decoded words. */
function rawCode(tables, col, val) {
  if (!val || val === 'all') return null;
  if (col === 'Sector') {
    if (val === 'Rural') return '1';
    if (val === 'Urban') return '2';
    return val; // already a code (dashboard sector select)
  }
  if (col === 'State') {
    for (const t of tables) for (const c of t.columns) {
      if (!c.state_meaning) continue;
      if (String(val) in c.state_meaning) return val; // already a code
      for (const [code, name] of Object.entries(c.state_meaning)) {
        if (name === val) return code;
      }
    }
    return val;
  }
  return val;
}

function currentFilter(tables, col) {
  const ids = col === 'Sector' ? ['sectorFilter', 'f-sector'] : ['stateFilter', 'f-state'];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el && el.value && el.value !== 'all') return rawCode(tables, col, el.value);
  }
  return null;
}

async function buildDataLink(link, prov) {
  if (!prov) { link.hidden = true; return; }
  const table = prov.file.split(' + ')[0].replace(/\.parquet$/, '');
  const mt = await meta();
  const q = new URLSearchParams();
  for (const col of ['Sector', 'State']) {
    const code = currentFilter(mt.tables, col);
    if (code) q.set(col, code);
  }
  // the columns this chart used — keep only those that exist in the table
  const entry = mt.tables.find(t => t.table === table);
  const have = entry ? new Set(entry.columns.map(c => c.name)) : null;
  const cols = have ? prov.cols.filter(c => have.has(c)) : prov.cols;
  if (cols.length && cols.length < (entry ? entry.columns.length : Infinity)) {
    q.set('cols', cols.join(','));
  }
  link.href = `/metadata/${table}?${q.toString()}`;
  link.hidden = false;
}

export function openInfo(key) {
  const info = INFO[key];
  if (!info) return;
  document.getElementById('modalTitle').textContent = info.title;
  document.getElementById('modalWhat').textContent = info.what;
  document.getElementById('modalLook').textContent = info.look;
  document.getElementById('modalSource').textContent = 'From: ' + info.source;
  const prov = PROV[key];
  document.getElementById('modalProv').innerHTML = prov ? `
      <div class="prov-row"><span class="prov-k">File</span><code>${prov.file}</code></div>
      <div class="prov-row"><span class="prov-k">Columns</span>${prov.cols.map(c => `<code>${c}</code>`).join(' ')}</div>
      <div class="prov-row"><span class="prov-k">Aggregate</span><code>data/${prov.agg}</code></div>
      <p class="prov-note">Weights use the survey <code>Multiplier</code>, normalized to national estimates for display. Open the <a href="/metadata">data catalog</a> for the full schema and value counts.</p>` : '';
  buildDataLink(document.getElementById('modalDataLink'), prov);
  document.getElementById('infoModal').showModal();
}

export function wireModal() {
  const modal = document.getElementById('infoModal');
  document.addEventListener('click', e => {
    const btn = e.target.closest('.info-btn');
    if (btn) openInfo(btn.dataset.info);
  });
  document.getElementById('modalClose').addEventListener('click', () => modal.close());
  modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });
}
