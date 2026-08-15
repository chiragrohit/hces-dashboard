/* Human labels for raw survey codes, from the data catalog (metadata.json).
 *
 * The microdata stores codes ("1", "09", "101"); the catalog carries the
 * meanings extracted from the official questionnaire (see extract_code_map.py):
 *   - c.meaning        -> answer codes (e.g. Religion 1 = Hinduism)
 *   - c.state_meaning  -> state codes (e.g. 09 = Uttar Pradesh)
 *   - c.item_meaning   -> consumption item codes (e.g. 101 = rice - PDS)
 */

let MAPS = null; // { table: { column: { code: label } } }

export async function loadCodeMaps() {
  if (MAPS) return MAPS;
  try {
    const res = await fetch('/data/metadata.json');
    const meta = await res.json();
    MAPS = {};
    for (const t of meta.tables) {
      const byCol = (MAPS[t.table] = {});
      for (const c of t.columns) {
        const d = {};
        if (c.meaning) Object.assign(d, c.meaning);
        if (c.state_meaning) Object.assign(d, c.state_meaning);
        if (c.item_meaning) Object.assign(d, c.item_meaning);
        if (Object.keys(d).length) byCol[c.name] = d;
      }
    }
  } catch (e) {
    MAPS = {}; // catalog missing -> show raw values
  }
  return MAPS;
}

export function decode(table, col, val) {
  if (val == null) return val;
  const map = MAPS && MAPS[table] && MAPS[table][col];
  if (!map) return val;
  const k = String(val);
  return k in map ? map[k] : val;
}
