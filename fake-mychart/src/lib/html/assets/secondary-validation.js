var maskedEmail = 'ho***@springfield.net';
var maskedPhone = '***-***-7890';
document.querySelectorAll('.method-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var method = btn.getAttribute('data-method');
    var isEmail = method === 'email';
    var contact = isEmail ? maskedEmail : maskedPhone;
    fetch('{{MP}}/Authentication/SecondaryValidation/SendCode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'deliveryMethodEmail=' + isEmail + '&resendCode=false&workflow=1',
      credentials: 'same-origin'
    }).then(function() {
      document.getElementById('methodSelection').classList.add('hidden');
      document.getElementById('codeEntry').classList.remove('hidden');
      document.getElementById('sentMessage').textContent =
        'We\'ve sent a security code to ' + contact + '.';
    });
  });
});
document.getElementById('verifyForm').addEventListener('submit', function(e) {
  e.preventDefault();
  var code = document.getElementById('code').value;
  fetch('{{MP}}/Authentication/SecondaryValidation/Validate', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'code=' + encodeURIComponent(code), credentials: 'same-origin'
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (data.Success) { window.location.href = '{{MP}}/Home'; }
    else { alert('Invalid code. Try 123456.'); }
  });
});
