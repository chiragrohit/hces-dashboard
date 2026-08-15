/* Info modal: explanations + provenance + SQL for chart info buttons. */

import { INFO, PROV } from './content.js';

let QUERIES = {};
const qPromise = fetch('/data/queries.json').then(r => r.json()).then(q => { QUERIES = q; }).catch(() => {});

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
      <p class="prov-note">Weights use the survey <code>Multiplier</code>, normalized to national estimates for display. Open the <a href="/metadata">data catalog</a> for the full schema and value counts.</p>
      <h4>SQL query</h4>
      <pre class="sql-block">${(QUERIES[key] || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>` : '';
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
