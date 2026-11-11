// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const invoked: unknown[] = [];
void mock.module("@aws-sdk/client-lambda", () => ({
  LambdaClient: class { send(command: unknown) { invoked.push(command); return Promise.resolve({}); } },
  InvokeCommand: class { constructor(readonly input: unknown) {} },
}));

const { handler, nextLink, rateLimitWait } = await import("../handler");

const context = (remainingMs = 900_000) => ({
  invokedFunctionArn: "arn:aws:lambda:us-east-2:123:function:stats",
  getRemainingTimeInMillis: () => remainingMs,
});

const API = "https://api.github.com/repos/Fan-Pier-Labs/openrecord/";
const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers });

const issue = (n: number, pr: boolean) => ({
  number: n, title: `t${n}`, user: { login: `u${n}` }, state: "open", created_at: "2026-01-01T00:00:00Z",
  html_url: `https://github.com/x/${n}`, ...(pr ? { pull_request: { merged_at: null } } : {}),
});

let routes: Record<string, () => Response>;
let logs: Record<string, unknown>[];
const realFetch = globalThis.fetch;
const realLog = console.log;

beforeEach(() => {
  invoked.length = 0;
  logs = [];
  console.log = (line: string) => { logs.push(JSON.parse(line) as Record<string, unknown>); };
  globalThis.fetch = mock((url: string) => {
    const route = routes[url];
    if (!route) throw new Error(`unexpected ${url}`);
    return Promise.resolve(route());
  }) as unknown as typeof globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  console.log = realLog;
});

describe("nextLink", () => {
  test("picks the next page out of GitHub's Link header", () => {
    expect(nextLink('<https://a/?page=2>; rel="next", <https://a/?page=9>; rel="last"')).toBe("https://a/?page=2");
    expect(nextLink('<https://a/?page=1>; rel="prev"')).toBeNull();
    expect(nextLink(null)).toBeNull();
  });
});

describe("rateLimitWait", () => {
  test("prefers Retry-After, then the reset time, then a minute", () => {
    expect(rateLimitWait(new Headers({ "Retry-After": "30", "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "999" }), 0)).toBe(30);
    expect(rateLimitWait(new Headers({ "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "1100" }), 1000)).toBe(105);
    expect(rateLimitWait(new Headers({ "X-RateLimit-Remaining": "3" }), 0)).toBe(60);
  });
});

describe("handler", () => {
  const happyRoutes = () => ({
    [`${API}issues?state=all&per_page=100`]: () =>
      json([issue(1, false), issue(2, true)], { Link: `<${API}issues?page=2>; rel="next"` }),
    [`${API}issues?page=2`]: () => json([issue(3, true)]),
    [`${API}forks?per_page=100`]: () =>
      json([{ owner: { login: "f" }, full_name: "f/openrecord", created_at: "c", html_url: "https://github.com/f/openrecord" }]),
    [`${API}events?per_page=100`]: () =>
      json([{ type: "WatchEvent", actor: { login: "s" }, created_at: "w" }, { type: "PushEvent", actor: { login: "p" }, created_at: "x" }]),
  });

  test("follows pagination, splits issues from PRs, and keeps only star events", async () => {
    routes = happyRoutes();
    expect(await handler(null, context())).toEqual({ issues: 1, prs: 2, forks: 1, recent_stars: 1 });
    expect(logs.map((l) => l.type)).toEqual(["issue", "pr", "pr", "fork", "star", "summary"]);
    expect(logs[1]).toMatchObject({ number: 2, author: "u2", merged_at: null });
    expect(logs[0]).not.toHaveProperty("merged_at");
    expect(logs[4]).toMatchObject({ user: "s", starred_at: "w", url: "https://github.com/s" });
    expect(new Set(logs.map((l) => l.snapshot)).size).toBe(1);
  });

  test("waits out a short rate limit and carries on", async () => {
    routes = happyRoutes();
    let calls = 0;
    const page1 = routes[`${API}forks?per_page=100`]!;
    routes[`${API}forks?per_page=100`] = () =>
      calls++ === 0 ? new Response("", { status: 403, headers: { "Retry-After": "0" } }) : page1();
    expect(await handler(null, context())).toMatchObject({ forks: 1 });
    expect(logs[0]).toMatchObject({ type: "rate_limited", wait_seconds: 0 });
  });

  test("re-invokes itself when the wait outlasts this invocation, printing no partial snapshot", async () => {
    routes = { [`${API}issues?state=all&per_page=100`]: () => new Response("", { status: 429, headers: { "Retry-After": "3000" } }) };
    expect(await handler({ attempt: 2 }, context(60_000))).toEqual({ status: "retrying", attempt: 2 });
    expect(invoked).toEqual([{ input: { FunctionName: context().invokedFunctionArn, InvocationType: "Event", Payload: '{"attempt":3}' } }]);
    expect(logs.map((l) => l.type)).toEqual(["rate_limited", "retry_scheduled"]);
  });

  test("gives up after the last attempt", async () => {
    routes = { [`${API}issues?state=all&per_page=100`]: () => new Response("", { status: 429, headers: { "Retry-After": "3000" } }) };
    await expect(handler({ attempt: 8 }, context(60_000))).rejects.toThrow("still rate-limited after 8 attempts");
    expect(invoked).toEqual([]);
  });

  test("any other error fails the run", async () => {
    routes = { [`${API}issues?state=all&per_page=100`]: () => new Response("", { status: 500 }) };
    await expect(handler(null, context())).rejects.toThrow("GitHub 500");
  });
});
