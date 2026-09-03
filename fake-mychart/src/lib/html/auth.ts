import { generateCsrfToken } from '@/lib/csrf';

import { inlineScript, inlineStyle } from './assets';
import { MP, basePageShell } from './layout';
import { preloginMnemonicsScript } from './prelogin';

// ─── Login Page ──────────────────────────────────────────────────────
export function loginPage(): string {
  const token = generateCsrfToken();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <title>MyChart - Login Page</title>
  <meta charset="utf-8" />
  ${inlineStyle('portal.css', 'login.css')}
  <noscript><meta class="noscript-meta" http-equiv="refresh" content="0;url=${MP()}/nojs.asp" /></noscript>
</head>
<body class="loginPage isPrelogin">
  <div class='hidden' style='display:none' id='__CSRFContainer'><input name="__RequestVerificationToken" type="hidden" value="${token}" /></div>
  ${preloginMnemonicsScript()}
  <div class="login-box">
    <div class="logo">My<span>Chart</span></div>
    <div class="subtitle">Springfield General Hospital</div>
    <div class="demo-creds">
      <div class="demo-title">Demo Credentials</div>
      Username: <code>homer</code> &nbsp; Password: <code>donuts123</code><br>
      Username: <code>marge</code> &nbsp; Password: <code>donuts123</code> &nbsp; 2FA: <code>123456</code>
      <div class="demo-note">This is a fake MyChart server with fictional Simpson family data for testing and development. The <code>marge</code> account has TOTP enabled; use the 2FA code above. Visit <code>/reset</code> to wipe all in-memory state (sessions, sent messages, booked appointments, etc.) back to the seed.</div>
    </div>
    <div class="error" id="errorMsg">Invalid username or password.</div>
    <form autocomplete="off" method="post" action="#" id="loginForm">
      <label for="Login">Username</label>
      <input type="text" id="Login" name="Login" maxlength="128" autocomplete="username webauthn" placeholder="Enter your username">
      <label for="Password">Password</label>
      <input type="password" id="Password" name="Password" autocomplete="current-password webauthn" placeholder="Enter your password">
      <button type="submit" id="submit">Sign In</button>
    </form>
    <div style="text-align:center; margin: 14px 0 0 0; color:#888; font-size:12px;">— or —</div>
    <button id="passkeyBtn" type="button" style="width:100%; padding:11px; margin-top:10px; background:#fff; color:#1a5276; border:1px solid #1a5276; border-radius:6px; font-size:15px; font-weight:600; cursor:pointer;">Sign in with Passkey</button>
    <div id="passkeyStatus" style="margin-top:10px; font-size:13px; color:#c0392b; display:none;"></div>
    <form class="hidden" style="display:none" action="${MP()}/Authentication/Login/DoLogin" autocomplete="off" id="actualLogin" method="post">
      <input name="__RequestVerificationToken" type="hidden" value="${token}" />
    </form>
  </div>
  <div id='__PerformanceTrackingSettings' class='hidden' style='display:none'>
    <input name='__NavigationRequestMetrics' value='["fake-metrics"]' type='hidden' autocomplete='off' />
    <input name='__NavigationRedirectMetrics' value='[]' type='hidden' autocomplete='off' />
    <input name='__RedirectChainIncludesLogin' value='0' type='hidden' autocomplete='off' />
    <input name='__CurrentPageLoadDescriptor' value='' type='hidden' autocomplete='off' />
    <input name='__RttCaptureEnabled' value='1' type='hidden' autocomplete='off' />
  </div>
  <script src="${MP()}/areas/authentication/scripts/controllers/loginpagecontroller.min.js" type="text/javascript"></script>
  ${inlineScript('login.js')}
</body>
</html>`;
}

export function loginPageControllerJs(): string {
  return `(function() {
  var LoginPageController = function() {
    this.Credentials = { Username: "", Password: "" };
  };
  new LoginPageController();
})();`;
}

export function doLoginSuccess(): string {
  const token = generateCsrfToken();
  return `<html><body class="md_home_index">
  <input name="__RequestVerificationToken" type="hidden" value="${token}" />
  <div>Login successful</div>
</body></html>`;
}

export function doLoginNeed2FA(): string {
  const token = generateCsrfToken();
  return `<html><body>
  <input name="__RequestVerificationToken" type="hidden" value="${token}" />
  <div>secondaryvalidationcontroller</div>
</body></html>`;
}

export function doLoginFailed(): string {
  return `<html><body><div> login failed</div></body></html>`;
}

/**
 * Returns which 2FA delivery methods the fake MyChart should offer.
 * Controlled by the FAKE_MYCHART_2FA_METHODS env var:
 *   - "email"     → only email
 *   - "sms"       → only SMS/phone
 *   - "email,sms" → both (default)
 */
export function get2faMethods(): { email: boolean; sms: boolean } {
  const methods = (process.env.FAKE_MYCHART_2FA_METHODS || 'email,sms').toLowerCase();
  return {
    email: methods.includes('email'),
    sms: methods.includes('sms'),
  };
}

export function secondaryValidationPage(): string {
  const token = generateCsrfToken();
  const methods = get2faMethods();

  // Build method buttons matching real MyChart's structure
  let methodButtons = '';
  if (methods.email) {
    methodButtons += `<button type="button" class="method-btn" data-method="email">Email to me</button>\n`;
  }
  if (methods.sms) {
    methodButtons += `<button type="button" class="method-btn" data-method="sms">Text to my phone</button>\n`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head><title>MyChart - Verification</title>
${inlineStyle('portal.css', 'secondary-validation.css')}
</head>
<body>
  <input name="__RequestVerificationToken" type="hidden" value="${token}" style="display:none" />
  <div>secondaryvalidationcontroller</div>
  <div class="verify-box">
    <h2>Verify your identity</h2>
    <p>Choose how to receive your security code.</p>
    <div id="methodSelection">
      ${methodButtons}
    </div>
    <div id="codeEntry" class="hidden">
      <p id="sentMessage"></p>
      <form id="verifyForm">
        <input type="text" id="code" name="code" maxlength="6" autocomplete="one-time-code" placeholder="000000">
        <button type="submit">Verify</button>
      </form>
    </div>
  </div>
  ${inlineScript('secondary-validation.js')}
</body></html>`;
}

// ─── Terms & Conditions ──────────────────────────────────────────────
export function termsConditionsPage(): string {
  const token = generateCsrfToken();
  return `<!DOCTYPE html>
<html lang="en">
<head><title>MyChart - Terms and Conditions</title></head>
<body>
  <div>Terms and Conditions</div>
  <p>Please review and accept the MyChart Terms and Conditions to continue.</p>
  <form method="POST" action="${MP()}/Authentication/TermsConditions">
    <input name="__RequestVerificationToken" type="hidden" value="${token}" />
    <p>By clicking Accept, you agree to the MyChart Terms of Use and Privacy Policy.</p>
    <button type="submit">I Accept</button>
  </form>
</body></html>`;
}

// ─── Token-only pages (backward compat for scrapers) ──────────────────
export function csrfTokenPage(): string {
  const token = generateCsrfToken();
  return `<html><body><input name="__RequestVerificationToken" type="hidden" value="${token}" /></body></html>`;
}

export function genericTokenPage(title: string): string {
  return basePageShell(title, '<div></div>');
}
