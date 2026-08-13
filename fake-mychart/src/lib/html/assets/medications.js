fetch('{{MP}}/api/medications/loadmedicationspage', { method: 'POST', credentials: 'same-origin' })
  .then(r => r.json()).then(data => {
    var meds = (data.communityMembers && data.communityMembers[0] && data.communityMembers[0].prescriptionList) ? data.communityMembers[0].prescriptionList.prescriptions : [];
    document.getElementById('content').innerHTML = meds.length === 0 ? '<p>No medications found.</p>' :
      meds.map(m => '<div class="card">' +
        '<h3>' + m.name + '</h3>' +
        '<div class="detail">' + m.sig + '</div>' +
        '<div class="meta">Prescribed by ' + m.authorizingProvider.name + ' on ' + m.dateToDisplay + '</div>' +
        (m.refillDetails && m.refillDetails.isRefillable ? '<div class="meta"><span class="badge badge-green">Refillable</span> Qty: ' + m.refillDetails.writtenDispenseQuantity + ' | ' + m.refillDetails.daySupply + ' day supply</div>' : '') +
        (m.refillDetails && m.refillDetails.owningPharmacy ? '<div class="meta">🏥 ' + m.refillDetails.owningPharmacy.name + '</div>' : '') +
      '</div>').join('');
  });
