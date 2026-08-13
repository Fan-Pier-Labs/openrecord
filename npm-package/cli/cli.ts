import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { version as CLI_VERSION } from '../package.json';
import { myChartUserPassLogin, myChartPasskeyLogin, complete2faFlow, areCookiesValid } from '../../scrapers/myChart/login';
import { MyChartRequest } from '../../scrapers/myChart/myChartRequest';
import { getMyChartAccounts } from '../../read-local-passwords/index';
import { type PasswordStoreEntryWithKey } from '../../read-local-passwords/types';
import { sendNewMessage, getMessageTopics, getMessageRecipients, getVerificationToken } from '../../scrapers/myChart/messages/sendMessage';
import { sendReply } from '../../scrapers/myChart/messages/sendReply';
import { listConversations } from '../../scrapers/myChart/messages/conversations';
import { checkProxyContext } from '../../scrapers/myChart/proxyContext';
import { sessionStore } from '../../scrapers/myChart/sessionStore';
import { generateTotpCode } from '../../scrapers/myChart/totp';
import { setupTotp } from '../../scrapers/myChart/setupTotp';
import { saveTotpSecret, loadTotpSecret } from './totpStore';
import { savePasskeyCredential, loadPasskeyCredential } from './passkeyStore';
import { passkeyLoginWithCounterRetry } from '../../scrapers/myChart/passkeyLoginRetry';
import { wireSilentReauthentication } from '../../scrapers/myChart/silentLogin';
import type { PasskeyCredential } from '../../scrapers/myChart/softwareAuthenticator';
import { sendTelemetryEvent } from '../../shared/telemetry';
import { checkForUpdate } from '../../shared/updateCheck';
import { isBlockedInstance } from '../../scrapers/myChart/blockedInstances';
import { COMMON_CAPABILITIES, LESS_FREQUENTLY_USED_CAPABILITIES, getCapability, type Capability } from '../../shared/capabilities';
import {
  FULL_SCRAPE_CAPABILITIES,
  downloadAllImagingStudies,
  renderCapabilityList,
  resolveCliAction,
  runCapabilityAction,
} from './capabilityActions';
import { renderCliHelp } from './help';

// Note: We NEVER modify or delete macOS Keychain entries. Read-only via browser password extraction.

// ─── Cookie cache helpers ───
const COOKIE_CACHE_DIR = path.join(process.cwd(), '.cookie-cache');

async function tryLoadCachedSession(hostname: string): Promise<MyChartRequest | null> {
  const cachePath = path.join(COOKIE_CACHE_DIR, `${hostname}.json`);
  try {
    const data = await fs.promises.readFile(cachePath, 'utf-8');
    const mychartRequest = await MyChartRequest.unserialize(data);
    if (!mychartRequest) return null;
    const valid = await areCookiesValid(mychartRequest);
    if (valid) return mychartRequest;
    console.log('  Cached cookies expired, will do fresh login.');
    return null;
  } catch {
    return null;
  }
}

async function saveCachedSession(hostname: string, mychartRequest: MyChartRequest): Promise<void> {
  await fs.promises.mkdir(COOKIE_CACHE_DIR, { recursive: true });
  const cachePath = path.join(COOKIE_CACHE_DIR, `${hostname}.json`);
  await fs.promises.writeFile(cachePath, await mychartRequest.serialize());
}

// ─── Parse CLI args ───
// Usage:
//   npx tsx src/cli.ts --host <hostname>                        (finds creds from browser passwords)
//   npx tsx src/cli.ts --host <hostname> --user <u> --pass <p>  (uses provided creds)
//   npx tsx src/cli.ts --host <hostname> --2fa <code>           (provides 2FA code)
//   npx tsx src/cli.ts --host <hostname> --no-cache             (skip cached cookies)
//   npx tsx src/cli.ts --read-login-from-browser --host <hostname>  (read creds from browser password stores)
//   npx tsx src/cli.ts --read-login-from-browser               (auto-pick first MyChart account from browsers)
//   npx tsx src/cli.ts --host <hostname> --action send-message  (send a new message)
//   npx tsx src/cli.ts --host <hostname> --action send-reply --conversation-id <id> --message <msg>
//   npx tsx src/cli.ts --host <hostname> --action list-proxies                 (list accessible patient records)
//   npx tsx src/cli.ts --host <hostname> --patient "Bart Simpson"            (read a proxy patient's chart)
//   npx tsx src/cli.ts --host <hostname> --switch "Bart Simpson"             (change MyChart's active patient)
//   npx tsx src/cli.ts --help                                                (usage + the commonly-used capabilities)
//   npx tsx src/cli.ts --help --show-all                                     (…including the less-frequently-used ones)
//   npx tsx src/cli.ts --list-capabilities [--show-all]                      (just the capability listing)
//   npx tsx src/cli.ts --host <hostname> --action get_visit_notes --arg csn=123
//
// `--action` accepts any id from the shared capability registry
// (`shared/capabilities.ts`) and prints its result as JSON, with parameters
// supplied by repeated `--arg name=value`. That is what keeps the CLI from
// drifting behind the extension and the app: a capability added there is a CLI
// command the same day, with no flag plumbing to remember.

