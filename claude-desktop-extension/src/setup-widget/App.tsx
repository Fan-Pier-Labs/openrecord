import { useEffect, useReducer, useState } from 'react';
import { initialState, reducer, setupDoneMessage, stepTitle, type FoundLogin } from './flow';
import type { Host } from './host';
import { Picker } from './Picker';
import { Accounts, Choose, Connecting, Consent, Creds, Done, Passkey, TwoFa } from './steps';

/**
 * Interactive setup widget, served as the ui://openrecord/setup MCP App. The
 * user imports MyChart logins saved in their browsers (the widget only ever
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

  const done = () => {
    dispatch({ type: 'done' });
    // ui/message injects a user-role message so Claude resumes the original
    // task. The passkey offer has already been made here, so the message
    // reports how it went rather than asking Claude to make it again.
    host.sendMessage(setupDoneMessage(state.connected)).catch((err: unknown) => {
      // Non-fatal — the visual confirmation still appears.
      console.error('ui/message failed:', err instanceof Error ? err.message : err);
    });
  };

  const body = (() => {
    switch (step.kind) {
      case 'choose':
        return <Choose onImport={goConsent} onManual={goPicker} />;
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
            onDone={done}
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
              dispatch({ type: 'loginResult', username, password, result });
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
      case 'done':
        return <Done connected={state.connected} />;
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
