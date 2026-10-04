import type { ScanResult } from '../browser-import';
import type { MyChartDirectoryMatch } from '../../../scrapers/list-all-mycharts/searchDirectory';

/**
 * The setup widget's flow, as a reducer: which step is showing, what the
 * browser scan found, and which accounts are connected. Every tool result is
 * interpreted here, so the components only call tools and dispatch what came
 * back. See docs/mcpb-setup-flow.md for the flow as a diagram.
 */

export type FoundLogin = ScanResult['accounts'][number];

/** The portal a sign-in is for. */
export interface Instance {
  hostname: string;
  name: string;
  logoUrl?: string;
}

/** A row in the health-system picker: a directory match, or the address the user typed. */
export interface PickerRow {
  /** Epic's directory id; absent only on the typed-address row. Hostnames repeat across affiliates. */
  slgId?: string;
  hostname: string;
  name: string;
  logoUrl?: string;
  unavailable?: string;
  custom?: boolean;
}

/** 'registered' — the widget just saved one; 'saved' — one was on file; null — the user skipped. */
export type PasskeyOutcome = 'registered' | 'saved' | null;

export interface Connected {
  name: string;
  account: string;
  passkey: PasskeyOutcome;
}

interface Scanned {
  supported: boolean;
  /** Account ids (`username@hostname`) connected before this widget opened. */
  saved: string[];
  entries: FoundLogin[];
}

interface Delivery {
  method?: string;
  contact?: string;
}

export interface CredsStep {
  kind: 'creds';
  instance: Instance;
  /** Reached from an import whose saved password failed: Back returns to the list. */
  fromImport: boolean;
  /** Prefilled; the password is never held in state, so it is always retyped. */
  username: string;
  error: string | null;
}

export type Step =
  | { kind: 'choose' }
  | { kind: 'consent'; error: string | null }
  | { kind: 'accounts'; error: string | null }
  | { kind: 'connecting'; instance: Instance; username: string }
  | { kind: 'picker' }
  | CredsStep
  // `back` is the sign-in to return to; null means the login came from an import.
  | { kind: 'twofa'; instance: Instance; pendingId: string; delivery: Delivery | null; back: CredsStep | null; error: string | null }
  | { kind: 'passkey'; instance: Instance; account: string; storage: string; error: string | null }
  | { kind: 'done' };

export interface State {
  step: Step;
  /** null until the browser has been searched, and again once its import ids expire. */
  scanned: Scanned | null;
  connected: Connected[];
}

export const initialState: State = { step: { kind: 'choose' }, scanned: null, connected: [] };

export type Action =
  | { type: 'back' }
  | { type: 'goConsent' }
  | { type: 'goPicker' }
  | { type: 'scanned'; scan: unknown; saved: unknown }
  | { type: 'connectImport'; entry: FoundLogin }
  | { type: 'importResult'; entry: FoundLogin; result: unknown }
  | { type: 'pickInstance'; row: PickerRow }
  | { type: 'loginResult'; username: string; result: unknown }
  | { type: 'twoFaResult'; result: unknown }
  | { type: 'passkeyResult'; result: unknown }
  | { type: 'skipPasskey' }
  | { type: 'error'; message: string }
  | { type: 'clearError' }
  | { type: 'done' };

/** The fields the login tools return. Every one is optional: a result is whatever the tool sent. */
interface ToolReply {
  state?: string;
  account?: string;
  pending_id?: string;
  delivery?: Delivery;
  passkey_saved?: boolean;
  passkey_storage_description?: string;
  registered?: boolean;
  message?: string;
}

function reply(result: unknown): ToolReply {
  return result && typeof result === 'object' ? result : {};
}

/** A tool error arrives as its "Error: …" text; the prefix is noise in an inline label. */
export function errorText(result: unknown, fallback: string): string {
  const msg = typeof result === 'string' ? result : reply(result).message || fallback;
  return msg.startsWith('Error: ') ? msg.slice(7) : msg;
}

const accountsStep = (error: string | null = null): Step => ({ kind: 'accounts', error });

/** Back from the consent or picker step: to the list once anything is connected, else the start. */
function home(state: State): Step {
  return state.connected.length ? accountsStep() : { kind: 'choose' };
}

