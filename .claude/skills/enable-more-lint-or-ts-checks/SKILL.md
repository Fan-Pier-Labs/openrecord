---
description: Find TypeScript compiler options or ESLint rules worth enabling, measure them, and land them in PRs — one PR per check that needs real code changes, trivial checks batched — with the full verification matrix green on every PR. Use when asked to tighten lint/type checking, enable a specific check, or run another round of lint-hardening.
user_invocable: true
---

# Enable More Lint or TS Checks

Find checks worth enabling — TypeScript compiler options, typescript-eslint rules,
core ESLint rules, or lint plugins — measure their real cost, and land the ones that
earn their keep. The core discipline: **measure before enabling, prove a new check
can actually fail, one PR per check that needs real code changes, every PR verified
against the full matrix, and every skipped check skipped with a written reason.**

## Where to find candidates

- Diff the current `eslint.config.mjs` and tsconfigs against what
  typescript-eslint's `strict`/`stylistic` type-checked presets and the TS compiler's
  full strictness surface offer. Anything not enabled is a candidate.
- Read the PR bodies of previous rounds (search merged PRs for "Measured and
  deferred") — deferred checks are listed there with violation counts and skip
  reasons. Re-measure; counts drift and earlier sweeps sometimes make a check free.
- Look at what recent bugs would have been caught by — a check that would have
  prevented a real regression outranks any preset.
- Plugins earn their install only for a concrete invariant worth locking in
  (e.g. module-cycle detection after a de-cycling refactor).

## Ground rules (learned the hard way)

- **Never force-push, never delete branches** — repo rules block both. A pushed
  branch is permanent; get it right before pushing, or add commits. If a branch must
  be rebuilt, it needs a new name and the old PR gets closed with a pointer.
- **Every PR bases on `main`. Never stack.** A stacked PR "merges" into its base
  branch, not main (this actually happened). Independent PRs conflict only in the
  shared `rules` block of `eslint.config.mjs` — resolve by keeping BOTH sides' rules,
  never drop one.
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
  Every package's deps must be installed first (root, expo-app, npm-package,
  claude-desktop-extension, tests/integration/ci) — type-aware lint silently degrades
  imports to `any` when a `node_modules` is missing, and rules stop seeing them. Same
  trap with `npm-package/dist`: the bundle test imports it, so lint without a fresh
  build misjudges that file. If a change touches session/proxy/renewal code, also run
  the fake-mychart integration suites.
- **Behavior neutrality is a claim you must defend per fix, in the PR body.**
  Modifier and type-position changes are free; `void x` is free; added `await`s
  inside try blocks change the error path; fallback operators change behavior on
  falsy-but-present values. Say which category each fix is in.

## Process

### 1. Probe — measure every candidate before enabling anything

Add candidate rules to `eslint.config.mjs` in the working tree (revert after), run
once, count violations per rule:

```bash
NODE_OPTIONS=--max-old-space-size=8192 npx eslint . 2>&1 \
  | grep -E "  error" | awk '{print $NF}' | sort | uniq -c | sort -rn
```

For TS compiler options, pass the flag directly per project and count:
`./node_modules/.bin/tsc --noEmit --<flag> 2>&1 | grep -cE 'error TS'` — run it in
EVERY tsconfig project (root, expo-app, npm-package, claude-desktop-extension,
fake-mychart, openrecord-splash/demo), not just root.

**First check whether the flag is already set**, per project:
`grep -n '"<flag>"' tsconfig.json`. A flag that is already on reports 0 errors
because it is already on, and that zero says nothing about the flag — it is the
compiler-option version of a check that cannot fail. Enabling on the strength of
it adds a duplicate key that reads as new coverage while changing nothing (JSON
takes the last one, so it is silent rather than an error). Candidates are only the
flags a project does NOT already set; if a flag is set in some projects and not
others, say which in the PR body and count only the ones where it is genuinely new.

### 2. Prove the check can fail (the canary step)

**A check that cannot fail is indistinguishable from a passing one.** Zero findings
is only good news after you've watched the check catch a planted violation. Write a
throwaway file that violates the check, confirm the error fires, delete the file.
This has caught a rule that ran and silently reported nothing because it couldn't
parse the imported files — resolution alone wasn't enough, it needed a parser
mapping. Config subtleties like that go in a comment next to the config, with the
canary method named.

**Check the canary file itself parsed.** When canarying many checks at once from
one file, a single syntax error in it makes the linter report a parse error and
nothing else — every other planted violation silently goes unreported, and the run
looks like the checks all fired clean. So assert on the *set of check names that
fired* against the set you planted, never on the exit code or a total count. Two
outcomes come out of that diff, and they mean opposite things:

- **A check stayed silent and the planted violation was wrong.** Fix the canary — a
  check can legitimately exempt the shape you planted (a rule that permits the
  parenthesized form of what it bans, say).
- **A check stayed silent because it cannot fire here at all.** Drop it rather than
  enabling it as decoration. A ban on syntax the compiler already rejects earlier in
  the pipeline can never trigger, and shipping it implies a guarantee that isn't
  real.

### 3. Triage by whether code changes at all

The batching line is code changes, not violation count:

- **Zero code changes** (the check passes as-is — config-only enablement) → batch
  freely with other zero-code-change enablements into one "no-op enablements" PR.
- **ANY code change required, even one line** → its own PR, one check per PR. A
  reviewer approving "turn on a rule that already passes" should never also be
  approving code edits riding along, and a single-rule PR is what makes the
  per-fix behavior analysis checkable.
- **False-positive-heavy** → scope the check (file-pattern override with a comment
  explaining why) rather than dropping it — a rule off in one directory with a
  reason beats a rule off everywhere silently.
- **Unsafe-to-sweep** → defer, and record count + reason in the PR body so the next
  round re-measures instead of re-litigating. Typical reasons: the fix operator
  changes runtime behavior on edge values, or the types the check trusts are
  casts of external data rather than validated shapes.

### 4. Land

- Auto-fixable checks: enable, `npx eslint . --fix`, verify, done. When rebasing,
  regenerate with `--fix` on the new base rather than cherry-picking — it's
  deterministic and conflict-free.
- Judgment checks: fix site by site, matching each module's existing failure style;
  hoist a recurring pattern into a helper when a reviewer would otherwise see the
  same wallpaper ten times.
- Every non-obvious config option gets a comment saying WHY, in the style of the
  existing rules block.
- PR body states: violation count, fix approach, per-fix behavior-change analysis,
  and what was measured-and-deferred with counts.
- Update `docs/testing.md` if the lint/typecheck contract changes. CI lives in
  `.github/workflows/checks.yml` — installs and the npm-package build come BEFORE
  the eslint step, and there must be exactly ONE `npx eslint .` step; grep for it
  after any workflow edit (an edit here once deleted the step and CI went green by
  linting nothing).

### 5. Shepherd

As each PR merges, siblings usually conflict in the shared rules block. Resolve by
keeping both sides, re-run the matrix, push. `gh pr update-branch <n>` handles the
no-conflict case. GitHub's mergeable status is computed lazily — an apparent DIRTY
right after a push is often stale; re-check after ~20 seconds.

For a check too large for one sitting, split the FIXES across parallel subagents by
disjoint file sets (no config changes in their branches), then merge their branches
into one integration branch, flip the flag everywhere, verify the matrix, and open a
single PR for the check.
