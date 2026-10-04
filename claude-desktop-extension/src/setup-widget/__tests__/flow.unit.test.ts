import { describe, expect, test } from 'bun:test';
import {
  accountsView,
  errorText,
  initialState,
  nextSelectable,
  pickerRows,
  reducer,
  setupDoneMessage,
  stepTitle,
  twoFaDeliveryLabel,
  typedHostname,
  type Action,
  type FoundLogin,
  type State,
} from '../flow';

const run = (actions: Action[], from: State = initialState) => actions.reduce(reducer, from);

const login = (id: string, over: Partial<FoundLogin> = {}): FoundLogin => ({
  import_id: id,
  hostname: 'mychart.example.org',
  username: id,
  confidence: 'directory',
  ...over,
});

const homer = login('homer', { instance_name: 'Example Health', source: 'Chrome' });
const marge = login('marge', { hostname: 'mychart.other.org' });

/** The list straight after a scan that found homer and marge. */
const scanned = run([
  { type: 'goConsent' },
  { type: 'scanned', scan: { supported: true, accounts: [homer, marge] }, saved: { accounts: [] } },
]);

const loggedIn = (over: Record<string, unknown> = {}) => ({ state: 'logged_in', account: 'homer@mychart.example.org', passkey_saved: false, ...over });

describe('the import route', () => {
  test('opens on the choice, and the scan lands on a list with the first login picked', () => {
    expect(initialState.step.kind).toBe('choose');
    expect(scanned.step).toEqual({ kind: 'accounts', error: null });
    const view = accountsView(scanned);
    expect(view.rows.map((r) => r.entry.import_id)).toEqual(['homer', 'marge']);
    expect(view.firstPickable).toBe(homer);
    expect(view.subtitle).toBe('Pick one to connect. You can import more after this one.');
    expect(stepTitle(scanned)).toBe('MyChart logins found');
  });

  test('shows logins already connected, or saved without a username, but will not pick them', () => {
    const state = run([
      { type: 'scanned', scan: { supported: true, accounts: [homer, login('nobody', { username: null })] }, saved: { accounts: [{ account: 'HOMER@mychart.example.org' }] } },
    ]);
    const view = accountsView(state);
    expect(view.rows.map((r) => r.note)).toEqual(['Already connected', 'No username saved. Enter this one manually.']);
    expect(view.firstPickable).toBeNull();
    expect(view.subtitle).toContain("We didn't find any MyChart logins");
  });

  test('a scan that failed stays on the permission step with the reason', () => {
    const state = run([{ type: 'goConsent' }, { type: 'scanned', scan: 'Error: keychain locked', saved: null }]);
    expect(state.step).toEqual({ kind: 'consent', error: 'keychain locked' });
  });

  test('says so on a platform that cannot import', () => {
    const state = run([{ type: 'scanned', scan: { supported: false, accounts: [] }, saved: null }]);
    expect(accountsView(state).subtitle).toContain('macOS and Windows only');
  });

  test('runs one login through 2FA and the passkey offer, then asks about another', () => {
    let state = run([{ type: 'connectImport', entry: homer }], scanned);
    expect(state.step).toMatchObject({ kind: 'connecting', username: 'homer', instance: { name: 'Example Health' } });

    state = run([{ type: 'importResult', entry: homer, result: { state: 'need_2fa', pending_id: 'p1', delivery: { method: 'sms' } } }], state);
    expect(state.step).toMatchObject({ kind: 'twofa', pendingId: 'p1', back: null });

    state = run([{ type: 'twoFaResult', result: loggedIn({ passkey_storage_description: 'the macOS Keychain' }) }], state);
    expect(state.step).toMatchObject({ kind: 'passkey', account: 'homer@mychart.example.org', storage: 'the macOS Keychain' });

    state = run([{ type: 'passkeyResult', result: { registered: true } }], state);
    expect(state.connected).toEqual([{ name: 'Example Health', account: 'homer@mychart.example.org', passkey: 'registered' }]);
    expect(state.step.kind).toBe('accounts');
    // The connected login leaves the found list for the ✓ list above it.
    const view = accountsView(state);
    expect(view.rows.map((r) => r.entry.import_id)).toEqual(['marge']);
    expect(view.subtitle).toBe('Import another one?');
    expect(view.first).toBe(false);
    expect(stepTitle(state)).toBe('Account connected');
  });

  test('back from 2FA on an import returns to the list', () => {
    const state = run([
      { type: 'connectImport', entry: homer },
      { type: 'importResult', entry: homer, result: { state: 'need_2fa', pending_id: 'p1' } },
      { type: 'back' },
    ], scanned);
    expect(state.step).toEqual({ kind: 'accounts', error: null });
  });

  test('turns a rejected saved password into a manual sign-in for that login', () => {
    let state = run([
      { type: 'connectImport', entry: homer },
      { type: 'importResult', entry: homer, result: { state: 'invalid_login' } },
    ], scanned);
    expect(state.step).toMatchObject({ kind: 'creds', fromImport: true, username: 'homer' });
    expect((state.step as { error: string }).error).toContain("The password saved in your browser didn't work.");
    state = run([{ type: 'back' }], state);
    expect(state.step.kind).toBe('accounts');
  });

  test('an expired import id sends the user back to search their browsers again', () => {
    const state = run([
      { type: 'connectImport', entry: homer },
      { type: 'importResult', entry: homer, result: { state: 'expired', message: 'That import_id is unknown or has expired.' } },
    ], scanned);
    expect(state.scanned).toBeNull();
    expect(state.step).toEqual({ kind: 'accounts', error: 'Saved logins are only kept for 10 minutes after searching. Import from your browser again to continue.' });
    expect(accountsView(state).canImport).toBe(true);
  });

  test('any other failure stays on the list with the reason', () => {
    const state = run([{ type: 'importResult', entry: homer, result: 'Error: session expired at the portal' }], scanned);
    expect(state.step).toEqual({ kind: 'accounts', error: 'session expired at the portal' });
    expect(state.scanned).not.toBeNull();
  });
});

