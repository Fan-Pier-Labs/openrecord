import * as fs from 'fs';
import * as path from 'path';

const TOTP_DIR = path.join(__dirname, '..', '.totp-secrets');

function getSecretPath(hostname: string): string {
  return path.join(TOTP_DIR, `${hostname}.txt`);
}

export async function saveTotpSecret(hostname: string, secret: string): Promise<void> {
  await fs.promises.mkdir(TOTP_DIR, { recursive: true });
  await fs.promises.writeFile(getSecretPath(hostname), secret, 'utf-8');
  console.log(`  TOTP secret saved to .totp-secrets/${hostname}.txt`);
}

export async function loadTotpSecret(hostname: string): Promise<string | null> {
  try {
    const secret = await fs.promises.readFile(getSecretPath(hostname), 'utf-8');
    return secret.trim();
  } catch {
    return null;
  }
}
