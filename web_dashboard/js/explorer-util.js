/* Pure helpers + chart defaults for the explorer. No DOM, no state. */

export const PALETTE = ['#1d4ed8', '#0e9f8a', '#b45309', '#be123c', '#6d28d9', '#0d9488', '#c2410c', '#4f46e5', '#a16207', '#be185d'];

export const NUMERIC = ['BIGINT', 'INTEGER', 'DOUBLE', 'FLOAT', 'DECIMAL', 'HUGEINT', 'UBIGINT', 'SMALLINT'];

export const baseScales = {
  x: { grid: { color: 'rgba(16,24,40,0.07)' }, ticks: { color: '#5f6b7d', font: { size: 11 } } },
  y: { grid: { color: 'rgba(16,24,40,0.07)' }, ticks: { color: '#5f6b7d', font: { size: 11 } } },
};

export const $ = id => document.getElementById(id);

export function fmt(n) {
  const a = Math.abs(n);
  const trim = x => parseFloat(x.toFixed(2)).toString();
  if (a >= 1e7) return trim(n / 1e7) + ' Cr';
  if (a >= 1e5) return trim(n / 1e5) + ' Lakh';
  if (a >= 1e3) return Math.round(n).toLocaleString('en-IN');
  return Math.round(n).toString();
}

export function inr(v) { return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 2 }); }

export function moneyCol(name) { return /value|expenditure|amount|consumption|rent|spend|price|cost/i.test(name); }
