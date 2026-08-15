
const DATA = {};
const charts = {};
const THEME = {
  grid: '#eef1f5', tick: '#5f6b7d', legend: '#344054', ink: '#101828',
  palette: ['#1d4ed8', '#0e9f8a', '#b45309', '#be123c', '#6d28d9', '#0d9488', '#c2410c', '#4f46e5', '#a16207', '#be185d'],
};

Chart.defaults.font.family = 'Segoe UI, system-ui, sans-serif';
Chart.defaults.font.size = 12;
Chart.defaults.color = THEME.tick;

/* ---------- Simple-English explanations for every chart ---------- */
const INFO = {
  stateConsumption: { title: 'Food spending by state', what: 'This chart shows how much money households in each state spend on food in one month. Blue bars are villages. Green bars are cities. The numbers are survey estimates for all of India.', look: 'Compare the bar heights. Taller bars mean more food spending in that state.', source: 'Level 5 food consumption records, with survey weights.' },
  sectorShare: { title: 'Villages vs cities', what: 'This circle splits all food spending into two parts, villages and cities. The larger part shows where most food is bought.', look: 'Villages spend more because most Indians live there.', source: 'Level 5 food consumption records, with survey weights.' },
  ooh: { title: 'Home vs eating out', what: 'This circle splits food spending into meals at home and meals outside the home. Outside meals include food from shops and street stalls.', look: 'Almost all food is eaten at home.', source: 'Level 5 food consumption records.' },
  ageGroup: { title: 'Population by age group', what: 'These bars show how many people are in each age group. Blue is men and red is women. The bars show the age structure of India.', look: 'A wide middle means many working-age people.', source: 'Level 3 individual records, with survey weights.' },
  gender: { title: 'Men and women', what: 'This circle shows the number of men and women in India, from the survey.', look: 'India has more men than women.', source: 'Level 3 individual records, with survey weights.' },
  pyramid: { title: 'Population pyramid', what: 'This pyramid shows age on the vertical axis. Men go to one side and women go to the other side. It shows age and gender at the same time.', look: 'A wide base means a young population.', source: 'Level 3 individual records.' },
  composition: { title: 'Men and women by age', what: 'Each bar shows the share of men and women inside one age group. The two parts add to 100 percent.', look: 'The share of women can rise in older age groups.', source: 'Level 3 individual records.' },
  education: { title: 'Education levels by state', what: 'These stacked bars show the highest education level of people in each state. Each color is one education level.', look: 'More color above means a more educated state.', source: 'Level 3 individual records.' },
  marital: { title: 'Marital status (adults)', what: 'These bars show the marital status of adults aged 15 and above. Married people form the largest group.', look: 'Most adults are married. Widows are more common among women.', source: 'Level 3 individual records, adults only.' },
  internet: { title: 'Internet use by age', what: 'These bars show who used the internet in the last 30 days. Blue is users and red is non-users, for each age group.', look: 'Internet use is higher among young people and in cities.', source: 'Level 3 individual records.' },
  meals: { title: 'Meals per day', what: 'These bars show how many meals people usually take each day. Almost everyone in India takes three meals.', look: 'Look for very small bars. They show people who skip meals.', source: 'Level 3 individual records.' },
  relation: { title: 'Family members', what: 'This chart shows the place of each person in the household, such as head, spouse, or child. Most members are children of the head.', look: 'One head per household. Children form the largest group.', source: 'Level 3 individual records.' },
  hhsize: { title: 'House size', what: 'These bars show how many people live in each household. Most Indian households have four to five members.', look: 'The tallest bar is the most common family size.', source: 'Level 3 household records.' },
  hhtype: { title: 'Main income source', what: 'This chart groups households by their main source of income. The groups include self-employment, wage work, and casual labour.', look: 'See which income type is most common in each area.', source: 'Level 3 household records.' },
  socialgroup: { title: 'Social group', what: 'These bars show the social group of the household head. The groups are Scheduled Tribe, Scheduled Caste, Other Backward Class, and others.', look: 'OBC is the largest group in India.', source: 'Level 3 household records.' },
  religion: { title: 'Religion of household head', what: 'These bars show the religion of the head of each household.', look: 'Compare the size of each bar.', source: 'Level 3 household records.' },
  dwelling: { title: 'House type', what: 'This circle shows the type of house people live in. Pucca houses use strong materials. Katcha houses use mud and thatch.', look: 'The largest slice is the most common house type.', source: 'Level 3 household records.' },
  energy: { title: 'Cooking fuel', what: 'This circle shows the fuel that households use for cooking. LPG and firewood are the most common fuels in India.', look: 'LPG use is higher in cities. Firewood is higher in villages.', source: 'Level 3 household records.' },
  lighting: { title: 'Lighting source', what: 'This circle shows the main source of light in the home. Electricity serves almost every household in India.', look: 'Very few homes still use kerosene.', source: 'Level 3 household records.' },
  land: { title: 'Land ownership', what: 'This circle shows whether households own land. Land ownership matters for income from farming.', look: 'Most rural households own some land.', source: 'Level 3 household records.' },
  ration: { title: 'Ration cards', what: 'This circle shows the ration cards that households hold. A ration card gives subsidized food from fair price shops.', look: 'Most households hold some type of ration card.', source: 'Level 3 household records.' },
  ujjwala: { title: 'Free LPG connection (Ujjwala)', what: 'This circle shows households that got a free LPG connection under the Ujjwala scheme. The scheme helps poor households cook with gas.', look: 'Compare the yes and no parts.', source: 'Level 3 household records.' },
  foodItems: { title: 'Top 20 food items by spending', what: 'These bars rank the food items that Indian households buy the most. Each bar is the monthly spending on one item.', look: 'The longest bars are the biggest food items, such as milk, vegetables, and cereals.', source: 'Level 5 food consumption records.' },
  consumpDist: { title: 'Food spending by state', what: 'One bar for each state. Each bar is the total monthly food spending of that state.', look: 'Large states show the biggest totals.', source: 'Level 5 food consumption records.' },
  perHH: { title: 'Average spend per item', what: 'This chart shows the average money that a household spends on one food item in one month. Blue is village households and green is city households.', look: 'Compare the village and city averages.', source: 'Level 5 food consumption records.' },
  foodSource: { title: 'Where food comes from', what: 'These bars show where households get their food. Purchase is the main source. Home production and free collection are the other sources.', look: 'Purchase is the main source in both areas.', source: 'Level 5 food consumption records.' },
  onlineGrocery: { title: 'Online grocery shopping', what: 'This circle shows households that bought groceries online in the last 30 days.', look: 'Online grocery is still a small share of all food buying.', source: 'Level 4 household records.' },
  pds: { title: 'Ration from fair price shops', what: 'This circle shows households that received ration from a fair price shop in the last 30 days. The ration includes rice, wheat, and sugar.', look: 'Most households received some ration.', source: 'Level 4 household records.' },
  lpg: { title: 'LPG cylinder subsidy', what: 'This circle shows households that received a subsidy on LPG cylinders.', look: 'Compare the yes and no parts.', source: 'Level 7 household records.' },
  electricity: { title: 'Free electricity', what: 'This circle shows households that get free electricity. The benefit reduces the power bill.', look: 'Free electricity helps poor households.', source: 'Level 7 household records.' },
  ayushman: { title: 'Ayushman health card', what: 'This circle shows households with an Ayushman Bharat health card. The card gives free treatment in listed hospitals.', look: 'Compare the yes and no parts.', source: 'Level 7 household records.' },
  school: { title: 'Children in school', what: 'This circle shows households with a child in school. The school can be government or private.', look: 'Compare villages and cities.', source: 'Level 7 household records.' },
  schoolSplit: { title: 'Government vs private schools', what: 'These bars show the number of children in government schools and private schools. Blue is government and green is private.', look: 'Government schools serve more village children. Private schools serve more city children.', source: 'Level 7 household records.' },
};

