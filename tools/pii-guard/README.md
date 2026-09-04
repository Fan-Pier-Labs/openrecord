# pii-guard

Refuses to let real personal or patient data reach a commit, a push, a pull
request or a GitHub comment.

CLAUDE.md has always said "NEVER upload PII to git or GitHub". This is that rule
with teeth: it runs before the commit lands and before an agent runs the command
that would publish it, and it says what to fix rather than just saying no.

```bash
bun run pii-guard:install      # once, per clone
```

## What it catches

Two tiers, because partial leaks come in two shapes.

**The denylist tier** knows your real values, from a private local file, and
catches them three ways:

| In the diff | Caught because |
| --- | --- |
| `you@your-domain.com` | it is the value |
| `// ends in 7788` | four consecutive digits of a real number survived |
| `r***@your-domain.com` | a masked rendering that a real value satisfies |
| `(617) ***-**34` | same, through any punctuation, with or without a country code |
| `born 1980-**-02` | same, and a date is matched in nine different renderings |
| `M*rigold Feath*******` | same, rejoined across adjacent words |

That last group is the reason this tool exists. Redacting most of a value feels
safe and isn't: the surviving characters plus the shape still identify a person,
and no shape-based scanner can see them, because a masked value no longer looks
like anything.

**The structural tier** knows nothing about you and catches what nobody thought
to list: email addresses, formatted or labelled phone numbers, Social Security
numbers, card numbers (issuer prefix *and* Luhn), values labelled as a medical
record, patient or accession number, private keys, JWTs, bearer tokens, session
cookies, and literal credential assignments.

It also warns — without blocking — when a commit adds an image, PDF or
spreadsheet, since a screenshot of a portal page is the most common way real
patient data actually arrives and no text scanner can see into one.

**What it deliberately does not do** is scan for medical vocabulary. This repo's
job is scraping charts; it says `diagnosis` and `procedure` on thousands of
legitimate lines, and a rule that fires on those would get the whole guard
switched off within a week. Real medical detail from a real record goes on the
denylist, where it is matched exactly.

## The denylist

Nothing catches a masked value without knowing the value. Set it up once:

```bash
cp tools/pii-guard/denylist.example.txt "$(git rev-parse --git-common-dir)/pii-denylist.txt"
$EDITOR "$(git rev-parse --git-common-dir)/pii-denylist.txt"
```

It lives inside `.git`, which is the one directory in a checkout that cannot be
committed by accident, and which every worktree shares. `PII_GUARD_DENYLIST`
overrides the location; `~/.config/openrecord/pii-denylist.txt` is the fallback
for values worth guarding across repos.

The format is `kind: value`, with optional per-entry thresholds. The example file
documents every kind and both knobs. Without a denylist the guard still runs, but
only the structural tier — it will tell you so on a clean run.

The file is plaintext, because the matchers need the characters themselves: a
hash cannot tell you that `617-***-**34` is a rendering of a number you know.
That is a real trade-off, and it is why the file lives where it does. It is never
printed, never sent anywhere, and read by nothing but this tool.

## Where it runs

| Surface | How | On a finding |
| --- | --- | --- |
| `git commit` | `.git/hooks/pre-commit`, installed by `bun run pii-guard:install` | commit fails, findings on stderr |
| Claude Code | `PreToolUse` hook in `.claude/settings.json` | the command is denied, and the model is told where to look and what to fix |
| CI, by hand | `bun run pii-guard --range origin/main...HEAD` | exit 1 |

The Claude Code hook covers `git commit`, `git push`, `gh pr create`,
`gh pr/issue comment|edit|review` and `gh api … -f body=`. For all of them it
scans the relevant diff **and the command string itself**, so a real value in a
commit message or a PR body is caught even when the diff is clean.

Only added lines are scanned. Something already committed is history's problem,
not this commit's — use the `pii-scan` skill for that.

**`tools/pii-guard/` is not scanned**, and that is a real blind spot rather than
an oversight. A tool that documents what a date of birth, a masked address and a
partial phone number look like has to contain those things — in its rules, in its
examples, and above all in its tests, which assert that a realistic value is
caught. Scanned like anything else it blocks every commit that touches it,
including the one that added it. Nothing in here has any business holding a
chart, which is what makes the trade acceptable.

## When it is wrong

Three escape hatches, in order of preference:

1. **`pii-guard-allow`** in a comment on the line, or on the line above, with a
   reason. Narrowest and most visible in review.
2. **`tools/pii-guard/allowlist.txt`** — a value that is fiction everywhere.
   Committed, so it applies to everyone's checkout.
3. **`.pii-guard-allow`** at the repo root — path globs that are not scanned.

And for a human at a terminal who has looked at a finding and judged it wrong:
`PII_GUARD_SKIP=1 git commit` or `git commit --no-verify`. The Claude Code hook
denies both of those to an agent on sight, which is the point — the decision that
a finding is a false positive is a human one.

If the guard's own thresholds are the problem, tune the entry rather than the
code: `phone: … | minRun=7` stops four-digit coincidences with epochs and
identifiers, at the cost of no longer catching "ends in 7788".

## Layout

| File | What it is |
| --- | --- |
| `match.ts` | the two matchers — fragment and mask-aware — and normalisation |
| `structural.ts` | the shape-based rules, and what each one refuses to fire on |
| `denylist.ts` | parsing the private list; one entry becomes several needles |
| `diff.ts` | unified diff → added lines, numbered from the hunk headers |
| `scan.ts` | both tiers over a line, plus waivers and candidate extraction |
| `report.ts` | findings → text. Never prints a matched value |
| `cli.ts` | every entry point, with git and stdin injected so it is testable |
| `command.ts` | which shell commands publish something |
| `install.ts` | writes the git hook, explains the missing denylist |

Findings carry a location and a redacted shape, never the value. A report that
quoted the match would copy it into a terminal, a CI log, or an agent transcript
— which is the thing the tool exists to prevent.
