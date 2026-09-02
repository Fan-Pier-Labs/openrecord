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
  // This is the fake's own demo page (extracted from html.ts by #338), not a
  // copy of MyChart's. It used to read VisitType/Location/LocationAddress,
  // three keys that appear on NO captured instance (realShapes.ts) and existed
  // only in homer.ts. Now that the fixture sets the real fields instead, those
  // three are gone and this reads VisitTypeName/PrimaryDepartment — otherwise
  // the page renders "undefined". Date/Time come off the row rather than being
  // re-derived from PrimaryDate, which is what the row carries them for.
  document.getElementById('content').innerHTML = visits.map(v => {
    var dept = v.PrimaryDepartment || {};
    return '<div class="card">' +
      '<h3>' + v.VisitTypeName + '</h3>' +
      '<div class="detail">' + v.Date + ' at ' + v.Time + '</div>' +
      '<div class="meta">' + (v.Providers || []).map(p => p.Name).join(', ') + '</div>' +
      '<div class="meta">📍 ' + (dept.Name || '') + '</div>' +
      ((dept.Address || []).length ? '<div class="meta">' + dept.Address.join(', ') + '</div>' : '') +
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
