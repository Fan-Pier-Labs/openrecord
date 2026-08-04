/**
 * The Claude Desktop surface.
 *
 * A browser re-creation of what `claude-desktop-extension/` looks like once
 * installed: the extension card in settings, the inline setup widget, the
 * connector's tool list, and a chat where each tool call appears as a
 * collapsible "Ran <tool>" disclosure the way Claude Desktop renders MCP calls.
 *
 * Same agent loop and same tool layer as the iOS surface — only the chrome and
 * the reply formatting differ, which is exactly the point OpenRecord is making:
 * one connector, many clients.
 */

import { el, clear, typeset, describeResult, summarizeArgs, fallbackNote } from './ui.js';
import { HAS_LIVE_AI } from './config.js';
import * as data from './data.js';
import { TOOL_SPECS } from './tools.js';
import { executeTool } from './tools.js';

const SUGGESTIONS = [
  'Summarize my health record and tell me what needs attention.',
  'Which of my lab values have been out of range more than once?',
  'What do I still owe, and what did insurance actually cover?',
  'Show me my chest X-ray and explain the report in plain English.',
  'Draft a message to Dr. Hibbert about my metformin refill.',
  'Find me an appointment slot and book it.',
];

export function createDesktopSurface({ mount, runTurn, session }) {
  const state = {
    installed: session.connected,
    setupStep: 'install', // install → connect → twofa → done
    hostname: data.DEMO_HOSTNAME,
    username: '',
    password: '',
    messages: [],
    busy: false,
    activeTool: null,
    toolsOpen: false,
    settingsOpen: false,
    chats: data.seedChats.map((c) => ({ ...c })),
  };

  const main = el('div', { class: 'cd-main' });

  const window_ = el(
    'div',
    { class: 'cd-window' },
    el(
      'div',
      { class: 'cd-titlebar' },
      el('div', { class: 'cd-lights' }, el('span', { class: 'l red' }), el('span', { class: 'l amber' }), el('span', { class: 'l green' })),
      el('span', { class: 'cd-title', text: 'Claude' }),
      el('span', { class: 'cd-titlebar-spacer' })
    ),
    el(
      'div',
      { class: 'cd-body' },
      el(
        'aside',
        { class: 'cd-sidebar' },
        el('button', { class: 'cd-newchat', onClick: newChat }, '+  New chat'),
        el('p', { class: 'cd-side-label', text: 'Recents' }),
        el('div', { class: 'cd-side-list' }, ...state.chats.map((c) => el('button', { class: 'cd-side-chat', text: c.title }))),
        el(
          'button',
          { class: 'cd-connector', onClick: () => { state.settingsOpen = true; render(); } },
          el('span', { class: 'cd-connector-dot', dataset: { on: String(state.installed) } }),
          el('span', {}, el('strong', { text: 'OpenRecord' }), el('br'), el('span', { class: 'cd-muted', text: state.installed ? 'Connected' : 'Not connected' }))
        )
      ),
      main
    )
  );

  clear(mount).append(window_);

  /* ---------------------------------------------------------------- *
   * Setup
   * ---------------------------------------------------------------- */

  function renderInstall() {
    return el(
      'div',
      { class: 'cd-center' },
      el(
        'div',
        { class: 'cd-extension-card' },
        el('div', { class: 'cd-ext-head' },
          el('div', { class: 'cd-ext-icon', text: '◍' }),
          el('div', {},
            el('h3', { class: 'cd-ext-name', text: 'OpenRecord — MyChart for Claude' }),
            el('p', { class: 'cd-ext-author', text: 'Fan Pier Labs · v0.1.0 · Extension' })
          )
        ),
        el('p', { class: 'cd-ext-desc', text: 'Connects Claude Desktop to Epic MyChart patient portals. Ask Claude to fetch your medications, lab results, imaging, messages, and billing — or to send a message to your care team, request a refill, or update emergency contacts.' }),
        el('div', { class: 'cd-ext-perms' },
          el('p', { class: 'cd-side-label', text: `Provides ${TOOL_SPECS.length} tools` }),
          el('p', { class: 'cd-muted', text: 'Runs locally on your machine. Credentials go in the OS keychain; health data never leaves the device except in the messages you send to Claude.' })
        ),
        el('button', {
          class: 'cd-btn primary',
          onClick: () => {
            // If the account was already connected on the phone, the extension
            // picks it up — the credentials belong to the account, not to one
            // client. Only a cold start needs the sign-in flow.
            if (session.connected) {
              state.installed = true;
              state.setupStep = 'done';
            } else {
              state.setupStep = 'connect';
            }
            render();
          },
        }, 'Install extension')
      )
    );
  }

  function renderConnect() {
    const username = el('input', { class: 'cd-input', placeholder: 'MyChart username', onInput: (e) => (state.username = e.target.value) });
    const password = el('input', { class: 'cd-input', type: 'password', placeholder: 'Password', onInput: (e) => (state.password = e.target.value) });
    const error = el('p', { class: 'cd-error' });

    return el(
      'div',
      { class: 'cd-center' },
      el(
        'div',
        { class: 'cd-widget' },
        el('div', { class: 'cd-widget-head' }, el('span', { class: 'cd-tool-chip', text: 'get_setup_widget' }), el('span', { class: 'cd-muted', text: 'Interactive setup' })),
        el('h3', { class: 'cd-widget-title', text: 'Connect your MyChart' }),
        el('ol', { class: 'cd-steps' },
          el('li', { class: 'done', text: 'Pick a health system' }),
          el('li', { class: 'active', text: 'Sign in' }),
          el('li', { text: 'Two-factor' }),
          el('li', { text: 'Register a passkey' })
        ),
        el('div', { class: 'cd-selected' },
          el('span', { class: 'cd-selected-logo', text: 'S' }),
          el('span', {}, el('strong', { text: data.DEMO_ORG }), el('br'), el('span', { class: 'cd-muted', text: data.DEMO_HOSTNAME }))
        ),
        el('div', { class: 'cd-credhint' },
          el('strong', { text: 'Demo credentials' }),
          el('code', { text: `${data.DEMO_USERNAME} / donuts123` }),
          el('button', {
            class: 'cd-linkbtn',
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
        el('button', {
          class: 'cd-btn primary',
          onClick: async (e) => {
            if (!state.username.trim() || !state.password) {
              error.textContent = 'Enter the demo username and password.';
              return;
            }
            const btn = e.currentTarget;
            btn.textContent = 'Signing in…';
            btn.disabled = true;
            await new Promise((r) => setTimeout(r, 900));
            state.setupStep = 'twofa';
            render();
          },
        }, 'Sign in')
      )
    );
  }

  function renderTwoFa() {
    const code = el('input', { class: 'cd-input cd-code', placeholder: '000000', maxlength: '6', inputmode: 'numeric' });
    const error = el('p', { class: 'cd-error' });
    return el(
      'div',
      { class: 'cd-center' },
      el(
        'div',
        { class: 'cd-widget' },
        el('div', { class: 'cd-widget-head' }, el('span', { class: 'cd-tool-chip', text: 'complete_2fa' }), el('span', { class: 'cd-muted', text: 'Two-factor' })),
        el('h3', { class: 'cd-widget-title', text: 'Enter your code' }),
        el('ol', { class: 'cd-steps' },
          el('li', { class: 'done', text: 'Pick a health system' }),
          el('li', { class: 'done', text: 'Sign in' }),
          el('li', { class: 'active', text: 'Two-factor' }),
          el('li', { text: 'Register a passkey' })
        ),
        el('p', { class: 'cd-muted', text: `${data.DEMO_ORG} sent a 6-digit code to your email.` }),
        el('div', { class: 'cd-credhint' }, el('strong', { text: 'Demo code' }), el('code', { text: '123456' }), el('button', { class: 'cd-linkbtn', onClick: () => (code.value = '123456') }, 'Fill')),
        code,
        error,
        el('button', {
          class: 'cd-btn primary',
          onClick: async (e) => {
            const result = executeTool(session, 'complete_2fa', { code: code.value });
            if (result.error) {
              error.textContent = result.error;
              return;
            }
            const btn = e.currentTarget;
            btn.textContent = 'Registering passkey…';
            btn.disabled = true;
            await new Promise((r) => setTimeout(r, 900));
            executeTool(session, 'connect_instance', {});
            state.installed = true;
            state.setupStep = 'done';
            render();
          },
        }, 'Verify and register passkey')
      )
    );
  }

  /* ---------------------------------------------------------------- *
   * Chat
   * ---------------------------------------------------------------- */

  function renderToolCall(record) {
    const meta = describeResult(record.result);
    const args = summarizeArgs(record.args);
    const details = el('details', { class: `cd-toolcall${meta.ok ? '' : ' failed'}` });
    details.append(
      el(
        'summary',
        {},
        el('span', { class: 'cd-tool-icon', text: meta.ok ? '⚙' : '!' }),
        el('span', { class: 'cd-tool-name', text: record.tool }),
        el('span', { class: 'cd-tool-meta', text: `${meta.label} · ${record.ms}ms` })
      ),
      el('div', { class: 'cd-tool-detail' },
        args ? el('p', { class: 'cd-tool-args', text: args }) : null,
        el('pre', { class: 'cd-tool-json', text: truncateJson(record.result) })
      )
    );
    return details;
  }

  function truncateJson(value) {
    const json = JSON.stringify(value, null, 2);
    return json.length > 2400 ? `${json.slice(0, 2400)}\n… truncated` : json;
  }

  function renderChat() {
    const thread = el('div', { class: 'cd-thread' });

    if (state.messages.length === 0) {
      thread.append(
        el(
          'div',
          { class: 'cd-empty' },
          el('h2', { class: 'cd-empty-title', text: 'What can I help with?' }),
          el('p', { class: 'cd-empty-sub' },
            el('span', { class: 'cd-connector-dot', dataset: { on: 'true' } }),
            ` OpenRecord connected — ${TOOL_SPECS.length} MyChart tools available`
          ),
          el('div', { class: 'cd-suggestions' },
            ...SUGGESTIONS.map((s) => el('button', { class: 'cd-suggestion', onClick: () => send(s) }, s))
          )
        )
      );
    }

    for (const msg of state.messages) {
      if (msg.role === 'user') {
        thread.append(el('div', { class: 'cd-msg user' }, el('div', { class: 'cd-bubble' }, msg.content)));
        continue;
      }
      const block = el('div', { class: 'cd-msg assistant' }, el('div', { class: 'cd-avatar', text: 'C' }));
      const column = el('div', { class: 'cd-msg-column' });
      for (const record of msg.toolCalls ?? []) column.append(renderToolCall(record));
      if (msg.pendingTool) {
        column.append(el('div', { class: 'cd-toolcall running' }, el('span', { class: 'cd-tool-icon spin', text: '⚙' }), el('span', { class: 'cd-tool-name', text: msg.pendingTool }), el('span', { class: 'cd-tool-meta', text: 'running…' })));
      }
      if (msg.content) {
        const content = el('div', { class: 'cd-markdown' });
        typeset(content, msg.content);
        column.append(content);
        if (msg.fallback) {
          column.append(el('p', { class: 'cd-fallback-note', text: fallbackNote(HAS_LIVE_AI) }));
        }
      } else if (!msg.pendingTool) {
        column.append(el('div', { class: 'cd-thinking', text: 'Thinking…' }));
      }
      block.append(column);
      thread.append(block);
    }

    const input = el('textarea', {
      class: 'cd-input-box',
      rows: '1',
      placeholder: state.busy ? 'Working…' : 'Ask about your health record…',
      disabled: state.busy,
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = input.value.trim();
        if (!text || state.busy) return;
        input.value = '';
        send(text);
      }
    });

    const composer = el(
      'div',
      { class: 'cd-composer' },
      input,
      el(
        'div',
        { class: 'cd-composer-bar' },
        el('button', { class: 'cd-tool-toggle', onClick: () => { state.toolsOpen = !state.toolsOpen; render(); } }, `⚙ ${TOOL_SPECS.length} tools`),
        el('button', {
          class: 'cd-send',
          disabled: state.busy,
          onClick: () => {
            const text = input.value.trim();
            if (!text || state.busy) return;
            input.value = '';
            send(text);
          },
        }, '↑')
      )
    );

    const page = el('div', { class: 'cd-chat' }, thread, composer);
    if (state.toolsOpen) page.append(renderToolPopover());
    queueMicrotask(() => {
      thread.scrollTop = thread.scrollHeight;
    });
    return page;
  }

  function renderToolPopover() {
    const groups = new Map();
    for (const spec of TOOL_SPECS) {
      if (!groups.has(spec.group)) groups.set(spec.group, []);
      groups.get(spec.group).push(spec);
    }
    return el(
      'div',
      { class: 'cd-popover', onClick: (e) => { if (e.target === e.currentTarget) { state.toolsOpen = false; render(); } } },
      el(
        'div',
        { class: 'cd-popover-panel' },
        el('div', { class: 'cd-popover-head' },
          el('strong', { text: `OpenRecord — ${TOOL_SPECS.length} tools` }),
          el('button', { class: 'cd-linkbtn', onClick: () => { state.toolsOpen = false; render(); } }, 'Close')
        ),
        ...[...groups.entries()].map(([group, specs]) =>
          el('div', { class: 'cd-tool-group' },
            el('p', { class: 'cd-side-label', text: group }),
            ...specs.map((spec) =>
              el('div', { class: `cd-tool-row${spec.write ? ' write' : ''}` },
                el('code', { class: 'cd-tool-code', text: spec.name }),
                spec.write ? el('span', { class: 'cd-write-tag', text: 'writes' }) : null,
                el('span', { class: 'cd-tool-desc', text: spec.description })
              )
            )
          )
        )
      )
    );
  }

  function renderSettings() {
    return el(
      'div',
      { class: 'cd-popover', onClick: (e) => { if (e.target === e.currentTarget) { state.settingsOpen = false; render(); } } },
      el(
        'div',
        { class: 'cd-popover-panel' },
        el('div', { class: 'cd-popover-head' }, el('strong', { text: 'Extension — OpenRecord' }), el('button', { class: 'cd-linkbtn', onClick: () => { state.settingsOpen = false; render(); } }, 'Close')),
        el('div', { class: 'cd-tool-group' },
          el('div', { class: 'cd-tool-row' }, el('span', { class: 'cd-tool-desc', text: 'Status' }), el('code', { class: 'cd-tool-code', text: state.installed ? 'connected' : 'not connected' })),
          el('div', { class: 'cd-tool-row' }, el('span', { class: 'cd-tool-desc', text: 'Account' }), el('code', { class: 'cd-tool-code', text: `${data.DEMO_USERNAME}@${data.DEMO_HOSTNAME}` })),
          el('div', { class: 'cd-tool-row' }, el('span', { class: 'cd-tool-desc', text: 'Passkey' }), el('code', { class: 'cd-tool-code', text: 'registered' })),
          el('div', { class: 'cd-tool-row' }, el('span', { class: 'cd-tool-desc', text: 'Transport' }), el('code', { class: 'cd-tool-code', text: 'stdio (local)' }))
        ),
        el('p', { class: 'cd-muted', text: 'The same server also runs as a hosted MCP endpoint — one URL covers every MyChart account you have connected.' })
      )
    );
  }

  /* ---------------------------------------------------------------- *
   * Turn handling
   * ---------------------------------------------------------------- */

  function newChat() {
    state.messages = [];
    state.activeTool = null;
    render();
  }

  async function send(text) {
    if (state.busy) return;

    state.messages.push({ role: 'user', content: text });
    const assistant = { role: 'assistant', content: '', toolCalls: [], pendingTool: null };
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
        surface: 'desktop',
        callbacks: {
          onToolStart: (call) => {
            assistant.pendingTool = call.tool;
            render();
          },
          onToolEnd: (record) => {
            assistant.pendingTool = null;
            assistant.toolCalls.push(record);
            render();
          },
        },
      });
      assistant.content = result.text;
      assistant.fallback = result.usedFallback;
    } catch (err) {
      assistant.content = `Something went wrong: ${err.message}`;
    } finally {
      assistant.pendingTool = null;
      state.busy = false;
      render();
    }
  }

  /* ---------------------------------------------------------------- *
   * Render
   * ---------------------------------------------------------------- */

  function render() {
    clear(main);
    if (!state.installed && state.setupStep === 'install') main.append(renderInstall());
    else if (!state.installed && state.setupStep === 'connect') main.append(renderConnect());
    else if (!state.installed && state.setupStep === 'twofa') main.append(renderTwoFa());
    else main.append(renderChat());

    if (state.settingsOpen) main.append(renderSettings());

    // Keep the sidebar connector chip in sync with the connection state.
    const dot = window_.querySelector('.cd-connector .cd-connector-dot');
    if (dot) dot.dataset.on = String(state.installed);
    const label = window_.querySelector('.cd-connector .cd-muted');
    if (label) label.textContent = state.installed ? 'Connected' : 'Not connected';
  }

  render();

  return {
    state,
    send,
    /** Skip the install/setup flow and land straight in a connected chat. */
    skipSetup() {
      executeTool(session, 'connect_instance', {});
      state.installed = true;
      state.setupStep = 'done';
      render();
    },
    isOnboarding: () => !state.installed,
  };
}
