function loadResults(groupType, tabEl) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if (tabEl) tabEl.classList.add('active');
  document.getElementById('detail').classList.remove('visible');
  document.getElementById('detail').innerHTML = '';
  fetch('{{MP}}/api/test-results/getlist', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupType: groupType })
  }).then(r => r.json()).then(data => {
    var groups = data.newResultGroups || [];
    var results = data.newResults || {};
    if (groups.length === 0) {
      document.getElementById('content').innerHTML = '<p>No results found.</p>';
      return;
    }
    document.getElementById('content').innerHTML = '<table><tr><th>Test</th><th>Date</th><th>Provider</th><th>Status</th></tr>' +
      groups.map(g => {
        var rKey = g.resultList[0] + '^';
        var r = results[rKey];
        var name = r ? r.name : g.key;
        var abnormal = r && r.isAbnormal;
        return '<tr style="cursor:pointer" onclick="loadDetail(\'' + g.key + '\')">' +
          '<td><strong' + (abnormal ? ' class="abnormal"' : '') + '>' + name + '</strong></td>' +
          '<td>' + g.formattedDate + '</td>' +
          '<td>' + (r ? r.orderMetadata.orderProviderName : '') + '</td>' +
          '<td>' + (abnormal ? '<span class="badge badge-red">Abnormal</span>' : '<span class="badge badge-green">Normal</span>') + '</td></tr>';
      }).join('') + '</table>';
  });
}
function loadDetail(orderKey) {
  fetch('{{MP}}/api/test-results/getdetails', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderKey: orderKey })
  }).then(r => r.json()).then(data => {
    var detail = document.getElementById('detail');
    var res = data.results && data.results[0];
    if (!res) { detail.innerHTML = '<p>No details available.</p>'; detail.classList.add('visible'); return; }
    var html = '<h2>' + (data.orderName || res.name) + '</h2>';
    html += '<div class="meta">' + res.orderMetadata.resultTimestampDisplay + ' | ' + res.orderMetadata.orderProviderName + '</div>';
    if (res.resultComponents && res.resultComponents.length > 0) {
      html += '<table style="margin-top:12px"><tr><th>Component</th><th>Value</th><th>Reference Range</th><th>Status</th></tr>';
      res.resultComponents.forEach(c => {
        var abnormal = c.componentResultInfo.abnormalFlagCategoryValue > 1;
        html += '<tr><td>' + c.componentInfo.name + '</td><td' + (abnormal ? ' class="abnormal"' : '') + '><strong>' + c.componentResultInfo.value + ' ' + c.componentInfo.units + '</strong></td><td>' + c.componentResultInfo.referenceRange.formattedReferenceRange + '</td><td>' + (abnormal ? '<span class="badge badge-red">Abnormal</span>' : '<span class="badge badge-green">Normal</span>') + '</td></tr>';
      });
      html += '</table>';
    }
    if (res.studyResult && res.studyResult.narrative && res.studyResult.narrative.hasContent) {
      html += '<h3 style="margin-top:16px">Findings</h3><div class="card"><div class="detail">' + res.studyResult.narrative.contentAsString + '</div></div>';
    }
    if (res.studyResult && res.studyResult.impression && res.studyResult.impression.hasContent) {
      html += '<h3>Impression</h3><div class="card"><div class="detail">' + res.studyResult.impression.contentAsString + '</div></div>';
    }
    if (res.imageStudies && res.imageStudies.length > 0) {
      html += '<h3>Images</h3>';
      res.imageStudies.forEach(img => {
        html += '<div class="card"><strong>' + img.studyDescription + '</strong><div class="meta">' + img.studyDate + ' | ' + img.numberOfImages + ' images | Modality: ' + img.modality + '</div></div>';
      });
    }
    detail.innerHTML = html;
    detail.classList.add('visible');
  });
}
loadResults(1, null);