/* ---------- Data provenance for cross-verification ---------- */
const PROV = {
  stateConsumption: { file: 'food_consumption.parquet', cols: ['State', 'Sector', 'Total_Consumption_Value', 'Multiplier'], agg: 'state_consumption.json' },
  sectorShare: { file: 'food_consumption.parquet', cols: ['Sector', 'Total_Consumption_Value', 'Multiplier'], agg: 'state_consumption.json' },
  ooh: { file: 'food_consumption.parquet', cols: ['OutOfHome_Consumption_Value', 'Total_Consumption_Value', 'Multiplier'], agg: 'state_consumption.json' },
  ageGroup: { file: 'individual_characteristics.parquet', cols: ['Age', 'Gender', 'Multiplier'], agg: 'demographics.json' },
  gender: { file: 'individual_characteristics.parquet', cols: ['Gender', 'Multiplier'], agg: 'demographics.json' },
  pyramid: { file: 'individual_characteristics.parquet', cols: ['Age', 'Gender', 'Multiplier'], agg: 'demographics.json' },
  composition: { file: 'individual_characteristics.parquet', cols: ['Age', 'Gender', 'Multiplier'], agg: 'demographics.json' },
  education: { file: 'individual_characteristics.parquet', cols: ['Education_Level', 'State', 'Multiplier'], agg: 'education.json' },
  marital: { file: 'individual_characteristics.parquet', cols: ['Marital_Status', 'Age', 'Gender', 'Multiplier'], agg: 'people.json' },
  internet: { file: 'individual_characteristics.parquet', cols: ['Used_Internet_Last_30_Days', 'Age', 'Sector', 'Multiplier'], agg: 'people.json' },
  meals: { file: 'individual_characteristics.parquet', cols: ['Meals_Usually_Taken_Per_Day', 'Sector', 'Multiplier'], agg: 'people.json' },
  relation: { file: 'individual_characteristics.parquet', cols: ['Relation_to_Head', 'Sector', 'Multiplier'], agg: 'people.json' },
  hhsize: { file: 'household_economic.parquet', cols: ['HH_Size_FDQ', 'Sector', 'Multiplier'], agg: 'household_extras.json' },
  hhtype: { file: 'household_economic.parquet', cols: ['Household_Type', 'Multiplier'], agg: 'household_characteristics.json' },
  socialgroup: { file: 'household_economic.parquet', cols: ['Social_Group_of_HH_Head', 'Sector', 'Multiplier'], agg: 'household_extras.json' },
  religion: { file: 'household_economic.parquet', cols: ['Religion_of_HH_Head', 'Multiplier'], agg: 'household_characteristics.json' },
  dwelling: { file: 'household_economic.parquet', cols: ['Type_of_Dwelling_Unit', 'Multiplier'], agg: 'household_characteristics.json' },
  energy: { file: 'household_economic.parquet', cols: ['Energy_Source_Cooking', 'Multiplier'], agg: 'household_characteristics.json' },
  lighting: { file: 'household_economic.parquet', cols: ['Energy_Source_Lighting', 'Sector', 'Multiplier'], agg: 'household_extras.json' },
  land: { file: 'household_economic.parquet', cols: ['Land_Ownership', 'Multiplier'], agg: 'household_characteristics.json' },
  ration: { file: 'household_economic.parquet', cols: ['Ration_Card_Type', 'Multiplier'], agg: 'household_characteristics.json' },
  ujjwala: { file: 'household_economic.parquet', cols: ['Benefitted_From_PMGKY', 'Sector', 'Multiplier'], agg: 'household_extras.json' },
  foodItems: { file: 'food_consumption.parquet', cols: ['Item_Code', 'Total_Consumption_Value', 'Multiplier'], agg: 'food_rankings.json' },
  consumpDist: { file: 'food_consumption.parquet', cols: ['State', 'Total_Consumption_Value', 'Multiplier'], agg: 'state_consumption.json' },
  perHH: { file: 'food_consumption.parquet', cols: ['State', 'Sector', 'Total_Consumption_Value', 'Multiplier'], agg: 'state_consumption.json' },
  foodSource: { file: 'food_consumption.parquet', cols: ['Source', 'Sector'], agg: 'spending_extras.json' },
  onlineGrocery: { file: 'consumption_4_1.parquet', cols: ['Online_Groceries', 'Sector', 'Multiplier'], agg: 'spending_extras.json' },
  pds: { file: 'consumption_4_1.parquet', cols: ['Ration_Any_Item_Last_30_Days', 'Sector', 'Multiplier'], agg: 'schemes.json' },
  lpg: { file: 'consumption_4_2.parquet', cols: ['LPG_subsidy_received', 'Sector', 'Multiplier'], agg: 'schemes.json' },
  electricity: { file: 'consumption_4_2.parquet', cols: ['Free_electricity', 'Sector', 'Multiplier'], agg: 'schemes.json' },
  ayushman: { file: 'consumption_4_2.parquet', cols: ['Ayushman_beneficiary', 'Sector', 'Multiplier'], agg: 'schemes.json' },
  school: { file: 'consumption_4_2.parquet', cols: ['Any_member_attended_school', 'Sector', 'Multiplier'], agg: 'schemes.json' },
  schoolSplit: { file: 'consumption_4_2.parquet', cols: ['Num_govt_school_attended', 'Num_private_school_attended', 'Multiplier'], agg: 'schemes.json' },
};