interface CliArgs {
  host?: string; user?: string; pass?: string; twofa?: string;
  nocache?: boolean; readLoginFromBrowser?: boolean; action?: string;
  conversationId?: string; message?: string; subject?: string;
  patient?: string; switchPatient?: string;
  setupTotp?: boolean; useSavedTotp?: boolean; disableTotp?: boolean;
  setupPasskey?: boolean; usePasskey?: boolean; listPasskeys?: boolean;
  deletePasskey?: boolean; local?: boolean; saveClo?: boolean;
  help?: boolean;
  listCapabilities?: boolean;
  /** Include the less-frequently-used capabilities in `--help` / `--list-capabilities`. */
  showAll?: boolean;
  /** Repeated `--arg name=value` pairs, passed straight to the capability. */
  capabilityArgs?: Record<string, string>;
  /** Where media capabilities write their decoded JPEGs (default ./imaging-output). */
  output?: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const parsed: Record<string, string | boolean | Record<string, string>> = {};
  const capabilityArgs: Record<string, string> = {};
  parsed.capabilityArgs = capabilityArgs;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') parsed.help = true;
    else if (args[i] === '--show-all') parsed.showAll = true;
    else if (args[i] === '--list-capabilities') parsed.listCapabilities = true;
    // `--arg name=value`, repeatable. Whatever the chosen capability declares
    // in the shared registry is what this accepts — no per-flag plumbing.
    else if (args[i] === '--arg' && args[i + 1]) {
      const pair = args[++i]!; // guarded by args[i + 1] above
      const eq = pair.indexOf('=');
      if (eq <= 0) {
        console.error(`  --arg expects name=value, got "${pair}".`);
        process.exit(1);
      }
      capabilityArgs[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
    else if (args[i] === '--host' && args[i + 1]) parsed.host = args[++i]!;
    else if (args[i] === '--user' && args[i + 1]) parsed.user = args[++i]!;
    else if (args[i] === '--pass' && args[i + 1]) parsed.pass = args[++i]!;
    else if (args[i] === '--2fa' && args[i + 1]) parsed.twofa = args[++i]!;
    else if (args[i] === '--no-cache') parsed.nocache = true;
    else if (args[i] === '--read-login-from-browser') parsed.readLoginFromBrowser = true;
    else if (args[i] === '--action' && args[i + 1]) parsed.action = args[++i]!;
    else if (args[i] === '--conversation-id' && args[i + 1]) parsed.conversationId = args[++i]!;
    else if (args[i] === '--message' && args[i + 1]) parsed.message = args[++i]!;
    else if (args[i] === '--subject' && args[i + 1]) parsed.subject = args[++i]!;
    // Which patient's chart to read. A name (full or partial), a record id, or
    // "me". Applies to every action; see checkProxyContext().
    else if (args[i] === '--patient' && args[i + 1]) parsed.patient = args[++i]!;
    // The one command that changes MyChart's server-side active patient.
    else if (args[i] === '--switch' && args[i + 1]) parsed.switchPatient = args[++i]!;
    else if (args[i] === '--set-up-totp') parsed.setupTotp = true;
    else if (args[i] === '--use-saved-totp') parsed.useSavedTotp = true;
    else if (args[i] === '--disable-totp') parsed.disableTotp = true;
    else if (args[i] === '--set-up-passkey') parsed.setupPasskey = true;
    else if (args[i] === '--use-passkey') parsed.usePasskey = true;
    else if (args[i] === '--list-passkeys') parsed.listPasskeys = true;
    else if (args[i] === '--delete-passkey') parsed.deletePasskey = true;
    else if (args[i] === '--local') parsed.local = true;
    else if (args[i] === '--save-clo') parsed.saveClo = true;
    // Output directory for capabilities that produce images (rendersMedia).
    else if (args[i] === '--output' && args[i + 1]) parsed.output = args[++i]!; // guarded by args[i + 1] check
  }
  return parsed;
}

const cliArgs = parseArgs();

// If --host provided, try to find creds from browser password stores (read-only)
async function resolveCredsFromBrowsers(host: string): Promise<{ user: string; pass: string } | null> {
  console.log(`  Scanning browser passwords for ${host}...`);
  try {
    const accounts = await getMyChartAccounts();
    const match = accounts.find(a => {
      try {
        return new URL(a.url).hostname === host;
      } catch { return false; }
    });
    if (match && match.user && match.pass) {
      console.log(`  Found credentials for ${host} in browser passwords (user: ${match.user})`);
      return { user: match.user, pass: match.pass };
    }
  } catch (err) {
    console.log(`  Could not scan browser passwords: ${(err as Error).message}`);
  }

  return null;
}

let nonInteractive = false;

let rl: readline.Interface;

function getRL(): readline.Interface {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  }
  return rl;
}

