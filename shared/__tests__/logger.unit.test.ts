/**
 * The log sink is process-wide mutable state, so the failure mode here is
 * silent and cross-cutting: a stdio MCP server that never installs its sink,
 * or a test that installs one and leaves it behind, corrupts the JSON-RPC
 * framing on stdout for everything that runs after it.
 */

import { describe, it, expect, afterEach } from 'bun:test';

import {
  logger,
  setLogSink,
  resetLogSink,
  silenceLogger,
  getLogSink,
  type LogLevel,
} from '../logger';

afterEach(() => {
  resetLogSink();
});

const recording = (): { entries: Array<{ level: LogLevel; args: unknown[] }> } => {
  const entries: Array<{ level: LogLevel; args: unknown[] }> = [];
  setLogSink((level, args) => entries.push({ level, args }));
  return { entries };
};

describe('setLogSink', () => {
  it('routes every level to the installed sink, tagged with its level', () => {
    const { entries } = recording();

    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(entries.map((entry) => entry.level)).toEqual(['debug', 'info', 'warn', 'error']);
    expect(entries.map((entry) => entry.args)).toEqual([['d'], ['i'], ['w'], ['e']]);
  });

  it('passes every argument through, not just the first', () => {
    const { entries } = recording();

    logger.info('status', 200, { host: 'example.org' });

    expect(entries).toHaveLength(1);
    expect(entries[0]!.args).toEqual(['status', 200, { host: 'example.org' }]);
  });

  it('calls the sink with no arguments when the caller logs nothing', () => {
    const { entries } = recording();

    logger.debug();

    expect(entries[0]!.args).toEqual([]);
  });

  it('replaces the previous sink rather than fanning out to both', () => {
    const first: unknown[][] = [];
    setLogSink((_level, args) => first.push(args));
    const second: unknown[][] = [];
    setLogSink((_level, args) => second.push(args));

    logger.info('only the second');

    expect(first).toEqual([]);
    expect(second).toEqual([['only the second']]);
  });
});

describe('silenceLogger', () => {
  it('drops messages instead of throwing', () => {
    silenceLogger();

    expect(() => logger.error('swallowed')).not.toThrow();
  });
});

describe('resetLogSink', () => {
  it('restores the default sink, and the default is shared across resets', () => {
    const initial = getLogSink();
    setLogSink(() => { /* no-op */ });
    expect(getLogSink()).not.toBe(initial);

    resetLogSink();
    expect(getLogSink()).toBe(initial);

    silenceLogger();
    resetLogSink();
    expect(getLogSink()).toBe(initial);
  });
});
