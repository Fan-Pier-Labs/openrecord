fetch('{{MP}}/api/referrals/listreferrals', { method: 'POST', credentials: 'same-origin' })
  .then(r => r.json()).then(data => {
    var refs = data.referralList || [];
    document.getElementById('content').innerHTML = refs.length === 0 ? '<p>No referrals.</p>' :
      refs.map(r => '<div class="card">' +
        '<h3>Referral to ' + r.referredToProviderName + '</h3>' +
        '<div class="detail">' + r.referredToFacility + '</div>' +
        '<div class="meta">Referred by: ' + r.referredByProviderName + ' | Created: ' + r.creationDate + '</div>' +
        '<div class="meta"><span class="badge badge-green">' + r.statusString + '</span> | Valid: ' + r.start + ' - ' + r.end + '</div>' +
      '</div>').join('');
  });
