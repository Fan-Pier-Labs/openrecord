/**
 * The iOS app surface.
 *
 * A browser re-creation of `expo-app/` — the onboarding flow, the chat screen
 * with its tool-call indicator, the alerts card, the skills sheet, the insights
 * screen, the chat drawer, and settings. Close enough to the real thing to be
 * worth clicking through; not a pixel-perfect clone, and it says so.
 *
 * All screen state lives in one object so "reset demo" is a re-mount.
 */

import { el, clear, typeset, fallbackNote } from './ui.js';
import { HAS_LIVE_AI } from './config.js';
import * as data from './data.js';
import { SKILLS } from './skills.js';
import { buildAlerts } from './skills.js';
import { executeTool } from './tools.js';

const SCREENS = ['welcome', 'signin', 'picker', 'login', 'twofa', 'passkey', 'chat', 'insights', 'settings'];

export function createIosSurface({ mount, runTurn, session, onNavigate }) {
  const state = {
    screen: 'welcome',
    email: '',
    instance: data.directory[0],
    hostname: data.directory[0].hostname,
    username: '',
    password: '',
    connecting: false,
    twoFaError: '',
    drawerOpen: false,
    skillsOpen: false,
    messages: [],
    activeTool: null,
    busy: false,
    activeSkill: null,
    chatTitle: null,
    dismissedAlerts: new Set(),
    chats: data.seedChats.map((c) => ({ ...c })),
    currentChatId: null,
    searchQuery: '',
  };

  const screenEl = el('div', { class: 'ios-screen' });
  const phone = el(
    'div',
    { class: 'phone-device' },
    el('div', { class: 'phone-shell' }),
    el(
      'div',
      { class: 'phone-viewport' },
      el('div', { class: 'phone-island' }),
      el(
        'div',
        { class: 'ios-statusbar' },
        el('span', { text: '9:41' }),
        el('span', { class: 'ios-status-icons', text: '●●●  ᯤ  ▮' })
      ),
      screenEl
    )
  );

  clear(mount).append(phone);

  function go(screen) {
    if (!SCREENS.includes(screen)) throw new Error(`unknown screen: ${screen}`);
    state.screen = screen;
    state.drawerOpen = false;
    render();
    onNavigate?.(screen);
  }

  /* ---------------------------------------------------------------- *
   * Onboarding
   * ---------------------------------------------------------------- */

  function renderWelcome() {
    return el(
      'div',
      { class: 'ios-page ios-onboarding' },
      el('div', { class: 'ios-ob-body' },
        el('div', { class: 'ios-ob-mark', text: '◍' }),
        el('h1', { class: 'ios-ob-title', text: 'OpenRecord' }),
        el('p', { class: 'ios-ob-copy', text: 'Your health record, in plain language. Connect your MyChart portal and ask it anything.' })
      ),
      el('div', { class: 'ios-ob-actions' },
        el('button', { class: 'ios-btn primary', onClick: () => go('signin') }, 'Get Started'),
        el('p', { class: 'ios-fineprint', text: 'Records stay on your device. Nothing is uploaded.' })
      )
    );
  }

  function renderSignin() {
    return el(
      'div',
      { class: 'ios-page ios-onboarding' },
      el('div', { class: 'ios-ob-body' },
        el('h1', { class: 'ios-ob-title', text: 'Sign in' }),
        el('p', { class: 'ios-ob-copy', text: 'Your OpenRecord account is separate from your MyChart login — that boundary is the point.' })
      ),
      el('div', { class: 'ios-ob-actions' },
        el(
          'button',
          {
            class: 'ios-btn google',
            onClick: () => {
              state.email = 'homer.simpson@example.com';
              go('picker');
            },
          },
          el('span', { class: 'g-mark', text: 'G' }),
          'Continue with Google'
        ),
        el('button', { class: 'ios-btn ghost', onClick: () => { state.email = 'homer.simpson@example.com'; go('picker'); } }, 'Continue with email'),
        el('p', { class: 'ios-fineprint', text: 'Demo — no real account is created.' })
      )
    );
  }

  function renderPicker() {
    const list = el('div', { class: 'ios-picker-list' });
    const search = el('input', {
      class: 'ios-input',
      type: 'search',
      placeholder: 'Search health systems',
      value: state.searchQuery,
      onInput: (e) => {
        state.searchQuery = e.target.value;
        fill();
      },
    });

    function fill() {
      clear(list);
      const q = state.searchQuery.trim().toLowerCase();
      const matches = data.directory.filter((d) => !q || d.name.toLowerCase().includes(q) || d.city.toLowerCase().includes(q));
      if (matches.length === 0) {
        list.append(el('p', { class: 'ios-empty', text: 'No matches. In the real app this searches every Epic MyChart instance.' }));
        return;
      }
      for (const entry of matches) {
        const isDemo = entry.hostname === data.DEMO_HOSTNAME;
        list.append(
          el(
            'button',
            {
              class: `ios-picker-row${isDemo ? ' demo' : ''}`,
              onClick: () => {
                if (!isDemo) return;
                state.instance = entry;
                state.hostname = entry.hostname;
                go('login');
              },
              disabled: !isDemo,
            },
            el('span', { class: 'ios-picker-logo', text: entry.name.slice(0, 1) }),
            el('span', { class: 'ios-picker-text' },
              el('span', { class: 'ios-picker-name', text: entry.name }),
              el('span', { class: 'ios-picker-host', text: entry.city })
            ),
            isDemo ? el('span', { class: 'ios-pill', text: 'Demo' }) : el('span', { class: 'ios-picker-host', text: '—' })
          )
        );
      }
    }
    fill();

    return el(
      'div',
      { class: 'ios-page' },
      el('div', { class: 'ios-nav' }, el('button', { class: 'ios-nav-back', onClick: () => go('signin') }, '‹ Back'), el('span', { class: 'ios-nav-title', text: 'Your provider' }), el('span', { class: 'ios-nav-spacer' })),
      el('div', { class: 'ios-scroll' }, search, list)
    );
  }

  function renderLogin() {
    const username = el('input', { class: 'ios-input', placeholder: 'MyChart username', value: state.username, autocomplete: 'off', onInput: (e) => (state.username = e.target.value) });
    const password = el('input', { class: 'ios-input', type: 'password', placeholder: 'Password', value: state.password, onInput: (e) => (state.password = e.target.value) });
    const error = el('p', { class: 'ios-error' });
    const connect = el('button', { class: 'ios-btn primary' }, state.connecting ? 'Connecting…' : 'Connect');

    connect.addEventListener('click', async () => {
      if (!state.username.trim() || !state.password) {
        error.textContent = 'Enter the demo username and password shown above.';
        return;
      }
      error.textContent = '';
      state.connecting = true;
      connect.textContent = 'Connecting…';
      connect.disabled = true;
      await new Promise((r) => setTimeout(r, 900));
      state.connecting = false;
      go('twofa');
    });

    return el(
      'div',
      { class: 'ios-page' },
      el('div', { class: 'ios-nav' }, el('button', { class: 'ios-nav-back', onClick: () => go('picker') }, '‹ Back'), el('span', { class: 'ios-nav-title', text: 'Connect MyChart' }), el('span', { class: 'ios-nav-spacer' })),
      el(
        'div',
        { class: 'ios-scroll' },
        el('div', { class: 'ios-selected-instance' },
          el('span', { class: 'ios-picker-logo', text: state.instance.name.slice(0, 1) }),
          el('span', { class: 'ios-picker-text' },
            el('span', { class: 'ios-picker-name', text: state.instance.name }),
            el('span', { class: 'ios-picker-host', text: state.hostname })
          ),
          el('button', { class: 'ios-linkbtn', onClick: () => go('picker') }, 'Change')
        ),
        el('p', { class: 'ios-copy', text: 'Sign in to your portal. If your provider asks for a code, we handle that next — then we register a passkey so you never type this password again.' }),
        el('div', { class: 'ios-credhint' },
          el('strong', { text: 'Demo credentials' }),
          el('span', { text: `${data.DEMO_USERNAME} · donuts123` }),
          el('button', {
            class: 'ios-linkbtn',
            onClick: () => {
              state.username = data.DEMO_USERNAME;
              state.password = 'donuts123';
              username.value = state.username;
              password.value = state.password;
            },
          }, 'Fill')
        ),
        username,
        password,
        error,
        connect,
        el('p', { class: 'ios-fineprint', text: 'Credentials are stored in the device keychain, encrypted at rest.' })
      )
    );
  }

  function renderTwoFa() {
    const input = el('input', { class: 'ios-input ios-code', inputmode: 'numeric', maxlength: '6', placeholder: '000000' });
    const error = el('p', { class: 'ios-error', text: state.twoFaError });

    async function submit() {
      const result = executeTool(session, 'complete_2fa', { code: input.value });
      if (result.error) {
        error.textContent = result.error;
        return;
      }
      go('passkey');
    }

    return el(
      'div',
      { class: 'ios-page' },
      el('div', { class: 'ios-nav' }, el('button', { class: 'ios-nav-back', onClick: () => go('login') }, '‹ Back'), el('span', { class: 'ios-nav-title', text: 'Two-factor' }), el('span', { class: 'ios-nav-spacer' })),
      el(
        'div',
        { class: 'ios-scroll' },
        el('p', { class: 'ios-copy', text: 'Springfield General sent a 6-digit code to your email. Enter it to finish signing in.' }),
        el('div', { class: 'ios-credhint' }, el('strong', { text: 'Demo code' }), el('span', { text: '123456' }), el('button', { class: 'ios-linkbtn', onClick: () => (input.value = '123456') }, 'Fill')),
        input,
        error,
        el('button', { class: 'ios-btn primary', onClick: submit }, 'Verify'),
        el('p', { class: 'ios-fineprint', text: 'The real app can also read the code from a linked inbox, or generate it from a stored authenticator secret.' })
      )
    );
  }

  function renderPasskey() {
    return el(
      'div',
      { class: 'ios-page ios-onboarding' },
      el('div', { class: 'ios-ob-body' },
        el('div', { class: 'ios-ob-mark', text: '⛨' }),
        el('h1', { class: 'ios-ob-title', text: 'Set up a passkey' }),
        el('p', { class: 'ios-ob-copy', text: 'Register a passkey on your portal and future logins skip the password and the 2FA code entirely — Face ID and you are in.' })
      ),
      el('div', { class: 'ios-ob-actions' },
        el('button', {
          class: 'ios-btn primary',
          onClick: async (e) => {
            const btn = e.currentTarget;
            btn.textContent = 'Registering…';
            btn.disabled = true;
            executeTool(session, 'connect_instance', { instance: state.hostname });
            await new Promise((r) => setTimeout(r, 900));
            finishOnboarding();
          },
        }, 'Register passkey'),
        el('button', { class: 'ios-btn ghost', onClick: () => { executeTool(session, 'connect_instance', {}); finishOnboarding(); } }, 'Skip for now')
      )
    );
  }

  function finishOnboarding() {
    state.currentChatId = `chat-${Date.now()}`;
    go('chat');
  }

  /* ---------------------------------------------------------------- *
   * Chat
   * ---------------------------------------------------------------- */

  function renderAlerts() {
    const alerts = buildAlerts(session, data.billing).filter(
      (a) => !state.dismissedAlerts.has(a.id) && !(a.resolvedWhen && a.resolvedWhen(session))
    );
    if (alerts.length === 0) return null;

    const list = el('div', { class: 'ios-alert-list' });
    for (const alert of alerts) {
      list.append(
        el(
          'div',
          { class: 'ios-alert' },
          el('p', { class: 'ios-alert-title', text: alert.title }),
          el('p', { class: 'ios-alert-desc', text: alert.description }),
          el(
            'div',
            { class: 'ios-alert-actions' },
            el('button', { class: 'ios-alert-btn primary', onClick: () => send(alert.prompt) }, alert.usesAi ? `${alert.ctaLabel} with AI` : alert.ctaLabel),
            el('button', {
              class: 'ios-alert-btn',
              onClick: () => {
                state.dismissedAlerts.add(alert.id);
                render();
              },
            }, 'Ignore')
          )
        )
      );
    }

    const card = el('div', { class: 'ios-alert-card' });
    const header = el(
      'button',
      { class: 'ios-alert-header', onClick: () => { card.classList.toggle('open'); } },
      el('span', { class: 'ios-alert-badge', text: String(alerts.length) }),
      el('span', { class: 'ios-alert-heading', text: alerts.length === 1 ? '1 thing to review' : `${alerts.length} things to review` }),
      el('span', { class: 'ios-alert-chevron', text: '▸' })
    );
    card.append(header, list);
    return card;
  }

  function renderChat() {
    const body = el('div', { class: 'ios-chat-body' });

    if (state.messages.length === 0) {
      body.append(
        el(
          'div',
          { class: 'ios-chat-empty' },
          el('div', { class: 'ios-empty-hero' },
            el('h2', { class: 'ios-empty-title', text: 'OpenRecord' }),
            el('p', { class: 'ios-empty-sub', text: 'Ask anything about your health data' }),
            el('button', { class: 'ios-skill-cta', onClick: () => { state.skillsOpen = true; render(); } }, 'Run a skill ›')
          ),
          renderAlerts()
        )
      );
    } else {
      const list = el('div', { class: 'ios-messages' });
      for (const msg of state.messages) {
        if (msg.role === 'user') {
          list.append(el('div', { class: 'ios-msg user' }, el('div', { class: 'ios-bubble' }, msg.content)));
        } else {
          const bubble = el('div', { class: 'ios-msg assistant' });
          const content = el('div', { class: 'ios-markdown' });
          if (msg.content) typeset(content, msg.content);
          else content.append(el('span', { class: 'ios-thinking', text: 'Thinking…' }));
          bubble.append(content);
          if (msg.fallback) {
            bubble.append(el('p', { class: 'ios-fallback-note', text: fallbackNote(HAS_LIVE_AI) }));
          }
          list.append(bubble);
        }
      }
      if (state.activeTool) {
        list.append(el('div', { class: 'ios-toolcall' }, el('span', { class: 'ios-tool-dot' }), `Running ${state.activeTool}…`));
      }
      body.append(list);
      queueMicrotask(() => list.scrollIntoView({ block: 'end' }));
    }

    const input = el('input', {
      class: 'ios-chat-input',
      placeholder: state.busy ? 'Working…' : 'Ask about your health data',
      disabled: state.busy,
    });
    const form = el(
      'form',
      {
        class: 'ios-chat-bar',
        onSubmit: (e) => {
          e.preventDefault();
          const text = input.value.trim();
          if (!text || state.busy) return;
          input.value = '';
          send(text);
        },
      },
      input,
      el('button', { class: 'ios-send', type: 'submit', disabled: state.busy, 'aria-label': 'Send' }, '↑')
    );

    return el(
      'div',
      { class: 'ios-page' },
      el(
        'div',
        { class: 'ios-nav' },
        el('button', { class: 'ios-nav-icon', 'aria-label': 'Open menu', onClick: () => { state.drawerOpen = true; render(); } }, '≡'),
        el('span', { class: 'ios-nav-title', text: 'OpenRecord' }),
        el('button', { class: 'ios-nav-back', onClick: newChat }, 'New')
      ),
      body,
      form
    );
  }

  /* ---------------------------------------------------------------- *
   * Insights
   * ---------------------------------------------------------------- */

  function renderInsights() {
    const cards = el('div');
    for (const insight of data.memoryDigest.insights) {
      const bodyEl = el('div', { class: 'ios-insight-body' });
      typeset(bodyEl, insight.bodyMd);
      const card = el(
        'div',
        { class: `ios-insight sev-${insight.severity}` },
        el(
          'button',
          {
            class: 'ios-insight-head',
            onClick: (e) => e.currentTarget.parentElement.classList.toggle('open'),
          },
          el('span', { class: `ios-sev sev-${insight.severity}`, text: insight.severity === 'discuss_soon' ? 'Discuss soon' : insight.severity === 'discuss' ? 'Discuss' : 'FYI' }),
          el('span', { class: 'ios-insight-title', text: insight.title }),
          el('span', { class: 'ios-alert-chevron', text: '▸' })
        ),
        el(
          'div',
          { class: 'ios-insight-detail' },
          bodyEl,
          el('button', { class: 'ios-alert-btn primary', onClick: () => { go('chat'); send(insight.suggestedQuestion); } }, 'Ask about this')
        )
      );
      cards.append(card);
    }

    const summary = el('div', { class: 'ios-summary-body' });
    typeset(summary, data.memoryDigest.summaryMd);

    return el(
      'div',
      { class: 'ios-page' },
      el('div', { class: 'ios-nav' }, el('button', { class: 'ios-nav-back', onClick: () => go('chat') }, '‹ Back'), el('span', { class: 'ios-nav-title', text: 'Insights' }), el('span', { class: 'ios-nav-spacer' })),
      el(
        'div',
        { class: 'ios-scroll ios-insights' },
        el('div', { class: 'ios-summary-card' },
          el('div', { class: 'ios-summary-head' },
            el('span', { class: 'ios-section-label', text: 'Health digest' }),
            el('span', { class: 'ios-picker-host', text: `Updated ${data.memoryDigest.generatedAt}` })
          ),
          summary
        ),
        el('p', { class: 'ios-section-label', text: `Patterns to consider (${data.memoryDigest.insights.length})` }),
        cards
      ),
      el('div', { class: 'ios-footnote' }, 'AI-generated suggestions based on your records. Not medical advice. Always discuss with your doctor.')
    );
  }

  /* ---------------------------------------------------------------- *
   * Settings
   * ---------------------------------------------------------------- */

  function renderSettings() {
    const contacts = executeTool(session, 'get_emergency_contacts', {});
    return el(
      'div',
      { class: 'ios-page' },
      el('div', { class: 'ios-nav' }, el('button', { class: 'ios-nav-back', onClick: () => go('chat') }, '‹ Back'), el('span', { class: 'ios-nav-title', text: 'Settings' }), el('span', { class: 'ios-nav-spacer' })),
      el(
        'div',
        { class: 'ios-scroll' },
        el('p', { class: 'ios-section-label', text: 'Account' }),
        el('div', { class: 'ios-settings-card' },
          el('div', { class: 'ios-settings-row' }, el('span', { text: 'Signed in' }), el('span', { class: 'ios-picker-host', text: state.email || 'homer.simpson@example.com' }))
        ),

        el('p', { class: 'ios-section-label', text: 'MyChart accounts' }),
        el('div', { class: 'ios-settings-card' },
          el('div', { class: 'ios-settings-row' },
            el('span', {}, el('strong', { text: state.instance.name }), el('br'), el('span', { class: 'ios-picker-host', text: state.hostname })),
            el('span', { class: 'ios-pill green', text: session.connected ? 'Connected' : 'Offline' })
          ),
          el('div', { class: 'ios-settings-row' }, el('span', { text: 'Passkey' }), el('span', { class: 'ios-pill green', text: 'Registered' })),
          el('div', { class: 'ios-settings-row' }, el('span', { text: 'Authenticator (TOTP)' }), el('span', { class: 'ios-pill green', text: 'Enabled' }))
        ),

        el('p', { class: 'ios-section-label', text: 'AI provider' }),
        el('div', { class: 'ios-settings-card' },
          el('div', { class: 'ios-settings-row' }, el('span', { text: 'Free tier' }), el('span', { class: 'ios-pill green', text: 'Active' })),
          el('div', { class: 'ios-settings-row' }, el('span', { text: 'Monthly spend' }), el('span', { class: 'ios-picker-host', text: '$0.42 of $50.00' })),
          el('div', { class: 'ios-settings-row' }, el('span', { text: 'Bring your own key' }), el('span', { class: 'ios-picker-host', text: 'Anthropic · OpenAI · Gemini' }))
        ),

        el('p', { class: 'ios-section-label', text: 'Emergency contacts' }),
        el('div', { class: 'ios-settings-card' },
          ...contacts.map((c) =>
            el('div', { class: 'ios-settings-row' },
              el('span', {}, el('strong', { text: c.name }), el('br'), el('span', { class: 'ios-picker-host', text: `${c.relationship} · ${c.phone}` })),
              c.addedThisSession ? el('span', { class: 'ios-pill green', text: 'Added' }) : el('span', { class: 'ios-picker-host', text: c.id })
            )
          )
        ),
        el('p', { class: 'ios-fineprint', text: 'Ask the assistant to add, update, or remove a contact and watch this list change.' })
      )
    );
  }

  /* ---------------------------------------------------------------- *
   * Overlays
   * ---------------------------------------------------------------- */

  function renderDrawer() {
    if (!state.drawerOpen) return null;
    const rows = state.chats.map((chat) =>
      el('button', { class: `ios-drawer-chat${chat.id === state.currentChatId ? ' active' : ''}`, onClick: () => { state.drawerOpen = false; render(); } }, chat.title)
    );
    return el(
      'div',
      { class: 'ios-overlay', onClick: (e) => { if (e.target === e.currentTarget) { state.drawerOpen = false; render(); } } },
      el(
        'div',
        { class: 'ios-drawer' },
        el('button', { class: 'ios-drawer-new', onClick: newChat }, '+  New Chat'),
        el('input', { class: 'ios-input small', placeholder: 'Search' }),
        el('div', { class: 'ios-drawer-list' }, ...rows),
        el('button', { class: 'ios-drawer-link', onClick: () => go('insights') }, '✦  Insights'),
        el('button', { class: 'ios-drawer-link', onClick: () => go('settings') }, '⚙︎  Settings')
      )
    );
  }

  function renderSkillsSheet() {
    if (!state.skillsOpen) return null;
    return el(
      'div',
      { class: 'ios-overlay bottom', onClick: (e) => { if (e.target === e.currentTarget) { state.skillsOpen = false; render(); } } },
      el(
        'div',
        { class: 'ios-sheet' },
        el('div', { class: 'ios-sheet-handle' }),
        el('h3', { class: 'ios-sheet-title', text: 'Run a skill' }),
        el('p', { class: 'ios-sheet-sub', text: 'Pre-built playbooks the assistant runs end-to-end.' }),
        ...SKILLS.map((skill) =>
          el(
            'button',
            {
              class: 'ios-sheet-row',
              onClick: () => {
                state.skillsOpen = false;
                state.activeSkill = skill;
                send(skill.kickoffMessage);
              },
            },
            el('span', { class: 'ios-sheet-icon', text: skill.icon }),
            el('span', { class: 'ios-sheet-text' },
              el('span', { class: 'ios-sheet-row-title', text: skill.title }),
              el('span', { class: 'ios-sheet-row-desc', text: skill.description })
            )
          )
        ),
        el('button', { class: 'ios-btn ghost', onClick: () => { state.skillsOpen = false; render(); } }, 'Cancel')
      )
    );
  }

  /* ---------------------------------------------------------------- *
   * Turn handling
   * ---------------------------------------------------------------- */

  function newChat() {
    state.messages = [];
    state.activeSkill = null;
    state.activeTool = null;
    state.currentChatId = `chat-${Date.now()}`;
    state.drawerOpen = false;
    if (state.screen !== 'chat') go('chat');
    else render();
  }

  async function send(text) {
    if (state.busy) return;
    if (state.screen !== 'chat') go('chat');

    state.messages.push({ role: 'user', content: text });
    const assistant = { role: 'assistant', content: '' };
    state.messages.push(assistant);
    state.busy = true;
    render();

    const history = state.messages
      .slice(0, -2)
      .filter((m) => m.content)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const result = await runTurn({
        userText: text,
        history,
        surface: 'ios',
        skillAddition: state.activeSkill?.playbook ?? null,
        memoryDigest: data.memoryDigest.summaryMd,
        callbacks: {
          onToolStart: (call) => {
            state.activeTool = call.tool;
            render();
          },
          onToolEnd: () => {
            state.activeTool = null;
            render();
          },
        },
      });
      assistant.content = result.text;
      assistant.fallback = result.usedFallback;
      if (!state.chatTitle) {
        state.chatTitle = text.slice(0, 42);
        state.chats.unshift({ id: state.currentChatId, title: state.chatTitle, updatedAt: 'just now' });
      }
    } catch (err) {
      assistant.content = `Something went wrong: ${err.message}`;
    } finally {
      state.busy = false;
      state.activeTool = null;
      render();
    }
  }

  /* ---------------------------------------------------------------- *
   * Render
   * ---------------------------------------------------------------- */

  const RENDERERS = {
    welcome: renderWelcome,
    signin: renderSignin,
    picker: renderPicker,
    login: renderLogin,
    twofa: renderTwoFa,
    passkey: renderPasskey,
    chat: renderChat,
    insights: renderInsights,
    settings: renderSettings,
  };

  function render() {
    clear(screenEl);
    screenEl.append(RENDERERS[state.screen]());
    const drawer = renderDrawer();
    if (drawer) screenEl.append(drawer);
    const sheet = renderSkillsSheet();
    if (sheet) screenEl.append(sheet);
  }

  render();

  return {
    state,
    send,
    go,
    /** Jump straight past onboarding — used by the "skip setup" shortcut. */
    skipOnboarding() {
      executeTool(session, 'connect_instance', {});
      state.email = 'homer.simpson@example.com';
      finishOnboarding();
    },
    isOnboarding: () => ['welcome', 'signin', 'picker', 'login', 'twofa', 'passkey'].includes(state.screen),
  };
}
