/* Section renderers: build all charts for one dashboard tab.
 * Each function reads DATA (via D for filterable rows) and calls
 * makeChart. RENDERERS maps section names to these functions. */

import { DATA, D, focusFilters } from './data.js';
import { THEME, baseScales, makeChart } from './charts-core.js';
import { C } from './content.js';
import { fmt, sumBy, inrTicks, moneyLabel, rupLabel, clip } from './util.js';

/* ---------- Overview ---------- */
function updateOverview() {
  const f = focusFilters() || {};
  const sector = f.sector || document.getElementById('sectorFilter')?.value || 'all';
  const state = f.state || document.getElementById('stateFilter')?.value || 'all';
  const filtered = DATA.stateConsumption.filter(d => (sector === 'all' || d.sector === sector) && (state === 'all' || d.state_name === state));
  const byState = {};
  filtered.forEach(d => { (byState[d.state_name] = byState[d.state_name] || { Rural: 0, Urban: 0 })[d.sector] = d.total_consumption_cr; });
  const names = Object.keys(byState).sort((a, b) => (byState[b].Rural + byState[b].Urban) - (byState[a].Rural + byState[a].Urban)).slice(0, 20);
  makeChart('chartStateConsumption', {
    type: 'bar',
    data: { labels: names, datasets: [
      { label: 'Rural', data: names.map(s => byState[s].Rural), backgroundColor: '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 26 },
      { label: 'Urban', data: names.map(s => byState[s].Urban), backgroundColor: '#0e9f8a', borderRadius: 4, borderSkipped: false, maxBarThickness: 26 }] },
    options: { scales: { ...baseScales, x: { ...baseScales.x, ticks: { ...baseScales.x.ticks, maxRotation: 45, font: { size: 11 } } }, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: inrTicks } } }, plugins: { tooltip: { callbacks: { label: moneyLabel } } } },
  });
  const rural = sumBy(filtered.filter(d => d.sector === 'Rural'), 'total_consumption_cr');
  const urban = sumBy(filtered.filter(d => d.sector === 'Urban'), 'total_consumption_cr');
  makeChart('chartSectorShare', { type: 'doughnut', data: { labels: ['Rural', 'Urban'], datasets: [{ data: [rural, urban], backgroundColor: ['#1d4ed8', '#0e9f8a'], borderWidth: 0, hoverOffset: 6 }] }, options: { cutout: '68%', plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: moneyLabel } } } } });
  const ooh = sumBy(filtered, 'ooh_consumption_cr');
  const home = sumBy(filtered, 'total_consumption_cr') - ooh;
  makeChart('chartOOH', { type: 'doughnut', data: { labels: ['At home', 'Out of home'], datasets: [{ data: [home, ooh], backgroundColor: ['#b45309', '#be123c'], borderWidth: 0, hoverOffset: 6 }] }, options: { cutout: '68%', plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: moneyLabel } } } } });
}

