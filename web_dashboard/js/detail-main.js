/* Detail page entry point (detail.html? id=<chart>): one chart rendered
 * from the same shared modules as the dashboard, plus its raw data table,
 * sector/state filters, CSV download and provenance. */

import { D, loadAll, setFocus, focusFilters } from './data.js';
import { RENDERERS } from './charts-sections.js';
import { setFocusChart } from './charts-core.js';
import { INFO, PROV, C } from './content.js';

let QUERIES = {};
const qPromise = fetch('/data/queries.json').then(r => r.json()).then(q => { QUERIES = q; }).catch(() => {});
import { fmt } from './util.js';

const params = new URLSearchParams(location.search);
const key = params.get('id');
const CANVAS = {
  stateConsumption: 'chartStateConsumption', sectorShare: 'chartSectorShare', ooh: 'chartOOH',
  ageGroup: 'chartAgeGroup', gender: 'chartGender', pyramid: 'chartPyramid', composition: 'chartComposition',
  education: 'chartEducation', marital: 'chartMarital', internet: 'chartInternet', meals: 'chartMeals', relation: 'chartRelation',
  hhsize: 'chartHHSize', hhtype: 'chartHHType', socialgroup: 'chartSocialGroup', religion: 'chartReligion',
  dwelling: 'chartDwelling', energy: 'chartEnergy', lighting: 'chartLighting', land: 'chartLand',
  ration: 'chartRation', ujjwala: 'chartUjjwala',
  foodItems: 'chartFoodItems', consumpDist: 'chartConsumpDist', perHH: 'chartPerHH', foodSource: 'chartFoodSource', onlineGrocery: 'chartOnlineGrocery',
  pds: 'chartPDS', lpg: 'chartLPG', electricity: 'chartElectricity', ayushman: 'chartAyushman', school: 'chartSchool', schoolSplit: 'chartSchoolSplit',
};
const chartId = CANVAS[key] || key;

const SECTION = {
  chartStateConsumption: 'overview', chartSectorShare: 'overview', chartOOH: 'overview',
  chartAgeGroup: 'people', chartGender: 'people', chartPyramid: 'people', chartComposition: 'people',
  chartEducation: 'people', chartMarital: 'people', chartInternet: 'people', chartMeals: 'people', chartRelation: 'people',
  chartHHSize: 'households', chartHHType: 'households', chartSocialGroup: 'households', chartReligion: 'households',
  chartDwelling: 'households', chartEnergy: 'households', chartLighting: 'households', chartLand: 'households',
  chartRation: 'households', chartUjjwala: 'households',
  chartFoodItems: 'spending', chartConsumpDist: 'spending', chartPerHH: 'spending', chartFoodSource: 'spending', chartOnlineGrocery: 'spending',
  chartPDS: 'schemes', chartLPG: 'schemes', chartElectricity: 'schemes', chartAyushman: 'schemes', chartSchool: 'schemes', chartSchoolSplit: 'schemes',
};

