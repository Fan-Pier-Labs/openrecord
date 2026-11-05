// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { describe, expect, it } from 'bun:test';

import { AGENT_LABEL, launchAgentPlist, parseWorkerOutput } from '../applet';
import { buildAuthUrl, SCOPE } from '../google-api';

describe('parseWorkerOutput', () => {
  it("reads the worker's last stdout line", () => {
    expect(parseWorkerOutput('noise\n{"ok":true,"synced":3}\n')).toEqual({ ok: true, synced: 3 });
  });

  it('turns a crash with no JSON into a failure rather than a success', () => {
    expect(parseWorkerOutput('').ok).toBe(false);
    expect(parseWorkerOutput('Segmentation fault').ok).toBe(false);
    expect(parseWorkerOutput('{"synced":3}').ok).toBe(false);
  });
});

describe('launchAgentPlist', () => {
  it('starts the menu-bar mode at login, escaping the path', () => {
    const plist = launchAgentPlist('/Users/a&b/.openrecord-mcpb/bin/openrecord-calendar');
    expect(plist).toContain(`<string>${AGENT_LABEL}</string>`);
    expect(plist).toContain('<key>RunAtLoad</key>\n  <true/>');
    expect(plist).toContain('<string>/Users/a&amp;b/.openrecord-mcpb/bin/openrecord-calendar</string>\n    <string>tray</string>');
  });
});

describe('buildAuthUrl', () => {
  it('asks only for calendar.app.created, offline, with PKCE', () => {
    const url = new URL(buildAuthUrl('http://127.0.0.1:5555', 'challenge', 'state'));
    expect(url.searchParams.get('scope')).toBe(SCOPE);
    expect(SCOPE).toBe('https://www.googleapis.com/auth/calendar.app.created');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:5555');
  });
});