/* ---------- People ---------- */
function updatePeople() {
  const demo = D('demographics');
  const ageGroups = ['0-4', '5-14', '15-24', '25-34', '35-44', '45-54', '55-64', '65+'];
  const byAge = {};
  ageGroups.forEach(a => byAge[a] = { Male: 0, Female: 0 });
  demo.forEach(d => { if (byAge[d.age_group]) byAge[d.age_group][d.gender] += d.estimated_population; });

  makeChart('chartAgeGroup', { type: 'bar', data: { labels: ageGroups, datasets: [
    { label: 'Male', data: ageGroups.map(a => byAge[a].Male), backgroundColor: '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 30 },
    { label: 'Female', data: ageGroups.map(a => byAge[a].Female), backgroundColor: '#be185d', borderRadius: 4, borderSkipped: false, maxBarThickness: 30 }] },
    options: { scales: { ...baseScales, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: v => fmt(v) } } } } });

  const male = sumBy(demo.filter(d => d.gender === 'Male'), 'estimated_population');
  const female = sumBy(demo.filter(d => d.gender === 'Female'), 'estimated_population');
  makeChart('chartGender', { type: 'doughnut', data: { labels: ['Male', 'Female'], datasets: [{ data: [male, female], backgroundColor: ['#1d4ed8', '#be185d'], borderWidth: 0, hoverOffset: 6 }] }, options: { cutout: '68%', plugins: { legend: { position: 'bottom' } } } });

  makeChart('chartPyramid', { type: 'bar', data: { labels: ageGroups, datasets: [
    { label: 'Male', data: ageGroups.map(a => byAge[a].Male), backgroundColor: '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 28 },
    { label: 'Female', data: ageGroups.map(a => -byAge[a].Female), backgroundColor: '#be185d', borderRadius: 4, borderSkipped: false, maxBarThickness: 28 }] },
    options: { indexAxis: 'y', scales: { ...baseScales, x: { ...baseScales.x, ticks: { ...baseScales.x.ticks, callback: v => fmt(Math.abs(v)) } } }, plugins: { legend: { position: 'bottom' } } } });

  const edu = D('education');
  const levels = [...new Set(edu.map(d => d.education_level))].slice(0, 8);
  const topStates = [...new Set(edu.map(d => d.state_name))].slice(0, 12);
  makeChart('chartEducation', { type: 'bar', data: { labels: topStates, datasets: levels.map((lev, i) => ({
    label: lev, data: topStates.map(s => sumBy(edu.filter(d => d.state_name === s && d.education_level === lev), 'estimated_count')),
    backgroundColor: THEME.palette[i % THEME.palette.length], borderRadius: 2, maxBarThickness: 18 })) },
    options: { scales: { ...baseScales, x: { ...baseScales.x, stacked: true, ticks: { ...baseScales.x.ticks, maxRotation: 45, font: { size: 10 } } }, y: { ...baseScales.y, stacked: true, ticks: { ...baseScales.y.ticks, callback: v => fmt(v) } } },
      plugins: { legend: { labels: { color: THEME.legend, font: { size: 10 } } } } } });

  const mar = D('people', 'marital');
  const marCodes = ['1', '2', '3', '4'];
  makeChart('chartMarital', { type: 'bar', data: { labels: ['Rural', 'Urban'], datasets: marCodes.map((c, i) => ({
    label: C.marital[c], data: ['Rural', 'Urban'].map(s => sumBy(mar.filter(d => d.sector === s && d.code === c), 'w')),
    backgroundColor: THEME.palette[i * 2], borderRadius: 4, borderSkipped: false, maxBarThickness: 26 })) },
    options: { scales: { ...baseScales, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: v => fmt(v) } } } } });

  const net = D('people', 'internet');
  const netAges = ['Under 15', '15-24', '25-44', '45+'];
  makeChart('chartInternet', { type: 'bar', data: { labels: netAges, datasets: [
    { label: 'Used internet', data: netAges.map(a => sumBy(net.filter(d => d.age_group === a && d.used === 'Yes'), 'w')), backgroundColor: '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 34 },
    { label: 'No internet', data: netAges.map(a => sumBy(net.filter(d => d.age_group === a && d.used === 'No'), 'w')), backgroundColor: '#f87171', borderRadius: 4, borderSkipped: false, maxBarThickness: 34 }] },
    options: { scales: { ...baseScales, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: v => fmt(v) } } } } });

  const rel = D('people', 'relation');
  const relKeys = Object.keys(C.relation);
  makeChart('chartRelation', { type: 'bar', data: { labels: ['Rural', 'Urban'], datasets: relKeys.map((c, i) => ({
    label: C.relation[c], data: ['Rural', 'Urban'].map(s => sumBy(rel.filter(d => d.sector === s && d.code === c), 'w')),
    backgroundColor: THEME.palette[i % THEME.palette.length], borderRadius: 3, borderSkipped: false, maxBarThickness: 20 })) },
    options: { scales: { ...baseScales, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: v => fmt(v) } } },
      plugins: { legend: { labels: { color: THEME.legend, font: { size: 10 } } } } } });
}

