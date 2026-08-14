Promise.all([
  fetch('{{MP}}/api/goals/loadcareteamgoals', { method: 'POST', credentials: 'same-origin' }).then(r => r.json()),
  fetch('{{MP}}/api/goals/loadpatientgoals', { method: 'POST', credentials: 'same-origin' }).then(r => r.json()),
]).then(([ct, pt]) => {
  var html = '<h2>Care Team Goals</h2>';
  var ctGoals = ct.careTeamGoals || [];
  html += ctGoals.map(g => {
    var badge = g.status === 'In Progress' ? 'badge-blue' : g.status === 'Completed' ? 'badge-green' : 'badge-gray';
    return '<div class="card"><h3>' + g.name + '</h3><div class="detail">' + g.description + '</div><div class="meta"><span class="badge ' + badge + '">' + g.status + '</span> | Target: ' + g.targetDate + '</div></div>';
  }).join('');
  html += '<h2>My Goals</h2>';
  var ptGoals = pt.patientGoals || [];
  html += ptGoals.map(g => {
    var badge = g.status === 'In Progress' ? 'badge-blue' : g.status === 'Completed' ? 'badge-green' : 'badge-gray';
    return '<div class="card"><h3>' + g.name + '</h3><div class="detail">' + g.description + '</div><div class="meta"><span class="badge ' + badge + '">' + g.status + '</span> | Target: ' + g.targetDate + '</div></div>';
  }).join('');
  document.getElementById('content').innerHTML = html;
});