/* ---------- Code labels ---------- */
const C = {
  marital: { 1: 'Never married', 2: 'Married', 3: 'Widowed', 4: 'Divorced or separated' },
  relation: { 1: 'Head', 2: 'Spouse', 3: 'Married child', 4: 'Child\'s spouse', 5: 'Unmarried child', 6: 'Grandchild', 7: 'Parent', 8: 'Sibling', 9: 'Other relative' },
  social: { 1: 'Scheduled Tribe', 2: 'Scheduled Caste', 3: 'OBC', 9: 'Others' },
  lighting: { 1: 'Electricity', 2: 'Kerosene', 3: 'Solar', 5: 'Gas', 6: 'Candle', 9: 'No lighting' },
  cooking: { '01': 'Firewood', '02': 'LPG / gas', '03': 'Other biofuel', '04': 'Dung cake', '05': 'Coal', '06': 'Kerosene', '09': 'Biogas', '11': 'No cooking', '12': 'Other' },
  dwelling: { 1: 'Pucca', 2: 'Semi-pucca', 3: 'Katcha' },
  land: { 1: 'Owns land', 2: 'No land' },
  religion: { 1: 'Hindu', 2: 'Muslim', 3: 'Christian', 4: 'Sikh', 5: 'Buddhist', 6: 'Jain', 9: 'Others', 0: 'Not reported' },
  hhtype: { 1: 'Self-employed, non-farm', 2: 'Self-employed, farm', 3: 'Casual labour, farm', 4: 'Casual labour, non-farm', 5: 'Regular wage or salary', 6: 'Others', 9: 'Other' },
  ration: { 0: 'No ration card', 1: 'Card type 1', 2: 'Card type 2', 3: 'Card type 3', 4: 'Card type 4', 5: 'Card type 5', 9: 'Not reported' },
  foodsrc: { 1: 'Purchased', 2: 'Home-produced', 3: 'Exchanged', 4: 'Gift', 5: 'Free collection', 6: 'From employer', 7: 'From others', 9: 'Other' },
};