/* ---------- Households ---------- */
function updateHouseholds() {
  const hh = D('householdChars');
  const by = (key, map, top = 8) => {
    const m = {};
    hh.forEach(d => { const k = d[key] || 'Not reported'; m[k] = (m[k] || 0) + d.estimated_households; });
    const entries = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, top);
    return entries.map(([k, v]) => [map[k] || (k === 'Not reported' ? k : 'Code ' + k), v]);
  };
  const pie = (id, entries) => makeChart(id, { type: 'doughnut', data: { labels: entries.map(e => e[0]), datasets: [{ data: entries.map(e => e[1]), backgroundColor: THEME.palette, borderWidth: 0, hoverOffset: 6 }] }, options: { cutout: '62%', plugins: { legend: { position: 'bottom', labels: { color: THEME.legend, font: { size: 11 } } } } } });

  const sizes = D('householdExtras', 'hh_size');
  const sizeLabels = ['1', '2', '3', '4', '5', '6', '7', '8+'];
  makeChart('chartHHSize', { type: 'bar', data: { labels: sizeLabels, datasets: ['Rural', 'Urban'].map((s, i) => ({
    label: s, data: sizeLabels.map(sz => sumBy(sizes.filter(d => d.sector === s && d.size === sz), 'w')),
    backgroundColor: i ? '#0e9f8a' : '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 26 })) },
    options: { scales: { ...baseScales, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: v => fmt(v) } } } } });

  const hhType = by('household_type', C.hhtype, 7);
  makeChart('chartHHType', { type: 'bar', data: { labels: hhType.map(e => e[0]), datasets: [{ label: 'Households', data: hhType.map(e => e[1]), backgroundColor: '#4f46e5', borderRadius: 4, borderSkipped: false, maxBarThickness: 28 }] },
    options: { scales: { ...baseScales, x: { ...baseScales.x, ticks: { ...baseScales.x.ticks, maxRotation: 30, font: { size: 11 } } }, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: v => fmt(v) } } }, plugins: { legend: { display: false } } } });

  const sg = D('householdExtras', 'social_group');
  const sgKeys = [...new Set(sg.map(d => d.code))];
  makeChart('chartSocialGroup', { type: 'bar', data: { labels: sgKeys.map(c => C.social[c]), datasets: ['Rural', 'Urban'].map((s, i) => ({
    label: s, data: sgKeys.map(c => sumBy(sg.filter(d => d.sector === s && d.code === c), 'w')),
    backgroundColor: i ? '#0e9f8a' : '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 26 })) },
    options: { scales: { ...baseScales, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: v => fmt(v) } } } } });

  const religion = by('religion', C.religion, 8);
  makeChart('chartReligion', { type: 'bar', data: { labels: religion.map(e => e[0]), datasets: [{ label: 'Households', data: religion.map(e => e[1]), backgroundColor: '#6d28d9', borderRadius: 4, borderSkipped: false, maxBarThickness: 30 }] },
    options: { scales: { ...baseScales, x: { ...baseScales.x, ticks: { ...baseScales.x.ticks, maxRotation: 30, font: { size: 11 } } }, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: v => fmt(v) } } }, plugins: { legend: { display: false } } } });

  pie('chartDwelling', by('dwelling_type', C.dwelling));
  pie('chartEnergy', by('cooking_energy', C.cooking, 8));
  pie('chartLand', by('land_ownership', C.land));
  pie('chartRation', by('ration_card', C.ration, 6));

  const light = D('householdExtras', 'lighting');
  const lightCodes = [...new Set(light.map(d => d.code))];
  const lightEntries = lightCodes.map(c => [C.lighting[c] || c, sumBy(light.filter(d => d.code === c), 'w')]).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]);
  makeChart('chartLighting', { type: 'doughnut', data: { labels: lightEntries.map(e => e[0]), datasets: [{ data: lightEntries.map(e => e[1]), backgroundColor: THEME.palette, borderWidth: 0, hoverOffset: 6 }] }, options: { cutout: '62%', plugins: { legend: { position: 'bottom', labels: { color: THEME.legend, font: { size: 11 } } } } } });

  const ujj = D('householdExtras', 'ujjwala');
  const ujjYes = sumBy(ujj.filter(d => d.got === 'Yes'), 'w');
  const ujjNo = sumBy(ujj.filter(d => d.got === 'No'), 'w');
  makeChart('chartUjjwala', { type: 'doughnut', data: { labels: ['Got free connection', 'Did not get'], datasets: [{ data: [ujjYes, ujjNo], backgroundColor: ['#0e9f8a', '#c8cfd9'], borderWidth: 0, hoverOffset: 6 }] }, options: { cutout: '62%', plugins: { legend: { position: 'bottom' } } } });
}

