// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { useEffect, useReducer, useState } from 'react';
import { DECLINED_MESSAGE, DEMO_LOGIN, demoAccount, demoDoneMessage, initialState, reducer, setupDoneMessage, stepTitle, type FoundLogin } from './flow';
import type { Host } from './host';
import { Picker } from './Picker';
import { Accounts, CalendarOffer, CheckingAppointments, Choose, Connecting, Consent, Creds, Declined, DemoConnecting, Disclaimer, Done, Passkey, Start, TwoFa } from './steps';

/**
 * Interactive setup widget, served as the ui://openrecord/setup MCP App. The
 * user first picks the fake MyChart demo (connected in one click, ending the
 * widget) or their real accounts. For real ones they import MyChart logins saved in their browsers (the widget only ever
 * sees import ids, never a password) or signs in by hand; each account runs
 * through 2FA and the passkey offer before the widget asks about the next one.
 * "I'm done" hands back to the chat. See docs/mcpb-setup-flow.md.
 */
export function App({ host }: { host: Host }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [hostError, setHostError] = useState<string | null>(null);
  const { step } = state;

  useEffect(() => {
    host.ready.catch((err: unknown) => setHostError(`Could not connect to host: ${err instanceof Error ? err.message : String(err)}`));
  }, [host]);

  const back = () => dispatch({ type: 'back' });
  const goConsent = () => dispatch({ type: 'goConsent' });
  const goPicker = () => dispatch({ type: 'goPicker' });
  const showError = (message: string) => dispatch({ type: 'error', message });
  const clearError = () => dispatch({ type: 'clearError' });

  const scan = async () => {
    const [scanned, saved] = await Promise.all([
      host.callTool('import_browser_passwords', {}),
      host.callTool('list_accounts', {}),
    ]);
    dispatch({ type: 'scanned', scan: scanned, saved });
  };

  const connectImport = async (entry: FoundLogin) => {
    dispatch({ type: 'connectImport', entry });
    const result = await host.callTool('connect_imported_account', { import_id: entry.import_id });
    dispatch({ type: 'importResult', entry, result });
  };

  // ui/message injects a user-role message so Claude resumes the original task.
  const finish = (message: string) => {
    host.sendMessage(message).catch((err: unknown) => {
      // Non-fatal — the visual confirmation still appears.
      console.error('ui/message failed:', err instanceof Error ? err.message : err);
    });
  };

  // The passkey and calendar offers have already been made here, so the
  // message reports how they went rather than asking Claude to make them again.
  const done = async () => {
    dispatch({ type: 'done' });
    // The sync runs from a macOS menu-bar app; elsewhere there is nothing to offer, so read no charts.
    const canSync = navigator.userAgent.includes('Mac');
    const [accounts, ...visits] = await Promise.all([
      host.callTool('list_accounts', {}),
      ...(canSync ? state.connected.map((c) => host.callTool('get_upcoming_visits', { account: c.account, mode: 'json' })) : []),
    ]);
    const next = reducer({ ...state, step: { kind: 'checkingAppointments' } }, { type: 'appointmentsChecked', visits, accounts, canSync });
    dispatch({ type: 'appointmentsChecked', visits, accounts, canSync });
    if (next.step.kind === 'done') finish(setupDoneMessage(state.connected));
  };

  const connectCalendar = async () => {
    // Clicking "Sync to Google Calendar" on the offer, which explains setup, is the user's go-ahead.
    const result = await host.callTool('connect_google_calendar', { confirmed_with_user: true });
    const next = reducer(state, { type: 'calendarResult', result });
    dispatch({ type: 'calendarResult', result });
    if (next.step.kind === 'done') finish(setupDoneMessage(state.connected, next.calendar));
  };

  const connectDemo = async () => {
    dispatch({ type: 'connectDemo' });
    const result = await host.callTool('setup_account', { ...DEMO_LOGIN });
    dispatch({ type: 'demoResult', result });
    const account = demoAccount(result);
    if (account) finish(demoDoneMessage(account));
  };

  const body = (() => {
    switch (step.kind) {
      case 'disclaimer':
        return (
          <Disclaimer
            onAgree={() => dispatch({ type: 'agree' })}
            onBack={back}
            onExit={() => {
              dispatch({ type: 'decline' });
              finish(DECLINED_MESSAGE);
            }}
          />
        );
      case 'declined':
        return <Declined />;
      case 'start':
        return <Start step={step} onReal={() => dispatch({ type: 'goReal' })} onDemo={() => void connectDemo()} />;
      case 'demoConnecting':
        return <DemoConnecting />;
      case 'choose':
        return (
          <Choose
            onImport={() => dispatch({ type: 'chooseMethod', next: 'consent' })}
            onManual={() => dispatch({ type: 'chooseMethod', next: 'picker' })}
            onBack={back}
          />
        );
      case 'consent':
        return <Consent step={step} onScan={scan} onBack={back} />;
      case 'accounts':
        return (
          <Accounts
            state={state}
            step={step}
            onConnect={(entry) => void connectImport(entry)}
            onImport={goConsent}
            onManual={goPicker}
            onBack={back}
            onDone={() => void done()}
          />
        );
      case 'connecting':
        return <Connecting step={step} />;
      case 'picker':
        return <Picker host={host} onPick={(row) => dispatch({ type: 'pickInstance', row })} onBack={back} />;
      case 'creds':
        return (
          <Creds
            step={step}
            onBack={back}
            onError={showError}
            onClearError={clearError}
            onSubmit={async (username, password) => {
              const result = await host.callTool('setup_account', { hostname: step.instance.hostname, username, password });
              dispatch({ type: 'loginResult', username, result });
            }}
          />
        );
      case 'twofa':
        return (
          <TwoFa
            step={step}
            onBack={back}
            onError={showError}
            onClearError={clearError}
            onVerify={async (code) => {
              const result = await host.callTool('complete_2fa', { pending_id: step.pendingId, code });
              dispatch({ type: 'twoFaResult', result });
            }}
          />
        );
      case 'passkey':
        return (
          <Passkey
            step={step}
            onSkip={() => dispatch({ type: 'skipPasskey' })}
            onRegister={async () => {
              const result = await host.callTool('register_passkey', { account: step.account });
              dispatch({ type: 'passkeyResult', result });
            }}
          />
        );
      case 'checkingAppointments':
        return <CheckingAppointments />;
      case 'calendarOffer':
        return (
          <CalendarOffer
            step={step}
            onConnect={connectCalendar}
            onSkip={() => {
              dispatch({ type: 'skipCalendar' });
              finish(setupDoneMessage(state.connected, 'declined'));
            }}
          />
        );
      case 'done':
        return <Done connected={state.connected} calendar={state.calendar} />;
    }
  })();

  return (
    <div className="container">
      <h1>{stepTitle(state)}</h1>
      {hostError && <div className="status">{hostError}</div>}
      {body}
    </div>
  );
}