function accountDone(state: State, instance: Instance | null, account: string | null, passkey: PasskeyOutcome): State {
  if (!account) return { ...state, step: accountsStep() };
  const others = state.connected.filter((c) => c.account.toLowerCase() !== account.toLowerCase());
  return {
    ...state,
    connected: [...others, { name: instance?.name || account, account, passkey }],
    step: accountsStep(),
  };
}

/**
 * Logged in, with or without 2FA. The login tools recommend a passkey rather
 * than registering one, so the widget makes the offer itself. Compared
 * against false rather than negated: a result missing the field is not a
 * result saying there is no passkey.
 */
function loggedIn(state: State, instance: Instance, account: string, r: ToolReply): State {
  if (r.passkey_saved === false) {
    // Where the key lands is the server's live answer (keystore or the
    // 0600-file fallback), never a promise the widget makes on its own.
    const storage = r.passkey_storage_description || 'your OS keystore';
    return { ...state, step: { kind: 'passkey', instance, account, storage, error: null } };
  }
  return accountDone(state, instance, account, r.passkey_saved === true ? 'saved' : null);
}

function withError(step: Step, error: string | null): Step {
  return 'error' in step ? { ...step, error } : step;
}

export function reducer(state: State, action: Action): State {
  const { step } = state;
  switch (action.type) {
    case 'back':
      switch (step.kind) {
        case 'consent':
        case 'picker':
          return { ...state, step: home(state) };
        case 'accounts':
          return { ...state, step: { kind: 'consent', error: null } };
        case 'creds':
          return { ...state, step: step.fromImport ? accountsStep() : { kind: 'picker' } };
        // Going back from 2FA drops the pending login. A manual sign-in returns
        // to its credentials, so re-submitting starts a fresh attempt.
        case 'twofa':
          return { ...state, step: step.back ? { ...step.back, error: null } : accountsStep() };
        default:
          return state;
      }

    case 'goConsent':
      return { ...state, step: { kind: 'consent', error: null } };

    case 'goPicker':
      return { ...state, step: { kind: 'picker' } };

    case 'scanned': {
      const { scan, saved } = action;
      if (!scan || typeof scan !== 'object') {
        return { ...state, step: { kind: 'consent', error: errorText(scan, 'Could not read your browser passwords.') } };
      }
      const s = scan as Partial<ScanResult>;
      // list_accounts marks logins already connected, so picking one again
      // doesn't cost the user a fresh 2FA code. Its failure just marks nothing.
      const savedAccounts = (reply(saved) as { accounts?: unknown }).accounts;
      const ids = Array.isArray(savedAccounts)
        ? savedAccounts.map((a: { account?: string; username?: string; hostname?: string }) => a.account || `${a.username}@${a.hostname}`)
        : [];
      return {
        ...state,
        scanned: { supported: s.supported !== false, saved: ids, entries: s.accounts ?? [] },
        step: accountsStep(),
      };
    }

    case 'connectImport': {
      const { entry } = action;
      const instance = { name: entry.instance_name || entry.hostname, hostname: entry.hostname };
      return { ...state, step: { kind: 'connecting', instance, username: entry.username ?? '' } };
    }

    case 'importResult': {
      const { entry } = action;
      const r = reply(action.result);
      const instance = { name: entry.instance_name || entry.hostname, hostname: entry.hostname };
      if (r.state === 'need_2fa' && r.pending_id) {
        return { ...state, step: { kind: 'twofa', instance, pendingId: r.pending_id, delivery: r.delivery ?? null, back: null, error: null } };
      }
      if (r.state === 'logged_in') return loggedIn(state, instance, r.account || entry.hostname, r);
      if (r.state === 'invalid_login') {
        // The saved password is stale. The import id is spent either way, so
        // carry on as a manual sign-in with the username already filled in.
        return {
          ...state,
          step: {
            kind: 'creds',
            instance,
            fromImport: true,
            username: entry.username ?? '',
            error: "The password saved in your browser didn't work. It may be out of date — enter your current one.",
          },
        };
      }
      if (r.state === 'expired') {
        // Import ids are held for 10 minutes after the scan; a slow round of 2FA
        // codes can outlast them, and only a fresh scan gets new ones.
        return {
          ...state,
          scanned: null,
          step: accountsStep('Saved logins are only kept for 10 minutes after searching. Import from your browser again to continue.'),
        };
      }
      return { ...state, step: accountsStep(errorText(action.result, 'Sign-in failed.')) };
    }

    case 'pickInstance': {
      const { row } = action;
      // A typed address carries 'Use <host>' as its row label; past the picker
      // it is named by the host alone.
      const instance: Instance = row.custom
        ? { hostname: row.hostname, name: row.hostname }
        : { hostname: row.hostname, name: row.name, ...(row.logoUrl ? { logoUrl: row.logoUrl } : {}) };
      return { ...state, step: { kind: 'creds', instance, fromImport: false, username: '', error: null } };
    }

    case 'loginResult': {
      if (step.kind !== 'creds') return state;
      const r = reply(action.result);
      if (r.state === 'need_2fa' && r.pending_id) {
        const back: CredsStep = { ...step, username: action.username, error: null };
        return {
          ...state,
          step: { kind: 'twofa', instance: step.instance, pendingId: r.pending_id, delivery: r.delivery ?? null, back, error: null },
        };
      }
      if (r.state === 'logged_in') return loggedIn(state, step.instance, r.account || step.instance.hostname, r);
      const error = r.state === 'invalid_login'
        ? 'Invalid username or password. Please check your credentials.'
        : errorText(action.result, 'Login failed. Please try again.');
      return { ...state, step: { ...step, error } };
    }

    case 'twoFaResult': {
      if (step.kind !== 'twofa') return state;
      const r = reply(action.result);
      if (r.state === 'logged_in') return loggedIn(state, step.instance, r.account || step.instance.hostname, r);
      if (r.state === 'invalid_2fa') {
        // A rejected code comes back with a fresh pending id for the next try.
        return { ...state, step: { ...step, pendingId: r.pending_id ?? step.pendingId, error: 'Invalid verification code. Please try again.' } };
      }
      return { ...state, step: { ...step, error: errorText(action.result, `Unexpected state: ${r.state}`) } };
    }

    case 'passkeyResult': {
      if (step.kind !== 'passkey') return state;
      if (reply(action.result).registered === true) return accountDone(state, step.instance, step.account, 'registered');
      // Some instances refuse passkey registration from the portal, and that
      // is the message they get. Skipping is still available beneath it.
      const error = errorText(typeof action.result === 'string' ? action.result : null, 'MyChart did not return a passkey.');
      return { ...state, step: { ...step, error } };
    }

    case 'skipPasskey':
      return step.kind === 'passkey' ? accountDone(state, step.instance, step.account, null) : state;

    case 'error':
      return { ...state, step: withError(step, action.message) };

    case 'clearError':
      return 'error' in step && step.error ? { ...state, step: withError(step, null) } : state;

    case 'done':
      return state.connected.length ? { ...state, step: { kind: 'done' } } : state;
  }
}