/* ---------- Spending ---------- */
function updateSpending() {
  const items = D('foodRankings').slice(0, 20);
  makeChart('chartFoodItems', { type: 'bar', data: { labels: items.map(d => d.item_name || 'Item ' + d.item_code), datasets: [{ label: 'Monthly value (₹ Cr)', data: items.map(d => d.total_value_cr), backgroundColor: '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 20 }] },
    options: { indexAxis: 'y', scales: { ...baseScales, x: { ...baseScales.x, ticks: { ...baseScales.x.ticks, callback: inrTicks } }, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, autoSkip: false, font: { size: 11 }, callback: function(v) { return clip(this.getLabelForValue(v), 26); } } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: moneyLabel } } } } });

  const sc = D('stateConsumption');
  const labels = [...new Set(sc.map(d => d.state_name))].sort().slice(0, 15);
  makeChart('chartPerHH', { type: 'bar', data: { labels, datasets: [
    { label: 'Rural', data: labels.map(s => sc.find(d => d.state_name === s && d.sector === 'Rural')?.avg_consumption_per_item || 0), backgroundColor: '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 20 },
    { label: 'Urban', data: labels.map(s => sc.find(d => d.state_name === s && d.sector === 'Urban')?.avg_consumption_per_item || 0), backgroundColor: '#0e9f8a', borderRadius: 4, borderSkipped: false, maxBarThickness: 20 }] },
    options: { scales: { ...baseScales, x: { ...baseScales.x, ticks: { ...baseScales.x.ticks, maxRotation: 45, font: { size: 11 } } } }, plugins: { tooltip: { callbacks: { label: rupLabel } } } } });

  const fs = D('spendingExtras', 'food_source');
  const fsKeys = Object.keys(C.foodsrc);
  const fsRural = fsKeys.map(c => ({ label: C.foodsrc[c], v: sumBy(fs.filter(d => d.sector === 'Rural' && d.code === c), 'w') }));
  const fsUrban = fsKeys.map(c => ({ label: C.foodsrc[c], v: sumBy(fs.filter(d => d.sector === 'Urban' && d.code === c), 'w') }));
  const pct = arr => { const t = sumBy(arr, 'v') || 1; return arr.map(x => +(100 * x.v / t).toFixed(1)); };
  makeChart('chartFoodSource', { type: 'bar', data: { labels: fsKeys.map(c => C.foodsrc[c]), datasets: [
    { label: 'Rural %', data: pct(fsRural), backgroundColor: '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 26 },
    { label: 'Urban %', data: pct(fsUrban), backgroundColor: '#0e9f8a', borderRadius: 4, borderSkipped: false, maxBarThickness: 26 }] },
    options: { scales: { ...baseScales, y: { ...baseScales.y, suggestedMax: 100, ticks: { ...baseScales.y.ticks, callback: v => v + '%' } } } } });
}

/* ---------- Schemes ---------- */
function updateSchemes() {
  const yn = (id, rows, yesLabel, noLabel) => {
    const y = sumBy(rows.filter(d => d.got === 'Yes'), 'w');
    const n = sumBy(rows.filter(d => d.got === 'No'), 'w');
    makeChart(id, { type: 'doughnut', data: { labels: [yesLabel, noLabel], datasets: [{ data: [y, n], backgroundColor: ['#0e9f8a', '#c8cfd9'], borderWidth: 0, hoverOffset: 6 }] }, options: { cutout: '62%', plugins: { legend: { position: 'bottom' } } } });
  };
  yn('chartPDS', D('schemes', 'pds'), 'Got ration', 'No ration');
  yn('chartLPG', D('schemes', 'lpg_subsidy'), 'Got subsidy', 'No subsidy');
  yn('chartElectricity', D('schemes', 'free_electricity'), 'Free electricity', 'No free electricity');
  yn('chartAyushman', D('schemes', 'ayushman'), 'Has card', 'No card');
  yn('chartSchool', D('schemes', 'school'), 'Child in school', 'No child in school');

  const gv = D('schemes', 'school_govt_private');
  const gLabels = ['Rural', 'Urban'];
  makeChart('chartSchoolSplit', { type: 'bar', data: { labels: gLabels, datasets: [
    { label: 'Government school', data: gLabels.map(x => gv.find(d => d.sector === x)?.govt || 0), backgroundColor: '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 40 },
    { label: 'Private school', data: gLabels.map(x => gv.find(d => d.sector === x)?.private || 0), backgroundColor: '#0e9f8a', borderRadius: 4, borderSkipped: false, maxBarThickness: 40 }] },
    options: { scales: { ...baseScales, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: v => fmt(v) } } } } });
}

export const RENDERERS = {
  overview: updateOverview, people: updatePeople, households: updateHouseholds,
  spending: updateSpending, schemes: updateSchemes,
};
