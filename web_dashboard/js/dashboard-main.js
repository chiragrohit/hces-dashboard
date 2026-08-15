/* Dashboard entry point (index.html): routing, tab wiring, overview
 * filters, and initial data load. Loads as an ES module. */

import { DATA, loadAll } from './data.js';
import { RENDERERS } from './charts-sections.js';
import { setShowValues } from './charts-core.js';
import { wireModal } from './modal.js';
import { fmt } from './util.js';

const ROUTES = ['overview', 'people', 'households', 'spending', 'income', 'schemes'];
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

wireModal();

document.querySelectorAll('.seg a').forEach(a => a.addEventListener('click', e => {
  e.preventDefault();
  const name = a.dataset.section;
  if (routeName() !== name) history.pushState({}, '', a.getAttribute('href'));
  showSection(name);
}));
window.addEventListener('popstate', () => showSection(routeName()));

document.getElementById('sectorFilter').addEventListener('change', () => RENDERERS.overview());
document.getElementById('stateFilter').addEventListener('change', () => RENDERERS.overview());

document.getElementById('valToggle').addEventListener('change', e => {
  setShowValues(e.target.checked);
  showSection(routeName()); // rebuild charts so values appear/disappear
});

(async () => {
  try {
    await loadAll();

    document.getElementById('statsBar').innerHTML = `
      <div class="stat"><div class="label">Survey year</div><div class="value">${DATA.summary.survey_year}</div><div class="sub">${DATA.summary.survey_name}</div></div>
      <div class="stat"><div class="label">Households sampled</div><div class="value">${fmt(DATA.summary.total_households_sampled)}</div><div class="sub">est. ${fmt(DATA.summary.estimated_total_households)} nationally</div></div>
      <div class="stat"><div class="label">Individuals sampled</div><div class="value">${fmt(DATA.summary.total_individuals_sampled)}</div><div class="sub">est. <span class="accent">${fmt(DATA.summary.estimated_total_population)}</span> population</div></div>
      <div class="stat"><div class="label">Coverage</div><div class="value">${DATA.summary.states_covered}</div><div class="sub">states &amp; UTs · rural + urban</div></div>`;

    const sel = document.getElementById('stateFilter');
    [...new Set(DATA.stateConsumption.map(d => d.state_name))].sort().forEach(s => {
      const o = document.createElement('option');
      o.value = s; o.textContent = s; sel.appendChild(o);
    });

    showSection(routeName());
  } catch (e) {
    console.error('Load error:', e);
    document.getElementById('statsBar').innerHTML =
      `<div class="error">Could not load survey data. Run <code>aggregate_for_web.py</code> first, then refresh.</div>`;
  }
})();
