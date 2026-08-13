fetch('{{MP}}/api/immunizations/loadimmunizations', { method: 'POST', credentials: 'same-origin' })
  .then(r => r.json()).then(data => {
    var orgs = data.organizationImmunizationList || [];
    document.getElementById('content').innerHTML = orgs.map(org =>
      '<h2>' + org.organization.organizationName + '</h2>' +
      '<table><tr><th>Vaccine</th><th>Dates Administered</th></tr>' +
      org.orgImmunizations.map(imm =>
        '<tr><td><strong>' + imm.name + '</strong></td><td>' + imm.formattedAdministeredDates.join(', ') + '</td></tr>'
      ).join('') + '</table>'
    ).join('');
  });
