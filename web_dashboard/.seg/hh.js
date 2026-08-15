function updateHouseholds() {
  const hh = DATA.householdChars;
  const by = (key, map, top = 8) => {
    const m = {};
    hh.forEach(d => { const k = d[key] || 'Not reported'; m[k] = (m[k] || 0) + d.estimated_households; });
    const entries = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, top);
    return entries.map(([k, v]) => [map[k] || ('Code ' + k), v]);
  };
  const pie = (id, entries) => makeChart(id, { type: 'doughnut', data: { labels: entries.map(e => e[0]), datasets: [{ data: entries.map(e => e[1]), backgroundColor: THEME.palette, borderWidth: 0, hoverOffset: 6 }] }, options: { cutout: '62%', plugins: { legend: { position: 'bottom', labels: { color: THEME.legend, font: { size: 11 } } } } } });

  const extra = DATA.householdExtras;
  // HH size
  const sizes = extra.hh_size;
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
  const sg = extra.social_group;
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
  const light = extra.lighting;
  const lightCodes = ['1', '2', '3', '5', '6', '9'];
  const lightEntries = lightCodes.map(c => [C.lighting[c] || c, sumBy(light.filter(d => d.code === c), 'w')]).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]);
  makeChart('chartLighting', { type: 'doughnut', data: { labels: lightEntries.map(e => e[0]), datasets: [{ data: lightEntries.map(e => e[1]), backgroundColor: THEME.palette, borderWidth: 0, hoverOffset: 6 }] }, options: { cutout: '62%', plugins: { legend: { position: 'bottom', labels: { color: THEME.legend, font: { size: 11 } } } } } });

  const ujj = extra.ujjwala;
  const ujjYes = sumBy(ujj.filter(d => d.got === 'Yes'), 'w');
  const ujjNo = sumBy(ujj.filter(d => d.got === 'No'), 'w');
  makeChart('chartUjjwala', { type: 'doughnut', data: { labels: ['Got free connection', 'Did not get'], datasets: [{ data: [ujjYes, ujjNo], backgroundColor: ['#0e9f8a', '#c8cfd9'], borderWidth: 0, hoverOffset: 6 }] }, options: { cutout: '62%', plugins: { legend: { position: 'bottom' } } } });
}

/* ---------- Spending ---------- */