describe('the manual route', () => {
  const creds = run([{ type: 'goPicker' }, { type: 'pickInstance', row: { hostname: 'mychart.example.org', name: 'Example Health', logoUrl: 'https://x/logo.png' } }]);

  test('a picked system opens its sign-in', () => {
    expect(creds.step).toEqual({
      kind: 'creds',
      instance: { hostname: 'mychart.example.org', name: 'Example Health', logoUrl: 'https://x/logo.png' },
      fromImport: false,
      username: '',
      error: null,
    });
    expect(run([{ type: 'back' }], creds).step.kind).toBe('picker');
  });

  test('a typed address is named by its host past the picker', () => {
    const state = run([{ type: 'pickInstance', row: { hostname: 'mychart.new.org', name: 'Use mychart.new.org', custom: true } }]);
    expect(state.step).toMatchObject({ instance: { hostname: 'mychart.new.org', name: 'mychart.new.org' } });
  });

  test('back from 2FA returns to the sign-in with the username kept and the password not', () => {
    let state = run([{ type: 'error', message: 'stale' }, { type: 'loginResult', username: 'homer', result: { state: 'need_2fa', pending_id: 'p1' } }], creds);
    expect(state.step.kind).toBe('twofa');
    state = run([{ type: 'back' }], state);
    expect(state.step).toMatchObject({ kind: 'creds', username: 'homer', error: null });
    // The password is never held in state: it would show in devtools and every logged state.
    expect(JSON.stringify(state)).not.toContain('password');
  });

  test('a rejected password or code stays on its step with the reason', () => {
    expect(run([{ type: 'loginResult', username: 'h', result: { state: 'invalid_login' } }], creds).step)
      .toMatchObject({ kind: 'creds', error: 'Invalid username or password. Please check your credentials.' });
    expect(run([{ type: 'loginResult', username: 'h', result: 'Error: timed out' }], creds).step)
      .toMatchObject({ kind: 'creds', error: 'timed out' });

    const twofa = run([{ type: 'loginResult', username: 'h', result: { state: 'need_2fa', pending_id: 'p1' } }], creds);
    // A rejected code comes back with a fresh pending id for the next try.
    expect(run([{ type: 'twoFaResult', result: { state: 'invalid_2fa', pending_id: 'p2' } }], twofa).step)
      .toMatchObject({ pendingId: 'p2', error: 'Invalid verification code. Please try again.' });
    expect(run([{ type: 'twoFaResult', result: { state: 'weird' } }], twofa).step).toMatchObject({ error: 'Unexpected state: weird' });
  });

  test('records how the passkey offer went', () => {
    // Already on file: no offer.
    const saved = run([{ type: 'loginResult', username: 'h', result: loggedIn({ passkey_saved: true }) }], creds);
    expect(saved.connected).toEqual([{ name: 'Example Health', account: 'homer@mychart.example.org', passkey: 'saved' }]);
    // A result without the field is not one saying there is no passkey.
    const unknown = run([{ type: 'loginResult', username: 'h', result: loggedIn({ passkey_saved: undefined }) }], creds);
    expect(unknown.connected[0]?.passkey).toBeNull();
    // Offered and skipped.
    const offered = run([{ type: 'loginResult', username: 'h', result: loggedIn() }], creds);
    expect(offered.step).toMatchObject({ kind: 'passkey', storage: 'your OS keystore' });
    expect(run([{ type: 'skipPasskey' }], offered).connected[0]?.passkey).toBeNull();
    // Refused by the portal: the reason shows, and skipping is still there.
    expect(run([{ type: 'passkeyResult', result: 'Error: passkeys are disabled here' }], offered).step)
      .toMatchObject({ kind: 'passkey', error: 'passkeys are disabled here' });
    expect(run([{ type: 'passkeyResult', result: { registered: false } }], offered).step)
      .toMatchObject({ error: 'MyChart did not return a passkey.' });
  });

  test('reconnecting the same account replaces its entry', () => {
    const once = run([{ type: 'loginResult', username: 'h', result: loggedIn({ passkey_saved: true }) }], creds);
    const twice = run([{ type: 'pickInstance', row: { hostname: 'mychart.example.org', name: 'Example Health' } }, { type: 'loginResult', username: 'h', result: loggedIn({ passkey_saved: true, account: 'HOMER@mychart.example.org' }) }], once);
    expect(twice.connected.map((c) => c.account)).toEqual(['HOMER@mychart.example.org']);
  });

  test('ignores a result that lands after the user left the step', () => {
    const left = run([{ type: 'back' }], creds);
    expect(run([{ type: 'loginResult', username: 'h', result: loggedIn() }], left)).toBe(left);
  });
});

