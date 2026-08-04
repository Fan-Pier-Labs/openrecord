import { useEffect, useRef, useState } from 'react';
import * as data from '../data';
import { TOOL_SPECS, executeTool } from '../tools';
import { HAS_LIVE_AI } from '../config';
import { describeResult, fallbackNote, summarizeArgs, truncateJson } from '../display';
import { Markdown } from './Markdown';
import type { Session, ToolGroup, ToolRecord, TurnCallbacks } from '../types';

/**
 * The Claude Desktop surface.
 *
 * A React re-creation of what `claude-desktop-extension/` looks like once
 * installed: the extension card, the inline setup widget, the connector's tool
 * list, and a chat where each tool call appears as a collapsible "Ran <tool>"
 * disclosure the way Claude Desktop renders MCP calls.
 *
 * Same agent loop and same tool layer as the iOS surface — only the chrome and
 * the reply formatting differ, which is exactly the point OpenRecord is making:
 * one connector, many clients.
 */

const SUGGESTIONS = [
  'Summarize my health record and tell me what needs attention.',
  'Which of my lab values have been out of range more than once?',
  'What do I still owe, and what did insurance actually cover?',
  'Show me my chest X-ray and explain the report in plain English.',
  'Draft a message to Dr. Hibbert about my metformin refill.',
  'Find me an appointment slot and book it.',
];

type SetupStep = 'install' | 'connect' | 'twofa' | 'done';

type DesktopEntry = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls: ToolRecord[];
  pendingTool: string | null;
  fallback?: boolean;
};

export type DesktopHandle = {
  send: (text: string) => void;
  skipSetup: () => void;
  isOnboarding: () => boolean;
};

type Props = {
  session: Session;
  runTurn: (opts: {
    userText: string;
    history: { role: 'user' | 'assistant'; content: string }[];
    surface: 'desktop';
    skillAddition: null;
    memoryDigest: null;
    callbacks: TurnCallbacks;
  }) => Promise<{ text: string; usedFallback: boolean }>;
  onReady: (handle: DesktopHandle) => void;
};

