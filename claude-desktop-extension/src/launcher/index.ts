#!/usr/bin/env node
// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * What Claude Desktop runs (`dist/launcher.cjs`). It owns stdio and runs the
 * real server, `server.cjs`, as a child — the newest verified download if
 * there is one, otherwise the copy bundled in this .mcpb — and keeps the next
 * release downloaded in the background.
 *
 * This file is the part of the extension that can only change by reinstalling,
 * so it stays small: see docs in ../../README.md ("Self-update").
 */

// stdout is the MCP channel; anything the scraper core logs goes to stderr.
import { setLogSink } from '../../../shared/logger';
setLogSink((level, args) => {
  process.stderr.write(`[openrecord:launcher:${level}] ` + args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n');
});

import * as path from 'path';
import { version as BUNDLED_VERSION } from '../../manifest.json';
import { markBad, payloadOrder, type Payload } from './payloads';
import { relay } from './relay';
import { reportStartupFailure, startUpdates, updateNotice } from './updater';

// The bundle sits in dist/, beside the bundled server.cjs; node_modules is one up.
const bundled: Payload = { version: BUNDLED_VERSION, dir: __dirname, bundled: true };
let running = bundled;

relay({
  payloads: payloadOrder(bundled),
  input: process.stdin,
  output: process.stdout,
  nodeModules: path.join(__dirname, '..', 'node_modules'),
  notice: updateNotice,
  onStart: (payload) => {
    running = payload;
    process.stderr.write(`[openrecord:launcher] starting server ${payload.version}${payload.bundled ? ' (bundled)' : ''}\n`);
  },
  onStartupFailure: (payload) => {
    process.stderr.write(`[openrecord:launcher] server ${payload.version} died before the handshake; falling back\n`);
    markBad(payload);
    reportStartupFailure(payload.version);
  },
  onExit: (code) => process.exit(code),
});

void startUpdates(() => running.version);