const TITLES: Record<Exclude<Step['kind'], 'accounts'>, string> = {
  choose: 'Connect to MyChart',
  consent: 'Import from your browser',
  connecting: 'Signing in',
  picker: 'Find your health system',
  creds: 'Sign in to MyChart',
  twofa: 'Two-step verification',
  passkey: 'Set up a passkey?',
  done: 'Connected',
};

export function stepTitle(state: State): string {
  if (state.step.kind !== 'accounts') return TITLES[state.step.kind];
  const n = state.connected.length;
  return n === 0 ? 'MyChart logins found' : n === 1 ? 'Account connected' : `${n} accounts connected`;
}

export interface FoundRow {
  entry: FoundLogin;
  /** Why the row can't be picked, when it can't. */
  note: string | null;
}

/**
 * What the found list still offers: anything connected in this widget is
 * dropped (it is in the ✓ list above), and an account connected earlier or a
 * login saved without a username is shown but can't be picked.
 */
function foundRows(state: State): FoundRow[] {
  const { scanned } = state;
  if (!scanned) return [];
  const idOf = (a: FoundLogin) => `${a.username}@${a.hostname}`.toLowerCase();
  const isConnected = (id: string) => state.connected.some((c) => c.account.toLowerCase() === id);
  return scanned.entries
    .filter((a) => !a.username || !isConnected(idOf(a)))
    .map((a) => ({
      entry: a,
      note: !a.username
        ? 'No username saved. Enter this one manually.'
        : scanned.saved.some((id) => id.toLowerCase() === idOf(a)) ? 'Already connected' : null,
    }));
}

