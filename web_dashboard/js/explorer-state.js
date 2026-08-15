/* Shared mutable state for the explorer modules. */

export const X = {
  cat: null,                                   // /api/tables payload
  current: { cols: [], rows: [], headers: [], note: '' },
  askFilter: null,                             // optional value filter from /api/ask
  asking: false,                               // an ask flow is in progress
  chartInst: null,                             // live Chart.js instance
};
