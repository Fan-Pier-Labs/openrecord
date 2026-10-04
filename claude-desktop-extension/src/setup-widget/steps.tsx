import { useRef, useState, type KeyboardEvent } from 'react';
import { BackLink, BusyButton, FieldError, InstanceHeader, RowText, Spinner } from './components';
import { accountsView, twoFaDeliveryLabel, type Connected, type CredsStep, type FoundLogin, type State, type Step } from './flow';

type StepOf<K extends Step['kind']> = Extract<Step, { kind: K }>;

/** Runs a step's tool call with its button busy until the result is dispatched. */
function useBusy(): [boolean, (run: () => Promise<void>) => Promise<void>] {
  const [busy, setBusy] = useState(false);
  return [busy, async (run) => {
    setBusy(true);
    try {
      await run();
    } finally {
      setBusy(false);
    }
  }];
}

const onEnter = (fn: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    fn();
  }
};

export function Choose({ onImport, onManual }: { onImport: () => void; onManual: () => void }) {
  return (
    <div className="step">
      <p className="step-sub">How would you like to connect your MyChart account?</p>
      <button className="choice" type="button" onClick={onImport}>
        <span className="passkey-badge">Easiest</span>
        <span className="choice-title">Import from your browser</span>
        <span className="choice-sub">Use MyChart logins you've already saved in Chrome, Arc, Brave, Edge or Firefox.</span>
      </button>
      <button className="choice" type="button" onClick={onManual}>
        <span className="choice-title">Enter manually</span>
        <span className="choice-sub">Search for your health system and type your username and password.</span>
      </button>
    </div>
  );
}

/** Ask before reading the browser's password store; the scan runs only from this button. */
export function Consent({ step, onScan, onBack }: { step: StepOf<'consent'>; onScan: () => Promise<void>; onBack: () => void }) {
  const [busy, run] = useBusy();
  return (
    <div className="step">
      <BackLink onClick={onBack} />
      <div className="passkey-card">
        <p><strong>OpenRecord needs your permission</strong> to look through the passwords saved in your browsers on this computer for MyChart logins.</p>
        <ul>
          <li><strong>Read-only.</strong> Nothing in your browser is changed, and only MyChart logins are kept.</li>
          <li><strong>Stays on this computer.</strong> Passwords are never shown to Claude or sent to Anthropic. One is used only to sign in to its own MyChart portal, and only for an account you pick next.</li>
          <li><strong>Your computer will ask too.</strong> On a Mac you'll see a system prompt to access your keychain, possibly one per browser. Click <strong>Allow</strong>.</li>
        </ul>
        <p className="passkey-note">To confirm a saved login is really MyChart, OpenRecord may load the sign-in page of a portal it doesn't already know.</p>
      </div>
      <div className="actions">
        <BusyButton busy={busy} busyLabel="Searching your browsers…" onClick={() => void run(onScan)}>
          {step.error ? 'Try again' : 'Allow and search my browsers'}
        </BusyButton>
        {busy && <p className="step-sub">Waiting for permission. If a system prompt appears, click Allow.</p>}
        <FieldError message={step.error} />
      </div>
    </div>
  );
}