function closeRL() {
  if (rl) rl.close();
}

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    getRL().question(question, (answer) => resolve(answer.trim()));
  });
}

function header(title: string) {
  const line = '='.repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(line);
}

function subheader(title: string) {
  console.log(`\n  -- ${title} --`);
}

// ─── Step 1: Discover or manually enter credentials ───

async function discoverAccounts(): Promise<PasswordStoreEntryWithKey[]> {
  header('Discovering MyChart Accounts');
  console.log('  Scanning your browsers for saved MyChart passwords...');
  console.log('  (Chrome, Arc, Firefox)\n');

  try {
    const accounts = await getMyChartAccounts();
    if (accounts.length === 0) {
      console.log('  No MyChart accounts found in your browsers.');
    } else {
      console.log(`  Found ${accounts.length} MyChart account(s):\n`);
      for (let i = 0; i < accounts.length; i++) {
        const a = accounts[i]!; // loop condition guarantees i < accounts.length
        const hostname = new URL(a.url).hostname;
        console.log(`    [${i + 1}] ${hostname} - ${a.user || '(no username)'}`);
      }
    }
    return accounts;
  } catch (err) {
    console.log('  Could not scan browsers:', (err as Error).message);
    console.log('  You can still enter credentials manually.\n');
    return [];
  }
}

async function getCredentials(): Promise<{ hostname: string; username: string; password: string }[]> {
  const choice = await ask('\n  How would you like to proceed?\n    [1] Scan browsers for saved MyChart passwords (Recommended)\n    [2] Enter credentials manually\n  Choice (1 or 2): ');

  if (choice === '1') {
    const accounts = await discoverAccounts();

    if (accounts.length === 0) {
      console.log('\n  No accounts found. Falling back to manual entry.\n');
      return [await getManualCredentials()];
    }

    const selection = await ask(`\n  Which accounts to scrape?\n    [a] All of them\n    [#] Enter number (e.g. "1" or "1,3")\n    [m] Enter credentials manually instead\n  Choice: `);

    if (selection.toLowerCase() === 'm') {
      return [await getManualCredentials()];
    }

    let selectedAccounts: PasswordStoreEntryWithKey[];

    if (selection.toLowerCase() === 'a') {
      selectedAccounts = accounts;
    } else {
      const indices = selection.split(',').map(s => parseInt(s.trim()) - 1).filter(i => i >= 0 && i < accounts.length);
      if (indices.length === 0) {
        console.log('  Invalid selection. Using all accounts.');
        selectedAccounts = accounts;
      } else {
        selectedAccounts = indices.map(i => accounts[i]!); // indices were filtered to be in range
      }
    }

    return selectedAccounts.map(a => {
      const hostname = new URL(a.url).hostname;
      return {
        hostname,
        username: a.user || '',
        password: a.pass || '',
      };
    });
  }

  return [await getManualCredentials()];
}

async function getManualCredentials(): Promise<{ hostname: string; username: string; password: string }> {
  console.log('\n  Example hostnames:');
  console.log('    - mychart.example.org');
  console.log('    - mychart.ochsner.org');
  console.log('    - mychart.geisinger.org\n');

  const hostname = await ask('  MyChart hostname: ');
  const username = await ask('  Username: ');
  const password = await ask('  Password: ');

  if (!hostname || !username || !password) {
    console.log('\n  All fields are required. Exiting.');
    rl.close();
    process.exit(1);
  }

  return { hostname, username, password };
}

// ─── Types ───

type LoginCredentials =
  | { hostname: string; passkey: PasskeyCredential }
  | { hostname: string; username: string; password: string; totp?: string };

// ─── Step 2: Login ───

/**
 * Wire automatic session renewal: when a scrape's session expires mid-run,
 * makeAuthenticatedRequest calls this hook to silently log back in with
 * whatever non-interactive credentials exist (passkey, password, saved TOTP
 * secret) and refresh the cookie cache. Stores are re-read at renewal time so
 * a passkey or TOTP secret saved after login still counts.
 */
function wireCliSessionRenewal(mychartRequest: MyChartRequest, creds: LoginCredentials) {
  wireSilentReauthentication(mychartRequest, async () => ({
    hostname: creds.hostname,
    username: 'username' in creds ? creds.username : undefined,
    password: 'password' in creds ? creds.password : undefined,
    totpSecret: ('totp' in creds ? creds.totp : undefined) ?? await loadTotpSecret(creds.hostname),
    passkey: 'passkey' in creds ? creds.passkey : await loadPasskeyCredential(creds.hostname),
    protocol: cliArgs.local ? 'http' : undefined,
    onPasskeyUsed: (credential) => savePasskeyCredential(creds.hostname, credential),
  }), (renewed) => saveCachedSession(creds.hostname, renewed));
}

