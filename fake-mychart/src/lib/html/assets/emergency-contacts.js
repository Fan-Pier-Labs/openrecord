fetch('{{MP}}/api/personalinformation/getrelationships', { method: 'POST', credentials: 'same-origin' })
  .then(r => r.json()).then(data => {
    var contacts = data.contacts || [];
    document.getElementById('content').innerHTML = contacts.length === 0 ? '<p>No emergency contacts.</p>' :
      '<div class="card-grid">' + contacts.map(c => '<div class="card">' +
        '<h3>' + c.formattedName + '</h3>' +
        '<div class="detail">' + ((c.relationToPatient || {}).name || '') + '</div>' +
        '<div class="meta">📞 ' + ((((c.contactInformation || {}).phoneNumbers || [])[0] || {}).phoneNumber || '') + '</div>' +
      '</div>').join('') + '</div>';
  });
