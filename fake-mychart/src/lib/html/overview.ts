import { inlineScript } from './assets';
import { MP, portalLayout } from './layout';

// ─── Home / Dashboard ──────────────────────────────────────────────────
export function homePage(name: string, dob: string, mrn: string, pcp: string): string {
  return portalLayout('Home', 'Home', `
    <div class="printheader">Name: ${name} | DOB: ${dob} | MRN: ${mrn} | PCP: ${pcp}</div>
    <h1>Welcome, ${name.split(' ')[0]}</h1>
    <div class="card-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 24px;">
      <div class="dash-card">
        <div class="dash-icon">\u{1F4C5}</div>
        <div class="dash-value">Apr 15</div>
        <div class="dash-label">Next Appointment</div>
      </div>
      <div class="dash-card">
        <div class="dash-icon">\u{1F4AC}</div>
        <div class="dash-value">2</div>
        <div class="dash-label">Messages</div>
      </div>
      <div class="dash-card">
        <div class="dash-icon">\u{1F9EA}</div>
        <div class="dash-value">3</div>
        <div class="dash-label">Recent Lab Results</div>
      </div>
      <div class="dash-card">
        <div class="dash-icon">\u{1F48A}</div>
        <div class="dash-value">4</div>
        <div class="dash-label">Active Medications</div>
      </div>
    </div>

    <h2>Quick Links</h2>
    <div class="card-grid" style="grid-template-columns: repeat(3, 1fr);">
      <a href="${MP()}/Messaging" class="card" style="text-decoration:none; color:inherit;">
        <h3>\u{1F4AC} Messages</h3>
        <div class="detail">View and send messages to your care team</div>
      </a>
      <a href="${MP()}/TestResults" class="card" style="text-decoration:none; color:inherit;">
        <h3>\u{1F9EA} Test Results</h3>
        <div class="detail">View your lab and imaging results</div>
      </a>
      <a href="${MP()}/Visits" class="card" style="text-decoration:none; color:inherit;">
        <h3>\u{1F4C5} Visits</h3>
        <div class="detail">Upcoming and past appointments</div>
      </a>
      <a href="${MP()}/Clinical/Medications" class="card" style="text-decoration:none; color:inherit;">
        <h3>\u{1F48A} Medications</h3>
        <div class="detail">Current prescriptions and refills</div>
      </a>
      <a href="${MP()}/Billing/Summary" class="card" style="text-decoration:none; color:inherit;">
        <h3>\u{1F4B3} Billing</h3>
        <div class="detail">View and pay your bills</div>
      </a>
      <a href="${MP()}/Clinical/CareTeam" class="card" style="text-decoration:none; color:inherit;">
        <h3>\u{1F468}\u200D\u2695\uFE0F Care Team</h3>
        <div class="detail">Your doctors and providers</div>
      </a>
    </div>
  `);
}

// ─── Messages ─────────────────────────────────────────────────────────
export function messagesPage(): string {
  return portalLayout('Messages', 'Messaging', `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
      <h1 style="margin-bottom:0">Messages</h1>
      <button onclick="showCompose()" style="padding:10px 20px; background:#1a5276; color:#fff; border:none; border-radius:6px; font-size:14px; font-weight:600; cursor:pointer;">New Message</button>
    </div>

    <!-- Compose new message form -->
    <div id="compose" class="msg-thread">
      <h2>New Message</h2>
      <div style="margin-bottom:12px;">
        <label style="display:block; font-size:13px; font-weight:600; margin-bottom:4px;">To:</label>
        <select id="composeRecipient" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:14px;">
          <option value="">Loading providers...</option>
        </select>
      </div>
      <div style="margin-bottom:12px;">
        <label style="display:block; font-size:13px; font-weight:600; margin-bottom:4px;">Topic:</label>
        <select id="composeTopic" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:14px;">
          <option value="">Loading topics...</option>
        </select>
      </div>
      <div style="margin-bottom:12px;">
        <label style="display:block; font-size:13px; font-weight:600; margin-bottom:4px;">Subject:</label>
        <input type="text" id="composeSubject" placeholder="Enter a subject" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:14px;" />
      </div>
      <div style="margin-bottom:12px;">
        <label style="display:block; font-size:13px; font-weight:600; margin-bottom:4px;">Message:</label>
        <textarea id="composeBody" rows="5" placeholder="Type your message..." style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:14px; resize:vertical;"></textarea>
      </div>
      <div style="display:flex; gap:8px;">
        <button onclick="sendNewMessage()" style="padding:10px 20px; background:#1a5276; color:#fff; border:none; border-radius:6px; font-size:14px; font-weight:600; cursor:pointer;">Send</button>
        <button onclick="hideCompose()" style="padding:10px 20px; background:#eee; color:#333; border:1px solid #ccc; border-radius:6px; font-size:14px; cursor:pointer;">Cancel</button>
      </div>
    </div>

    <div id="content"><div class="loading">Loading messages...</div></div>

    <!-- Thread view with reply -->
    <div id="thread" class="msg-thread"></div>

    ${inlineScript('messages.js')}
  `);
}

// ─── Visits ──────────────────────────────────────────────────────────
export function visitsPage(): string {
  return portalLayout('Visits', 'Visits', `
    <h1>Visits</h1>
    <div class="tabs">
      <div class="tab active" id="tab-upcoming" onclick="showTab('upcoming')">Upcoming</div>
      <div class="tab" id="tab-past" onclick="showTab('past')">Past</div>
    </div>
    <div id="content"><div class="loading">Loading visits...</div></div>
    ${inlineScript('visits.js')}
  `);
}
