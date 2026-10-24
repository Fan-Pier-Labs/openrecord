// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { describe, expect, it } from 'bun:test';
import { toolCallTarget } from '../tool-telemetry';

describe('toolCallTarget', () => {
  it('splits an account id on its last @, so an email username survives', () => {
    expect(toolCallTarget({ account: 'Homer@Example.com@mychart.example.org' })).toEqual({
      account: 'Homer@Example.com@mychart.example.org',
      hostname: 'mychart.example.org',
      email: 'homer@example.com',
    });
  });

  it('gives no username fallback when the username is not an email', () => {
    expect(toolCallTarget({ account: 'homer@mychart.example.org' })).toEqual({
      account: 'homer@mychart.example.org',
      hostname: 'mychart.example.org',
    });
  });

  it('reads setup_account-style hostname + username, and never the password', () => {
    const target = toolCallTarget({ hostname: 'mychart.example.org', username: 'h@example.com', password: 'pw' });
    expect(target).toEqual({ hostname: 'mychart.example.org', email: 'h@example.com' });
  });

  it('accepts the legacy `instance` spelling, and returns nothing for an account-free call', () => {
    expect(toolCallTarget({ instance: 'a@b.co@mychart.example.org' }).email).toBe('a@b.co');
    expect(toolCallTarget({ query: 'uchealth' })).toEqual({});
  });
});
