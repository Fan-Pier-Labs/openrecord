import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import * as data from '../data';
import { SKILLS, buildAlerts } from '../skills';
import { executeTool } from '../tools';
import { Markdown } from './Markdown';
import { WriteConfirm } from './WriteConfirm';
import { streamText } from '../stream';
import type { PendingWrite, Session, Skill, TurnCallbacks } from '../types';

/**
 * The iOS app surface.
 *
 * A React re-creation of `expo-app/` — the onboarding flow, the chat screen
 * with its tool-call indicator, the alerts card, the skills sheet, the insights
 * screen, the chat drawer, and settings. Close enough to the real thing to be
 * worth clicking through; not a pixel-perfect clone, and the page says so.
 */

type Screen = 'chat' | 'insights' | 'settings';

export type ChatEntry = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  failed?: boolean;
};

export type IosHandle = {
  send: (text: string) => void;
};

type Props = {
  session: Session;
  runTurn: (opts: {
    userText: string;
    history: { role: 'user' | 'assistant'; content: string }[];
    surface: 'ios';
    skillAddition: string | null;
    memoryDigest: string | null;
    callbacks: TurnCallbacks;
  }) => Promise<{ text: string }>;
  onReady: (handle: IosHandle) => void;
};

export function IosSurface({ session, runTurn, onReady }: Props) {
  const [screen, setScreen] = useState<Screen>('chat');
  // The demo starts on a connected account, so the provider is fixed.
  const instance = data.directory[0];

  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [activeSkill, setActiveSkill] = useState<Skill | null>(null);

  /** A write waiting on the user. `decide` resolves the agent loop's promise. */
  const [confirm, setConfirm] = useState<{ write: PendingWrite; decide: (ok: boolean) => void } | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const [chats, setChats] = useState(() => data.seedChats.map((c) => ({ ...c })));
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [openInsight, setOpenInsight] = useState<string | null>(null);

  const titleSetRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // The turn handler is recreated each render; the imperative handle we hand
  // the parent has to call the latest one.
  const sendRef = useRef<(text: string) => void>(() => {});

  const alerts = useMemo(
    () =>
      buildAlerts(session, data.billing).filter(
        (a) => !dismissedAlerts.has(a.id) && !(a.resolvedWhen && a.resolvedWhen(session)),
      ),
    // `session` mutates in place, so tie this to the things that change it.
    [session, dismissedAlerts, messages],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, activeTool]);

  async function send(text: string) {
    if (busy) return;
    setScreen('chat');
    setDrawerOpen(false);

    const history = messages.filter((m) => m.content).map((m) => ({ role: m.role, content: m.content }));
    const userEntry: ChatEntry = { id: `u-${Date.now()}`, role: 'user', content: text };
    const assistantId = `a-${Date.now()}`;
    setMessages((prev) => [...prev, userEntry, { id: assistantId, role: 'assistant', content: '' }]);
    setBusy(true);

    if (!titleSetRef.current) {
      titleSetRef.current = true;
      setChats((prev) => [{ id: `chat-${Date.now()}`, title: text.slice(0, 42), updatedAt: 'just now' }, ...prev]);
    }

    try {
      const result = await runTurn({
        userText: text,
        history,
        surface: 'ios',
        skillAddition: activeSkill?.playbook ?? null,
        memoryDigest: data.memoryDigest.summaryMd,
        callbacks: {
          onToolStart: (call) => setActiveTool(call.tool),
          onToolEnd: () => setActiveTool(null),
          // Blocks the loop until the user answers the dialog.
          onConfirmWrite: (write) =>
            new Promise<boolean>((decide) => {
              setActiveTool(null);
              setConfirm({ write, decide });
            }),
        },
      });
      // The proxy answers a whole turn at once, so reveal it at the pace a
      // model would have produced it — an instant wall of text reads as canned.
      await streamText(result.text, (visible) =>
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: visible } : m))),
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `I couldn't reach the model just now — ${(err as Error).message}`, failed: true }
            : m,
        ),
      );
    } finally {
      setBusy(false);
      setActiveTool(null);
    }
  }

  sendRef.current = send;

  function newChat() {
    setMessages([]);
    setActiveSkill(null);
    setActiveTool(null);
    titleSetRef.current = false;
    setDrawerOpen(false);
    setScreen('chat');
  }

  useEffect(() => {
    onReady({ send: (text) => sendRef.current(text) });
    // Registered once on mount, deliberately: it reads live state through refs
    // rather than closing over this render's values.
  }, []);

  /* ── Chat ───────────────────────────────────────────────────────── */

  function renderAlerts() {
    if (alerts.length === 0) return null;
    return (
      <div className={`ios-alert-card${alertsOpen ? ' open' : ''}`}>
        <button className="ios-alert-header" onClick={() => setAlertsOpen((v) => !v)}>
          <span className="ios-alert-badge">{alerts.length}</span>
          <span className="ios-alert-heading">
            {alerts.length === 1 ? '1 thing to review' : `${alerts.length} things to review`}
          </span>
          <span className="ios-alert-chevron">▸</span>
        </button>
        <div className="ios-alert-list">
          {alerts.map((alert) => (
            <div className="ios-alert" key={alert.id}>
              <p className="ios-alert-title">{alert.title}</p>
              <p className="ios-alert-desc">{alert.description}</p>
              <div className="ios-alert-actions">
                <button className="ios-alert-btn primary" onClick={() => send(alert.prompt)}>
                  {alert.usesAi ? `${alert.ctaLabel} with AI` : alert.ctaLabel}
                </button>
                <button
                  className="ios-alert-btn"
                  onClick={() => setDismissedAlerts((prev) => new Set(prev).add(alert.id))}
                >
                  Ignore
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderChat() {
    return (
      <div className="ios-page">
        <div className="ios-nav">
          <button className="ios-nav-icon" aria-label="Open menu" onClick={() => setDrawerOpen(true)}>
            ≡
          </button>
          <span className="ios-nav-title">OpenRecord</span>
          <button className="ios-nav-back" onClick={newChat}>
            New
          </button>
        </div>

        <div className="ios-chat-body" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="ios-chat-empty">
              <div className="ios-empty-hero">
                <h2 className="ios-empty-title">OpenRecord</h2>
                <p className="ios-empty-sub">Ask anything about your health data</p>
                <button className="ios-skill-cta" onClick={() => setSkillsOpen(true)}>
                  Run a skill ›
                </button>
              </div>
              {renderAlerts()}
            </div>
          ) : (
            <div className="ios-messages">
              {messages.map((msg) =>
                msg.role === 'user' ? (
                  <div className="ios-msg user" key={msg.id}>
                    <div className="ios-bubble">{msg.content}</div>
                  </div>
                ) : (
                  <div className="ios-msg assistant" key={msg.id}>
                    {msg.content ? (
                      <Markdown className="ios-markdown" source={msg.content} />
                    ) : (
                      <span className="ios-thinking">Thinking…</span>
                    )}
                    {msg.failed && <p className="ios-fallback-note">Try again in a moment.</p>}
                  </div>
                ),
              )}
              {activeTool && (
                <div className="ios-toolcall">
                  <span className="ios-tool-dot" />
                  {`Running ${activeTool}…`}
                </div>
              )}
            </div>
          )}
        </div>

        <form
          className="ios-chat-bar"
          onSubmit={(e) => {
            e.preventDefault();
            const text = draft.trim();
            if (!text || busy) return;
            setDraft('');
            void send(text);
          }}
        >
          <input
            className="ios-chat-input"
            placeholder={busy ? 'Working…' : 'Ask about your health data'}
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="ios-send" type="submit" disabled={busy} aria-label="Send">
            ↑
          </button>
        </form>
      </div>
    );
  }

  /* ── Insights ───────────────────────────────────────────────────── */

  function renderInsights() {
    return (
      <div className="ios-page">
        <div className="ios-nav">
          <button className="ios-nav-back" onClick={() => setScreen('chat')}>
            ‹ Back
          </button>
          <span className="ios-nav-title">Insights</span>
          <span className="ios-nav-spacer" />
        </div>
        <div className="ios-scroll ios-insights">
          <div className="ios-summary-card">
            <div className="ios-summary-head">
              <span className="ios-section-label">Health digest</span>
              <span className="ios-picker-host">Updated {data.memoryDigest.generatedAt}</span>
            </div>
            <Markdown className="ios-summary-body" source={data.memoryDigest.summaryMd} />
          </div>

          <p className="ios-section-label">Patterns to consider ({data.memoryDigest.insights.length})</p>

          {data.memoryDigest.insights.map((insight) => (
            <div
              className={`ios-insight sev-${insight.severity}${openInsight === insight.id ? ' open' : ''}`}
              key={insight.id}
            >
              <button
                className="ios-insight-head"
                onClick={() => setOpenInsight((curr) => (curr === insight.id ? null : insight.id))}
              >
                <span className={`ios-sev sev-${insight.severity}`}>
                  {insight.severity === 'discuss_soon' ? 'Discuss soon' : insight.severity === 'discuss' ? 'Discuss' : 'FYI'}
                </span>
                <span className="ios-insight-title">{insight.title}</span>
                <span className="ios-alert-chevron">▸</span>
              </button>
              <div className="ios-insight-detail">
                <Markdown className="ios-insight-body" source={insight.bodyMd} />
                <button className="ios-alert-btn primary" onClick={() => send(insight.suggestedQuestion)}>
                  Ask about this
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="ios-footnote">
          AI-generated suggestions based on your records. Not medical advice. Always discuss with your doctor.
        </div>
      </div>
    );
  }

  /* ── Settings ───────────────────────────────────────────────────── */

  function renderSettings() {
    const contacts = executeTool(session, 'get_emergency_contacts', {}) as {
      id: string;
      name: string;
      relationship: string;
      phone: string;
      addedThisSession?: boolean;
    }[];

    return (
      <div className="ios-page">
        <div className="ios-nav">
          <button className="ios-nav-back" onClick={() => setScreen('chat')}>
            ‹ Back
          </button>
          <span className="ios-nav-title">Settings</span>
          <span className="ios-nav-spacer" />
        </div>
        <div className="ios-scroll">
          <p className="ios-section-label">Account</p>
          <div className="ios-settings-card">
            <div className="ios-settings-row">
              <span>Signed in</span>
              <span className="ios-picker-host">homer.simpson@example.com</span>
            </div>
          </div>

          <p className="ios-section-label">MyChart accounts</p>
          <div className="ios-settings-card">
            <div className="ios-settings-row">
              <span>
                <strong>{instance.name}</strong>
                <br />
                <span className="ios-picker-host">{instance.hostname}</span>
              </span>
              <span className="ios-pill green">{session.connected ? 'Connected' : 'Offline'}</span>
            </div>
            <div className="ios-settings-row">
              <span>Passkey</span>
              <span className="ios-pill green">Registered</span>
            </div>
            <div className="ios-settings-row">
              <span>Authenticator (TOTP)</span>
              <span className="ios-pill green">Enabled</span>
            </div>
          </div>

          <p className="ios-section-label">AI provider</p>
          <div className="ios-settings-card">
            <div className="ios-settings-row">
              <span>Free tier</span>
              <span className="ios-pill green">Active</span>
            </div>
            <div className="ios-settings-row">
              <span>Monthly spend</span>
              <span className="ios-picker-host">$0.42 of $50.00</span>
            </div>
            <div className="ios-settings-row">
              <span>Bring your own key</span>
              <span className="ios-picker-host">Anthropic · OpenAI · Gemini</span>
            </div>
          </div>

          <p className="ios-section-label">Emergency contacts</p>
          <div className="ios-settings-card">
            {contacts.map((c) => (
              <div className="ios-settings-row" key={c.id}>
                <span>
                  <strong>{c.name}</strong>
                  <br />
                  <span className="ios-picker-host">
                    {c.relationship} · {c.phone}
                  </span>
                </span>
                {c.addedThisSession ? (
                  <span className="ios-pill green">Added</span>
                ) : (
                  <span className="ios-picker-host">{c.id}</span>
                )}
              </div>
            ))}
          </div>
          <p className="ios-fineprint">
            Ask the assistant to add, update, or remove a contact and watch this list change.
          </p>
        </div>
      </div>
    );
  }

  /* ── Overlays ───────────────────────────────────────────────────── */

  function renderDrawer() {
    if (!drawerOpen) return null;
    const q = chatSearch.trim().toLowerCase();
    const matches = chats.filter((chat) => !q || chat.title.toLowerCase().includes(q));
    return (
      <div
        className="ios-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) setDrawerOpen(false);
        }}
      >
        <div className="ios-drawer">
          <button className="ios-drawer-new" onClick={newChat}>
            +  New Chat
          </button>
          <input
            className="ios-input small"
            type="search"
            placeholder="Search"
            value={chatSearch}
            onChange={(e) => setChatSearch(e.target.value)}
          />
          <div className="ios-drawer-list">
            {matches.length === 0 ? (
              <p className="ios-empty">No matches</p>
            ) : (
              matches.map((chat) => (
                <button className="ios-drawer-chat" key={chat.id} onClick={() => setDrawerOpen(false)}>
                  {chat.title}
                </button>
              ))
            )}
          </div>
          <button
            className="ios-drawer-link"
            onClick={() => {
              setDrawerOpen(false);
              setScreen('insights');
            }}
          >
            ✦  Insights
          </button>
          <button
            className="ios-drawer-link"
            onClick={() => {
              setDrawerOpen(false);
              setScreen('settings');
            }}
          >
            ⚙︎  Settings
          </button>
        </div>
      </div>
    );
  }

  function renderSkillsSheet() {
    if (!skillsOpen) return null;
    return (
      <div
        className="ios-overlay bottom"
        onClick={(e) => {
          if (e.target === e.currentTarget) setSkillsOpen(false);
        }}
      >
        <div className="ios-sheet">
          <div className="ios-sheet-handle" />
          <h3 className="ios-sheet-title">Run a skill</h3>
          <p className="ios-sheet-sub">Pre-built playbooks the assistant runs end-to-end.</p>
          {SKILLS.map((skill) => (
            <button
              className="ios-sheet-row"
              key={skill.id}
              onClick={() => {
                setSkillsOpen(false);
                setActiveSkill(skill);
                void send(skill.kickoffMessage);
              }}
            >
              <span className="ios-sheet-icon">{skill.icon}</span>
              <span className="ios-sheet-text">
                <span className="ios-sheet-row-title">{skill.title}</span>
                <span className="ios-sheet-row-desc">{skill.description}</span>
              </span>
            </button>
          ))}
          <button className="ios-btn ghost" onClick={() => setSkillsOpen(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const SCREENS: Record<Screen, () => ReactElement> = {
    chat: renderChat,
    insights: renderInsights,
    settings: renderSettings,
  };

  return (
    <div className="phone-device">
      <div className="phone-shell" />
      <div className="phone-viewport">
        <div className="phone-island" />
        <div className="ios-statusbar">
          <span>9:41</span>
          <span className="ios-status-icons">●●●  ᯤ  ▮</span>
        </div>
        <div className="ios-screen">
          {SCREENS[screen]()}
          {renderDrawer()}
          {renderSkillsSheet()}
          {confirm && (
            <WriteConfirm
              write={confirm.write}
              variant="ios"
              onDecide={(approved) => {
                confirm.decide(approved);
                setConfirm(null);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
