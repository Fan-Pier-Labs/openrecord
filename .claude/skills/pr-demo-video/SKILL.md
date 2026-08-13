---
name: pr-demo-video
description: Record a narrated video demo of a pull request's changes — Playwright for web surfaces, the iOS simulator (maestro-cli + simctl screen recording) for expo-app changes — and post it to the PR as an embedded video comment. Use whenever the user asks to demo a PR, record a video or screencast of a PR/feature/change, "show what this PR does", or post a demo to a pull request — even if they don't say "video" explicitly (e.g. "demo PR 123 and put it on the PR").
---

# PR Demo Video

Given a PR number, understand what the PR changes, run the app with video recording —
Playwright for web surfaces, the iOS simulator for `expo-app/` changes — drive a short
demo of the change, convert the recording to mp4, and post it to the PR as an embedded
video comment.

Two pieces of tooling do the heavy lifting — do not reimplement either:

- **Playwright** (the library, not `playwright-cli`) records the video. This is the one
  sanctioned exception to the "always use playwright-cli" rule: video recording requires
  `recordVideo` on a browser context, which only the library exposes. Playwright is
  already a dependency of `tests/integration/ci/` in this repo.
- **`gh-attach`** (`~/Desktop/code/cli-apps/gh-attach-cli`) handles the GitHub upload.
  GitHub's REST API has no attachment-upload endpoint; this tool reverse-engineers the
  web UI's flow (`POST /upload/policies/assets` → presigned S3 POST → finalize) riding
  on a browser-bootstrapped web session. It can upload *and* post the embedding comment
  in one command. Run it as `cd ~/Desktop/code/cli-apps/gh-attach-cli && bun run src/cli.ts <cmd>`
  (check `which gh-attach` first — use the linked binary if present).

**Hard rule: demo against fake data only.** Record against fake-mychart
(`homer`/`donuts123`) or the splash demo's fictional patient — never a real MyChart
account. The video goes on GitHub; real patient data in it would violate the repo's
no-PII rule.

## Step 1 — Understand the PR

```bash
gh pr view <N> --json title,body,headRefName,files,url
gh pr diff <N>
```

Read the diff for real. The goal is to answer: *what user-visible behavior changed, and
what's the shortest browser flow that shows it?* Write down the 3–6 beats the demo will
hit before writing any code.

Pick the demo surface:

| Change touches | Demo surface |
| --- | --- |
| `scrapers/`, `fake-mychart/`, capabilities, auth/session flows | fake-mychart UI at `localhost:4000` (login `homer`/`donuts123`, TOTP user `marge`/`donuts123`, code `123456`) |
| `openrecord-splash/` | the splash (`index.html`) or the interactive demo (`/demo.html` via `npx vite` in `openrecord-splash/demo`) |
| CLI / npm package | run the CLI against fake-mychart; if there's nothing browser-visible, consider a browser demo of the fake-mychart pages the CLI hits |
| `expo-app/` | the real app in the iOS simulator, driven by maestro-cli and recorded with `simctl` — skip Steps 2–3 below and follow "iOS demos" instead |
| Pure refactor / CI / docs | often still demoable as "the flow still works" — if genuinely nothing can be shown, tell the user instead of forcing a pointless video |

## Step 2 — Check out the PR and start the app

Never demo `main` when the PR is the subject. Check the PR out into a throwaway
worktree so the current tree is untouched:

```bash
git worktree add /tmp/pr-demo-<N> && cd /tmp/pr-demo-<N> && gh pr checkout <N>
bun install
```

Then start whatever surface Step 1 chose, e.g. fake-mychart:

```bash
cd fake-mychart && bun install && bun run dev   # port 4000
```

Port 4000 may already be in use by another session's server — `curl -s localhost:4000`
first. If something is there, either reuse it (fine when the PR doesn't change
fake-mychart itself) or start on another port (`PORT=4010 bun run dev`) and point the
demo script there.

## Step 3 — Write and run the recording script

Write the script **inside the PR worktree at `tests/integration/ci/record-demo.ts`** so
`import 'playwright'` resolves (run `bun install` in that directory first). The worktree
is throwaway, so the file never risks being committed. Don't name it `*.test.ts`.

Template — the parts that matter are the viewport/video size match, the caption helper,
and the deliberate pacing:

```ts
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: '/tmp/pr-demo-<N>-video', size: { width: 1280, height: 720 } },
});
const page = await context.newPage();

// Floating caption so the viewer knows what they're looking at.
// DOM is wiped on navigation — call caption() again after every goto().
async function caption(text: string) {
  await page.evaluate((t) => {
    let el = document.getElementById('__demo_caption') as HTMLDivElement | null;
    if (!el) {
      el = document.createElement('div');
      el.id = '__demo_caption';
      Object.assign(el.style, {
        position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(20,20,20,0.85)', color: '#fff', padding: '10px 18px',
        borderRadius: '8px', font: '600 16px system-ui', zIndex: '999999',
        pointerEvents: 'none',
      });
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
}

await page.goto('http://localhost:4000/MyChart/Authentication/Login');
await caption('Signing in to fake MyChart');
await page.waitForTimeout(1500);
// ...fill, click, navigate through the 3–6 beats from Step 1.
// Pause 800–1500ms after every meaningful step: a demo that runs at
// automation speed is an unwatchable blur. Target 20–60 seconds total.

const videoPath = await page.video()!.path();
await context.close();   // context.close() is what flushes the video file
await browser.close();
console.log(videoPath);
```

Run with `cd tests/integration/ci && bun record-demo.ts`. Headless is deliberate —
recording doesn't need a visible window, and headless can't steal the user's focus.
If Chromium is missing, `bunx playwright install chromium` from that directory.

