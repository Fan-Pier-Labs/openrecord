// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { accountId, readAccountIdentities } from '../../shared/mcp-server/credential-store';
import { caughtErrorResult, jsonResult, toolMeta, z } from '../../shared/mcp-server/tools';
import { connectGoogleCalendar, uninstallGoogleCalendar, unsupportedReason as calendarSyncUnsupported } from './google-calendar/applet';

/**
 * macOS/Windows-only and machine-local (it installs a menu-bar or tray app
 * whose binaries ship beside this bundle), so these are extension tools rather
 * than shared capabilities.
 */
export function registerCalendarTools(server: McpServer): void {
  server.registerTool(
    'connect_google_calendar',
    {
      description:
        "Sync the user's upcoming MyChart appointments (every connected account) to their Google Calendar, and keep them in sync every 4 hours. macOS and Windows only. " +
        'Only call this when the user has asked for it. Call it first without confirmed_with_user: that changes nothing and returns what setup involves, ' +
        'to explain to the user. Call it again with confirmed_with_user: true only after the user has agreed.',
      inputSchema: {
        confirmed_with_user: z.boolean().optional().describe(
          'true only once the user has read what setup involves (returned by a call without this) and agreed to go ahead.',
        ),
      },
      ...toolMeta('Sync appointments to Google Calendar', { readOnlyHint: false, destructiveHint: false, openWorldHint: true }),
    },
    async ({ confirmed_with_user }) => {
      try {
        const unsupported = calendarSyncUnsupported();
        if (unsupported) throw new Error(unsupported);
        if (confirmed_with_user !== true) {
          const accounts = readAccountIdentities().map(accountId);
          if (accounts.length === 0) {
            return jsonResult({ state: 'no_accounts', message: 'No MyChart account is connected yet, so there is nothing to sync. Help the user connect one first.' });
          }
          return jsonResult({
            state: 'needs_confirmation',
            message_for_user:
              'Want to install the OpenRecord Google Calendar Sync applet?\n\n' +
              `This applet copies all of your upcoming appointments from all of your connected MyChart accounts (${accounts.join(', ')}) ` +
              'to a new "MyChart Appointments" calendar in your Google Calendar. It only touches this new calendar. ' +
              (process.platform === 'win32'
                ? 'This applet will sit in your Windows system tray, launch at sign-in, and sync appointments every 4 hours. ' +
                  'Setup will download the 100 MB applet and open Google sign-in.'
                : 'This applet will sit in your macOS status bar, launch at login, and sync appointments every 4 hours. ' +
                  'Setup will download the 100 MB applet and trigger permission prompts (macOS and Google sign-in).'),
            message:
              'Nothing has been set up yet. Show the user message_for_user exactly as written, and wait for their answer. ' +
              'Only if they agree, call connect_google_calendar again with confirmed_with_user: true.',
          });
        }
        const { sync } = await connectGoogleCalendar();
        const failed = (sync.accounts ?? []).filter((a) => a.error);
        return jsonResult({
          state: 'connected',
          synced: sync.synced ?? 0,
          accounts: sync.accounts ?? [],
          message:
            `Google Calendar is connected. ${sync.synced ?? 0} upcoming appointment(s) are on the "MyChart Appointments" calendar. ` +
            (process.platform === 'win32'
              ? 'A calendar icon is now in the Windows notification area (system tray); it starts at sign-in and syncs every 4 hours, and its menu has "Turn Off Calendar Sync".'
              : 'A medical-cross icon is now in the menu bar; it starts at login and syncs every 4 hours, and its menu has "Turn Off Calendar Sync". ' +
                'Tell the user that macOS may later ask whether openrecord-calendar may use OpenRecord\'s saved MyChart sign-in from the keychain, and to choose "Always Allow" so background syncs can sign in.') +
            (failed.length ? ` These accounts could not be synced yet: ${failed.map((a) => `${a.account} (${a.error})`).join('; ')}.` : '') +
            (!sync.ok && !sync.accounts ? ` The first sync did not finish: ${sync.error ?? 'unknown error'}. The app will retry.` : ''),
        });
      } catch (err) {
        return caughtErrorResult(err);
      }
    },
  );

  server.registerTool(
    'disconnect_google_calendar',
    {
      description:
        'Turn off Google Calendar sync: revokes OpenRecord\'s access to the user\'s Google account, ' +
        'quits the menu-bar or tray app and stops it starting at login. The app itself stays on disk at ~/.openrecord-mcpb/bin/openrecord-calendar (about 100 MB) so turning sync back on needs no download. ' +
        'The "MyChart Appointments" calendar and its events stay in Google Calendar, and connecting again later reuses that calendar. Only call this when the user has asked for it.',
      inputSchema: {},
      ...toolMeta('Turn off Google Calendar sync', { readOnlyHint: false, destructiveHint: true, openWorldHint: true }),
    },
    async () => {
      try {
        await uninstallGoogleCalendar();
        return jsonResult({
          state: 'disconnected',
          message:
            'Google Calendar sync is off: OpenRecord no longer has access to the Google account, and its menu-bar or tray app has quit and no longer starts at login. ' +
            'The "MyChart Appointments" calendar and its events are still in Google Calendar for the user to keep or delete. ' +
            'The app stays at ~/.openrecord-mcpb/bin/openrecord-calendar (about 100 MB) so turning sync back on is fast; deleting that file removes it completely.',
        });
      } catch (err) {
        return caughtErrorResult(err);
      }
    },
  );
}
