/* Section renderers: build all charts for one dashboard tab.
 * Each function reads DATA (via D for filterable rows) and calls
 * makeChart. RENDERERS maps section names to these functions. */

import { DATA, D, focusFilters } from './data.js';
import { THEME, baseScales, makeChart } from './charts-core.js';
import { C } from './content.js';
import { fmt, sumBy, inrTicks, moneyLabel, rupLabel, clip, getVal, crTicks } from './util.js';

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
    { label: 'No internet', data: netAges.map(a => sumBy(net.filter(d => d.age_group === a && d.used === 'No'), 'w')), backgroundColor: '#be123c', borderRadius: 4, borderSkipped: false, maxBarThickness: 34 }] },
    options: { scales: { ...baseScales, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: v => fmt(v) } } } } });

  const rel = D('people', 'relation');
  const relKeys = Object.keys(C.relation);
  // Horizontal bar of who lives in an Indian household, sorted largest first.
  // A single national view reads better than 9 categories x 2 sectors.
  const relTot = relKeys.map(c => ({ label: C.relation[c], v: sumBy(rel.filter(d => d.code === c), 'w') }))
    .sort((a, b) => b.v - a.v);
  const relSum = sumBy(relTot, 'v') || 1;
  makeChart('chartRelation', { type: 'bar', data: { labels: relTot.map(e => e.label), datasets: [{
    label: 'People', data: relTot.map(e => e.v),
    backgroundColor: '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 22 }] },
    options: { indexAxis: 'y', scales: { ...baseScales, x: { ...baseScales.x, ticks: { ...baseScales.x.ticks, callback: v => fmt(v) } }, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, autoSkip: false, font: { size: 11 } } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fmt(getVal(c)) + ' (' + (100 * getVal(c) / relSum).toFixed(1) + '%)' } } } } });

  const lit = D('people', 'literacy');
  const litRate = (s, g) => {
    const rows = lit.filter(d => d.sector === s && d.gender === g);
    const t = sumBy(rows, 'w') || 1;
    return +(100 * sumBy(rows.filter(d => d.lit === 'Literate'), 'w') / t).toFixed(1);
  };
  makeChart('chartLiteracy', { type: 'bar', data: { labels: ['Rural', 'Urban'], datasets: ['Male', 'Female'].map((g, i) => ({
    label: g, data: ['Rural', 'Urban'].map(s => litRate(s, g)),
    backgroundColor: i ? '#be185d' : '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 40 })) },
    options: { scales: { ...baseScales, y: { ...baseScales.y, suggestedMax: 100, ticks: { ...baseScales.y.ticks, callback: v => v + '%' } } } } });
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

  const emp = D('householdExtras', 'employment');
  const empKeys = [...new Set(emp.map(d => d.status))];
  makeChart('chartEmployment', { type: 'bar', data: { labels: ['Rural', 'Urban'], datasets: empKeys.map((st, i) => ({
    label: st, data: ['Rural', 'Urban'].map(s => sumBy(emp.filter(d => d.sector === s && d.status === st), 'w')),
    backgroundColor: i ? '#c8cfd9' : '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 40 })) },
    options: { scales: { ...baseScales, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: v => fmt(v) } } } } });
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

  const byCat = (key, map, fmtFn) => {
    const rows = D('spendingExtras', key);
    const codes = Object.keys(map);
    const datasets = ['Rural', 'Urban'].map((s, i) => ({
      label: s,
      data: codes.map(c => sumBy(rows.filter(d => d.sector === s && d.code === c), 'w')),
      backgroundColor: i ? '#0e9f8a' : '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 26 }));
    return { labels: codes.map(c => map[c]), datasets, fmtFn };
  };
  const catChart = (id, { labels, datasets }) => makeChart(id, { type: 'bar', data: { labels, datasets },
    options: { scales: { ...baseScales, x: { ...baseScales.x, ticks: { ...baseScales.x.ticks, maxRotation: 40, font: { size: 11 } } }, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: crTicks } } }, plugins: { tooltip: { callbacks: { label: moneyLabel } } } } });

  catChart('chartClothing', byCat('clothing', C.clothing));
  catChart('chartServices', byCat('services', C.services));
  catChart('chartFuel', byCat('fuel', C.fuel));
  catChart('chartTobacco', byCat('tobacco', C.tobacco));

  const dur = D('spendingExtras', 'durables');
  const durLabels = Object.keys(C.durables).map(c => C.durables[c]);
  makeChart('chartDurables', { type: 'bar', data: { labels: durLabels, datasets: [{
    label: 'Households that bought (last year)',
    data: Object.keys(C.durables).map(c => sumBy(dur.filter(d => d.code === c), 'w')),
    backgroundColor: '#4f46e5', borderRadius: 4, borderSkipped: false, maxBarThickness: 26 }] },
    options: { indexAxis: 'y', scales: { ...baseScales, x: { ...baseScales.x, ticks: { ...baseScales.x.ticks, callback: v => fmt(v) } }, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, autoSkip: false, font: { size: 11 } } } }, plugins: { legend: { display: false } } } });

  const oc = D('spendingExtras', 'online_channels');
  const ocLabels = ['Medicine', 'Services', 'Education', 'Fuel & light', 'Toilet articles'];
  makeChart('chartOnlineChannels', { type: 'bar', data: { labels: ocLabels, datasets: ['Rural', 'Urban'].map((s, i) => ({
    label: s, data: ocLabels.map(c => sumBy(oc.filter(d => d.sector === s && d.channel === c), 'w')),
    backgroundColor: i ? '#0e9f8a' : '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 26 })) },
    options: { scales: { ...baseScales, x: { ...baseScales.x, ticks: { ...baseScales.x.ticks, maxRotation: 40, font: { size: 11 } } }, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: v => fmt(v) } } } } });

  updateIncome(); // spending-power cluster (curves, deciles, states, budget)
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

  const sb = D('schemes', 'school_benefits');
  const sbLabels = ['Free textbooks', 'Free stationery', 'Free school bag', 'Fee waiver'];
  const sbKey = { 'Free textbooks': 'textbooks', 'Free stationery': 'stationery', 'Free school bag': 'school_bag', 'Fee waiver': 'fee_waiver' };
  makeChart('chartSchoolBenefits', { type: 'bar', data: { labels: ['Rural', 'Urban'], datasets: sbLabels.map((l, i) => ({
    label: l, data: ['Rural', 'Urban'].map(s => sb.find(d => d.sector === s)?.[sbKey[l]] || 0),
    backgroundColor: THEME.palette[i % THEME.palette.length], borderRadius: 4, borderSkipped: false, maxBarThickness: 26 })) },
    options: { scales: { ...baseScales, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: v => fmt(v) } } } } });

  const sm = D('schemes', 'school_meals');
  const smYes = sumBy(sm.filter(d => d.got === 'Yes'), 'w');
  const smNo = sumBy(sm.filter(d => d.got === 'No'), 'w');
  makeChart('chartSchoolMeals', { type: 'doughnut', data: { labels: ['Get school meal', 'No school meal'], datasets: [{ data: [smYes, smNo], backgroundColor: ['#0e9f8a', '#c8cfd9'], borderWidth: 0, hoverOffset: 6 }] }, options: { cutout: '62%', plugins: { legend: { position: 'bottom' } } } });

  const ad = D('schemes', 'ayushman_detail');
  const adLabels = ['Has Ayushman card', 'Hospital case last year', 'Got medical benefit'];
  const adKey = { 'Has Ayushman card': 'card', 'Hospital case last year': 'hospitalised', 'Got medical benefit': 'got_benefit' };
  makeChart('chartAyushmanDetail', { type: 'bar', data: { labels: ['Rural', 'Urban'], datasets: adLabels.map((l, i) => ({
    label: l, data: ['Rural', 'Urban'].map(s => ad.find(d => d.sector === s)?.[adKey[l]] || 0),
    backgroundColor: THEME.palette[i % THEME.palette.length], borderRadius: 4, borderSkipped: false, maxBarThickness: 26 })) },
    options: { scales: { ...baseScales, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: v => fmt(v) } } } } });
}

/* ---------- Income & spending power ---------- */
function drawMpceCurve() {
  const curves = D('income', 'curves');
  const f = (document.getElementById('mpceFilter') || {}).value || 'sector';
  const groups = curves[f] || {};
  const labels = Array.from({ length: 99 }, (_, i) => i + 1);
  const palette = ['#1d4ed8', '#0e9f8a', '#b45309', '#be123c', '#4f46e5', '#0891b2', '#65a30d', '#7c3aed', '#dc2626', '#2563eb', '#d97706', '#db2777'];
  const entries = Object.entries(groups).sort((a, b) => b[1][49] - a[1][49]);
  makeChart('chartMpceCurve', { type: 'line', data: { labels, datasets: entries.map(([g, pts], i) => ({
    label: g, data: pts, borderColor: palette[i % palette.length], backgroundColor: palette[i % palette.length],
    borderWidth: 2, pointRadius: 0, pointHitRadius: 12, tension: 0.25, fill: false })) },
    options: { scales: { ...baseScales, x: { ...baseScales.x, title: { display: true, text: 'Percentile of households (poorest → richest)', font: { size: 11 } }, ticks: { ...baseScales.x.ticks, maxRotation: 0, autoSkip: true, maxTicksLimit: 10, callback: v => v + '%' } }, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: v => '₹' + Math.round(v).toLocaleString('en-IN') } } }, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ₹' + Math.round(getVal(c)).toLocaleString('en-IN') + ' / month' } }, cutline: { enabled: true, fmt: v => ' ₹' + Math.round(v).toLocaleString('en-IN') } } } });
}

function updateIncome() {  // spending-power cluster inside the Spending section
  drawMpceCurve();
  document.getElementById('mpceFilter')?.addEventListener('change', drawMpceCurve);

  const inc = D('income');
  const d = inc.dist;
  const distLabels = ['Poorest 10%', 'Next 10%', '20%', '30%', '40%', '50%', '60%', '70%', 'Richest 10%', 'National avg'];
  const distVals = [d.p10, d.p20, d.p30, d.p40, d.p50, d.p60, d.p70, d.p80, d.p90, d.mean];
  makeChart('chartMpceDist', { type: 'bar', data: { labels: distLabels, datasets: [{
    label: 'Monthly spending per person (₹)', data: distVals,
    backgroundColor: distVals.map((v, i) => i === 9 ? '#b45309' : (i >= 6 ? '#be123c' : '#1d4ed8')),
    borderRadius: 4, borderSkipped: false, maxBarThickness: 30 }] },
    options: { scales: { ...baseScales, x: { ...baseScales.x, ticks: { ...baseScales.x.ticks, maxRotation: 40, font: { size: 11 } } }, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: v => '₹' + Math.round(v).toLocaleString('en-IN') } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ₹' + Math.round(getVal(c)).toLocaleString('en-IN') + ' / month' } } } } });

  const st = D('income', 'state');
  const stStates = [...new Set(st.map(d => d.state_name))]
    .sort((a, b) => (st.find(d => d.state_name === b && d.sector === 'Rural')?.median_mpce || 0) - (st.find(d => d.state_name === a && d.sector === 'Rural')?.median_mpce || 0))
    .slice(0, 15);
  makeChart('chartMpceState', { type: 'bar', data: { labels: stStates, datasets: [
    { label: 'Rural', data: stStates.map(s => st.find(d => d.state_name === s && d.sector === 'Rural')?.median_mpce || 0), backgroundColor: '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 20 },
    { label: 'Urban', data: stStates.map(s => st.find(d => d.state_name === s && d.sector === 'Urban')?.median_mpce || 0), backgroundColor: '#0e9f8a', borderRadius: 4, borderSkipped: false, maxBarThickness: 20 }] },
    options: { scales: { ...baseScales, x: { ...baseScales.x, ticks: { ...baseScales.x.ticks, maxRotation: 45, font: { size: 11 } } }, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: v => '₹' + Math.round(v).toLocaleString('en-IN') } } } } });

  const b = inc.budget;
  makeChart('chartBudgetSplit', { type: 'doughnut', data: { labels: ['Food', 'Everything else'], datasets: [{ data: [b.food_share_pct, +(100 - b.food_share_pct).toFixed(1)], backgroundColor: ['#b45309', '#1d4ed8'], borderWidth: 0, hoverOffset: 6 }] }, options: { cutout: '62%', plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => ' ' + getVal(c) + '% of budget' } } } } });
}

export const RENDERERS = {
  overview: updateOverview, people: updatePeople, households: updateHouseholds,
  spending: updateSpending, schemes: updateSchemes, income: updateIncome,
};
