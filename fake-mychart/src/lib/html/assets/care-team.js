Promise.all([
  fetch('{{MP}}/Clinical/CareTeam/Load', { method: 'POST', credentials: 'same-origin' }).then(r => r.json()),
  fetch('{{MP}}/Clinical/CareTeam/LoadExternal', { method: 'POST', credentials: 'same-origin' }).then(r => r.json()),
]).then(([internal, external]) => {
  function cards(providers) {
    return (providers || []).map(p =>
      '<div class="card careteam-provider">' +
      '<h3 class="provider-name">' + p.Name + '</h3>' +
      '<div class="detail provider-role">' + p.Relation + '</div>' +
      '<div class="meta provider-specialty">' + p.Specialty + '</div>' +
      '</div>'
    ).join('');
  }
  var providers = internal.ProvidersList || [];
  var outside = external.ProvidersList || [];
  var html = providers.length === 0
    ? '<p>No care team providers.</p>'
    : '<div class="card-grid">' + cards(providers) + '</div>';
  if (outside.length > 0) {
    html += '<h2>' + (external.DescriptiveTitle || 'Outside providers') + '</h2>' +
      '<div class="card-grid">' + cards(outside) + '</div>';
  }
  document.getElementById('content').innerHTML = html;
});
