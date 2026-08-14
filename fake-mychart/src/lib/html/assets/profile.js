Promise.all([
  fetch('{{MP}}/PersonalInformation/GetContactInformation', { method: 'POST', credentials: 'same-origin' }).then(r => r.json()),
  fetch('{{MP}}/api/health-summary/fetchhealthsummary', { method: 'POST', credentials: 'same-origin' }).then(r => r.json()),
]).then(([contact, summary]) => {
  var email = contact.SecureCommunicationInfo ? contact.SecureCommunicationInfo.EmailAddress : 'N/A';
  var h = summary.header || {};
  document.getElementById('content').innerHTML =
    '<div class="card-grid">' +
      '<div class="card"><h3>Contact</h3><div class="detail">✉️ ' + email + '</div></div>' +
      '<div class="card"><h3>Demographics</h3><div class="detail">Age: ' + (h.patientAge || 'N/A') + '</div><div class="detail">Blood Type: ' + (h.bloodType || 'N/A') + '</div></div>' +
      '<div class="card"><h3>Measurements</h3><div class="detail">Height: ' + (h.height ? h.height.value : 'N/A') + '</div><div class="detail">Weight: ' + (h.weight ? h.weight.value : 'N/A') + '</div></div>' +
    '</div>';
});
