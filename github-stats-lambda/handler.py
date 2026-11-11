# Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

# Weekly snapshot of the public repo's issues, PRs, forks and new stars, printed
# to CloudWatch as one JSON line per item. Unauthenticated on purpose: 60
# requests/hour per IP, and Lambda's egress IPs are shared, so a run can find
# the budget already spent. It waits the limit out instead of failing — see
# README.md.

import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

REPO = "Fan-Pier-Labs/openrecord"
API = f"https://api.github.com/repos/{REPO}/"
# Each invocation can wait ~14 min; 8 chained ones outlast GitHub's 1-hour window.
MAX_ATTEMPTS = 8
# Leave room to re-invoke and log before Lambda kills us.
SAFETY_MS = 60_000


class OutOfTime(Exception):
    pass


def rate_limit_wait(headers):
    if headers.get("Retry-After"):
        return int(headers["Retry-After"])
    if headers.get("X-RateLimit-Remaining") == "0" and headers.get("X-RateLimit-Reset"):
        return max(0, int(headers["X-RateLimit-Reset"]) - int(time.time())) + 5
    # A secondary limit with neither header: GitHub says wait at least a minute.
    return 60


def next_link(link_header):
    for part in link_header.split(","):
        if 'rel="next"' in part:
            return part.split(";")[0].strip(" <>")
    return None


def get_page(url, accept, context):
    while True:
        req = urllib.request.Request(url, headers={
            "Accept": accept,
            "User-Agent": "openrecord-github-stats",
            "X-GitHub-Api-Version": "2022-11-28",
        })
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r), r.headers.get("Link", "")
        except urllib.error.HTTPError as e:
            if e.code not in (403, 429):
                raise
            wait = rate_limit_wait(e.headers)
            budget = (context.get_remaining_time_in_millis() - SAFETY_MS) // 1000
            print(json.dumps({"type": "rate_limited", "status": e.code, "wait_seconds": wait,
                              "remaining_budget_seconds": budget}))
            if wait > budget:
                time.sleep(max(0, budget))
                raise OutOfTime()
            time.sleep(wait)


def fetch_all(path, context, accept="application/vnd.github+json"):
    url, out = API + path, []
    while url:
        page, link = get_page(url, accept, context)
        out += page
        url = next_link(link)
    return out


def handler(event, context):
    attempt = (event or {}).get("attempt", 1)
    snapshot = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        # Fetch everything before printing anything, so a snapshot in the logs is
        # always complete — a rate-limited run restarts from scratch.
        issues = fetch_all("issues?state=all&per_page=100", context)
        forks = fetch_all("forks?per_page=100", context)
        # /stargazers now 401s without a token, so stars come from the public
        # events feed: each WatchEvent is one star. That feed holds the last 300
        # events (~4 weeks at current activity), which covers a weekly run.
        stars = [e for e in fetch_all("events?per_page=100", context) if e["type"] == "WatchEvent"]
    except OutOfTime:
        if attempt >= MAX_ATTEMPTS:
            raise RuntimeError(f"still rate-limited after {attempt} attempts")
        import boto3  # ships with the Lambda Python runtime

        boto3.client("lambda").invoke(
            FunctionName=context.invoked_function_arn,
            InvocationType="Event",
            Payload=json.dumps({"attempt": attempt + 1}),
        )
        print(json.dumps({"type": "retry_scheduled", "next_attempt": attempt + 1}))
        return {"status": "retrying", "attempt": attempt}

    def emit(record):
        print(json.dumps({"snapshot": snapshot, **record}))

    for i in issues:
        pr = i.get("pull_request")
        emit({"type": "pr" if pr else "issue", "number": i["number"], "title": i["title"],
              "author": i["user"]["login"], "state": i["state"], "created_at": i["created_at"],
              **({"merged_at": pr.get("merged_at")} if pr else {}), "url": i["html_url"]})
    for f in forks:
        emit({"type": "fork", "owner": f["owner"]["login"], "name": f["full_name"],
              "created_at": f["created_at"], "url": f["html_url"]})
    for s in stars:
        emit({"type": "star", "user": s["actor"]["login"], "starred_at": s["created_at"],
              "url": f"https://github.com/{s['actor']['login']}"})

    counts = {
        "issues": sum(1 for i in issues if "pull_request" not in i),
        "prs": sum(1 for i in issues if "pull_request" in i),
        "forks": len(forks),
        "recent_stars": len(stars),
    }
    emit({"type": "summary", "attempt": attempt, **counts})
    return counts
