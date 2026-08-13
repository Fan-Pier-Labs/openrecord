var visitData = {};
function showTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  renderVisits(tab);
}
function renderVisits(tab) {
  var visits = tab === 'upcoming' ? (visitData.upcoming || []) : (visitData.past || []);
  if (visits.length === 0) {
    document.getElementById('content').innerHTML = '<p>No ' + tab + ' visits.</p>';
    return;
  }
  document.getElementById('content').innerHTML = visits.map(v => {
    var d = new Date(v.PrimaryDate);
    return '<div class="card">' +
      '<h3>' + v.VisitType + '</h3>' +
      '<div class="detail">' + d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + '</div>' +
      '<div class="meta">' + (v.Providers || []).map(p => p.Name).join(', ') + '</div>' +
      '<div class="meta">📍 ' + v.Location + '</div>' +
      (v.LocationAddress ? '<div class="meta">' + v.LocationAddress + '</div>' : '') +
    '</div>';
  }).join('');
}
Promise.all([
  fetch('{{MP}}/Visits/VisitsList/LoadUpcoming', { method: 'POST', credentials: 'same-origin' }).then(r => r.json()),
  fetch('{{MP}}/Visits/VisitsList/LoadPast', { method: 'POST', credentials: 'same-origin' }).then(r => r.json()),
]).then(([up, past]) => {
  visitData.upcoming = (up.InProgressVisits || []).concat(up.NextNDaysVisits || [], up.LaterVisitsList || []);
  // LoadPast now returns the real MyChart shape: visits live under
  // List[orgId].List (one page). Flatten across orgs for the demo view.
  visitData.past = Object.values(past.List || {}).flatMap(o => o.List || []);
  renderVisits('upcoming');
});
