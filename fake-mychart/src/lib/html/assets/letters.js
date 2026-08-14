fetch('{{MP}}/api/letters/getletterslist', { method: 'POST', credentials: 'same-origin' })
  .then(r => r.json()).then(data => {
    var letters = data.letters || [];
    var users = data.users || {};
    document.getElementById('content').innerHTML = letters.length === 0 ? '<p>No letters.</p>' :
      letters.map(l => {
        var provider = users[l.empId] ? users[l.empId].name : '';
        var d = new Date(l.dateISO);
        return '<div class="card" style="cursor:pointer" onclick="loadLetter(\'' + l.hnoId + '\')">' +
          '<h3>' + l.reason + '</h3>' +
          '<div class="meta">' + provider + ' | ' + d.toLocaleDateString() + '</div>' +
          (!l.viewed ? '<span class="badge badge-blue">New</span>' : '') +
        '</div>';
      }).join('');
  });
function loadLetter(hnoId) {
  fetch('{{MP}}/api/letters/getletterdetails', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hnoId: hnoId })
  }).then(r => r.json()).then(data => {
    var el = document.getElementById('letterDetail');
    el.innerHTML = '<div class="letter-body">' + (data.bodyHTML || '<p>No content.</p>') + '</div>';
    el.classList.add('visible');
    el.scrollIntoView({ behavior: 'smooth' });
  });
}
