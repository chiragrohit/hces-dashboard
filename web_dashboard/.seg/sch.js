function updateSchemes() {
  const s = DATA.schemes;
  const yn = (id, rows, yesLabel, noLabel) => {
    const y = sumBy(rows.filter(d => d.got === 'Yes'), 'w');
    const n = sumBy(rows.filter(d => d.got === 'No'), 'w');
    makeChart(id, { type: 'doughnut', data: { labels: [yesLabel, noLabel], datasets: [{ data: [y, n], backgroundColor: ['#0e9f8a', '#c8cfd9'], borderWidth: 0, hoverOffset: 6 }] }, options: { cutout: '62%', plugins: { legend: { position: 'bottom' } } } });
  };
  yn('chartPDS', s.pds, 'Got ration', 'No ration');
  yn('chartLPG', s.lpg_subsidy, 'Got subsidy', 'No subsidy');
  yn('chartElectricity', s.free_electricity, 'Free electricity', 'No free electricity');
  yn('chartAyushman', s.ayushman, 'Has card', 'No card');
  yn('chartSchool', s.school, 'Child in school', 'No child in school');

  const gv = s.school_govt_private;
  const gLabels = ['Rural', 'Urban'];
  makeChart('chartSchoolSplit', { type: 'bar', data: { labels: gLabels, datasets: [
    { label: 'Government school', data: gLabels.map(x => gv.find(d => d.sector === x)?.govt || 0), backgroundColor: '#1d4ed8', borderRadius: 4, borderSkipped: false, maxBarThickness: 40 },
    { label: 'Private school', data: gLabels.map(x => gv.find(d => d.sector === x)?.private || 0), backgroundColor: '#0e9f8a', borderRadius: 4, borderSkipped: false, maxBarThickness: 40 }] },
    options: { scales: { ...baseScales, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: v => fmt(v) } } } } });
}

const RENDERERS = { overview: updateOverview, people: updatePeople, households: updateHouseholds, spending: updateSpending, schemes: updateSchemes };
