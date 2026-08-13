/**
 * `--help` — what the CLI is and every flag it takes, followed by the
 * capability listing.
 *
 * This lives outside `cli.ts` for the same reason `capabilityActions.ts` does:
 * `cli.ts` runs `main()` the moment it is imported, so anything a test needs to
 * read has to be importable on its own. The help text is exactly that — a test
 * asserts that the default listing leads with the useful capabilities and holds
 * the rest back, which is only checkable if rendering it costs nothing.
 */

import { renderCapabilityList, type CapabilityListOptions } from './capabilityActions';

/**
 * The full help text.
 *
 * The flag sections are always shown in full — there are only a couple of dozen
 * flags and hiding one would just mean a reader failing to find it. What
 * `showAll` gates is the capability listing, which is fifty entries of wildly
 * uneven value; see `Capability.lessFrequentlyUsed`.
 */
export function renderCliHelp(options: CapabilityListOptions = {}): string {
  const lines: string[] = [
    '',
    '  mychart-cli — read and act on an Epic MyChart account from the terminal.',
    '',
    '  Usage:',
    '    mychart-cli --host <hostname>                         Scrape every category and print it',
    '    mychart-cli --host <hostname> --action <capability>   Run one capability, print JSON',
    '    mychart-cli --help [--show-all]                       This text',
    '    mychart-cli --list-capabilities [--show-all]          Just the capability listing',
    '',
    '  Signing in:',
    '    --host <hostname>          MyChart hostname, e.g. mychart.example.org',
    '    --user <u> --pass <p>      Credentials; omit to look them up in the browser password stores',
    '    --read-login-from-browser  Force a browser password-store lookup (with or without --host)',
    '    --2fa <code>               Supply the 2FA code instead of being prompted for it',
    '    --no-cache                 Ignore the cached session cookies and log in fresh',
    '',
    "  Whose chart (accounts with proxy access to a family member's record):",
    '    --patient "<name>"         Assert the record this command is about; defaults to the account holder',
    '    --switch "<name>"          Change the record MyChart has active. The only command that does',
    '    --action list-proxies      Every record this account can reach',
    '',
    '  Running a capability:',
    '    --action <id>              Any id from the listing below',
    '    --arg name=value           A capability argument; repeat for each one',
    '',
    "  The account's own sign-in settings:",
    '    --set-up-passkey           Register a passkey and save it locally',
    '    --use-passkey              Log in with the saved passkey instead of a password',
    '    --list-passkeys            Passkeys registered on the account',
    '    --delete-passkey           Remove every passkey from the account',
    '    --set-up-totp              Turn on authenticator-app 2FA and save the secret',
    '    --use-saved-totp           Generate the 2FA code from the saved secret',
    '    --disable-totp             Turn authenticator-app 2FA back off',
    '',
    '  Other:',
    '    --local                    Talk HTTP instead of HTTPS (for a local fake-mychart)',
    '    --save-clo                 Keep the raw CLO bytes alongside downloaded images',
    '    --show-all                 Include the less-frequently-used capabilities in the listing',
    renderCapabilityList(options),
  ];
  return lines.join('\n');
}