/* ---------- Helpers ---------- */
async function loadJSON(name) { const r = await fetch(`data/${name}.json`); return r.json(); }
/* Indian number formats: lakh and crore, with Indian digit grouping */
function trim(x) { return parseFloat(x.toFixed(2)).toString(); }
function fmt(n) {
  if (n == null || isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e7) return trim(n / 1e7) + ' Cr';
  if (a >= 1e5) return trim(n / 1e5) + ' Lakh';
  if (a >= 1e3) return Math.round(n).toLocaleString('en-IN');
  return n.toFixed(0);
}
/* money value given in crore rupees -> Indian display */
function fmtCr(cr) {
  if (cr == null || isNaN(cr)) return '—';
  const a = Math.abs(cr);
  if (a >= 1e5) return '₹' + trim(cr / 1e5) + ' lakh crore';
  if (a >= 1) return '₹' + Math.round(cr).toLocaleString('en-IN') + ' Cr';
  return '₹' + Math.round(cr * 100).toLocaleString('en-IN') + ' L';
}
const getVal = ctx => ctx.parsed && ctx.parsed.y !== undefined ? ctx.parsed.y : ctx.parsed && ctx.parsed.x !== undefined ? ctx.parsed.x : (ctx.raw ?? ctx.parsed);
const moneyLabel = ctx => ' ' + fmtCr(getVal(ctx));
const rupLabel = ctx => ' ₹' + Math.round(getVal(ctx)).toLocaleString('en-IN');
const inrTicks = v => Math.round(v).toLocaleString('en-IN');
const sumBy = (arr, k) => arr.reduce((s, d) => s + (d[k] || 0), 0);

// Row accessor that applies detail-page filters (sector/state) only when a single chart is focused.
function D(file, key) {
  let rows = key ? DATA[file][key] : DATA[file];
  if (window.FOCUS_CHART && window.FILTERS) {
    const f = window.FILTERS;
    if (f.sector && rows && rows[0] && 'sector' in rows[0]) rows = rows.filter(r => r.sector === f.sector);
    if (f.state && rows && rows[0] && 'state_name' in rows[0]) rows = rows.filter(r => r.state_name === f.state);
  }
  return rows;
}

