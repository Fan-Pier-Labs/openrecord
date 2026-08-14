fetch('{{MP}}/api/allergies/loadallergies', { method: 'POST', credentials: 'same-origin' })
  .then(r => r.json()).then(data => {
    var items = data.dataList || [];
    document.getElementById('content').innerHTML = items.length === 0 ? '<p>No allergies on file.</p>' :
      '<table><tr><th>Allergen</th><th>Type</th><th>Reaction</th><th>Severity</th><th>Date Noted</th></tr>' +
      items.map(a => {
        var i = a.allergyItem;
        var sev = i.severity === 'Severe' ? 'badge-red' : i.severity === 'Moderate' ? 'badge-yellow' : 'badge-green';
        return '<tr><td><strong>' + i.name + '</strong></td><td>' + i.type + '</td><td>' + i.reaction + '</td><td><span class="badge ' + sev + '">' + i.severity + '</span></td><td>' + i.formattedDateNoted + '</td></tr>';
      }).join('') + '</table>';
  });
