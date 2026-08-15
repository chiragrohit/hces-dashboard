function updateSpending() {
  const items = DATA.foodRankings.slice(0, 20).reverse();
  makeChart('chartFoodItems', { type: 'bar', data: { labels: items.map(d => 'Item ' + d.item_code), datasets: [{ label: 'Monthly value (₹ Cr)', data: items.map(d => d.total_value_cr), backgroundColor: '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 20 }] },
    options: { indexAxis: 'y', scales: { ...baseScales, x: { ...baseScales.x, ticks: { ...baseScales.x.ticks, callback: inrTicks } }, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, font: { size: 11 } } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: moneyLabel } } } } });

  const states = [...new Set(DATA.stateConsumption.map(d => d.state_name))].sort();
  makeChart('chartConsumpDist', { type: 'bar', data: { labels: states, datasets: [{ label: 'Monthly (₹ Cr)', data: states.map(s => sumBy(DATA.stateConsumption.filter(d => d.state_name === s), 'total_consumption_cr')), backgroundColor: '#0e9f8a', borderRadius: 3, borderSkipped: false, maxBarThickness: 22 }] },
    options: { scales: { ...baseScales, x: { ...baseScales.x, ticks: { ...baseScales.x.ticks, maxRotation: 90, font: { size: 10 } } }, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: inrTicks } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: moneyLabel } } } }});

  const labels = [...new Set(DATA.stateConsumption.map(d => d.state_name))].sort().slice(0, 15);
  makeChart('chartPerHH', { type: 'bar', data: { labels, datasets: [
    { label: 'Rural', data: labels.map(s => DATA.stateConsumption.find(d => d.state_name === s && d.sector === 'Rural')?.avg_consumption_per_item || 0), backgroundColor: '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 20 },
    { label: 'Urban', data: labels.map(s => DATA.stateConsumption.find(d => d.state_name === s && d.sector === 'Urban')?.avg_consumption_per_item || 0), backgroundColor: '#0e9f8a', borderRadius: 4, borderSkipped: false, maxBarThickness: 20 }] },
    options: { scales: { ...baseScales, x: { ...baseScales.x, ticks: { ...baseScales.x.ticks, maxRotation: 45, font: { size: 11 } } } }, plugins: { tooltip: { callbacks: { label: rupLabel } } } } });

  // Food source (share %)
  const fs = DATA.spendingExtras.food_source;
  const fsKeys = Object.keys(C.foodsrc);
  const fsRural = fsKeys.map(c => ({ label: C.foodsrc[c], v: sumBy(fs.filter(d => d.sector === 'Rural' && d.code === c), 'w') }));
  const fsUrban = fsKeys.map(c => ({ label: C.foodsrc[c], v: sumBy(fs.filter(d => d.sector === 'Urban' && d.code === c), 'w') }));
  const pct = arr => { const t = sumBy(arr, 'v') || 1; return arr.map(x => +(100 * x.v / t).toFixed(1)); };
  makeChart('chartFoodSource', { type: 'bar', data: { labels: fsKeys.map(c => C.foodsrc[c]), datasets: [
    { label: 'Rural %', data: pct(fsRural), backgroundColor: '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 26 },
    { label: 'Urban %', data: pct(fsUrban), backgroundColor: '#0e9f8a', borderRadius: 4, borderSkipped: false, maxBarThickness: 26 }] },
    options: { scales: { ...baseScales, y: { ...baseScales.y, suggestedMax: 100, ticks: { ...baseScales.y.ticks, callback: v => v + '%' } } } } });

  const og = DATA.spendingExtras.online_grocery;
  const ogYes = sumBy(og.filter(d => d.bought === 'Yes'), 'w');
  const ogNo = sumBy(og.filter(d => d.bought === 'No'), 'w');
  makeChart('chartOnlineGrocery', { type: 'doughnut', data: { labels: ['Bought online', 'Did not buy online'], datasets: [{ data: [ogYes, ogNo], backgroundColor: ['#0e9f8a', '#c8cfd9'], borderWidth: 0, hoverOffset: 6 }] }, options: { cutout: '62%', plugins: { legend: { position: 'bottom' } } } });
}

/* ---------- Schemes ---------- */
