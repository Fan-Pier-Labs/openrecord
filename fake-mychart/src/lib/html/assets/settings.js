var csrfToken = document.querySelector('input[name="__RequestVerificationToken"]').value;
var headers = { 'Content-Type': 'application/json', '__RequestVerificationToken': csrfToken };

function setupTotp() {
  var area = document.getElementById('totp-setup-area');
  area.style.display = 'block';
  area.innerHTML = '<p>Verifying password...</p>';
  fetch('{{MP}}/api/secondary-validation/VerifyPasswordAndUpdateContact', {
    method: 'POST', credentials: 'same-origin', headers: headers,
    body: JSON.stringify({ Password: '' })
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (!data.IsPasswordValid) { area.innerHTML = '<p style="color:red;">Invalid password.</p>'; return; }
    area.innerHTML = '<p>Fetching QR code...</p>';
    return fetch('{{MP}}/api/secondary-validation/TotpQrCode', {
      method: 'POST', credentials: 'same-origin', headers: headers, body: '{}'
    }).then(function(r) { return r.json(); }).then(function(qr) {
      var secret = qr.encodedSecretKey || qr.EncodedSecretKey || '';
      area.innerHTML = '<p>Secret: <code>' + secret + '</code></p>' +
        '<input id="totp-code" placeholder="Enter 6-digit code" style="padding:6px;margin:8px 0;">' +
        '<button class="btn" onclick="verifyTotp()">Verify & Enable</button>';
    });
  });
}

function verifyTotp() {
  var code = document.getElementById('totp-code').value;
  fetch('{{MP}}/api/secondary-validation/VerifyCode', {
    method: 'POST', credentials: 'same-origin', headers: headers,
    body: JSON.stringify({ Code: code })
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (!data.Success) { alert('Invalid code'); return; }
    return fetch('{{MP}}/api/secondary-validation/UpdateTwoFactorTotpOptInStatus', {
      method: 'POST', credentials: 'same-origin', headers: headers, body: '{}'
    }).then(function() { location.reload(); });
  });
}

function disableTotp() {
  if (!confirm('Disable TOTP?')) return;
  fetch('{{MP}}/api/secondary-validation/UpdateTwoFactorTotpOptInStatus', {
    method: 'POST', credentials: 'same-origin', headers: headers, body: '{}'
  }).then(function() { location.reload(); });
}

function b64ToBytes(b64) {
  // Tolerate base64url too
  b64 = String(b64).replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  var bin = atob(b64);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(buf) {
  var bin = '';
  var arr = new Uint8Array(buf);
  for (var i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

async function addPasskey() {
  var statusEl = document.getElementById('passkey-status');
  statusEl.textContent = '';
  if (!window.PublicKeyCredential || !navigator.credentials) {
    statusEl.textContent = 'WebAuthn is not available in this browser.';
    return;
  }
  try {
    var optsResp = await fetch('{{MP}}/api/passkey-management/GenerateCreateRequest', {
      method: 'POST', credentials: 'same-origin', headers: headers, body: '{}'
    }).then(function(r) { return r.json(); });
    if (!optsResp.success && !optsResp.Success) {
      statusEl.textContent = 'Failed to start registration.';
      return;
    }
    var opts = optsResp.data || optsResp.Data;
    var publicKey = {
      rp: { id: window.location.hostname, name: opts.rp.name },
      user: {
        id: b64ToBytes(opts.user.id),
        name: opts.user.name,
        displayName: opts.user.displayName
      },
      challenge: b64ToBytes(opts.challenge),
      pubKeyCredParams: opts.pubKeyCredParams,
      timeout: opts.timeout || 60000,
      attestation: opts.attestation || 'none',
      authenticatorSelection: opts.authenticatorSelection || {},
      excludeCredentials: (opts.excludeCredentials || []).map(function(c) {
        return { type: c.type, id: b64ToBytes(c.id) };
      })
    };
    statusEl.textContent = 'Follow your browser prompt to create the passkey…';
    var cred = await navigator.credentials.create({ publicKey: publicKey });
    if (!cred) { statusEl.textContent = 'No credential returned.'; return; }
    var payload = {
      rawId: bytesToB64(cred.rawId),
      attestationData: bytesToB64(cred.response.attestationObject),
      clientDataJSON: bytesToB64(cred.response.clientDataJSON),
      indexForDefaultName: (opts.excludeCredentials || []).length + 1
    };
    var saveResp = await fetch('{{MP}}/api/passkey-management/CreatePasskey', {
      method: 'POST', credentials: 'same-origin', headers: headers,
      body: JSON.stringify(payload)
    }).then(function(r) { return r.json(); });
    if (saveResp.success || saveResp.Success || saveResp.rawId) {
      location.reload();
    } else {
      statusEl.textContent = 'Server rejected the passkey: ' + (saveResp.errors ? saveResp.errors.join(', ') : 'unknown error');
    }
  } catch (e) {
    statusEl.textContent = 'Passkey registration failed: ' + (e && e.message ? e.message : e);
  }
}

function deletePasskey(rawId) {
  if (!confirm('Remove this passkey?')) return;
  fetch('{{MP}}/api/passkey-management/DeletePasskey', {
    method: 'POST', credentials: 'same-origin', headers: headers,
    body: JSON.stringify({ rawId: rawId })
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (data.success) location.reload();
    else alert('Failed to remove passkey.');
  });
}