function makeChart(id, cfg) {
  if (charts[id]) charts[id].destroy();
  const el = document.getElementById(id);
  if (!el) return;
  if (window.FOCUS_CHART && window.FOCUS_CHART !== id) return;
  charts[id] = new Chart(el, {
    ...cfg,
    options: {
      responsive: true, maintainAspectRatio: false, ...cfg.options,
      plugins: {
        legend: { labels: { color: THEME.legend, usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 18 }, ...(cfg.options?.plugins?.legend || {}) },
        tooltip: {
          backgroundColor: '#101828', padding: 10, cornerRadius: 8, titleColor: '#e5e7eb', bodyColor: '#d1d5db',
          callbacks: { label: ctx => ' ' + fmt(getVal(ctx)) },
          ...(cfg.options?.plugins?.tooltip || {}),
        },
      },
    },
  });
}
const baseScales = {
  x: { ticks: { color: THEME.tick }, grid: { color: THEME.grid }, border: { color: THEME.grid } },
  y: { ticks: { color: THEME.tick }, grid: { color: THEME.grid }, border: { display: false } },
};

/* ---------- Routing ---------- */
const ROUTES = ['overview', 'people', 'households', 'spending', 'schemes'];
const ALIASES = { consumption: 'spending', demographics: 'people' };
function routeName() {
  const seg = location.pathname.replace(/\/+$/, '').split('/').pop() || 'overview';
  return ALIASES[seg] || (ROUTES.includes(seg) ? seg : 'overview');
}
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.seg a').forEach(a => { a.classList.remove('active'); a.removeAttribute('aria-current'); });
  document.getElementById('sec-' + name).classList.add('active');
  const tab = document.getElementById('tab-' + name);
  tab.classList.add('active'); tab.setAttribute('aria-current', 'page');
  RENDERERS[name]();
}

/* ---------- Info modal ---------- */
const modal = document.getElementById('infoModal');
function openInfo(key) {
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
  modal.showModal();
}
document.addEventListener('click', e => {
  const btn = e.target.closest('.info-btn');
  if (btn) openInfo(btn.dataset.info);
});
document.getElementById('modalClose').addEventListener('click', () => modal.close());
modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });

