/**
 * Sign `openrecord.mcpb` with the Fan Pier Labs Developer ID certificate.
 *
 * `mcpb sign` wants a certificate and a private key as PEM files on disk, and
 * an Apple Developer ID private key lives in the login keychain, which does not
 * hand out PEM. The bridge is a PKCS#12 bundle exported from Keychain Access
 * once, by hand (see the README) — this script reads that, unpacks it into a
 * 0700 temp directory that is deleted on the way out, and shells out to
 * `mcpb sign`. The private key never lands anywhere the repo can see it and is
 * never passed on a command line.
 *
 * Then it checks its own work, because `mcpb verify` currently cannot: the
 * verifier in @anthropic-ai/mcpb (and the copy bundled in Claude Desktop) calls
 * node-forge's `pkcs7.verify()`, which is a stub that throws "PKCS#7 signature
 * verification not yet implemented", and the caller catches that and reports
 * `unsigned`. Every .mcpb reads as unsigned today, signed or not. So the
 * signature is checked here the way a working verifier would: `openssl cms
 * -verify` over the exact bytes that were signed, plus a `security verify-cert
 * -p codeSign` trust check on the chain. See ../README.md#signing-a-release for
 * what that means for shipping.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTENSION_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Appended-signature-block markers, from @anthropic-ai/mcpb's `sign.ts`. */
const SIGNATURE_HEADER = 'MCPB_SIG_V1';
const SIGNATURE_FOOTER = 'MCPB_SIG_END';

/** The only identity a release may be signed with. */
const DEFAULT_IDENTITY = 'Developer ID Application: Fan Pier Labs LLC (CA25MAKF9Z)';

/** Where the hand-exported PKCS#12 bundle lives, absent an override. */
const DEFAULT_P12 = path.join(os.homedir(), '.config', 'fan-pier-labs', 'mcpb-signing.p12');

/** Keychain generic-password item the p12 passphrase is read from. */
const PASSWORD_SERVICE = 'mcpb-signing-p12';

/**
 * macOS always has this one, and the p12 Keychain Access writes uses legacy
 * ciphers that OpenSSL 3 refuses without `-legacy` and LibreSSL just reads.
 */
const OPENSSL = '/usr/bin/openssl';

/**
 * Splits a signed .mcpb into the bytes that were signed and the PKCS#7 blob.
 *
 * Mirrors `extractSignatureBlock` in @anthropic-ai/mcpb: the block is appended
 * after the zip's end-of-central-directory record as `MCPB_SIG_V1` + uint32le
 * length + DER + `MCPB_SIG_END`, and is located by searching backwards from the
 * LAST footer, so a bundle signed twice resolves to its outermost signature.
 */
export function extractSignatureBlock(
  file: Buffer,
): { content: Buffer; signature: Buffer } | null {
  const footer = Buffer.from(SIGNATURE_FOOTER, 'utf-8');
  const header = Buffer.from(SIGNATURE_HEADER, 'utf-8');
  const footerAt = file.lastIndexOf(footer);
  if (footerAt === -1) return null;

  let headerAt = -1;
  for (let i = footerAt - 1; i >= 0; i--) {
    if (file.subarray(i, i + header.length).equals(header)) {
      headerAt = i;
      break;
    }
  }
  if (headerAt === -1) return null;

  const lengthAt = headerAt + header.length;
  if (lengthAt + 4 > file.length) return null;
  const length = file.readUInt32LE(lengthAt);
  const signature = file.subarray(lengthAt + 4, lengthAt + 4 + length);
  if (signature.length !== length) return null;

  return { content: file.subarray(0, headerAt), signature };
}

/** One certificate, as much of it as the checks below need. */
export interface CertificateSummary {
  commonName: string;
  notAfter: Date;
  isCodeSigning: boolean;
  sha256: string;
}

/**
 * Reads the fields this script asserts on out of `openssl x509` output.
 *
 * Kept separate from the openssl call so the parsing has a test — the failure
 * it guards against is silent: a subject line this did not recognize would
 * leave `commonName` empty, and an identity check against an empty string is
 * one that never fires.
 */