describe('navigation', () => {
  test('back from the permission step or the picker goes to the start until an account is connected', () => {
    expect(run([{ type: 'goConsent' }, { type: 'back' }]).step.kind).toBe('choose');
    expect(run([{ type: 'goPicker' }, { type: 'back' }]).step.kind).toBe('choose');
    const connected: State = { ...initialState, connected: [{ name: 'x', account: 'x@y.org', passkey: null }] };
    expect(run([{ type: 'goPicker' }, { type: 'back' }], connected).step.kind).toBe('accounts');
    expect(run([{ type: 'back' }], scanned).step.kind).toBe('consent');
  });

  test("hands back to the chat only once something is connected", () => {
    expect(run([{ type: 'done' }], scanned)).toBe(scanned);
    const connected: State = { ...scanned, connected: [{ name: 'x', account: 'x@y.org', passkey: null }] };
    expect(run([{ type: 'done' }], connected).step.kind).toBe('done');
    expect(stepTitle({ ...connected, connected: [...connected.connected, ...connected.connected] })).toBe('2 accounts connected');
  });

  test('errors clear on the step that shows them', () => {
    const withError = run([{ type: 'goConsent' }, { type: 'error', message: 'nope' }]);
    expect(withError.step).toEqual({ kind: 'consent', error: 'nope' });
    expect(run([{ type: 'clearError' }], withError).step).toEqual({ kind: 'consent', error: null });
    // A step with no error to clear is left as it is.
    expect(run([{ type: 'clearError' }])).toBe(initialState);
  });
});