/* ---------- Overview ---------- */
function updateOverview() {
  const sector = (window.FILTERS && window.FILTERS.sector) || document.getElementById('sectorFilter')?.value || 'all';
  const state = (window.FILTERS && window.FILTERS.state) || document.getElementById('stateFilter')?.value || 'all';
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

  const totals = ageGroups.map(a => byAge[a].Male + byAge[a].Female || 1);
  makeChart('chartComposition', { type: 'bar', data: { labels: ageGroups, datasets: [
    { label: 'Male %', data: ageGroups.map((a, i) => +(100 * byAge[a].Male / totals[i]).toFixed(1)), backgroundColor: '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 30 },
    { label: 'Female %', data: ageGroups.map((a, i) => +(100 * byAge[a].Female / totals[i]).toFixed(1)), backgroundColor: '#be185d', borderRadius: 4, borderSkipped: false, maxBarThickness: 30 }] },
    options: { scales: { ...baseScales, y: { ...baseScales.y, suggestedMax: 60, ticks: { ...baseScales.y.ticks, callback: v => v + '%' } } }, plugins: { legend: { position: 'bottom' } } } });

  const edu = D('education');
  const levels = [...new Set(edu.map(d => d.education_level))].slice(0, 8);
  const topStates = [...new Set(edu.map(d => d.state_name))].slice(0, 12);
  makeChart('chartEducation', { type: 'bar', data: { labels: topStates, datasets: levels.map((lev, i) => ({
    label: lev, data: topStates.map(s => sumBy(edu.filter(d => d.state_name === s && d.education_level === lev), 'estimated_count')),
    backgroundColor: THEME.palette[i % THEME.palette.length], borderRadius: 2, maxBarThickness: 18 })) },
    options: { scales: { ...baseScales, x: { ...baseScales.x, stacked: true, ticks: { ...baseScales.x.ticks, maxRotation: 45, font: { size: 10 } } }, y: { ...baseScales.y, stacked: true, ticks: { ...baseScales.y.ticks, callback: v => fmt(v) } } },
      plugins: { legend: { labels: { color: THEME.legend, font: { size: 10 } } } } } });

  // Marital status (grouped by sector)
  const mar = D('people', 'marital');
  const marCodes = ['1', '2', '3', '4'];
  makeChart('chartMarital', { type: 'bar', data: { labels: ['Rural', 'Urban'], datasets: marCodes.map((c, i) => ({
    label: C.marital[c], data: ['Rural', 'Urban'].map(s => sumBy(mar.filter(d => d.sector === s && d.code === c), 'w')),
    backgroundColor: THEME.palette[i * 2], borderRadius: 4, borderSkipped: false, maxBarThickness: 26 })) },
    options: { scales: { ...baseScales, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: v => fmt(v) } } } } });

  // Internet by age group
  const net = D('people', 'internet');
  const netAges = ['Under 15', '15-24', '25-44', '45+'];
  makeChart('chartInternet', { type: 'bar', data: { labels: netAges, datasets: [
    { label: 'Used internet', data: netAges.map(a => sumBy(net.filter(d => d.age_group === a && d.used === 'Yes'), 'w')), backgroundColor: '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 34 },
    { label: 'No internet', data: netAges.map(a => sumBy(net.filter(d => d.age_group === a && d.used === 'No'), 'w')), backgroundColor: '#f87171', borderRadius: 4, borderSkipped: false, maxBarThickness: 34 }] },
    options: { scales: { ...baseScales, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: v => fmt(v) } } } } });

  // Meals per day
  const meals = D('people', 'meals');
  const mealVals = ['0', '1', '2', '3'];
  makeChart('chartMeals', { type: 'bar', data: { labels: ['Rural', 'Urban'], datasets: mealVals.map((m, i) => ({
    label: m + (m === '0' ? ' meals' : ' meal' + (m === '1' ? '' : 's')), data: ['Rural', 'Urban'].map(s => sumBy(meals.filter(d => d.sector === s && d.meals === m), 'w')),
    backgroundColor: THEME.palette[(i + 2) % THEME.palette.length], borderRadius: 4, borderSkipped: false, maxBarThickness: 26 })) },
    options: { scales: { ...baseScales, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: v => fmt(v) } } } } });

  // Family role
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
    return entries.map(([k, v]) => [map[k] || ('Code ' + k), v]);
  };
  const pie = (id, entries) => makeChart(id, { type: 'doughnut', data: { labels: entries.map(e => e[0]), datasets: [{ data: entries.map(e => e[1]), backgroundColor: THEME.palette, borderWidth: 0, hoverOffset: 6 }] }, options: { cutout: '62%', plugins: { legend: { position: 'bottom', labels: { color: THEME.legend, font: { size: 11 } } } } } });

  const extra = DATA.householdExtras;
  // HH size
  const sizes = D('householdExtras', 'hh_size');
  const sizeLabels = ['1', '2', '3', '4', '5', '6', '7', '8+'];
  makeChart('chartHHSize', { type: 'bar', data: { labels: sizeLabels, datasets: ['Rural', 'Urban'].map((s, i) => ({
    label: s, data: sizeLabels.map(sz => sumBy(sizes.filter(d => d.sector === s && d.size === sz), 'w')),
    backgroundColor: i ? '#0e9f8a' : '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 26 })) },
    options: { scales: { ...baseScales, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: v => fmt(v) } } } } });

  // Income type
  const hhType = by('household_type', C.hhtype, 7);
  makeChart('chartHHType', { type: 'bar', data: { labels: hhType.map(e => e[0]), datasets: [{ label: 'Households', data: hhType.map(e => e[1]), backgroundColor: '#4f46e5', borderRadius: 4, borderSkipped: false, maxBarThickness: 28 }] },
    options: { scales: { ...baseScales, x: { ...baseScales.x, ticks: { ...baseScales.x.ticks, maxRotation: 30, font: { size: 11 } } }, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: v => fmt(v) } } }, plugins: { legend: { display: false } } } });

  // Social group
  const sg = D('householdExtras', 'social_group');
  const sgKeys = ['1', '2', '3', '9'];
  makeChart('chartSocialGroup', { type: 'bar', data: { labels: sgKeys.map(c => C.social[c]), datasets: ['Rural', 'Urban'].map((s, i) => ({
    label: s, data: sgKeys.map(c => sumBy(sg.filter(d => d.sector === s && d.code === c), 'w')),
    backgroundColor: i ? '#0e9f8a' : '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 26 })) },
    options: { scales: { ...baseScales, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: v => fmt(v) } } } } });

  // Religion
  const religion = by('religion', C.religion, 8);
  makeChart('chartReligion', { type: 'bar', data: { labels: religion.map(e => e[0]), datasets: [{ label: 'Households', data: religion.map(e => e[1]), backgroundColor: '#6d28d9', borderRadius: 4, borderSkipped: false, maxBarThickness: 30 }] },
    options: { scales: { ...baseScales, x: { ...baseScales.x, ticks: { ...baseScales.x.ticks, maxRotation: 30, font: { size: 11 } } }, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: v => fmt(v) } } }, plugins: { legend: { display: false } } } });

  pie('chartDwelling', by('dwelling_type', C.dwelling));
  pie('chartEnergy', by('cooking_energy', C.cooking, 8));
  pie('chartLand', by('land_ownership', C.land));
  pie('chartRation', by('ration_card', C.ration, 6));

  // Lighting + Ujjwala from extras (sector split)
  const light = D('householdExtras', 'lighting');
  const lightCodes = ['1', '2', '3', '5', '6', '9'];
  const lightEntries = lightCodes.map(c => [C.lighting[c] || c, sumBy(light.filter(d => d.code === c), 'w')]).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]);
  makeChart('chartLighting', { type: 'doughnut', data: { labels: lightEntries.map(e => e[0]), datasets: [{ data: lightEntries.map(e => e[1]), backgroundColor: THEME.palette, borderWidth: 0, hoverOffset: 6 }] }, options: { cutout: '62%', plugins: { legend: { position: 'bottom', labels: { color: THEME.legend, font: { size: 11 } } } } } });

  const ujj = D('householdExtras', 'ujjwala');
  const ujjYes = sumBy(ujj.filter(d => d.got === 'Yes'), 'w');
  const ujjNo = sumBy(ujj.filter(d => d.got === 'No'), 'w');
  makeChart('chartUjjwala', { type: 'doughnut', data: { labels: ['Got free connection', 'Did not get'], datasets: [{ data: [ujjYes, ujjNo], backgroundColor: ['#0e9f8a', '#c8cfd9'], borderWidth: 0, hoverOffset: 6 }] }, options: { cutout: '62%', plugins: { legend: { position: 'bottom' } } } });
}

