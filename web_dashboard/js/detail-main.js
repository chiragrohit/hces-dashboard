/* Detail page entry point (detail.html? id=<chart>): one chart rendered
 * from the same shared modules as the dashboard, plus its raw data table,
 * sector/state filters, CSV download and provenance. */

import { D, loadAll, setFocus, focusFilters } from './data.js';
import { RENDERERS } from './charts-sections.js';
import { setFocusChart, setShowValues } from './charts-core.js';
import { INFO, PROV, C } from './content.js';
import { fmt } from './util.js';
import { SQL, sqlHighlight } from './sql.js';

const params = new URLSearchParams(location.search);
const key = params.get('id');
const CANVAS = {
  stateConsumption: 'chartStateConsumption', sectorShare: 'chartSectorShare', ooh: 'chartOOH',
  ageGroup: 'chartAgeGroup', gender: 'chartGender', pyramid: 'chartPyramid',
  education: 'chartEducation', marital: 'chartMarital', internet: 'chartInternet', relation: 'chartRelation',
  hhsize: 'chartHHSize', hhtype: 'chartHHType', socialgroup: 'chartSocialGroup', religion: 'chartReligion',
  dwelling: 'chartDwelling', energy: 'chartEnergy', lighting: 'chartLighting', land: 'chartLand',
  ration: 'chartRation', ujjwala: 'chartUjjwala',
  foodItems: 'chartFoodItems', perHH: 'chartPerHH', foodSource: 'chartFoodSource',
  pds: 'chartPDS', lpg: 'chartLPG', electricity: 'chartElectricity', ayushman: 'chartAyushman', school: 'chartSchool', schoolSplit: 'chartSchoolSplit',
  literacy: 'chartLiteracy', employment: 'chartEmployment',
  clothing: 'chartClothing', services: 'chartServices', fuel: 'chartFuel', tobacco: 'chartTobacco',
  durables: 'chartDurables', onlineChannels: 'chartOnlineChannels',
  mpceDist: 'chartMpceDist', mpceState: 'chartMpceState', mpceCurve: 'chartMpceCurve', budgetSplit: 'chartBudgetSplit',
  schoolBenefits: 'chartSchoolBenefits', schoolMeals: 'chartSchoolMeals', ayushmanDetail: 'chartAyushmanDetail',
};
const chartId = CANVAS[key] || key;

const SECTION = {
  chartStateConsumption: 'overview', chartSectorShare: 'overview', chartOOH: 'overview',
  chartAgeGroup: 'people', chartGender: 'people', chartPyramid: 'people',
  chartEducation: 'people', chartMarital: 'people', chartInternet: 'people', chartRelation: 'people',
  chartHHSize: 'households', chartHHType: 'households', chartSocialGroup: 'households', chartReligion: 'households',
  chartDwelling: 'households', chartEnergy: 'households', chartLighting: 'households', chartLand: 'households',
  chartRation: 'households', chartUjjwala: 'households',
  chartFoodItems: 'spending', chartPerHH: 'spending', chartFoodSource: 'spending',
  chartPDS: 'schemes', chartLPG: 'schemes', chartElectricity: 'schemes', chartAyushman: 'schemes', chartSchool: 'schemes', chartSchoolSplit: 'schemes',
  chartLiteracy: 'people', chartEmployment: 'households',
  chartClothing: 'spending', chartServices: 'spending', chartFuel: 'spending', chartTobacco: 'spending',
  chartDurables: 'spending', chartOnlineChannels: 'spending',
  chartMpceDist: 'spending', chartMpceState: 'spending', chartMpceCurve: 'spending',
  chartBudgetSplit: 'spending',
  chartSchoolBenefits: 'schemes', chartSchoolMeals: 'schemes', chartAyushmanDetail: 'schemes',
};