export function parseCertificateSummary(opensslOutput: string): CertificateSummary {
  const field = (name: string): string =>
    new RegExp(`^${name}\\s*=\\s*(.*)$`, 'm').exec(opensslOutput)?.[1]?.trim() ?? '';

  // LibreSSL prints `subject= /UID=…/CN=…`, OpenSSL 3 `subject=UID=…, CN=…`.
  const commonName = /(?:^|[/,])\s*CN\s*=\s*([^/,\n]+)/.exec(field('subject'))?.[1]?.trim() ?? '';
  const sha256 = field('SHA256 Fingerprint').replace(/:/g, '').toLowerCase();

  return {
    commonName,
    notAfter: new Date(field('notAfter')),
    // From the `-text` dump: LibreSSL has neither `-ext` nor a code-signing
    // row in `-purpose`, so the extension block is read directly.
    isCodeSigning: /Extended Key Usage:[\s\S]{0,200}?\bCode Signing\b/.test(opensslOutput),
    sha256,
  };
}

/** Runs a command, returning stdout; stderr is inherited so failures are read. */
function run(command: string, args: string[], env?: NodeJS.ProcessEnv): string {
  return execFileSync(command, args, {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: env ?? process.env,
  });
}

/**
 * Reads the p12 passphrase, preferring the environment (CI) over the keychain
 * item (a laptop). Returned, never logged, and handed to openssl through the
 * environment rather than argv, where `ps` would show it.
 */
function resolvePassphrase(): string {
  const fromEnv = process.env.MCPB_SIGNING_P12_PASSWORD;
  if (fromEnv) return fromEnv;

  try {
    return run('security', ['find-generic-password', '-s', PASSWORD_SERVICE, '-w']).trim();
  } catch {
    throw new Error(
      `No passphrase for the signing bundle.\n` +
        `Set MCPB_SIGNING_P12_PASSWORD, or store it once:\n` +
        `  security add-generic-password -s ${PASSWORD_SERVICE} -a "$USER" -w`,
    );
  }
}

/** Unpacks the p12 into `dir`, returning the paths `mcpb sign` needs. */
function unpackP12(
  p12: string,
  passphrase: string,
  dir: string,
): { cert: string; key: string; chain: string } {
  const cert = path.join(dir, 'cert.pem');
  const key = path.join(dir, 'key.pem');
  const chain = path.join(dir, 'chain.pem');
  const env = { ...process.env, MCPB_P12_PASS: passphrase };
  const common = ['pkcs12', '-in', p12, '-passin', 'env:MCPB_P12_PASS'];

  fs.writeFileSync(cert, run(OPENSSL, [...common, '-clcerts', '-nokeys'], env), { mode: 0o600 });
  fs.writeFileSync(key, run(OPENSSL, [...common, '-nocerts', '-nodes'], env), { mode: 0o600 });
  fs.writeFileSync(chain, run(OPENSSL, [...common, '-cacerts', '-nokeys'], env), { mode: 0o600 });

  if (!fs.readFileSync(key, 'utf-8').includes('PRIVATE KEY')) {
    throw new Error(`${p12} holds no private key — export the identity, not just its certificate.`);
  }
  return { cert, key, chain };
}

/** Refuses to sign with a certificate that is expired, wrong, or not for code. */
function checkCertificate(cert: string, expectedIdentity: string): CertificateSummary {
  const summary = parseCertificateSummary(
    run(OPENSSL, [
      'x509',
      '-in',
      cert,
      '-noout',
      '-subject',
      '-enddate',
      '-fingerprint',
      '-sha256',
      '-text',
    ]),
  );

  if (summary.commonName !== expectedIdentity) {
    throw new Error(
      `Refusing to sign: the bundle holds "${summary.commonName}", not "${expectedIdentity}".`,
    );
  }
  if (!(summary.notAfter.getTime() > Date.now())) {
    throw new Error(`Refusing to sign: the certificate expired ${summary.notAfter.toISOString()}.`);
  }
  if (!summary.isCodeSigning) {
    throw new Error('Refusing to sign: the certificate is not valid for code signing.');
  }
  return summary;
}