const TBL = {
  chartStateConsumption: { key: 'stateConsumption' },
  chartSectorShare: { key: 'stateConsumption' },
  chartOOH: { key: 'stateConsumption' },
  chartAgeGroup: { key: 'demographics' },
  chartGender: { key: 'demographics' },
  chartPyramid: { key: 'demographics' },
  chartComposition: { key: 'demographics' },
  chartEducation: { key: 'education' },
  chartMarital: { key: 'people.marital', map: 'marital' },
  chartInternet: { key: 'people.internet' },
  chartMeals: { key: 'people.meals' },
  chartRelation: { key: 'people.relation', map: 'relation' },
  chartHHSize: { key: 'householdExtras.hh_size' },
  chartHHType: { key: 'householdChars', group: { by: 'household_type', sum: 'estimated_households', top: 7, map: 'hhtype' } },
  chartSocialGroup: { key: 'householdExtras.social_group', map: 'social' },
  chartReligion: { key: 'householdChars', group: { by: 'religion', sum: 'estimated_households', top: 8, map: 'religion' } },
  chartDwelling: { key: 'householdChars', group: { by: 'dwelling_type', sum: 'estimated_households', top: 8, map: 'dwelling' } },
  chartEnergy: { key: 'householdChars', group: { by: 'cooking_energy', sum: 'estimated_households', top: 8, map: 'cooking' } },
  chartLand: { key: 'householdChars', group: { by: 'land_ownership', sum: 'estimated_households', top: 8, map: 'land' } },
  chartRation: { key: 'householdChars', group: { by: 'ration_card', sum: 'estimated_households', top: 6, map: 'ration' } },
  chartLighting: { key: 'householdExtras.lighting', map: 'lighting' },
  chartUjjwala: { key: 'householdExtras.ujjwala' },
  chartFoodItems: { key: 'foodRankings' },
  chartConsumpDist: { key: 'stateConsumption' },
  chartPerHH: { key: 'stateConsumption' },
  chartFoodSource: { key: 'spendingExtras.food_source', map: 'foodsrc' },
  chartOnlineGrocery: { key: 'spendingExtras.online_grocery' },
  chartPDS: { key: 'schemes.pds' },
  chartLPG: { key: 'schemes.lpg_subsidy' },
  chartElectricity: { key: 'schemes.free_electricity' },
  chartAyushman: { key: 'schemes.ayushman' },
  chartSchool: { key: 'schemes.school' },
  chartSchoolSplit: { key: 'schemes.school_govt_private' },
};

const COLS = {
  sector: 'Sector', code: 'Category', w: 'People', gender: 'Gender', age_group: 'Age group',
  state_name: 'State / UT', state_code: 'Code', estimated_population: 'Population (est.)',
  estimated_count: 'People (est.)', estimated_households: 'Households (est.)',
  education_level: 'Education level', meals: 'Meals per day', used: 'Internet use', got: 'Received',
  bought: 'Bought online', size: 'Household size', govt: 'Govt school (est.)', private: 'Private school (est.)',
  item_code: 'Item code', total_value_cr: 'Value (Cr Rs)', total_quantity: 'Quantity (est.)',
  households_consuming: 'Households consuming (est.)', attended: 'Attended school',
  household_type: 'Main income source', religion: 'Religion', dwelling_type: 'House type',
  cooking_energy: 'Cooking fuel', land_ownership: 'Land', ration_card: 'Ration card',
};
const MONEY = new Set(['total_value_cr', 'ooh_consumption_cr', 'avg_consumption_per_item']);
const COUNT = new Set(['w', 'estimated_population', 'estimated_count', 'estimated_households', 'govt', 'private', 'total_quantity', 'households_consuming']);

let filters = {};   // active sector/state filters on this page
let csvData = null; // last rendered table, for CSV export

function getRows(spec) {
  const parts = spec.key.split('.');
  return D(parts[0], parts[1]);
}

function buildFilters() {
  const el = document.getElementById('dFilters');
  el.innerHTML = '';
  el.hidden = false;
  const rows = getRows(TBL[chartId]) || [];
  const first = rows[0] || {};
  let any = false;
  if ('sector' in first) { addFilter('sector', 'Sector', [...new Set(rows.map(r => r.sector))]); any = true; }
  if ('state_name' in first) { addFilter('state', 'State / UT', [...new Set(rows.map(r => r.state_name))].sort()); any = true; }
  if (!any) el.hidden = true;
}

function addFilter(k, label, values) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const lab = document.createElement('label');
  lab.htmlFor = 'f-' + k;
  lab.textContent = label;
  const sel = document.createElement('select');
  sel.id = 'f-' + k;
  const opt = document.createElement('option');
  opt.value = 'all'; opt.textContent = 'All';
  sel.appendChild(opt);
  values.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
  sel.value = filters[k] || 'all';
  sel.addEventListener('change', () => {
    filters[k] = sel.value === 'all' ? undefined : sel.value;
    rerender();
  });
  wrap.appendChild(lab); wrap.appendChild(sel);
  document.getElementById('dFilters').appendChild(wrap);
}