/** Everything the accounts step shows, derived from state. */
export function accountsView(state: State) {
  const rows = foundRows(state);
  const pickable = rows.filter((r) => !r.note);
  // Nothing connected yet: this is the list straight after the scan.
  // Afterwards it is the "another one?" question, with a way to stop.
  const first = state.connected.length === 0;
  const { scanned } = state;
  let subtitle: string;
  if (!scanned) subtitle = 'Connect another account, or finish.';
  else if (!scanned.supported) subtitle = 'Importing from a browser works on macOS and Windows only. You can enter your account manually instead.';
  else if (pickable.length) subtitle = first ? 'Pick one to connect. You can import more after this one.' : 'Import another one?';
  else if (first) subtitle = "We didn't find any MyChart logins in your browsers that can be imported. You can enter your account manually instead.";
  else subtitle = 'There are no more logins in your browsers to import.';
  return {
    rows,
    firstPickable: pickable[0]?.entry ?? null,
    first,
    subtitle,
    canImport: !scanned,
    manualLabel: first ? 'Enter an account manually instead' : 'Enter an account manually',
  };
}

/** search_mycharts' matches, plus a "Use <host>" row when the query is itself a web address. */
export function pickerRows(result: unknown, query: string): PickerRow[] {
  const raw = (reply(result) as { matches?: unknown }).matches;
  const matches: PickerRow[] = Array.isArray(raw) ? (raw as MyChartDirectoryMatch[]) : [];
  // A typed address the directory already lists is just that listing.
  const host = typedHostname(query);
  if (host && !matches.some((m) => m.hostname === host)) {
    return [...matches, { hostname: host, name: `Use ${host}`, custom: true }];
  }
  return matches;
}

/**
 * The next row the arrow keys land on. They step over rows that can't be
 * picked, so an unavailable entry is never the thing Enter lands on. -1 when
 * nothing is pickable.
 */
export function nextSelectable(rows: PickerRow[], from: number, step: 1 | -1): number {
  const n = rows.length;
  for (let k = 1; k <= n; k++) {
    const idx = (((from + step * k) % n) + n) % n;
    if (!rows[idx]?.unavailable) return idx;
  }
  return -1;
}

/**
 * Where MyChart says it sent the 2FA code, phrased for the hint line.
 * setup_account reports delivery as `{ method, contact }` — the contact is a
 * masked phone or address, and is absent whenever MyChart named no target.
 */
export function twoFaDeliveryLabel(delivery?: Delivery | null): string | null {
  if (!delivery) return null;
  if (delivery.contact) return delivery.contact;
  if (delivery.method === 'sms') return 'your phone';
  if (delivery.method === 'email') return 'your email';
  return null;
}

/**
 * The bare host a picker query names, when the user typed a web address
 * rather than a health-system name — so a portal missing from the bundled
 * directory can still be connected. Accepts a pasted URL ("https://host/MyChart/")
 * and returns just the host; anything without a dotted name is a search, not
 * an address.
 */
export function typedHostname(query: string): string | null {
  const trimmed = query.trim();
  let url: URL;
  try {
    // A space anywhere in the host makes this throw, so names like "Denver Health" fall out here.
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  const labels = url.hostname.split('.');
  return labels.length > 1 && labels.every(Boolean) ? url.host : null;
}

/**
 * What "I'm done" says to the conversation. It reports how the passkey offer
 * went per account rather than asking Claude to make it again.
 */
export function setupDoneMessage(accounts: { account: string; passkey: PasskeyOutcome }[]): string {
  const list = (xs: { account: string }[]) => xs.map((a) => a.account).join(', ');
  let msg = accounts.length === 1
    ? `My MyChart account ${accounts[0]!.account} is now connected.`
    : `I connected ${accounts.length} MyChart accounts: ${list(accounts)}.`;
  const registered = accounts.filter((a) => a.passkey === 'registered');
  const declined = accounts.filter((a) => a.passkey === null);
  if (registered.length) msg += ` A passkey is now saved for ${list(registered)}.`;
  if (declined.length) msg += ` I chose not to set up a passkey for ${list(declined)} right now, so do not offer one again.`;
  return `${msg} Please continue with my original request.`;
}