/* ---------- Spending ---------- */
function updateSpending() {
  const items = D('foodRankings').slice(0, 20).reverse();
  makeChart('chartFoodItems', { type: 'bar', data: { labels: items.map(d => 'Item ' + d.item_code), datasets: [{ label: 'Monthly value (₹ Cr)', data: items.map(d => d.total_value_cr), backgroundColor: '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 20 }] },
    options: { indexAxis: 'y', scales: { ...baseScales, x: { ...baseScales.x, ticks: { ...baseScales.x.ticks, callback: inrTicks } }, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, font: { size: 11 } } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: moneyLabel } } } } });

  const sc = D('stateConsumption'); const states = [...new Set(sc.map(d => d.state_name))].sort();
  makeChart('chartConsumpDist', { type: 'bar', data: { labels: states, datasets: [{ label: 'Monthly (₹ Cr)', data: states.map(s => sumBy(sc.filter(d => d.state_name === s), 'total_consumption_cr')), backgroundColor: '#0e9f8a', borderRadius: 3, borderSkipped: false, maxBarThickness: 22 }] },
    options: { scales: { ...baseScales, x: { ...baseScales.x, ticks: { ...baseScales.x.ticks, maxRotation: 90, font: { size: 10 } } }, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: inrTicks } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: moneyLabel } } } }});

  const labels = [...new Set(sc.map(d => d.state_name))].sort().slice(0, 15);
  makeChart('chartPerHH', { type: 'bar', data: { labels, datasets: [
    { label: 'Rural', data: labels.map(s => sc.find(d => d.state_name === s && d.sector === 'Rural')?.avg_consumption_per_item || 0), backgroundColor: '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 20 },
    { label: 'Urban', data: labels.map(s => sc.find(d => d.state_name === s && d.sector === 'Urban')?.avg_consumption_per_item || 0), backgroundColor: '#0e9f8a', borderRadius: 4, borderSkipped: false, maxBarThickness: 20 }] },
    options: { scales: { ...baseScales, x: { ...baseScales.x, ticks: { ...baseScales.x.ticks, maxRotation: 45, font: { size: 11 } } } }, plugins: { tooltip: { callbacks: { label: rupLabel } } } } });

  // Food source (share %)
  const fs = D('spendingExtras', 'food_source');
  const fsKeys = Object.keys(C.foodsrc);
  const fsRural = fsKeys.map(c => ({ label: C.foodsrc[c], v: sumBy(fs.filter(d => d.sector === 'Rural' && d.code === c), 'w') }));
  const fsUrban = fsKeys.map(c => ({ label: C.foodsrc[c], v: sumBy(fs.filter(d => d.sector === 'Urban' && d.code === c), 'w') }));
  const pct = arr => { const t = sumBy(arr, 'v') || 1; return arr.map(x => +(100 * x.v / t).toFixed(1)); };
  makeChart('chartFoodSource', { type: 'bar', data: { labels: fsKeys.map(c => C.foodsrc[c]), datasets: [
    { label: 'Rural %', data: pct(fsRural), backgroundColor: '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 26 },
    { label: 'Urban %', data: pct(fsUrban), backgroundColor: '#0e9f8a', borderRadius: 4, borderSkipped: false, maxBarThickness: 26 }] },
    options: { scales: { ...baseScales, y: { ...baseScales.y, suggestedMax: 100, ticks: { ...baseScales.y.ticks, callback: v => v + '%' } } } } });

  const og = D('spendingExtras', 'online_grocery');
  const ogYes = sumBy(og.filter(d => d.bought === 'Yes'), 'w');
  const ogNo = sumBy(og.filter(d => d.bought === 'No'), 'w');
  makeChart('chartOnlineGrocery', { type: 'doughnut', data: { labels: ['Bought online', 'Did not buy online'], datasets: [{ data: [ogYes, ogNo], backgroundColor: ['#0e9f8a', '#c8cfd9'], borderWidth: 0, hoverOffset: 6 }] }, options: { cutout: '62%', plugins: { legend: { position: 'bottom' } } } });
}

/* ---------- Schemes ---------- */
function updateSchemes() {
  const s = DATA.schemes;
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

const RENDERERS = { overview: updateOverview, people: updatePeople, households: updateHouseholds, spending: updateSpending, schemes: updateSchemes };
function updateAll() { updateOverview(); }

/* ============ SHARED LOADING (used by index + detail) ============ */
window.loadAll = async function () {
  const [summary, stateC, demo, edu, hhChars, foodRank, people, hhExtra, spendExtra, schemes] = await Promise.all([
    loadJSON('national_summary'), loadJSON('state_consumption'), loadJSON('demographics'), loadJSON('education'),
    loadJSON('household_characteristics'), loadJSON('food_rankings'), loadJSON('people'),
    loadJSON('household_extras'), loadJSON('spending_extras'), loadJSON('schemes'),
  ]);
  Object.assign(DATA, { summary, stateConsumption: stateC, demographics: demo, education: edu, householdChars: hhChars, foodRankings: foodRank, people, householdExtras: hhExtra, spendingExtras: spendExtra, schemes });
};
window.renderSection = name => (RENDERERS[name] || RENDERERS.overview)();

/* ============ INIT (dashboard only) ============ */
(async () => {
  if (window.DETAIL_MODE) return;
  document.querySelectorAll('.seg a').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    const name = a.dataset.section;
    if (routeName() !== name) history.pushState({}, '', a.getAttribute('href'));
    showSection(name);
  }));
  window.addEventListener('popstate', () => showSection(routeName()));

  try {
    await loadAll();

    document.getElementById('statsBar').innerHTML = `
      <div class="stat"><div class="label">Survey year</div><div class="value">${DATA.summary.survey_year}</div><div class="sub">${DATA.summary.survey_name}</div></div>
      <div class="stat"><div class="label">Households sampled</div><div class="value">${fmt(DATA.summary.total_households_sampled)}</div><div class="sub">est. ${fmt(DATA.summary.estimated_total_households)} nationally</div></div>
      <div class="stat"><div class="label">Individuals sampled</div><div class="value">${fmt(DATA.summary.total_individuals_sampled)}</div><div class="sub">est. <span class="accent">${fmt(DATA.summary.estimated_total_population)}</span> population</div></div>
      <div class="stat"><div class="label">Coverage</div><div class="value">${DATA.summary.states_covered}</div><div class="sub">states &amp; UTs · rural + urban</div></div>`;

    const sel = document.getElementById('stateFilter');
    [...new Set(DATA.stateConsumption.map(d => d.state_name))].sort().forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; sel.appendChild(o); });

    showSection(routeName());
  } catch (e) {
    console.error('Load error:', e);
    document.getElementById('statsBar').innerHTML = `<div class="error">Could not load survey data. Run <code>aggregate_for_web.py</code> first, then refresh.</div>`;
  }
})();
