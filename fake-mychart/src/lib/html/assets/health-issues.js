fetch('{{MP}}/api/healthissues/loadhealthissuesdata', { method: 'POST', credentials: 'same-origin' })
  .then(r => r.json()).then(data => {
    var items = data.dataList || [];
    document.getElementById('content').innerHTML = items.length === 0 ? '<p>No health issues on file.</p>' :
      '<table><tr><th>Condition</th><th>Date Noted</th></tr>' +
      items.map(h => '<tr><td><strong>' + h.healthIssueItem.name + '</strong></td><td>' + h.healthIssueItem.formattedDateNoted + '</td></tr>').join('') + '</table>';
  });
