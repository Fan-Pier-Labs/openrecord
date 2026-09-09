fetch('{{MP}}/api/documents/viewer/loadotherdocuments', {
  method: 'POST', credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ isInitialLoad: true })
})
  .then(r => r.json()).then(data => {
    var docs = data.documents || [];
    document.getElementById('content').innerHTML = docs.length === 0 ? '<p>No documents.</p>' :
      '<table><tr><th>Document</th><th>Description</th><th>Format</th><th>Date</th></tr>' +
      docs.map(d => '<tr><td><strong>' + d.docType + '</strong>' + (d.new ? ' <span class="badge badge-blue">New</span>' : '') +
        '</td><td>' + d.docDesc + '</td><td>' + d.docExt + '</td><td>' + d.date + '</td></tr>').join('') + '</table>';
  });
