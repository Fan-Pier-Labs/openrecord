function b64ToBytes(b64) {
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

function routeAfterLogin(html) {
  if (html.indexOf('md_home_index') !== -1) {
    window.location.href = '{{MP}}/Home';
  } else if (html.indexOf('secondaryvalidationcontroller') !== -1) {
    window.location.href = '{{MP}}/Authentication/SecondaryValidation';
  } else {
    return false;
  }
  return true;
}

document.getElementById('loginForm').addEventListener('submit', function(e) {
  e.preventDefault();
  var user = document.getElementById('Login').value;
  var pass = document.getElementById('Password').value;
  var token = document.querySelector('#__CSRFContainer input[name=__RequestVerificationToken]').value;
  var loginInfo = JSON.stringify({ Credentials: { Username: btoa(user), Password: btoa(pass) } });
  var body = '__RequestVerificationToken=' + encodeURIComponent(token) + '&LoginInfo=' + encodeURIComponent(loginInfo);
  fetch('{{MP}}/Authentication/Login/DoLogin', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body, credentials: 'same-origin'
  }).then(function(r) { return r.text(); }).then(function(html) {
    if (!routeAfterLogin(html)) {
      document.getElementById('errorMsg').style.display = 'block';
    }
  });
});

document.getElementById('passkeyBtn').addEventListener('click', async function() {
  var statusEl = document.getElementById('passkeyStatus');
  statusEl.style.display = 'none';
  statusEl.textContent = '';
  if (!window.PublicKeyCredential || !navigator.credentials) {
    statusEl.style.display = 'block';
    statusEl.textContent = 'WebAuthn is not available in this browser.';
    return;
  }
  try {
    var paramsResp = await fetch('{{MP}}/Authentication/Login/GetPasskeyGetParams?force=true&noCache=' + Math.random(), {
      method: 'POST', credentials: 'same-origin', body: ''
    }).then(function(r) { return r.json(); });
    if (!paramsResp.Success || !paramsResp.PasskeyGetParams) {
      statusEl.style.display = 'block';
      statusEl.textContent = 'No passkeys are registered yet. Sign in with a password and add one in Settings.';
      return;
    }
    var get = paramsResp.PasskeyGetParams;
    if (!get.AllowCredentials || get.AllowCredentials.length === 0) {
      statusEl.style.display = 'block';
      statusEl.textContent = 'No passkeys are registered yet. Sign in with a password and add one in Settings.';
      return;
    }
    var publicKey = {
      challenge: b64ToBytes(get.Challenge),
      timeout: get.Timeout || 60000,
      rpId: get.RpId || window.location.hostname,
      userVerification: (get.UserVerification || 'preferred').toLowerCase(),
      allowCredentials: get.AllowCredentials.map(function(c) {
        return { type: c.type, id: b64ToBytes(c.id) };
      })
    };
    var assertion = await navigator.credentials.get({ publicKey: publicKey });
    if (!assertion) {
      statusEl.style.display = 'block';
      statusEl.textContent = 'Passkey sign-in was cancelled.';
      return;
    }
    var loginInfo = JSON.stringify({
      Type: 'PasskeyLogin',
      Credentials: {
        id: assertion.id,
        type: 'public-key',
        rawId: bytesToB64(assertion.rawId),
        authenticatorAssertion: {
          clientDataJSON: bytesToB64(assertion.response.clientDataJSON),
          authenticatorData: bytesToB64(assertion.response.authenticatorData),
          signature: bytesToB64(assertion.response.signature),
          userHandle: assertion.response.userHandle ? bytesToB64(assertion.response.userHandle) : ''
        }
      }
    });
    var token = document.querySelector('#__CSRFContainer input[name=__RequestVerificationToken]').value;
    var body = '__RequestVerificationToken=' + encodeURIComponent(token) + '&LoginInfo=' + encodeURIComponent(loginInfo);
    var html = await fetch('{{MP}}/Authentication/Login/DoLogin', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    }).then(function(r) { return r.text(); });
    if (!routeAfterLogin(html)) {
      statusEl.style.display = 'block';
      statusEl.textContent = 'Passkey sign-in was rejected by the server.';
    }
  } catch (e) {
    statusEl.style.display = 'block';
    statusEl.textContent = 'Passkey sign-in failed: ' + (e && e.message ? e.message : e);
  }
});
