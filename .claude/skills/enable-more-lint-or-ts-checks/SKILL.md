---
description: Measure, enable, and land stricter TypeScript compiler options or ESLint rules across the repo — one PR per rule that needs real code changes, trivial rules batched — with the full verification matrix green on every PR. Use when asked to tighten lint/type checking, enable a specific rule, or run another round of the lint-hardening process.
user_invocable: true
---

# Enable More Lint or TS Checks

Run another round of the lint/typecheck-hardening process that landed PRs #244–#263
(TS6 configs → full strict → type-aware ESLint → per-rule PRs → full project coverage).
The core discipline: **measure before enabling, one PR per rule that needs real code
changes, every PR verified against the full matrix, and every skipped rule skipped
with a written reason.**

## Ground rules (learned the hard way)

- **Never force-push, never delete branches** — repo rules block both. A pushed branch
  is permanent; get it right before pushing, or add commits. If a branch must be
  rebuilt, it needs a new name and the old PR gets closed with a pointer.
- **Every PR bases on `main`. Never stack.** A stacked PR "merges" into its base
  branch, not main (this actually happened to #248/#249). Independent PRs conflict
  only in the shared `rules` block of `eslint.config.mjs` — trivial to resolve, and
  auto-resolvable order: keep BOTH sides' rules, never drop one.
- **The verification matrix, run before every push:**
  ```bash
  cd npm-package && bun run build && cd ..           # lint needs dist types (see below)
  NODE_OPTIONS=--max-old-space-size=8192 npx eslint .
  bun run typecheck
  cd expo-app && bun run typecheck && cd ..
  cd npm-package && ./node_modules/.bin/tsc --noEmit && cd ..
  cd claude-desktop-extension && ./node_modules/.bin/tsc --noEmit && cd ..
  bun run test
  ```
  All packages' deps must be installed first (root, expo-app, npm-package,
  claude-desktop-extension, tests/integration/ci) — type-aware lint silently degrades
  imports to `any` when a `node_modules` is missing, and the rules stop seeing them.
  Same trap with `npm-package/dist`: the bundle test imports it, so lint without a
  fresh build misjudges that file. If a change touches session/proxy/renewal code,
  also run the fake-mychart integration suites.
- **Behavior neutrality is a claim you must be able to defend per fix.** `void x` and
  assertion removals are free; added `await`s inside try blocks change the error
  path; `||`→`??` changes behavior on `''`/`0`. Say which in the PR body.

## Process

### 1. Probe — measure every candidate before enabling anything

Add the candidate rules to a scratch copy of `eslint.config.mjs` (or pass compiler
flags to `tsc` directly), run once, count violations per rule:

```bash
NODE_OPTIONS=--max-old-space-size=8192 npx eslint . 2>&1 \
  | grep -E "  error" | awk '{print $NF}' | sort | uniq -c | sort -rn
```

For TS compiler flags: `./node_modules/.bin/tsc --noEmit --strict --<flag> ...` and
count `error TS` lines per file. Revert the scratch config before starting real work.

### 2. Triage by count and by fix character

- **0–5 violations, or purely mechanical** → batch into one "trivial rules" PR.
- **More than that, or fixes need judgment** → one PR per rule.
- **False-positive-heavy** → scope the rule (file-pattern override with a comment
  explaining why) rather than dropping it. Precedent: `await-thenable` is off in test
  files only, because bun-types declares `.rejects`/`.resolves` as `void` while
  awaiting them is load-bearing.
- **Unsafe-to-sweep** → skip, and record the reason in the PR body so the next round
  doesn't re-litigate. Current skip list with reasons, still valid:
  - `prefer-nullish-coalescing` (~288 sites): `||`→`??` is a behavior change on
    `''`/`0`; needs case-by-case review, not a sweep.
  - `no-unnecessary-condition` (~184): scraper types come from `as` casts of scraped
    JSON, so "redundant" checks are load-bearing runtime guards. Enable only after
    the response types are made honest (e.g. zod-validated).
  - `no-unsafe-*` family: same root cause — fights the scraped-JSON reality.

### 3. Land

- Auto-fixable rules: enable in `eslint.config.mjs`, run
  `npx eslint . --fix`, verify, done. Regenerate (don't cherry-pick) when rebasing —
  `--fix` on the new base is deterministic and conflict-free.
- Judgment rules: fix site by site; hoist recurring patterns into a helper when the
  reviewer would otherwise see the same wallpaper ten times (precedent:
  `expo-app/src/lib/fire-and-forget.ts` for user-invisible async failures).
- Every non-obvious config option gets a comment in `eslint.config.mjs` saying WHY
  (see the existing rules block — match that style).
- PR body states: violation count, fix approach, behavior-change analysis, and what
  was deliberately skipped. Update `docs/testing.md` if the lint/typecheck contract
  changes. CI conventions live in `.github/workflows/checks.yml` — installs and the
  npm-package build come BEFORE the eslint step, and there must be exactly one
  `npx eslint .` step (grep for it after editing; one edit here once deleted it and
  CI went green by linting nothing).

### 4. Shepherd

As each PR merges, the next one usually conflicts in the shared rules block. Resolve
by keeping both sides, re-run the matrix, push. `gh pr update-branch <n>` handles the
no-conflict case. GitHub's mergeable status is computed lazily — an apparent DIRTY
right after a push is often stale; re-check after ~20s.

## The remaining backlog (measured or assessed, as of #263)

TS compiler options, roughly in value order:
- `noUncheckedIndexedAccess` — the highest-value remaining flag; surfaces real
  index-out-of-bounds assumptions. Expect a large batch; measure first.
- `noImplicitOverride` — cheap, small batch.
- `verbatimModuleSyntax` — would make `consistent-type-imports` compiler-enforced;
  check interaction with npm-package's CJS build before enabling.
- `noPropertyAccessFromIndexSignature`, `exactOptionalPropertyTypes` — high churn,
  measure before committing to a round.

ESLint:
- `import-x/no-cycle` (plugin) — #263 made the renewal graph acyclic; this rule would
  lock that in so cycles can't silently return. Scope to `scrapers/` + `shared/`
  first; it is slow repo-wide.
- `@typescript-eslint/no-deprecated` — type-aware, catches dead API usage.
- `@typescript-eslint/require-await`, `no-confusing-void-expression`,
  `prefer-readonly` — moderate value, measure.
- `strict-boolean-expressions` — very churny; only with explicit buy-in.
- The skip list above (`prefer-nullish-coalescing`, `no-unnecessary-condition`,
  `no-unsafe-*`) — revisit only after the scraped-response types are validated
  rather than cast.
