/* Explorer entry point (explorer.html): loads the catalog, populates the
 * table picker, wires all controls, and starts the ask flow. */

import { X } from './explorer-state.js';
import { $ } from './explorer-util.js';
import { run } from './explorer-query.js';
import { downloadCsv } from './explorer-chart.js';
import { onTableChange, ask } from './explorer-ask.js';

async function init() {
  try {
    X.cat = await fetch('/api/tables').then(r => r.json());
  } catch (e) {
    $('xTable').innerHTML = '<option>Could not load tables</option>';
    $('xNote').textContent = 'Cannot reach /api/tables. Restart serve.py (stop old python.exe processes first).';
    return;
  }
  if (!X.cat || !X.cat.tables || !X.cat.tables.length) {
    $('xTable').innerHTML = '<option>No tables found</option>';
    $('xNote').textContent = 'The server returned no tables. Run aggregate_for_web.py and restart serve.py.';
    return;
  }

  const sel = $('xTable');
  X.cat.tables.forEach(t => {
    const o = document.createElement('option');
    o.value = t.table; o.textContent = t.table + '  (' + t.rows.toLocaleString('en-IN') + ' rows)';
    sel.appendChild(o);
  });

  sel.addEventListener('change', () => { X.askFilter = null; onTableChange(); run(); });
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

  onTableChange();
}

// modal wiring (same pattern as the dashboard pages)
const modal = document.getElementById('infoModal');
document.getElementById('modalClose').addEventListener('click', () => modal.close());
modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });
document.getElementById('exploreInfo').addEventListener('click', () => modal.showModal());

init();