async function login(creds: LoginCredentials): Promise<MyChartRequest | null> {
  if (isBlockedInstance(creds.hostname)) {
    console.log(`\n  ✗ ${creds.hostname} is not supported. central.mychart.org is a portal aggregator and cannot be scraped directly. Please use the individual hospital MyChart instance instead.`);
    return null;
  }

  console.log(`\n  Connecting to ${creds.hostname}...`);

  // Try cached session first (unless --no-cache)
  if (!cliArgs.nocache) {
    const cached = await tryLoadCachedSession(creds.hostname);
    if (cached) {
      console.log('  Using cached session (skipping login).');
      wireCliSessionRenewal(cached, creds);
      return cached;
    }
  }

  try {
    // Passkey login
    if ('passkey' in creds) {
      console.log(`  Attempting passkey login for ${creds.hostname}...`);
      // MyChart enforces a strictly-increasing WebAuthn signature counter. Our
      // stored counter can lag the server's, which rejects the first attempt;
      // passkeyLoginWithCounterRetry bumps and retries to recover.
      const passkeyResult = await passkeyLoginWithCounterRetry(
        (credential) => myChartPasskeyLogin({
          hostname: creds.hostname,
          credential,
          protocol: cliArgs.local ? 'http' : undefined,
        }),
        creds.passkey,
      );

      if (passkeyResult.state === 'logged_in') {
        console.log('  Passkey login successful!');
        // Persist the accepted (incremented) sign counter so the next login
        // starts from the right place and doesn't have to retry.
        await savePasskeyCredential(creds.hostname, creds.passkey);
        await saveCachedSession(creds.hostname, passkeyResult.mychartRequest);
        wireCliSessionRenewal(passkeyResult.mychartRequest, creds);
        return passkeyResult.mychartRequest;
      }

      console.log(`  Passkey login failed (${passkeyResult.state}).`);
      return null;
    }

    // Password login
    const useTotpSecret = creds.totp ?? (cliArgs.useSavedTotp ? await loadTotpSecret(creds.hostname) : null);
    if (cliArgs.useSavedTotp && !useTotpSecret) {
      console.log(`  No saved TOTP secret found for ${creds.hostname}. Run with --set-up-totp first.`);
      return null;
    }

    // When using TOTP, skip the SendCode call (no email needed)
    const loginResult = await myChartUserPassLogin({
      hostname: creds.hostname,
      user: creds.username,
      pass: creds.password,
      skipSendCode: !!useTotpSecret,
      protocol: cliArgs.local ? 'http' : undefined,
    });

    if (loginResult.state === 'invalid_login') {
      console.log('  Login failed: Invalid username or password.');
      return null;
    }

    if (loginResult.state === 'error') {
      console.log(`  Login error: ${loginResult.error}`);
      return null;
    }

    let mychartRequest = loginResult.mychartRequest;

    if (loginResult.state === 'need_2fa') {
      let twofaCodeArray: { code: string; score: number }[];

      // Show where the code was sent (helpful for any path).
      if (loginResult.twoFaDelivery) {
        const { method, contact } = loginResult.twoFaDelivery;
        if (method === 'sms') {
          console.log(`  2FA code sent via text message${contact ? ` to ${contact}` : ''}`);
        } else {
          console.log(`  2FA code sent via email${contact ? ` to ${contact}` : ''}`);
        }
      }

      if (useTotpSecret) {
        // Generate TOTP code locally — no email, no waiting
        const totpCode = await generateTotpCode(useTotpSecret);
        // The code is submitted programmatically — printing it only puts a
        // live credential in the terminal scrollback.
        console.log('  Generated TOTP code locally.');
        twofaCodeArray = [{ code: totpCode, score: 1 }];
      } else if (cliArgs.twofa) {
        console.log('  Using 2FA code from --2fa arg');
        twofaCodeArray = [{ code: cliArgs.twofa, score: 1 }];
      } else {
        // Default: prompt the user for the code from their phone / email.
        const code = (await ask('  Enter 2FA code: ')).trim();
        if (!code) {
          console.log('  No 2FA code entered. Skipping this account.');
          return null;
        }
        twofaCodeArray = [{ code, score: 1 }];
      }

      const twoFaResult = await complete2faFlow({
        mychartRequest,
        twofaCodeArray,
        isTOTP: !!useTotpSecret,
      });

      if (twoFaResult.state === 'invalid_2fa') {
        console.log('  Invalid 2FA code.');
        return null;
      }

      if (twoFaResult.state === 'error') {
        console.log('  Error completing 2FA.');
        return null;
      }

      mychartRequest = twoFaResult.mychartRequest;

      // After successful email-based 2FA, offer TOTP auto-setup
      if (!useTotpSecret && !cliArgs.setupTotp) {
        const existingSecret = await loadTotpSecret(creds.hostname);
        if (!existingSecret) {
          console.log('\n  To let the CLI sign in automatically in the future, we can set up');
          console.log('  a TOTP authenticator on your MyChart account (no email codes needed).');
          const setupChoice = await ask('  Set up automatic sign-in? (y/n): ');
          if (setupChoice.trim().toLowerCase() === 'y') {
            console.log('  Setting up TOTP authenticator...');
            const result = await setupTotp(mychartRequest, creds.password);
            if (result.secret) {
              await saveTotpSecret(creds.hostname, result.secret);
              console.log('  TOTP configured! Future logins will use --use-saved-totp automatically.');
            } else {
              console.log(`  TOTP setup failed: ${result.error}`);
              console.log('  Your session is still active but will expire in a few hours.');
              console.log('  Without TOTP, you\'ll need email 2FA again next time.');
            }
          } else {
            console.log('  Skipped TOTP setup. Your session will expire in a few hours.');
            console.log('  Tip: Use --set-up-totp later to enable automatic sign-in.');
          }
        }
      }
    }

    console.log('  Logged in successfully!');
    await saveCachedSession(creds.hostname, mychartRequest);
    wireCliSessionRenewal(mychartRequest, creds);
    return mychartRequest;
  } catch (err) {
    console.error('  Login failed:', (err as Error).message);
    return null;
  }
}

