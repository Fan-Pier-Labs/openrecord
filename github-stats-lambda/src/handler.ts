// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

// Weekly snapshot of the public repo's issues, PRs, forks and new stars, printed
// to CloudWatch as one JSON line per item. Unauthenticated on purpose: 60
// requests/hour per IP, and Lambda's egress IPs are shared, so a run can find
// the budget already spent. It waits the limit out instead of failing — see
// README.md.

const REPO = "Fan-Pier-Labs/openrecord";
const API = `https://api.github.com/repos/${REPO}/`;
// Each invocation can wait ~14 min; 8 chained ones outlast GitHub's 1-hour window.
const MAX_ATTEMPTS = 8;
// Leave room to re-invoke and log before Lambda kills us.
const SAFETY_MS = 60_000;

interface LambdaContext {
  invokedFunctionArn: string;
  getRemainingTimeInMillis(): number;
}

interface Issue {
  number: number;
  title: string;
  user: { login: string };
  state: string;
  created_at: string;
  html_url: string;
  pull_request?: { merged_at: string | null };
}
interface Fork {
  owner: { login: string };
  full_name: string;
  created_at: string;
  html_url: string;
}
interface RepoEvent {
  type: string;
  actor: { login: string };
  created_at: string;
}

class OutOfTime extends Error {}

// console.log, not process.stdout.write: Lambda freezes the process when the
// handler returns, and buffered stdout writes are lost — a run logged only part
// of its PRs. CloudWatch's JSON filters still read past console's prefix.
const log = (record: object) => console.log(JSON.stringify(record));

const sleep = (seconds: number) => new Promise<void>((resolve) => { setTimeout(resolve, seconds * 1000); });

export function rateLimitWait(headers: Headers, nowSeconds = Math.floor(Date.now() / 1000)): number {
  const retryAfter = headers.get("Retry-After");
  if (retryAfter) return Number(retryAfter);
  const reset = headers.get("X-RateLimit-Reset");
  if (headers.get("X-RateLimit-Remaining") === "0" && reset) return Math.max(0, Number(reset) - nowSeconds) + 5;
  // A secondary limit with neither header: GitHub says wait at least a minute.
  return 60;
}

export function nextLink(link: string | null): string | null {
  const next = link?.split(",").find((part) => part.includes('rel="next"'));
  return next ? next.split(";")[0]!.trim().replace(/^<|>$/g, "") : null;
}

async function getPage<T>(url: string, context: LambdaContext): Promise<{ page: T[]; next: string | null }> {
  for (;;) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "openrecord-github-stats",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (res.ok) return { page: (await res.json()) as T[], next: nextLink(res.headers.get("Link")) };
    if (res.status !== 403 && res.status !== 429) throw new Error(`GitHub ${res.status} for ${url}`);

    const wait = rateLimitWait(res.headers);
    const budget = Math.floor((context.getRemainingTimeInMillis() - SAFETY_MS) / 1000);
    log({ type: "rate_limited", status: res.status, wait_seconds: wait, remaining_budget_seconds: budget });
    if (wait > budget) {
      await sleep(Math.max(0, budget));
      throw new OutOfTime();
    }
    await sleep(wait);
  }
}

async function fetchAll<T>(path: string, context: LambdaContext): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = API + path;
  while (url) {
    const { page, next }: { page: T[]; next: string | null } = await getPage<T>(url, context);
    out.push(...page);
    url = next;
  }
  return out;
}

async function invokeSelf(context: LambdaContext, attempt: number): Promise<void> {
  type LambdaSdk = {
    LambdaClient: new () => { send(command: unknown): Promise<unknown> };
    InvokeCommand: new (input: { FunctionName: string; InvocationType: string; Payload: string }) => unknown;
  };
  const sdkName = "@aws-sdk/client-lambda";
  // eslint-disable-next-line no-restricted-syntax -- the SDK ships with the Lambda runtime and is not installed here
  const { LambdaClient, InvokeCommand } = (await import(sdkName)) as LambdaSdk;
  await new LambdaClient().send(new InvokeCommand({
    FunctionName: context.invokedFunctionArn,
    InvocationType: "Event",
    Payload: JSON.stringify({ attempt }),
  }));
}

export async function handler(event: { attempt?: number } | null, context: LambdaContext) {
  const attempt = event?.attempt ?? 1;
  const snapshot = new Date().toISOString().replace(/\.\d+Z$/, "Z");

  let issues: Issue[], forks: Fork[], stars: RepoEvent[];
  try {
    // Fetch everything before printing anything, so a snapshot in the logs is
    // always complete — a rate-limited run restarts from scratch.
    issues = await fetchAll<Issue>("issues?state=all&per_page=100", context);
    forks = await fetchAll<Fork>("forks?per_page=100", context);
    // /stargazers now 401s without a token, so stars come from the public
    // events feed: each WatchEvent is one star. That feed holds the last 300
    // events (~4 weeks at current activity), which covers a weekly run.
    stars = (await fetchAll<RepoEvent>("events?per_page=100", context)).filter((e) => e.type === "WatchEvent");
  } catch (e) {
    if (!(e instanceof OutOfTime)) throw e;
    if (attempt >= MAX_ATTEMPTS) throw new Error(`still rate-limited after ${attempt} attempts`);
    await invokeSelf(context, attempt + 1);
    log({ type: "retry_scheduled", next_attempt: attempt + 1 });
    return { status: "retrying", attempt };
  }

  const emit = (record: object) => log({ snapshot, ...record });

  for (const i of issues) {
    emit({
      type: i.pull_request ? "pr" : "issue",
      number: i.number,
      title: i.title,
      author: i.user.login,
      state: i.state,
      created_at: i.created_at,
      ...(i.pull_request ? { merged_at: i.pull_request.merged_at } : {}),
      url: i.html_url,
    });
  }
  for (const f of forks) {
    emit({ type: "fork", owner: f.owner.login, name: f.full_name, created_at: f.created_at, url: f.html_url });
  }
  for (const s of stars) {
    emit({ type: "star", user: s.actor.login, starred_at: s.created_at, url: `https://github.com/${s.actor.login}` });
  }

  const counts = {
    issues: issues.filter((i) => !i.pull_request).length,
    prs: issues.filter((i) => i.pull_request).length,
    forks: forks.length,
    recent_stars: stars.length,
  };
  emit({ type: "summary", attempt, ...counts });
  return counts;
}