const TBL = {
  chartStateConsumption: { key: 'stateConsumption' },
  chartSectorShare: { key: 'stateConsumption' },
  chartOOH: { key: 'stateConsumption' },
  chartAgeGroup: { key: 'demographics' },
  chartGender: { key: 'demographics' },
  chartPyramid: { key: 'demographics' },
  chartEducation: { key: 'education' },
  chartMarital: { key: 'people.marital', map: 'marital' },
  chartInternet: { key: 'people.internet' },
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
  chartPerHH: { key: 'stateConsumption' },
  chartFoodSource: { key: 'spendingExtras.food_source', map: 'foodsrc' },
  chartPDS: { key: 'schemes.pds' },
  chartLPG: { key: 'schemes.lpg_subsidy' },
  chartElectricity: { key: 'schemes.free_electricity' },
  chartAyushman: { key: 'schemes.ayushman' },
  chartSchool: { key: 'schemes.school' },
  chartSchoolSplit: { key: 'schemes.school_govt_private' },
  chartLiteracy: { key: 'people.literacy' },
  chartEmployment: { key: 'householdExtras.employment' },
  chartClothing: { key: 'spendingExtras.clothing', map: 'clothing', moneyCr: true },
  chartServices: { key: 'spendingExtras.services', map: 'services', moneyCr: true },
  chartFuel: { key: 'spendingExtras.fuel', map: 'fuel', moneyCr: true },
  chartTobacco: { key: 'spendingExtras.tobacco', map: 'tobacco', moneyCr: true },
  chartDurables: { key: 'spendingExtras.durables', map: 'durables' },
  chartOnlineChannels: { key: 'spendingExtras.online_channels' },
  chartMpceDist: { key: 'income.dist' },
  chartMpceState: { key: 'income.state' },
  chartMpceCurve: { key: 'income.curves', curve: true, curveMap: { sector: null, state: null, hhtype: 'hhtype', social: 'social', religion: 'religion', land: 'land', cooking: 'cooking', ration: 'ration', dwelling: 'dwelling', month: null } },
  chartBudgetSplit: { key: 'income.budget' },
  chartSchoolBenefits: { key: 'schemes.school_benefits' },
  chartSchoolMeals: { key: 'schemes.school_meals' },
  chartAyushmanDetail: { key: 'schemes.ayushman_detail' },
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
  status: 'Employment', lit: 'Literacy', median_mpce: 'Median ₹/person/month', mean_mpce: 'Average ₹/person/month',
  channel: 'Online category', textbooks: 'Free textbooks (est.)', stationery: 'Free stationery (est.)',
  school_bag: 'Free bags (est.)', fee_waiver: 'Fee waiver (est.)', card: 'Ayushman card (est.)',
  hospitalised: 'Hospital cases (est.)', got_benefit: 'Medical benefit (est.)',
  p10: '10th pct', p20: '20th pct', p30: '30th pct', p40: '40th pct', p50: 'Median',
  p60: '60th pct', p70: '70th pct', p80: '80th pct', p90: '90th pct', mean: 'Average',
  p25: '25th pct', p75: '75th pct', filter: 'Compare by', group: 'Group',
  food_cr: 'Food (Cr Rs)', total_cr: 'Total (Cr Rs)', food_share_pct: 'Food share (%)',
};
const MONEY = new Set(['total_value_cr', 'ooh_consumption_cr', 'avg_consumption_per_item', 'median_mpce', 'mean_mpce', 'food_cr', 'total_cr', 'p10', 'p25', 'p50', 'p75', 'p90']);
const COUNT = new Set(['w', 'estimated_population', 'estimated_count', 'estimated_households', 'govt', 'private', 'total_quantity', 'households_consuming', 'textbooks', 'stationery', 'school_bag', 'fee_waiver', 'card', 'hospitalised', 'got_benefit']);

let filters = {};   // active sector/state filters on this page
let csvData = null; // last rendered table, for CSV export

function getRows(spec) {
  if (spec.curve) return D('income', 'curves'); // {filter: {group: [p1..p99]}}
  const parts = spec.key.split('.');
  let rows = D(parts[0], parts[1]);
  if (rows && !Array.isArray(rows)) rows = [rows]; // single-object aggregates (income.dist / income.budget)
  return rows;
}