function renderTable() {
  const spec = TBL[chartId];
  const rows = getRows(spec) || [];
  let headers, data;
  if (spec.group) {
    const m = {};
    rows.forEach(r => { const k = r[spec.group.by] || 'Not reported'; m[k] = (m[k] || 0) + (r[spec.group.sum] || 0); });
    const entries = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, spec.group.top || 8);
    const map = C[spec.group.map] || {};
    headers = [spec.group.by, spec.group.sum];
    data = entries.map(([k, v]) => [map[k] || (spec.group.map ? 'Code ' + k : k), v]);
  } else {
    headers = Object.keys(rows[0] || {});
    data = rows.map(r => headers.map(h => r[h]));
  }
  const tbl = document.getElementById('dTable');
  tbl.innerHTML = '';
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  headers.forEach(h => { const th = document.createElement('th'); th.textContent = COLS[h] || (h[0].toUpperCase() + h.slice(1).replace(/_/g, ' ')); tr.appendChild(th); });
  thead.appendChild(tr);
  const tbody = document.createElement('tbody');
  data.forEach(row => {
    const trr = document.createElement('tr');
    row.forEach((v, i) => {
      const td = document.createElement('td');
      const h = headers[i];
      if (typeof v === 'number') {
        td.classList.add('num');
        td.textContent = MONEY.has(h) ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : COUNT.has(h) ? fmt(v) : String(v);
      } else td.textContent = v == null ? '' : String(v);
      trr.appendChild(td);
    });
    tbody.appendChild(trr);
  });
  tbl.appendChild(thead); tbl.appendChild(tbody);
  document.getElementById('dCount').textContent = data.length + ' rows';
  csvData = { headers, data };
}

function updateFilterNote() {
  const parts = [];
  if (filters.sector) parts.push('Sector: ' + filters.sector);
  if (filters.state) parts.push('State: ' + filters.state);
  document.getElementById('dFilterNote').textContent = parts.length ? 'Showing: ' + parts.join(' · ') : '';
}

function rerender() {
  setFocus(filters);
  RENDERERS[SECTION[chartId]]();
  renderTable();
  updateFilterNote();
}

function downloadCsv() {
  if (!csvData) return;
  const { headers, data } = csvData;
  const lines = [headers, ...data.map(row => row.map(v => typeof v === 'number' ? v : '"' + String(v).replace(/"/g, '""') + '"'))];
  const csv = '\uFEFF' + lines.map(r => r.join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = chartId + '.csv';
  a.click();
}

(async function main() {
  const info = INFO[key];
  if (!info) {
    document.getElementById('dTitle').textContent = 'Chart not found';
    document.getElementById('dWhat').textContent = 'Open a chart from the dashboard and use "View data".';
    document.getElementById('dChart').remove();
    return;
  }
  setFocusChart(chartId);
  setFocus(filters);
  document.getElementById('dTitle').textContent = info.title;
  document.getElementById('dWhat').textContent = info.what + ' ' + info.look;
  document.getElementById('dSource').textContent = 'From: ' + info.source;
  document.getElementById('dCrumb').textContent = ' / ' + info.title;
  document.getElementById('dChart').id = chartId;
  const prov = PROV[key];
  if (prov) {
    document.getElementById('dProv').innerHTML = `
      <div class="prov-row"><span class="prov-k">File</span><code>${prov.file}</code></div>
      <div class="prov-row"><span class="prov-k">Columns</span>${prov.cols.map(c => `<code>${c}</code>`).join(' ')}</div>
      <div class="prov-row"><span class="prov-k">Aggregate</span><code>data/${prov.agg}</code></div>
      <h4>SQL query</h4>
      <pre class="sql-block">${(QUERIES[key] || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>
      <p class="prov-note">Weights use the survey <code>Multiplier</code>, normalized to national estimates for display. Open the <a href="/metadata">data catalog</a> for the full schema and value counts.</p>`;
    document.getElementById('dProvCard').hidden = false;
  }
  document.getElementById('dCsv').addEventListener('click', downloadCsv);
  try {
    await loadAll();
    buildFilters();
    rerender();
  } catch (e) {
    console.error(e);
    document.getElementById('dWhat').textContent = 'Could not load survey data. Run aggregate_for_web.py first.';
  }
})();
