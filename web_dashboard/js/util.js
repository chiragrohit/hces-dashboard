/* Pure formatting helpers shared by the dashboard pages. No DOM, no data. */

/* strip trailing zeros from a decimal, keep at most 2 places */
export function trim(x) { return parseFloat(x.toFixed(2)).toString(); }

/* Indian number formats: lakh and crore, with Indian digit grouping */
export function fmt(n) {
  if (n == null || isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e7) return trim(n / 1e7) + ' Cr';
  if (a >= 1e5) return trim(n / 1e5) + ' Lakh';
  if (a >= 1e3) return Math.round(n).toLocaleString('en-IN');
  return n.toFixed(0);
}

/* money value given in crore rupees -> Indian display */
export function fmtCr(cr) {
  if (cr == null || isNaN(cr)) return '—';
  const a = Math.abs(cr);
  if (a >= 1e5) return '₹' + trim(cr / 1e5) + ' lakh crore';
  if (a >= 1) return '₹' + Math.round(cr).toLocaleString('en-IN') + ' Cr';
  return '₹' + Math.round(cr * 100).toLocaleString('en-IN') + ' L';
}

/* value under the cursor, for chart tooltips */
export const getVal = ctx =>
  ctx.parsed && ctx.parsed.y !== undefined ? ctx.parsed.y
  : ctx.parsed && ctx.parsed.x !== undefined ? ctx.parsed.x
  : (ctx.raw ?? ctx.parsed);

export const moneyLabel = ctx => ' ' + fmtCr(getVal(ctx));
export const rupLabel = ctx => ' ₹' + Math.round(getVal(ctx)).toLocaleString('en-IN');
export const inrTicks = v => Math.round(v).toLocaleString('en-IN');
export const sumBy = (arr, k) => arr.reduce((s, d) => s + (d[k] || 0), 0);