/** The hub: pick one login to import, and back here after every account. */
export function Accounts({ state, step, onConnect, onImport, onManual, onBack, onDone }: {
  state: State;
  step: StepOf<'accounts'>;
  onConnect: (entry: FoundLogin) => void;
  onImport: () => void;
  onManual: () => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const view = accountsView(state);
  const [picked, setPicked] = useState<string | null>(view.firstPickable?.import_id ?? null);
  const chosen = view.rows.find((r) => !r.note && r.entry.import_id === picked)?.entry ?? view.firstPickable;
  const hasPickable = view.firstPickable !== null;

  return (
    <div className="step">
      {view.first && <BackLink onClick={onBack} />}
      {state.connected.length > 0 && (
        <ul className="account-list">
          {state.connected.map((c: Connected) => (
            <li key={c.account}>
              <span className="mark ok">✓</span>
              <RowText title={c.name} subtitle={c.account + (c.passkey ? ' · passkey saved' : '')} />
            </li>
          ))}
        </ul>
      )}
      <p className="step-sub">{view.subtitle}</p>
      {hasPickable && (
        <ul className="account-list">
          {view.rows.map(({ entry: a, note }) => (
            <li key={a.import_id} className={note ? 'disabled' : undefined}>
              <label>
                <input
                  type="radio"
                  name="found"
                  disabled={!!note}
                  checked={!note && chosen?.import_id === a.import_id}
                  onChange={() => setPicked(a.import_id)}
                />
                <RowText
                  title={a.instance_name || a.hostname}
                  subtitle={[a.username, a.source ? `from ${a.source}` : null, a.instance_name ? a.hostname : null].filter(Boolean).join(' · ')}
                  note={note}
                />
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="actions">
        {hasPickable && <button type="button" onClick={() => chosen && onConnect(chosen)}>Connect</button>}
        <FieldError message={step.error} />
        {/* "I'm done" is the main action once nothing is left to import. */}
        {!view.first && <button type="button" className={hasPickable ? 'secondary' : undefined} onClick={onDone}>I'm done</button>}
        {view.canImport && <button className="link-btn" type="button" onClick={onImport}>Import from your browser</button>}
        <button className="link-btn" type="button" onClick={onManual}>{view.manualLabel}</button>
      </div>
    </div>
  );
}

export function Connecting({ step }: { step: StepOf<'connecting'> }) {
  return (
    <div className="step">
      <InstanceHeader instance={step.instance} />
      <div className="working"><Spinner /><span>Signing in as {step.username}…</span></div>
    </div>
  );
}

export function Creds({ step, onSubmit, onBack, onError, onClearError }: {
  step: CredsStep;
  onSubmit: (username: string, password: string) => Promise<void>;
  onBack: () => void;
  onError: (message: string) => void;
  onClearError: () => void;
}) {
  const [username, setUsername] = useState(step.username);
  const [password, setPassword] = useState('');
  const [busy, run] = useBusy();
  const userRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    if (!username || !password) {
      onError(!username && !password ? 'Enter your username and password.' : !username ? 'Enter your username.' : 'Enter your password.');
      (username ? passRef : userRef).current?.focus();
      return;
    }
    onClearError();
    void run(() => onSubmit(username, password));
  };

  return (
    <div className="step">
      {/* A sign-in reached from an import goes back to the list it came from. */}
      <BackLink onClick={onBack}>{step.fromImport ? '‹ Back' : '‹ Change health system'}</BackLink>
      <InstanceHeader instance={step.instance} />
      <div className="field">
        <label htmlFor="username">Username</label>
        <input
          id="username"
          ref={userRef}
          type="text"
          autoFocus={!step.username}
          value={username}
          onChange={(e) => { setUsername(e.target.value); onClearError(); }}
          placeholder="MyChart username"
          autoComplete="off"
        />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          ref={passRef}
          type="password"
          autoFocus={!!step.username}
          value={password}
          onChange={(e) => { setPassword(e.target.value); onClearError(); }}
          onKeyDown={onEnter(submit)}
          placeholder="MyChart password"
        />
      </div>
      <div className="actions">
        <BusyButton busy={busy} busyLabel="Connecting..." onClick={submit}>Connect Account</BusyButton>
        <FieldError message={step.error} />
      </div>
    </div>
  );
}

export function TwoFa({ step, onVerify, onBack, onError, onClearError }: {
  step: StepOf<'twofa'>;
  onVerify: (code: string) => Promise<void>;
  onBack: () => void;
  onError: (message: string) => void;
  onClearError: () => void;
}) {
  const [code, setCode] = useState('');
  const [busy, run] = useBusy();
  const label = twoFaDeliveryLabel(step.delivery);

  const verify = () => {
    const trimmed = code.trim();
    if (trimmed.length < 6) {
      onError('Enter the 6-digit verification code.');
      return;
    }
    onClearError();
    void run(() => onVerify(trimmed));
  };

  return (
    <div className="step">
      <BackLink onClick={onBack} />
      <InstanceHeader instance={step.instance} />
      <p className="step-sub">
        {label ? `Enter the 6-digit code sent to ${label} to finish signing in.` : 'Enter the 6-digit verification code to finish signing in.'}
      </p>
      <div className="field">
        <label htmlFor="code">Verification Code</label>
        <input
          id="code"
          type="text"
          autoFocus
          value={code}
          onChange={(e) => { setCode(e.target.value); onClearError(); }}
          onKeyDown={onEnter(verify)}
          placeholder="6-digit code"
          maxLength={6}
          inputMode="numeric"
          autoComplete="one-time-code"
        />
      </div>
      <div className="actions">
        <BusyButton busy={busy} busyLabel="Verifying..." onClick={verify}>Verify Code</BusyButton>
        <FieldError message={step.error} />
      </div>
    </div>
  );
}

/** Offer a passkey — reached only when the account has none saved — and register only on click. */
export function Passkey({ step, onRegister, onSkip }: { step: StepOf<'passkey'>; onRegister: () => Promise<void>; onSkip: () => void }) {
  const [busy, run] = useBusy();
  return (
    <div className="step">
      <div className="passkey-card">
        <span className="passkey-badge">Recommended</span>
        <p><strong>You're signed in.</strong> Set up a passkey so Claude can reconnect on its own next time.</p>
        <ul>
          <li><strong>No more codes.</strong> When your MyChart session expires, Claude signs back in without your username, password or a verification code. Without a passkey, you may be asked for a new code each time.</li>
          <li><strong>Stays on this computer.</strong> The private key is stored in {step.storage}. It is never sent to Anthropic.</li>
          <li><strong>Lives on your MyChart account.</strong> It adds a new sign-in credential to {step.instance.name || 'MyChart'} that stays valid until you remove it. Ask Claude to delete the passkey, or disconnect the account, at any time.</li>
        </ul>
        <p className="passkey-note">Some health systems don't allow passkeys to be registered from the portal. If this one doesn't, the account still works; you'll just be asked for a code when the session expires.</p>
      </div>
      <div className="actions">
        <BusyButton busy={busy} busyLabel="Registering..." autoFocus onClick={() => void run(onRegister)}>
          {step.error ? 'Try again' : 'Set up passkey'}
        </BusyButton>
        <button className="link-btn" type="button" disabled={busy} onClick={onSkip}>Skip for now</button>
        <FieldError message={step.error} />
      </div>
    </div>
  );
}

export function Done({ connected }: { connected: Connected[] }) {
  return (
    <div className="success-card">
      <div className="check-circle">
        <svg viewBox="0 0 24 24"><polyline points="5 12.5 10 17.5 19 7.5" /></svg>
      </div>
      <p className="success-title">Connected!</p>
      <p className="success-sub">{connected.map((c) => c.account).join(', ')}</p>
      <p className="success-hint">Press <kbd>Enter</kbd> in the chat to continue.</p>
    </div>
  );
}
