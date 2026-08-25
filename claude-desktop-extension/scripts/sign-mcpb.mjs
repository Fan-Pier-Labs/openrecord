/**
 * Sign a freshly packed `openrecord.mcpb` with the Fan Pier Labs Developer ID.
 *
 * `mcpb sign` wants the certificate and private key as PEM files, and the
 * Developer ID key lives in the login keychain, which will not hand one out.
 * The bridge is a PKCS#12 exported from Keychain Access once, by hand (see the
 * README); this unpacks it into a 0700 temp directory that is deleted on the
 * way out, and never puts the passphrase on a command line.
 *
 * The signature is then checked here, because `mcpb verify` cannot: it — and
 * the copy of the same code inside Claude Desktop — verifies by calling
 * node-forge's `pkcs7.verify()`, a stub that throws, which the caller catches
 * and reports as `unsigned`. So every .mcpb reads as unsigned today, signed or
 * not. `openssl cms -verify` over the signed bytes and `security verify-cert -p
 * codeSign` over the chain are what a working verifier would do — and the
 * codeSign policy covers expiry and the code-signing usage too, so there is no
 * separate certificate check here.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTENSION_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const P12 = process.env.MCPB_SIGNING_P12 ?? path.join(os.homedir(), '.config', 'fan-pier-labs', 'mcpb-signing.p12');
const PASSWORD_SERVICE = 'mcpb-signing-p12';
const TARGET = path.resolve(process.argv[2] ?? path.join(EXTENSION_DIR, 'openrecord.mcpb'));

// macOS always has this one, and the p12 Keychain Access writes uses legacy
// ciphers that OpenSSL 3 refuses without `-legacy` and LibreSSL just reads.
const OPENSSL = '/usr/bin/openssl';

const run = (cmd, args, env) =>
  execFileSync(cmd, args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'], env });

function fail(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(TARGET)) fail(`No bundle at ${TARGET} — run \`bun run pack\` first.`);
if (!fs.existsSync(P12)) {
  fail(
    `No signing bundle at ${P12}.\n` +
      `    Export the Developer ID once from Keychain Access (login → My\n` +
      `    Certificates → right-click → Export…), save it there, then store its\n` +
      `    passphrase: security add-generic-password -s ${PASSWORD_SERVICE} -a "$USER" -w`,
  );
}

let passphrase = process.env.MCPB_SIGNING_P12_PASSWORD;
if (!passphrase) {
  try {
    passphrase = run('security', ['find-generic-password', '-s', PASSWORD_SERVICE, '-w']).trim();
  } catch {
    fail(`No passphrase for ${P12}. Set MCPB_SIGNING_P12_PASSWORD, or store it in the keychain under "${PASSWORD_SERVICE}".`);
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpb-sign-'));
fs.chmodSync(dir, 0o700);
const at = name => path.join(dir, name);

try {
  // The passphrase goes through the environment, not argv, where `ps` shows it.
  const env = { ...process.env, MCPB_P12_PASS: passphrase };
  const p12 = ['pkcs12', '-in', P12, '-passin', 'env:MCPB_P12_PASS'];
  fs.writeFileSync(at('cert.pem'), run(OPENSSL, [...p12, '-clcerts', '-nokeys'], env), { mode: 0o600 });
  fs.writeFileSync(at('key.pem'), run(OPENSSL, [...p12, '-nocerts', '-nodes'], env), { mode: 0o600 });
  fs.writeFileSync(at('chain.pem'), run(OPENSSL, [...p12, '-cacerts', '-nokeys'], env), { mode: 0o600 });

  // `-i` is variadic, so it goes last or it swallows the bundle path.
  run('npx', ['-y', '@anthropic-ai/mcpb', 'sign', TARGET, '-c', at('cert.pem'), '-k', at('key.pem'), '-i', at('chain.pem')]);

  // mcpb appends `MCPB_SIG_V1` + uint32le length + DER + `MCPB_SIG_END` after
  // the zip; everything before that header is what the signature covers.
  const signed = fs.readFileSync(TARGET);
  const header = signed.lastIndexOf('MCPB_SIG_V1');
  if (header === -1) fail('mcpb sign left no signature block on the bundle.');
  fs.writeFileSync(at('content.bin'), signed.subarray(0, header));
  fs.writeFileSync(at('signature.der'), signed.subarray(header + 15, signed.length - 12));

  // `-binary` because mcpb signs raw bytes: without it openssl would hash a
  // text-canonicalized copy. `-noverify` because the chain is checked below,
  // against the OS trust store, which is where a real verifier looks.
  run(OPENSSL, ['cms', '-verify', '-binary', '-noverify', '-inform', 'DER',
    '-in', at('signature.der'), '-content', at('content.bin'), '-out', '/dev/null']);

  fs.writeFileSync(at('full.pem'), fs.readFileSync(at('cert.pem')) + fs.readFileSync(at('chain.pem')));
  try {
    run('security', ['verify-cert', '-c', at('full.pem'), '-p', 'codeSign']);
  } catch {
    fail('The signature is good but its certificate chain is not trusted for code signing on this machine — which is what a verifier checks.');
  }

  console.log(`\n  ✓ signed ${path.relative(process.cwd(), TARGET)} with`);
  console.log(run(OPENSSL, ['x509', '-in', at('cert.pem'), '-noout', '-subject', '-enddate']));
  console.log('  Claude Desktop still shows it as unsigned — see README.md#signing-a-release.\n');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
