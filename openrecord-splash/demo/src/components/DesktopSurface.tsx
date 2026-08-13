import { useEffect, useRef, useState } from 'react';
import * as data from '../data';
import { TOOL_SPECS } from '../tools';
import { describeResult, summarizeArgs, truncateJson } from '../display';
import { Markdown } from './Markdown';
import { WriteConfirm } from './WriteConfirm';
import { streamText } from '../stream';
import type { PendingWrite, ToolGroup, ToolRecord, TurnCallbacks } from '../types';

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

type DesktopEntry = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls: ToolRecord[];
  pendingTool: string | null;
  failed?: boolean;
};

export type DesktopHandle = {
  send: (text: string) => void;
};

type Props = {
  runTurn: (opts: {
    userText: string;
    history: { role: 'user' | 'assistant'; content: string }[];
    surface: 'desktop';
    skillAddition: null;
    memoryDigest: null;
    callbacks: TurnCallbacks;
  }) => Promise<{ text: string }>;
  onReady: (handle: DesktopHandle) => void;
};

export function DesktopSurface({ runTurn, onReady }: Props) {

  const [messages, setMessages] = useState<DesktopEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [toolsOpen, setToolsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** A write waiting on the user. `decide` resolves the agent loop's promise. */
  const [confirm, setConfirm] = useState<{ write: PendingWrite; decide: (ok: boolean) => void } | null>(null);

  const threadRef = useRef<HTMLDivElement | null>(null);
  const sendRef = useRef<(text: string) => void>(() => {});

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
          // Blocks the loop until the user answers the dialog.
          onConfirmWrite: (write) =>
            new Promise<boolean>((decide) => {
              update({ pendingTool: null });
              setConfirm({ write, decide });
            }),
        },
      });
      update({ pendingTool: null });
      // The proxy answers a whole turn at once, so reveal it at the pace a
      // model would have produced it — an instant wall of text reads as canned.
      await streamText(result.text, (visible) => update({ content: visible }));
    } catch (err) {
      update({
        content: `I couldn't reach the model just now — ${(err as Error).message}`,
        failed: true,
        pendingTool: null,
      });
    } finally {
      setBusy(false);
    }
  }

  sendRef.current = send;

  useEffect(() => {
    onReady({ send: (text) => sendRef.current(text) });
    // Registered once on mount, deliberately: it reads live state through refs
    // rather than closing over this render's values.
  }, []);

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
                      {msg.failed && <p className="cd-fallback-note">Try again in a moment.</p>}
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
                void send(text);
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
                void send(text);
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
              <code className="cd-tool-code">connected</code>
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
            <span className="cd-connector-dot" data-on="true" />
            <span>
              <strong>OpenRecord</strong>
              <br />
              <span className="cd-muted">Connected</span>
            </span>
          </button>
        </aside>
        <div className="cd-main">
          {renderChat()}
          {settingsOpen && renderSettings()}
        </div>
      </div>
      {confirm && (
        <WriteConfirm
          write={confirm.write}
          variant="desktop"
          onDecide={(approved) => {
            confirm.decide(approved);
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}
