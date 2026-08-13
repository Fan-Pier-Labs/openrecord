fetch('{{MP}}/api/documents/viewer/loadotherdocuments', { method: 'POST', credentials: 'same-origin' })
  .then(r => r.json()).then(data => {
    var docs = data.documents || [];
    document.getElementById('content').innerHTML = docs.length === 0 ? '<p>No documents.</p>' :
      '<table><tr><th>Title</th><th>Type</th><th>Date</th><th>Provider</th><th>Organization</th></tr>' +
      docs.map(d => '<tr><td><strong>' + d.title + '</strong></td><td>' + d.documentType + '</td><td>' + d.date + '</td><td>' + d.providerName + '</td><td>' + d.organizationName + '</td></tr>').join('') + '</table>';
  });
