fetch('{{MP}}/api/histories/loadhistoriesviewmodel', { method: 'POST', credentials: 'same-origin' })
  .then(r => r.json()).then(data => {
    var html = '';
    if (data.medicalHistory) {
      html += '<h2>Diagnoses</h2><table><tr><th>Diagnosis</th><th>Date</th></tr>' +
        (data.medicalHistory.diagnoses || []).map(d => '<tr><td><strong>' + d.diagnosisName + '</strong></td><td>' + d.diagnosisDate + '</td></tr>').join('') + '</table>';
      if (data.medicalHistory.medicalHistoryNotes) html += '<div class="card"><div class="detail">' + data.medicalHistory.medicalHistoryNotes + '</div></div>';
    }
    if (data.surgicalHistory) {
      html += '<h2>Surgical History</h2><table><tr><th>Surgery</th><th>Date</th></tr>' +
        (data.surgicalHistory.surgeries || []).map(s => '<tr><td><strong>' + s.surgeryName + '</strong></td><td>' + s.surgeryDate + '</td></tr>').join('') + '</table>';
    }
    if (data.familyHistoryAndStatus) {
      html += '<h2>Family History</h2><table><tr><th>Relationship</th><th>Status</th><th>Conditions</th></tr>' +
        (data.familyHistoryAndStatus.familyMembers || []).map(f => '<tr><td><strong>' + f.relationshipToPatientName + '</strong></td><td>' + f.statusName + '</td><td>' + (f.conditions || []).join(', ') + '</td></tr>').join('') + '</table>';
    }
    document.getElementById('content').innerHTML = html || '<p>No medical history available.</p>';
  });