// ─── Step 3: Scrape everything ───
//
// The default no-`--action` run. There is no hand-written per-category
// fetching or rendering here any more: every category is a registry
// capability, dispatched through `runCapabilityAction` →
// `executeCapability` like any other `--action`, so the full scrape gets
// the same active-patient guard and prints the same JSON. What gets
// scraped is `FULL_SCRAPE_CAPABILITIES` — derived from the registry, so a
// read capability added there is scraped here with no CLI change.

async function scrapeAll(
  session: { hostname: string; request: MyChartRequest },
  password: string | undefined,
): Promise<boolean> {
  header(`Scraping: ${session.hostname}`);
  console.log('  This may take a minute...');

  let failures = 0;
  for (const capability of FULL_SCRAPE_CAPABILITIES) {
    const ok = await runCapabilityAction(
      capability,
      session,
      password,
      {},
      cliArgs.output,
      cliArgs.patient,
    );
    if (!ok) failures++;
  }

  if (failures > 0) {
    console.log(`
  ${failures} of ${FULL_SCRAPE_CAPABILITIES.length} categories failed on ${session.hostname}; see above.`);
  }
  return failures === 0;
}

// ─── Send Message Handler ───

async function handleSendMessage(mychartRequest: MyChartRequest) {
  header('Send New Message');

  const token = await getVerificationToken(mychartRequest);
  if (!token) {
    console.log('  Could not get verification token. Session may have expired.');
    return;
  }

  // Get available topics
  const topics = await getMessageTopics(mychartRequest, token);
  if (topics.length === 0) {
    console.log('  No message topics available.');
    return;
  }

  console.log('\n  Available topics:');
  for (let i = 0; i < topics.length; i++) {
    console.log(`    [${i + 1}] ${topics[i]!.displayName}`); // loop bound guarantees the index
  }

  const topicChoice = await ask('\n  Select topic number: ');
  const topicIdx = parseInt(topicChoice) - 1;
  if (topicIdx < 0 || topicIdx >= topics.length) {
    console.log('  Invalid topic selection.');
    return;
  }
  const selectedTopic = topics[topicIdx]!; // range-checked just above

  // Get available recipients
  const recipients = await getMessageRecipients(mychartRequest, token);
  if (recipients.length === 0) {
    console.log('  No recipients available.');
    return;
  }

  console.log('\n  Available recipients:');
  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i]!; // loop bound guarantees the index
    const specialty = r.specialty ? ` (${r.specialty})` : r.pcpTypeDisplayName ? ` (${r.pcpTypeDisplayName})` : '';
    console.log(`    [${i + 1}] ${r.displayName}${specialty}`);
  }

  const recipientChoice = await ask('\n  Select recipient number: ');
  const recipientIdx = parseInt(recipientChoice) - 1;
  if (recipientIdx < 0 || recipientIdx >= recipients.length) {
    console.log('  Invalid recipient selection.');
    return;
  }
  const selectedRecipient = recipients[recipientIdx]!; // range-checked just above

  const subject = cliArgs.subject || await ask('\n  Subject: ');
  const messageBody = cliArgs.message || await ask('  Message: ');

  if (!subject || !messageBody) {
    console.log('  Subject and message are required.');
    return;
  }

  console.log(`\n  Sending message to ${selectedRecipient.displayName}...`);
  console.log(`  Topic: ${selectedTopic.displayName}`);
  console.log(`  Subject: ${subject}`);
  console.log(`  Message: ${messageBody}\n`);

  const result = await sendNewMessage(mychartRequest, {
    recipient: selectedRecipient,
    topic: selectedTopic,
    subject,
    messageBody,
  });

  if (result.success) {
    console.log('  Message sent successfully!');
    console.log(`  Conversation ID: ${result.conversationId}`);
  } else {
    console.log(`  Failed to send message: ${result.error}`);
  }
}

// ─── Send Reply Handler ───

