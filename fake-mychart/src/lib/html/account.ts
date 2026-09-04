import { inlineScript, inlineStyle } from './assets';
import { MP, portalLayout } from './layout';

// ─── Billing ──────────────────────────────────────────────────────────
export function billingSummaryPage(accounts: Array<{
  guarantorId: string; guarantorName: string; amountDue: string; lastPaid: string; detailsId: string; detailsContext: string;
}>): string {
  const cards = accounts.map(a => `
    <div class="card col-6 ba_card">
      <h3>\u{1F4B3} Account #${a.guarantorId}</h3>
      <div class="detail">${a.guarantorName}</div>
      <div style="font-size:28px; font-weight:700; color:#c0392b; margin: 12px 0;">
        <p class="ba_card_status_due_amount moneyColor">${a.amountDue}</p>
      </div>
      <div class="meta ba_card_status_due_label">Amount Due</div>
      <p class="meta ba_card_status_recentPaymentLabel">
        <a href="${MP()}/Billing/Details?ID=${a.detailsId}&Context=${a.detailsContext}&tab=3" title="View payment history">${a.lastPaid}</a>
      </p>
      <div class="meta" style="margin-top:8px;">
        <span class="ba_card_header_saLabel ba_card_header_saLabel_saName">Springfield Nuclear Power Plant</span>
      </div>
      <p class="ba_card_header_account_idAndType" style="display:none">Guarantor #${a.guarantorId} (${a.guarantorName})</p>
    </div>
  `).join('');
  return portalLayout('Billing', 'Billing/Summary', `<h1>Billing</h1>${cards}`);
}

export function billingDetailsPage(encId: string): string {
  return portalLayout('Billing Details', 'Billing/Summary', `
    <h1>Billing Details</h1>
    <div id="content"><div class="loading">Loading billing details...</div></div>
    ${inlineScript('billing-details-controller.js')}
    <script>
      accountDetailsController.Initialize({ "ID": "742", "EncID": "${encId}", "EncCID": "" });
    </script>
    ${inlineScript('billing-details.js')}
  `);
}

// ─── Insurance ───────────────────────────────────────────────────────
/**
 * A shell, deliberately. On every captured instance the Insurance page's whole
 * body is an empty `<div id="coverages-list">` that the jQuery controller
 * fills from `Insurance/Coverages/GetCoverages`; no coverage is ever in the
 * markup. The page's only job for a scraper is to carry the antiforgery token.
 */
export function insurancePage(): string {
  return portalLayout('Insurance', 'Insurance', `
    <h1>Insurance Summary</h1>
    <div class="section"><div class="content"><div id="coverages-list"></div></div></div>
  `);
}

// ─── Profile / Personal Information ──────────────────────────────────
export function profilePage(): string {
  return portalLayout('Profile', 'PersonalInformation', `
    <h1>Personal Information</h1>
    <div id="content"><div class="loading">Loading profile...</div></div>
    ${inlineScript('profile.js')}
  `);
}

// ─── Emergency Contacts ──────────────────────────────────────────────
export function emergencyContactsPage(): string {
  return portalLayout('Emergency Contacts', 'EmergencyContacts', `
    <h1>Emergency Contacts</h1>
    <div id="content"><div class="loading">Loading contacts...</div></div>
    ${inlineScript('emergency-contacts.js')}
  `);
}

// ─── Settings ────────────────────────────────────────────────────────
export function settingsPage(isTotpEnabled: boolean, passkeys: Array<{ rawId: string; name: string; createdOnDevice: string; creationInstant: string; lastUsedInstant: string | null }>): string {
  const passkeyRows = passkeys.length === 0
    ? '<p>No passkeys registered.</p>'
    : '<table><tr><th>Name</th><th>Device</th><th>Created</th><th>Last Used</th><th>Actions</th></tr>' +
      passkeys.map(pk => `<tr>
        <td>${pk.name}</td>
        <td>${pk.createdOnDevice}</td>
        <td>${pk.creationInstant}</td>
        <td>${pk.lastUsedInstant || 'Never'}</td>
        <td><button class="btn btn-danger btn-sm" onclick="deletePasskey('${pk.rawId}')">Remove</button></td>
      </tr>`).join('') + '</table>';

  return portalLayout('Settings', 'Settings', `
    <h1>Settings</h1>

    <h2>Two-Factor Authentication (TOTP)</h2>
    <div class="card" id="totp-card">
      <h3>Authenticator App</h3>
      <div class="detail" id="totp-status">
        Status: <span class="badge ${isTotpEnabled ? 'badge-green' : 'badge-gray'}">${isTotpEnabled ? 'Enabled' : 'Disabled'}</span>
      </div>
      <div style="margin-top: 12px;">
        ${isTotpEnabled
          ? '<button class="btn" onclick="disableTotp()">Disable TOTP</button>'
          : '<button class="btn" onclick="setupTotp()">Enable TOTP</button>'}
      </div>
      <div id="totp-setup-area" style="margin-top: 12px; display: none;"></div>
    </div>

    <h2>Passkeys</h2>
    <div class="card" id="passkey-card">
      <h3>Registered Passkeys</h3>
      <div id="passkey-list">${passkeyRows}</div>
      <div style="margin-top: 12px;">
        <button class="btn" onclick="addPasskey()">Add Passkey</button>
      </div>
      <div id="passkey-status" style="margin-top: 10px; font-size: 13px; color: #1a5276;"></div>
    </div>

    ${inlineStyle('settings.css')}

    ${inlineScript('settings.js')}
  `);
}