/**
 * Verifies the signature the way a working verifier would.
 *
 * `-binary` matters: mcpb signs the raw file bytes, so the S/MIME text
 * canonicalization openssl applies by default would hash something else.
 * `-noverify` skips openssl's own chain building — the chain is checked against
 * the OS trust store instead, which is what Claude Desktop does.
 */
function verifySignature(mcpb: string, dir: string): void {
  const block = extractSignatureBlock(fs.readFileSync(mcpb));
  if (!block) throw new Error(`${mcpb} has no signature block after signing.`);

  const content = path.join(dir, 'signed-content.bin');
  const signature = path.join(dir, 'signature.der');
  fs.writeFileSync(content, block.content);
  fs.writeFileSync(signature, block.signature);

  run(OPENSSL, [
    'cms',
    '-verify',
    '-binary',
    '-noverify',
    '-inform',
    'DER',
    '-in',
    signature,
    '-content',
    content,
    '-out',
    '/dev/null',
  ]);
}

/** Chain check under the code-signing policy — the OS trust store, as shipped. */
function checkChainIsTrusted(cert: string, chain: string, dir: string): void {
  const full = path.join(dir, 'full-chain.pem');
  fs.writeFileSync(full, fs.readFileSync(cert, 'utf-8') + fs.readFileSync(chain, 'utf-8'));
  try {
    run('security', ['verify-cert', '-c', full, '-p', 'codeSign']);
  } catch {
    throw new Error(
      'The signature is good but the certificate chain is not trusted for code ' +
        'signing on this machine, which is what a verifier would check. Export ' +
        'the identity WITH its issuing certificates, or install the missing ' +
        'Apple intermediate.',
    );
  }
}

function main(): void {
  const target = path.resolve(process.argv[2] ?? path.join(EXTENSION_DIR, 'openrecord.mcpb'));
  const p12 = process.env.MCPB_SIGNING_P12 ?? DEFAULT_P12;
  const identity = process.env.MCPB_SIGNING_IDENTITY ?? DEFAULT_IDENTITY;

  if (!fs.existsSync(target)) {
    throw new Error(`No bundle at ${target} — run \`bun run pack\` first.`);
  }
  if (!fs.existsSync(p12)) {
    throw new Error(
      `No signing bundle at ${p12}.\n` +
        `Export the Developer ID identity once, from Keychain Access:\n` +
        `  login → My Certificates → "${identity}" → right-click → Export…\n` +
        `  save it as ${p12}, then store its passphrase:\n` +
        `  security add-generic-password -s ${PASSWORD_SERVICE} -a "$USER" -w\n` +
        `Or point MCPB_SIGNING_P12 somewhere else.`,
    );
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpb-sign-'));
  fs.chmodSync(dir, 0o700);
  try {
    const { cert, key, chain } = unpackP12(p12, resolvePassphrase(), dir);
    const summary = checkCertificate(cert, identity);

    // Signing appends, so signing twice would nest one block inside the next.
    if (extractSignatureBlock(fs.readFileSync(target))) {
      run('npx', ['-y', '@anthropic-ai/mcpb', 'unsign', target]);
    }

    const sign = ['-y', '@anthropic-ai/mcpb', 'sign', target, '-c', cert, '-k', key];
    // `-i` is variadic, so it goes last or it swallows the bundle path.
    if (fs.statSync(chain).size > 0) sign.push('-i', chain);
    run('npx', sign);

    verifySignature(target, dir);
    checkChainIsTrusted(cert, chain, dir);

    console.log(`\n  ✓ signed ${path.relative(process.cwd(), target)}`);
    console.log(`    publisher    ${summary.commonName}`);
    console.log(`    expires      ${summary.notAfter.toISOString().slice(0, 10)}`);
    console.log(`    fingerprint  ${summary.sha256}`);
    console.log(
      `\n  Claude Desktop still shows this bundle as unsigned — its verifier is\n` +
        `  broken for every .mcpb, signed or not. See README.md#signing-a-release.`,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    // A stack trace through execFileSync says nothing the message does not.
    console.error(`\n  ✗ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
