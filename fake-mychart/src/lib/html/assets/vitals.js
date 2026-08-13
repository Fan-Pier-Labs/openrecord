fetch('{{MP}}/api/track-my-health/getflowsheets', { method: 'POST', credentials: 'same-origin' })
  .then(r => r.json()).then(data => {
    var sheets = data.flowsheets || [];
    document.getElementById('content').innerHTML = sheets.map(fs =>
      '<div class="card"><h3>' + fs.name + '</h3>' +
      '<table><tr><th>Date</th><th>Value</th><th>Units</th></tr>' +
      fs.readings.map(r =>
        '<tr><td>' + r.date + '</td><td><strong>' + r.value + '</strong></td><td>' + r.units + '</td></tr>'
      ).join('') + '</table></div>'
    ).join('');
  });
