/* Survey data loading + row access. DATA is shared state, populated by
 * loadAll(). D() applies detail-page filters (sector/state) when the
 * detail page has set a focus via setFocus(). */

const DATA = {};
let focus = null; // { sector?, state? } set by the detail page

export { DATA };

export function setFocus(f) { focus = f; }

/* active detail-page filters, or null on the dashboard */
export function focusFilters() { return focus; }

async function loadJSON(name) {
  const r = await fetch(`data/${name}.json`);
  return r.json();
}

export async function loadAll() {
  const [summary, stateC, demo, edu, hhChars, foodRank, people, hhExtra, spendExtra, schemes] = await Promise.all([
    loadJSON('national_summary'), loadJSON('state_consumption'), loadJSON('demographics'), loadJSON('education'),
    loadJSON('household_characteristics'), loadJSON('food_rankings'), loadJSON('people'),
    loadJSON('household_extras'), loadJSON('spending_extras'), loadJSON('schemes'),
  ]);
  Object.assign(DATA, {
    summary, stateConsumption: stateC, demographics: demo, education: edu, householdChars: hhChars,
    foodRankings: foodRank, people, householdExtras: hhExtra, spendingExtras: spendExtra, schemes,
  });
}

/* Row accessor: DATA[file][key] with optional detail-page filters applied. */
export function D(file, key) {
  let rows = key ? DATA[file][key] : DATA[file];
  if (focus) {
    if (focus.sector && rows && rows[0] && 'sector' in rows[0]) rows = rows.filter(r => r.sector === focus.sector);
    if (focus.state && rows && rows[0] && 'state_name' in rows[0]) rows = rows.filter(r => r.state_name === focus.state);
  }
  return rows;
}
