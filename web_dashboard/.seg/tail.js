function updateAll() { updateOverview(); }

/* ============ INIT ============ */
(async () => {
  document.querySelectorAll('.seg a').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    const name = a.dataset.section;
    if (routeName() !== name) history.pushState({}, '', a.getAttribute('href'));
    showSection(name);
  }));
  window.addEventListener('popstate', () => showSection(routeName()));

  try {
    const [summary, stateC, demo, edu, hhChars, foodRank, people, hhExtra, spendExtra, schemes] = await Promise.all([
      loadJSON('national_summary'), loadJSON('state_consumption'), loadJSON('demographics'), loadJSON('education'),
      loadJSON('household_characteristics'), loadJSON('food_rankings'), loadJSON('people'),
      loadJSON('household_extras'), loadJSON('spending_extras'), loadJSON('schemes'),
    ]);
    Object.assign(DATA, { summary, stateConsumption: stateC, demographics: demo, education: edu, householdChars: hhChars, foodRankings: foodRank, people, householdExtras: hhExtra, spendingExtras: spendExtra, schemes });

    document.getElementById('statsBar').innerHTML = `
      <div class="stat"><div class="label">Survey year</div><div class="value">${DATA.summary.survey_year}</div><div class="sub">${DATA.summary.survey_name}</div></div>
      <div class="stat"><div class="label">Households sampled</div><div class="value">${fmt(DATA.summary.total_households_sampled)}</div><div class="sub">est. ${fmt(DATA.summary.estimated_total_households)} nationally</div></div>
      <div class="stat"><div class="label">Individuals sampled</div><div class="value">${fmt(DATA.summary.total_individuals_sampled)}</div><div class="sub">est. <span class="accent">${fmt(DATA.summary.estimated_total_population)}</span> population</div></div>
      <div class="stat"><div class="label">Coverage</div><div class="value">${DATA.summary.states_covered}</div><div class="sub">states &amp; UTs · rural + urban</div></div>`;

    const sel = document.getElementById('stateFilter');
    [...new Set(stateC.map(d => d.state_name))].sort().forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; sel.appendChild(o); });

    showSection(routeName());
  } catch (e) {
    console.error('Load error:', e);
    document.getElementById('statsBar').innerHTML = `<div class="error">Could not load survey data. Run <code>aggregate_for_web.py</code> first, then refresh.</div>`;
  }
})();
