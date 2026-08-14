fetch('{{MP}}/api/education/getpateducationtitles', { method: 'POST', credentials: 'same-origin' })
  .then(r => r.json()).then(data => {
    var titles = Array.isArray(data) ? data : [];
    document.getElementById('content').innerHTML = titles.length === 0 ? '<p>No education materials.</p>' :
      titles.map(t => '<div class="card">' +
        '<h3>' + t.displayName + '</h3>' +
        '<div class="meta">Assigned: ' + t.assignedDate + ' | ' + t.numTopics + ' topics</div>' +
      '</div>').join('');
  });