describe('the picker', () => {
  const unavailable = { hostname: 'sandbox.example.org', name: 'Sandbox', unavailable: 'Down for now' };
  const a = { hostname: 'a.example.org', name: 'A' };
  const b = { hostname: 'b.example.org', name: 'B' };

  test('offers a typed address as its own row unless the directory lists it', () => {
    expect(pickerRows({ matches: [a] }, 'mychart.new.org')).toEqual([a, { hostname: 'mychart.new.org', name: 'Use mychart.new.org', custom: true }]);
    expect(pickerRows({ matches: [a] }, 'a.example.org')).toEqual([a]);
    expect(pickerRows({ matches: [a] }, 'Denver Health')).toEqual([a]);
    // A failed search is no matches.
    expect(pickerRows('Error: offline', 'Denver Health')).toEqual([]);
  });

  test('arrow keys step over an entry that cannot be picked', () => {
    // It stays visible, carrying its reason, but is never where Enter lands.
    const rows = [a, unavailable, b];
    expect(nextSelectable(rows, 0, 1)).toBe(2);
    expect(nextSelectable(rows, 2, 1)).toBe(0);
    expect(nextSelectable(rows, 0, -1)).toBe(2);
    expect(nextSelectable([unavailable], -1, 1)).toBe(-1);
    expect(nextSelectable([], -1, 1)).toBe(-1);
  });

  test('reads a typed MyChart address out of the query', () => {
    expect(typedHostname('mychart.example.org')).toBe('mychart.example.org');
    // Pasted from the browser's address bar.
    expect(typedHostname('  https://MyChart.Example.org/MyChart/Authentication/Login?  ')).toBe('mychart.example.org');
    expect(typedHostname('mychart.example.org:8443/MyChart')).toBe('mychart.example.org:8443');
    // A health-system name is a search, not an address.
    expect(typedHostname('Denver Health')).toBeNull();
    expect(typedHostname('st. mary')).toBeNull();
    expect(typedHostname('mychart')).toBeNull();
    expect(typedHostname('')).toBeNull();
  });
});

describe('copy', () => {
  test('names the 2FA target instead of stringifying the delivery object', () => {
    expect(twoFaDeliveryLabel({ method: 'sms', contact: '***-***-1234' })).toBe('***-***-1234');
    // MyChart often reports the method with no masked contact.
    expect(twoFaDeliveryLabel({ method: 'sms' })).toBe('your phone');
    expect(twoFaDeliveryLabel({ method: 'email' })).toBe('your email');
    expect(twoFaDeliveryLabel({})).toBeNull();
    expect(twoFaDeliveryLabel(null)).toBeNull();
  });

  test('drops the "Error: " prefix a tool error carries', () => {
    expect(errorText('Error: bad', 'fallback')).toBe('bad');
    expect(errorText({ message: 'from the result' }, 'fallback')).toBe('from the result');
    expect(errorText(null, 'fallback')).toBe('fallback');
  });

  test('reports every connected account and how its passkey offer went', () => {
    expect(setupDoneMessage([{ account: 'homer@mychart.example.org', passkey: 'registered' }])).toBe(
      'My MyChart account homer@mychart.example.org is now connected. A passkey is now saved for homer@mychart.example.org. Please continue with my original request.',
    );
    expect(
      setupDoneMessage([
        { account: 'a@one.example.org', passkey: null },
        { account: 'b@two.example.org', passkey: 'saved' },
        { account: 'c@three.example.org', passkey: null },
      ]),
    ).toBe(
      'I connected 3 MyChart accounts: a@one.example.org, b@two.example.org, c@three.example.org. ' +
        'I chose not to set up a passkey for a@one.example.org, c@three.example.org right now, so do not offer one again. ' +
        'Please continue with my original request.',
    );
  });
});
