fetch('{{MP}}/Billing/Details/GetVisits', { method: 'POST', credentials: 'same-origin' })
  .then(r => r.json()).then(data => {
    var visits = (data.Data && data.Data.InformationalVisitList) || [];
    document.getElementById('content').innerHTML = visits.map(v =>
      '<div class="card">' +
        '<h3>' + v.Description + '</h3>' +
        '<div class="detail">' + v.StartDateDisplay + '</div>' +
        '<div class="meta">' + v.Provider + ' | ' + v.Patient + '</div>' +
        '<div style="display:flex;justify-content:space-between;margin-top:12px">' +
          '<div><div class="meta">Total Charges</div><div style="font-weight:600">' + v.ChargeAmount + '</div></div>' +
          '<div><div class="meta">Insurance</div><div style="font-weight:600">' + v.InsuranceAmountDue + '</div></div>' +
          '<div><div class="meta">You Owe</div><div style="font-weight:600;color:#c0392b">' + v.SelfAmountDue + '</div></div>' +
        '</div>' +
        (v.ProcedureList ? '<table style="margin-top:12px"><tr><th>Procedure</th><th>Amount</th><th>You Owe</th></tr>' +
          v.ProcedureList.map(p => '<tr><td>' + p.Description + '</td><td>' + p.Amount + '</td><td>' + p.SelfAmountDue + '</td></tr>').join('') + '</table>' : '') +
      '</div>'
    ).join('') || '<p>No billing details available.</p>';
  });