export function DesktopSurface({ session, runTurn, onReady }: Props) {
  const [installed, setInstalled] = useState(false);
  const [setupStep, setSetupStep] = useState<SetupStep>('install');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [setupError, setSetupError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [code, setCode] = useState('');

  const [messages, setMessages] = useState<DesktopEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [toolsOpen, setToolsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const threadRef = useRef<HTMLDivElement | null>(null);
  const sendRef = useRef<(text: string) => void>(() => {});
  const installedRef = useRef(installed);
  installedRef.current = installed;

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages]);

  async function send(text: string) {
    if (busy) return;

    const history = messages.filter((m) => m.content).map((m) => ({ role: m.role, content: m.content }));
    const assistantId = `a-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', content: text, toolCalls: [], pendingTool: null },
      { id: assistantId, role: 'assistant', content: '', toolCalls: [], pendingTool: null },
    ]);
    setBusy(true);

    const update = (patch: Partial<DesktopEntry>) =>
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)));

    try {
      const result = await runTurn({
        userText: text,
        history,
        surface: 'desktop',
        skillAddition: null,
        memoryDigest: null,
        callbacks: {
          onToolStart: (call) => update({ pendingTool: call.tool }),
          onToolEnd: (record) =>
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, pendingTool: null, toolCalls: [...m.toolCalls, record] } : m,
              ),
            ),
        },
      });
      update({ content: result.text, fallback: result.usedFallback, pendingTool: null });
    } catch (err) {
      update({ content: `Something went wrong: ${(err as Error).message}`, pendingTool: null });
    } finally {
      setBusy(false);
    }
  }

  sendRef.current = send;

  useEffect(() => {
    onReady({
      send: (text) => sendRef.current(text),
      skipSetup: () => {
        executeTool(session, 'connect_instance', {});
        setInstalled(true);
        setSetupStep('done');
      },
      isOnboarding: () => !installedRef.current,
    });
    // Registered once on mount, deliberately: it reads live state through refs
    // rather than closing over this render's values.
  }, []);

  /* ── Setup ──────────────────────────────────────────────────────── */

  function renderInstall() {
    return (
      <div className="cd-center">
        <div className="cd-extension-card">
          <div className="cd-ext-head">
            <div className="cd-ext-icon">◍</div>
            <div>
              <h3 className="cd-ext-name">OpenRecord — MyChart for Claude</h3>
              <p className="cd-ext-author">Fan Pier Labs · v0.1.0 · Extension</p>
            </div>
          </div>
          <p className="cd-ext-desc">
            Connects Claude Desktop to Epic MyChart patient portals. Ask Claude to fetch your medications, lab
            results, imaging, messages, and billing — or to send a message to your care team, request a refill,
            or update emergency contacts.
          </p>
          <div className="cd-ext-perms">
            <p className="cd-side-label">Provides {TOOL_SPECS.length} tools</p>
            <p className="cd-muted">
              Runs locally on your machine. Credentials go in the OS keychain; health data never leaves the
              device except in the messages you send to Claude.
            </p>
          </div>
          <button
            className="cd-btn primary"
            onClick={() => {
              // If the account was already connected on the phone, the extension
              // picks it up — the credentials belong to the account, not to one
              // client. Only a cold start needs the sign-in flow.
              if (session.connected) {
                setInstalled(true);
                setSetupStep('done');
              } else {
                setSetupStep('connect');
              }
            }}
          >
            Install extension
          </button>
        </div>
      </div>
    );
  }

  function renderConnect() {
    async function signIn() {
      if (!username.trim() || !password) {
        setSetupError('Enter the demo username and password.');
        return;
      }
      setSetupError('');
      setSigningIn(true);
      await new Promise((r) => setTimeout(r, 900));
      setSigningIn(false);
      setSetupStep('twofa');
    }

    return (
      <div className="cd-center">
        <div className="cd-widget">
          <div className="cd-widget-head">
            <span className="cd-tool-chip">get_setup_widget</span>
            <span className="cd-muted">Interactive setup</span>
          </div>
          <h3 className="cd-widget-title">Connect your MyChart</h3>
          <ol className="cd-steps">
            <li className="done">Pick a health system</li>
            <li className="active">Sign in</li>
            <li>Two-factor</li>
            <li>Register a passkey</li>
          </ol>
          <div className="cd-selected">
            <span className="cd-selected-logo">S</span>
            <span>
              <strong>{data.DEMO_ORG}</strong>
              <br />
              <span className="cd-muted">{data.DEMO_HOSTNAME}</span>
            </span>
          </div>
          <div className="cd-credhint">
            <strong>Demo credentials</strong>
            <code>{data.DEMO_USERNAME} / donuts123</code>
            <button
              className="cd-linkbtn"
              onClick={() => {
                setUsername(data.DEMO_USERNAME);
                setPassword('donuts123');
              }}
            >
              Fill
            </button>
          </div>
          <input
            className="cd-input"
            placeholder="MyChart username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className="cd-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="cd-error">{setupError}</p>
          <button className="cd-btn primary" onClick={signIn} disabled={signingIn}>
            {signingIn ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </div>
    );
  }

  function renderTwoFa() {
    async function verify() {
      const result = executeTool(session, 'complete_2fa', { code });
      if (result && typeof result === 'object' && 'error' in result) {
        setSetupError(String((result as { error: string }).error));
        return;
      }
      setSetupError('');
      setSigningIn(true);
      await new Promise((r) => setTimeout(r, 900));
      executeTool(session, 'connect_instance', {});
      setSigningIn(false);
      setInstalled(true);
      setSetupStep('done');
    }

    return (
      <div className="cd-center">
        <div className="cd-widget">
          <div className="cd-widget-head">
            <span className="cd-tool-chip">complete_2fa</span>
            <span className="cd-muted">Two-factor</span>
          </div>
          <h3 className="cd-widget-title">Enter your code</h3>
          <ol className="cd-steps">
            <li className="done">Pick a health system</li>
            <li className="done">Sign in</li>
            <li className="active">Two-factor</li>
            <li>Register a passkey</li>
          </ol>
          <p className="cd-muted">{data.DEMO_ORG} sent a 6-digit code to your email.</p>
          <div className="cd-credhint">
            <strong>Demo code</strong>
            <code>123456</code>
            <button className="cd-linkbtn" onClick={() => setCode('123456')}>
              Fill
            </button>
          </div>
          <input
            className="cd-input cd-code"
            placeholder="000000"
            maxLength={6}
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <p className="cd-error">{setupError}</p>
          <button className="cd-btn primary" onClick={verify} disabled={signingIn}>
            {signingIn ? 'Registering passkey…' : 'Verify and register passkey'}
          </button>
        </div>
      </div>
    );
  }

  /* ── Chat ───────────────────────────────────────────────────────── */

  function renderToolCall(record: ToolRecord, key: number) {
    const meta = describeResult(record.result);
    const args = summarizeArgs(record.args);
    return (
      <details className={`cd-toolcall${meta.ok ? '' : ' failed'}`} key={key}>
        <summary>
          <span className="cd-tool-icon">{meta.ok ? '⚙' : '!'}</span>
          <span className="cd-tool-name">{record.tool}</span>
          <span className="cd-tool-meta">
            {meta.label} · {record.ms}ms
          </span>
        </summary>
        <div className="cd-tool-detail">
          {args && <p className="cd-tool-args">{args}</p>}
          <pre className="cd-tool-json">{truncateJson(record.result)}</pre>
        </div>
      </details>
    );
  }

  function renderChat() {
    return (
      <div className="cd-chat">
        <div className="cd-thread" ref={threadRef}>
          {messages.length === 0 && (
            <div className="cd-empty">
              <h2 className="cd-empty-title">What can I help with?</h2>
              <p className="cd-empty-sub">
                <span className="cd-connector-dot" data-on="true" />
                {` OpenRecord connected — ${TOOL_SPECS.length} MyChart tools available`}
              </p>
              <div className="cd-suggestions">
                {SUGGESTIONS.map((s) => (
                  <button className="cd-suggestion" key={s} onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) =>
            msg.role === 'user' ? (
              <div className="cd-msg user" key={msg.id}>
                <div className="cd-bubble">{msg.content}</div>
              </div>
            ) : (
              <div className="cd-msg assistant" key={msg.id}>
                <div className="cd-avatar">C</div>
                <div className="cd-msg-column">
                  {msg.toolCalls.map(renderToolCall)}
                  {msg.pendingTool && (
                    <div className="cd-toolcall running">
                      <span className="cd-tool-icon spin">⚙</span>
                      <span className="cd-tool-name">{msg.pendingTool}</span>
                      <span className="cd-tool-meta">running…</span>
                    </div>
                  )}
                  {msg.content ? (
                    <>
                      <Markdown className="cd-markdown" source={msg.content} />
                      {msg.fallback && <p className="cd-fallback-note">{fallbackNote(HAS_LIVE_AI)}</p>}
                    </>
                  ) : (
                    !msg.pendingTool && <div className="cd-thinking">Thinking…</div>
                  )}
                </div>
              </div>
            ),
          )}
        </div>

        <div className="cd-composer">
          <textarea
            className="cd-input-box"
            rows={1}
            placeholder={busy ? 'Working…' : 'Ask about your health record…'}
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const text = draft.trim();
                if (!text || busy) return;
                setDraft('');
                send(text);
              }
            }}
          />
          <div className="cd-composer-bar">
            <button className="cd-tool-toggle" onClick={() => setToolsOpen(true)}>
              ⚙ {TOOL_SPECS.length} tools
            </button>
            <button
              className="cd-send"
              disabled={busy}
              onClick={() => {
                const text = draft.trim();
                if (!text || busy) return;
                setDraft('');
                send(text);
              }}
            >
              ↑
            </button>
          </div>
        </div>

        {toolsOpen && renderToolPopover()}
      </div>
    );
  }

  function renderToolPopover() {
    const groups = new Map<ToolGroup, typeof TOOL_SPECS>();
    for (const spec of TOOL_SPECS) {
      const bucket = groups.get(spec.group) ?? [];
      bucket.push(spec);
      groups.set(spec.group, bucket);
    }

    return (
      <div
        className="cd-popover"
        onClick={(e) => {
          if (e.target === e.currentTarget) setToolsOpen(false);
        }}
      >
        <div className="cd-popover-panel">
          <div className="cd-popover-head">
            <strong>OpenRecord — {TOOL_SPECS.length} tools</strong>
            <button className="cd-linkbtn" onClick={() => setToolsOpen(false)}>
              Close
            </button>
          </div>
          {[...groups.entries()].map(([group, specs]) => (
            <div className="cd-tool-group" key={group}>
              <p className="cd-side-label">{group}</p>
              {specs.map((spec) => (
                <div className={`cd-tool-row${spec.write ? ' write' : ''}`} key={spec.name}>
                  <code className="cd-tool-code">{spec.name}</code>
                  {spec.write && <span className="cd-write-tag">writes</span>}
                  <span className="cd-tool-desc">{spec.description}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderSettings() {
    return (
      <div
        className="cd-popover"
        onClick={(e) => {
          if (e.target === e.currentTarget) setSettingsOpen(false);
        }}
      >
        <div className="cd-popover-panel">
          <div className="cd-popover-head">
            <strong>Extension — OpenRecord</strong>
            <button className="cd-linkbtn" onClick={() => setSettingsOpen(false)}>
              Close
            </button>
          </div>
          <div className="cd-tool-group">
            <div className="cd-tool-row">
              <span className="cd-tool-desc">Status</span>
              <code className="cd-tool-code">{installed ? 'connected' : 'not connected'}</code>
            </div>
            <div className="cd-tool-row">
              <span className="cd-tool-desc">Account</span>
              <code className="cd-tool-code">
                {data.DEMO_USERNAME}@{data.DEMO_HOSTNAME}
              </code>
            </div>
            <div className="cd-tool-row">
              <span className="cd-tool-desc">Passkey</span>
              <code className="cd-tool-code">registered</code>
            </div>
            <div className="cd-tool-row">
              <span className="cd-tool-desc">Transport</span>
              <code className="cd-tool-code">stdio (local)</code>
            </div>
          </div>
          <p className="cd-muted">
            The same server also runs as a hosted MCP endpoint — one URL covers every MyChart account you have
            connected.
          </p>
        </div>
      </div>
    );
  }

  const body = !installed
    ? setupStep === 'install'
      ? renderInstall()
      : setupStep === 'connect'
        ? renderConnect()
        : renderTwoFa()
    : renderChat();

  return (
    <div className="cd-window">
      <div className="cd-titlebar">
        <div className="cd-lights">
          <span className="l red" />
          <span className="l amber" />
          <span className="l green" />
        </div>
        <span className="cd-title">Claude</span>
        <span className="cd-titlebar-spacer" />
      </div>
      <div className="cd-body">
        <aside className="cd-sidebar">
          <button
            className="cd-newchat"
            onClick={() => {
              setMessages([]);
            }}
          >
            +  New chat
          </button>
          <p className="cd-side-label">Recents</p>
          <div className="cd-side-list">
            {data.seedChats.map((c) => (
              <button className="cd-side-chat" key={c.id}>
                {c.title}
              </button>
            ))}
          </div>
          <button className="cd-connector" onClick={() => setSettingsOpen(true)}>
            <span className="cd-connector-dot" data-on={String(installed)} />
            <span>
              <strong>OpenRecord</strong>
              <br />
              <span className="cd-muted">{installed ? 'Connected' : 'Not connected'}</span>
            </span>
          </button>
        </aside>
        <div className="cd-main">
          {body}
          {settingsOpen && renderSettings()}
        </div>
      </div>
    </div>
  );
}
