// Mirror of Epic's HealthAdvisoriesController: form-POST GetTopics with an
// empty registryID, then render the topics the response carries.
fetch('{{MP}}/HealthAdvisories/GetTopics', {
  method: 'POST',
  credentials: 'same-origin',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
  body: 'registryID=',
}).then(r => r.json()).then(data => {
  var topics = data.HealthAdvisoryViewModelList || [];
  document.getElementById('hm-list-activity').innerHTML = topics.map(t => {
    var badge = t.StatusCode === '100_OVERDUE' ? 'badge-red' : t.StatusCode === '500_NOTDUE' ? 'badge-yellow' : 'badge-green';
    var when = t.FormattedDueDate ? 'Due ' + t.FormattedDueDate : t.FormattedLastDoneDate ? 'Last done ' + t.FormattedLastDoneDate : '';
    return '<div class="card"><h3>' + t.Name + '</h3><div class="meta"><span class="badge ' + badge + '">' + t.Status + '</span> | ' + when + '</div></div>';
  }).join('');
});
