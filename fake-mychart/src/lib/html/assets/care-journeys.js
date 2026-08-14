fetch('{{MP}}/api/care-journeys/getcarejourneys', { method: 'POST', credentials: 'same-origin' })
  .then(r => r.json()).then(data => {
    var cjs = data.careJourneys || [];
    document.getElementById('content').innerHTML = cjs.length === 0 ? '<p>No care journeys.</p>' :
      cjs.map(cj => '<div class="card">' +
        '<h3>' + cj.name + '</h3>' +
        '<div class="detail">' + cj.description + '</div>' +
        '<div class="meta"><span class="badge badge-green">' + cj.status + '</span> | ' + cj.providerName + '</div>' +
      '</div>').join('');
  });