function buildFilters() {
  const el = document.getElementById('dFilters');
  el.innerHTML = '';
  el.hidden = false;
  const spec = TBL[chartId];
  if (spec && spec.curve) {
    // Compare-by dropdown mirroring the dashboard's Spending-power-by-group filter
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const lab = document.createElement('label');
    lab.htmlFor = 'f-curve'; lab.textContent = 'Compare by';
    const sel = document.createElement('select');
    sel.id = 'f-curve';
    [['sector', 'Rural / Urban'], ['state', 'State / UT'], ['hhtype', 'Household type'], ['social', 'Social group'], ['religion', 'Religion'], ['land', 'Land ownership'], ['cooking', 'Cooking fuel'], ['ration', 'Ration card'], ['dwelling', 'House type'], ['month', 'Survey month']]
      .forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); });
    sel.value = filters.curve || 'sector';
    window.CURVE_FILTER = filters.curve || 'sector';
    sel.addEventListener('change', () => { filters.curve = sel.value; window.CURVE_FILTER = sel.value; rerender(); });
    wrap.appendChild(lab); wrap.appendChild(sel);
    el.appendChild(wrap);
    return;
  }
  const rows = getRows(TBL[chartId]) || [];
  const first = rows[0];
  if (!first || typeof first !== 'object') { el.hidden = true; return; }
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
  const isCurve = !!(spec && spec.curve);
  const rows = getRows(spec) || [];
  let headers, data;
  if (spec.curve) {
    // Transpose: rows = percentile p1..p99, columns = each group of the selected filter.
    const curves = rows; // already the curves object from getRows
    const f = filters.curve || 'sector';
    const groups = curves[f] || {};
    const entries = Object.entries(groups).sort((a, b) => b[1][49] - a[1][49]);
    const labelOf = (g) => {
      const m = spec.curveMap[f];
      if (m) return (C[m] || {})[String(g)] || 'Code ' + g;
      return g; // sector / state / month carry readable labels already
    };
    headers = ['Percentile', ...entries.map(e => labelOf(e[0]))];
    data = Array.from({ length: 99 }, (_, p) => ['p' + (p + 1), ...entries.map(e => e[1][p])]);
  } else if (spec.group) {
    const m = {};
    rows.forEach(r => { const k = r[spec.group.by] || 'Not reported'; m[k] = (m[k] || 0) + (r[spec.group.sum] || 0); });
    const entries = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, spec.group.top || 8);
    const map = C[spec.group.map] || {};
    headers = [spec.group.by, spec.group.sum];
    data = entries.map(([k, v]) => [map[k] || (spec.group.map ? 'Code ' + k : k), v]);
  } else {
    headers = Object.keys(rows[0] || {});
    const map = spec.map ? C[spec.map] : null;
    data = rows.map(r => headers.map(h => {
      const v = r[h];
      return map && (h === 'code') ? (map[String(v)] || v) : v;
    }));
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
        if (isCurve) {
          td.textContent = '₹' + v.toLocaleString('en-IN');
        } else {
          td.textContent = MONEY.has(h) ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : COUNT.has(h) ? fmt(v) : String(v);
        }
        if (spec.moneyCr && h === 'w') td.textContent = '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 1 }) + ' Cr/month';
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

document.getElementById('valToggle').addEventListener('change', e => {
  setShowValues(e.target.checked);
  rerender();
});

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
      <p class="prov-note">${TBL[chartId] && TBL[chartId].curve
        ? 'Weights use the survey <code>Multiplier</code> to rank households. Percentile values are the raw rupee amounts, not scaled.'
        : 'Weights use the survey <code>Multiplier</code>, normalized to national estimates for display.'} Open the <a href="/metadata">data catalog</a> for the full schema and value counts.</p>`;
    document.getElementById('dProvCard').hidden = false;
    if (TBL[chartId] && TBL[chartId].curve) document.getElementById('dCalc').hidden = false;
  }
  document.getElementById('dCsv').addEventListener('click', downloadCsv);

  // SQL behind this chart — copy-paste runnable, syntax-highlighted
  const sqlText = SQL[key] || SQL[chartId];
  if (sqlText) {
    document.getElementById('dSql').innerHTML = sqlHighlight(sqlText);
    document.getElementById('dSqlCard').hidden = false;
    const copy = document.getElementById('dSqlCopy');
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(sqlText);
      } catch (e) {
        // fallback for non-secure contexts
        const ta = document.createElement('textarea');
        ta.value = sqlText; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove();
      }
      copy.textContent = 'Copied ✓';
      setTimeout(() => { copy.textContent = 'Copy SQL'; }, 1500);
    });
  }
  try {
    await loadAll();
    buildFilters();
    rerender();
  } catch (e) {
    console.error(e);
    document.getElementById('dWhat').textContent = 'Could not load survey data. Run aggregate_for_web.py first.';
  }
})();