async function handleSendReply(mychartRequest: MyChartRequest) {
  header('Send Reply');

  let conversationId = cliArgs.conversationId;
  let messageBody = cliArgs.message;

  if (!conversationId) {
    // List conversations and let user pick
    subheader('Recent Conversations');
    const conversations = await listConversations(mychartRequest);
    const convoList = conversations?.conversations || [];

    if (convoList.length === 0) {
      console.log('  No conversations found.');
      return;
    }

    for (let i = 0; i < Math.min(convoList.length, 10); i++) {
      const c = convoList[i]!; // loop bound guarantees the index
      const audience = c.audience?.map((a: { name: string }) => a.name).join(', ') || 'System';
      console.log(`    [${i + 1}] "${c.subject}" - ${audience}`);
    }

    const convoChoice = await ask('\n  Select conversation to reply to: ');
    const convoIdx = parseInt(convoChoice) - 1;
    if (convoIdx < 0 || convoIdx >= convoList.length) {
      console.log('  Invalid selection.');
      return;
    }
    conversationId = convoList[convoIdx]!.hthId; // range-checked just above
  }

  if (!messageBody) {
    messageBody = await ask('\n  Reply message: ');
  }

  if (!messageBody) {
    console.log('  Message is required.');
    return;
  }

  console.log(`\n  Sending reply...`);
  console.log(`  Message: ${messageBody}\n`);

  const result = await sendReply(mychartRequest, {
    conversationId: conversationId!,
    messageBody,
  });

  if (result.success) {
    console.log('  Reply sent successfully!');
    console.log(`  Conversation ID: ${result.conversationId}`);
  } else {
    console.log(`  Failed to send reply: ${result.error}`);
  }
}

// ─── Main ───