**Verify before publishing.** Extract frames and actually look at them — the video is
about to go on a public-ish PR, so a blank page or an error state must be caught here:

```bash
mkdir -p /tmp/pr-demo-<N>-frames
ffmpeg -y -i <video.webm> -vf fps=1 /tmp/pr-demo-<N>-frames/f%03d.png
```

Read several frames (start / middle / end). If the feature isn't clearly visible,
fix the script and re-record. Iterate until the frames tell the PR's story.

## iOS demos (expo-app changes)

When the PR touches `expo-app/`, demo the real app in the iOS simulator instead of a
browser. The division of labor: **maestro-cli drives the app** (per the repo's
simulator rules — one-shot commands, never multi-step YAML, never the macOS mouse) and
**`xcrun simctl io recordVideo` records the screen** natively to h264. Playwright is
not involved.

1. **Own a fresh simulator** — follow the "Starting a sim session" recipe in CLAUDE.md
   exactly (create `claude-<date>-<random>`, boot, `open -a Simulator`, export
   `MAESTRO_UDID`). Never record or drive another session's sim.

2. **Build the PR's app onto it** from the PR worktree:

   ```bash
   cd /tmp/pr-demo-<N>/expo-app && bun install && bunx expo run:ios --device "$MAESTRO_UDID" --port 8083
   ```

   Pick a Metro port not in use by other sessions. The build takes several minutes —
   start it early. The app's built-in **Springfield General Hospital (test)** instance
   points at the deployed fake-mychart, so no local server is needed for chart data.

3. **Stage the starting state before recording.** Drive the app with maestro-cli to the
   screen where the demo begins (sign-in, account setup) *first* — the video should
   open on the interesting part, not on setup. Note the AI chat requires Google
   sign-in; if the sim isn't signed in, demo non-AI surfaces or ask the user.

4. **Record while driving.** Start the recorder in the background, run the demo beats,
   then stop it with SIGINT — SIGINT finalizes the file, SIGKILL corrupts it:

   ```bash
   xcrun simctl io "$MAESTRO_UDID" recordVideo --codec h264 /tmp/pr-demo-<N>.mov & REC_PID=$!
   # ...maestro-cli tap / fill / scroll through the beats, sleeping 1–2s
   # between steps; check /tmp/maestro-last.png after each to verify state
   kill -INT $REC_PID; wait $REC_PID
   ```

5. **Same tail as the web path**: convert the .mov with the Step 4 ffmpeg command
   (output is portrait ~1206×2622 — fine as-is), frame-verify with Step 3's extraction,
   upload with Steps 5–6. When done, `xcrun simctl shutdown "$MAESTRO_UDID" && xcrun
   simctl delete "$MAESTRO_UDID"`.

## Step 4 — Convert to mp4

GitHub reliably embeds mp4; Playwright emits webm. System ffmpeg handles it:

```bash
ffmpeg -y -i demo.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart -crf 23 demo.mp4
```

(`yuv420p` is required — without it Safari and the GitHub player can refuse the file.)
Keep it well under GitHub's 100 MB video cap; a 60s 720p demo is a few MB.

## Step 5 — GitHub session

```bash
cd ~/Desktop/code/cli-apps/gh-attach-cli && bun run src/cli.ts whoami
```

- Logged in → note **which account** it is; that account authors the comment. If it's
  the wrong one, treat as expired.
- Expired / not logged in → run `bun run src/cli.ts login` (headed Chrome opens at
  github.com/login) and tell the user to sign in **themselves** in that window,
  including any 2FA. Never fill the credentials for them — don't use the `--user` /
  `--password` flags, even if the credentials are available somewhere. The command
  blocks until the session cookie appears (5-minute timeout), then caches it in
  `~/.gh-attach/session.json`. Sessions last roughly two weeks.

## Step 6 — Upload and post the comment

One command uploads and posts the embedding comment:

```bash
cd ~/Desktop/code/cli-apps/gh-attach-cli && bun run src/cli.ts upload \
  -r <owner>/<repo> --pr <N> \
  --body "🎬 **Automated demo** — <one line: what the video shows and which flow it drives>

{markdown}" \
  /path/to/demo.mp4 --json
```

`{markdown}` is replaced by the asset embed. Get `<owner>/<repo>` from
`gh repo view --json nameWithOwner -q .nameWithOwner`. The `--json` output includes the
asset URL and the posted comment — put the comment URL in the final report.

## Step 7 — Clean up

Kill any servers started for the demo, then:

```bash
git worktree remove --force /tmp/pr-demo-<N>
```

Report: what the PR changes, what the demo shows beat-by-beat, the comment URL, and
which GitHub account posted it.

## Troubleshooting

- **Upload fails with 4xx**: GitHub occasionally changes the private endpoints. Debug as
  a request-shape problem first (cookies, `GitHub-Verified-Fetch: true` header, field
  names) before blaming bot detection. The whole flow is readable in
  `~/Desktop/code/cli-apps/gh-attach-cli/src/client.ts`.
- **Video file is empty/tiny**: the context wasn't closed. `context.close()` must run
  before the file is read.
- **Blank frames at the start**: normal — recording starts before the first `goto`
  paints. Lead with a caption + pause rather than trimming.
- **`gh-attach` repo missing on this machine**: fall back to writing the three-step
  upload against `POST https://github.com/upload/policies/assets` (multipart:
  `repository_id`, `name`, `size`, `content_type`; header `GitHub-Verified-Fetch: true`;
  session cookies from a Playwright-bootstrapped login) → S3 POST → `PUT` finalize.
  The repository id is in `<meta name="octolytics-dimension-repository_id">` on any
  repo page.