async function main() {
  // Fire-and-forget telemetry — never blocks or breaks the CLI
  sendTelemetryEvent('cli_started', {
    action: cliArgs.action || 'default',
    host: cliArgs.host || 'unknown',
  }, 'cli');

  // Fire-and-forget update check — never blocks or breaks the CLI
  void checkForUpdate({ currentVersion: CLI_VERSION, packageName: 'cli' });

  // Saying what the CLI can do needs no account and no network. Both listings
  // lead with the commonly-used capabilities and name `--show-all` for the rest.
  if (cliArgs.help) {
    console.log(renderCliHelp({ showAll: cliArgs.showAll }));
    closeRL();
    return;
  }
  if (cliArgs.listCapabilities) {
    console.log(renderCapabilityList({ showAll: cliArgs.showAll }));
    closeRL();
    return;
  }

  header('MyChart Scraper - Terminal');

  // ─── Resolve credentials from browser passwords ───
  // --read-login-from-browser: scan browser password stores for the given --host (or pick from all MyChart accounts)
  if (cliArgs.readLoginFromBrowser) {
    console.log('\n  Scanning browser password stores for saved MyChart credentials...');
    const accounts = await getMyChartAccounts();
    if (cliArgs.host) {
      const match = accounts.find(a => {
        try { return new URL(a.url).hostname === cliArgs.host; } catch { return false; }
      });
      if (match && match.user && match.pass) {
        console.log(`  Found credentials for ${cliArgs.host} (user: ${match.user})`);
        cliArgs.user = match.user;
        cliArgs.pass = match.pass;
      } else {
        console.log(`  No saved credentials found for ${cliArgs.host}.`);
        closeRL();
        process.exit(1);
      }
    } else {
      // No --host: pick the first MyChart account found
      if (accounts.length === 0) {
        console.log('  No MyChart credentials found in any browser.');
        closeRL();
        process.exit(1);
      }
      const first = accounts[0]!; // non-empty checked just above
      cliArgs.host = new URL(first.url).hostname;
      cliArgs.user = first.user!;
      cliArgs.pass = first.pass!;
      console.log(`  Using ${cliArgs.host} (user: ${cliArgs.user})`);
    }
  } else if (cliArgs.host && !cliArgs.user && !cliArgs.pass) {
    // Check for saved passkey first — no username/password needed
    const savedPasskey = await loadPasskeyCredential(cliArgs.host);
    if (savedPasskey) {
      console.log(`\n  Found saved passkey for ${cliArgs.host}. Logging in with passkey...`);
      cliArgs.usePasskey = true;
    } else {
      const resolved = await resolveCredsFromBrowsers(cliArgs.host);
      if (resolved) {
        cliArgs.user = resolved.user;
        cliArgs.pass = resolved.pass;
      } else {
        console.log(`\n  Could not find credentials for ${cliArgs.host}.`);
        console.log(`  Provide them: npx tsx src/cli.ts --host ${cliArgs.host} --user X --pass Y\n`);
        closeRL();
        process.exit(1);
      }
    }
  }
  nonInteractive = !!(cliArgs.host && (cliArgs.usePasskey || (cliArgs.user && cliArgs.pass)));

  let credentialsList: LoginCredentials[];

  if (nonInteractive) {
    // Non-interactive mode: credentials from CLI args, Keychain, or passkey
    console.log(`\n  Non-interactive mode: --host ${cliArgs.host}`);
    if (cliArgs.usePasskey) {
      const passkey = await loadPasskeyCredential(cliArgs.host!);
      if (!passkey) {
        console.log(`  No saved passkey found for ${cliArgs.host}. Run with --set-up-passkey first.`);
        closeRL();
        process.exit(1);
      }
      credentialsList = [{ hostname: cliArgs.host!, passkey }];
    } else {
      credentialsList = [{ hostname: cliArgs.host!, username: cliArgs.user!, password: cliArgs.pass! }];
    }
  } else {
    console.log('\n  This tool logs into your MyChart account(s) and scrapes');
    console.log('  your medical data (profile, bills, visits, labs, messages).');
    credentialsList = await getCredentials();
  }

  if (credentialsList.length === 0) {
    console.log('\n  No accounts to scrape. Exiting.');
    closeRL();
    process.exit(0);
  }

  header('Logging In');

  const sessions: { hostname: string; request: MyChartRequest }[] = [];

  for (const creds of credentialsList) {
    const mychartRequest = await login(creds);
    if (mychartRequest) {
      sessions.push({ hostname: creds.hostname, request: mychartRequest });
    }
  }

  if (sessions.length === 0) {
    console.log('\n  Could not log in to any accounts. Exiting.');
    closeRL();
    process.exit(1);
  }

  console.log(`\n  Successfully logged in to ${sessions.length} account(s).`);

  // The password that resolved a session, for the account-security
  // capabilities that need it (TOTP setup wants the account password).
  const passwordFor = (hostname: string): string | undefined => {
    const creds = credentialsList.find(c => c.hostname === hostname);
    return creds && 'password' in creds ? creds.password : undefined;
  };

  /** Run one registry capability on every session; exits the process. */
  const runForAllSessions = async (
    capability: Capability,
    args: Record<string, string> = {},
  ): Promise<never> => {
    let ok = true;
    for (const session of sessions) {
      if (!(await runCapabilityAction(capability, session, passwordFor(session.hostname), args, cliArgs.output, cliArgs.patient))) {
        ok = false;
      }
    }
    closeRL();
    process.exit(ok ? 0 : 1);
  };

  // ── Explicit patient switch: the ONLY command that changes MyChart state ──
  //
  // MyChart's active patient lives in the server-side session, so changing it
  // is a real mutation. It gets its own deliberate command rather than
  // happening as a side effect of a read. The flag is sugar for the
  // switch_proxy_target capability, which verifies the switch against the
  // profile page before reporting success.
  if (cliArgs.switchPatient !== undefined) {
    await runForAllSessions(getCapability('switch_proxy_target')!, { patient: cliArgs.switchPatient });
  }

  // ── Every other command asserts which patient it is reading, and refuses ──
  //
  // Reads never mutate. If MyChart is pointed at a different patient than this
  // command is about, stop and say so rather than switching silently — a read
  // that quietly changes server state is how you end up scraping the wrong
  // person's chart without noticing.
  //
  // No --patient means the account holder, stated explicitly, because the CLI
  // resumes sessions from cached cookies and would otherwise inherit whichever
  // patient an earlier invocation left behind.
  // The patient-record commands are the exception: asserting "you must already
  // be on patient X" before letting someone list the records or switch to one
  // would make those commands unusable exactly when they are needed.
  const actionIsAboutPatients =
    cliArgs.action !== undefined && resolveCliAction(cliArgs.action)?.group === 'Patients';

  if (!actionIsAboutPatients) {
    for (const session of sessions) {
      let check;
      try {
        check = await checkProxyContext(session.request, cliArgs.patient);
      } catch (err) {
        const why = (err as Error).message;
        if (cliArgs.patient) {
          // A specific patient was asked for and we can't confirm we're on
          // them. Refusing is the whole point.
          console.log(`\n  ${why}`);
          closeRL();
          process.exit(1);
        }
        // Nobody asked for a proxy patient. Most accounts have no proxy access
        // at all, and two of the three discovery surfaces are inferred rather
        // than captured from a real instance — so a parsing miss here must not
        // break an ordinary scrape that has nothing to do with this feature.
        console.log(`  Note: could not determine the active patient on ${session.hostname} (${why}). Continuing.`);
        continue;
      }

      // Single-record account: no proxy surface, nothing to assert.
      if (!check.wanted) {
        if (cliArgs.patient) {
          console.log(`\n  ${session.hostname} has access to only one patient record, so --patient cannot be used.`);
          closeRL();
          process.exit(1);
        }
        continue;
      }

      if (check.active) {
        console.log(`  Reading ${session.hostname} as: ${check.wanted.displayName}${check.wanted.isSelf ? ' (your own record)' : ''}`);
        continue;
      }

      const host = session.hostname;
      const wantedName = check.wanted.displayName;
      const currentName = check.current
        ? check.current.displayName
        : 'an unknown patient (this MyChart does not report which record is active)';

      console.log(`\n  Refusing to read: ${host} is currently on ${currentName}, but this command is about ${wantedName}.`);
      console.log('\n  The active patient is stored on MyChart\'s server, so it has to be changed');
      console.log('  deliberately — reading never changes it. Run:');
      console.log(`\n    mychart-cli --host ${host} --action list-proxies     # every patient name on this account`);
      console.log(`    mychart-cli --host ${host} --switch ${JSON.stringify(wantedName)}`);
      console.log('\n  then re-run this command.');
      closeRL();
      process.exit(1);
    }
  }

  // ── The account-security flags ──
  //
  // Each flag is sugar for an `account`-kind registry capability. The
  // capability reads and writes the CLI's own TOTP and passkey stores through
  // capabilityContext, exactly as the equivalent `--action setup_totp` would.
  const accountFlagCapabilityId =
    (cliArgs.setupTotp && 'setup_totp') ||
    (cliArgs.disableTotp && 'disable_totp') ||
    (cliArgs.setupPasskey && 'register_passkey') ||
    (cliArgs.listPasskeys && 'list_passkeys') ||
    (cliArgs.deletePasskey && 'delete_passkey') ||
    undefined;
  if (accountFlagCapabilityId) {
    await runForAllSessions(getCapability(accountFlagCapabilityId)!);
  }

  // Handle send-message action
  if (cliArgs.action === 'send-message') {
    for (const session of sessions) {
      await handleSendMessage(session.request);
    }
    closeRL();
    return;
  }

  // Handle send-reply action
  if (cliArgs.action === 'send-reply') {
    for (const session of sessions) {
      await handleSendReply(session.request);
    }
    closeRL();
    return;
  }

  // Handle get-imaging action: every study on the account, downloaded and
  // decoded. A composite of get_imaging_results + download_imaging_study,
  // both dispatched through executeCapability.
  if (cliArgs.action === 'get-imaging') {
    let ok = true;
    for (const session of sessions) {
      const succeeded = await downloadAllImagingStudies(session, passwordFor(session.hostname), {
        outputDir: cliArgs.output,
        patient: cliArgs.patient,
        saveClo: cliArgs.saveClo,
      });
      if (!succeeded) ok = false;
    }
    closeRL();
    process.exit(ok ? 0 : 1);
  }

  // Handle keep-alive-test action — use shared sessionStore keepalive
  if (cliArgs.action === 'keep-alive-test') {
    closeRL();

    // Register all sessions in the shared store
    for (const session of sessions) {
      sessionStore.set(session.hostname, session.request, { hostname: session.hostname });
    }

    console.log('\n  ── Keep-Alive Test Mode ──');
    console.log(`  Pinging KeepAlive every 30s for ${sessions.length} session(s).`);
    console.log('  Press Ctrl+C to stop.\n');

    // Ping immediately, then start the interval
    await sessionStore.runKeepalive();
    sessionStore.startKeepalive();
    return;
  }

  // Any capability from the shared registry, by id — or one of the dashed
  // spellings the CLI has always accepted (list-proxies, get-thread,
  // delete-message, request-refill), which resolve to the same registry
  // entries. Runs after the bespoke interactive actions above.
  if (cliArgs.action) {
    const capability = resolveCliAction(cliArgs.action);
    if (!capability) {
      console.log(`\n  Unknown --action "${cliArgs.action}".`);
      console.log(`  Capabilities: ${COMMON_CAPABILITIES.map(c => c.id).join(', ')}`);
      console.log(
        `  …and ${LESS_FREQUENTLY_USED_CAPABILITIES.length} less-frequently-used ones. Run  mychart-cli --list-capabilities [--show-all]  for the full list with arguments.`,
      );
      closeRL();
      process.exit(1);
    }
    // `--conversation-id <id>` predates `--arg`; keep honoring it for the
    // capabilities that take one (get-thread, delete-message, send_reply).
    const capabilityArgs = { ...(cliArgs.capabilityArgs ?? {}) };
    if (
      cliArgs.conversationId !== undefined &&
      capabilityArgs.conversation_id === undefined &&
      capability.params.some(p => p.name === 'conversation_id')
    ) {
      capabilityArgs.conversation_id = cliArgs.conversationId;
    }
    await runForAllSessions(capability, capabilityArgs);
  }

  // Default: scrape every argument-free read capability in the registry.
  let allOk = true;
  for (const session of sessions) {
    if (!(await scrapeAll(session, passwordFor(session.hostname)))) allOk = false;
  }

  header('Done!');
  console.log(`  Scraped ${sessions.length} MyChart account(s).`);
  console.log('  All available data has been displayed above.\n');
  if (!allOk) console.log('  Some categories failed; see the per-category output above.\n');

  closeRL();
}

/**
 * main() plus the fatal-error handler. Called by `entry.ts` (which is also
 * what the published binary is built from), or directly below when this file
 * itself is the entry module — importing this module no longer runs the CLI,
 * so tests can reach its internals.
 */
export async function runCli(): Promise<void> {
  try {
    await main();
  } catch (err) {
    console.error('Fatal error:', err);
    closeRL();
    process.exit(1);
  }
}

if (import.meta.main) {
  void runCli();
}
