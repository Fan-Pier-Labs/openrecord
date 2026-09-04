#!/bin/sh
#
# PreToolUse hook: gate the Bash commands that publish something.
#
# Wired up in .claude/settings.json. Claude Code sends the tool payload on
# stdin; this passes it through to the guard, which answers with a deny
# decision (JSON on stdout) or with silence, which means allow.
#
# Silence is also what happens when anything here goes wrong — a missing bun, a
# checkout without the guard in it. That is the opposite of the git hook's
# fail-closed stance, and it is deliberate: a PreToolUse hook that errors blocks
# EVERY bash command the agent runs, so a broken guard would take the session
# with it. The git hook is the one that has to hold; this one is the early,
# talkative layer that tells the agent what to fix before it gets there.

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
guard="$root/tools/pii-guard/cli.ts"

[ -f "$guard" ] || exit 0
command -v bun >/dev/null 2>&1 || exit 0

cd "$root" || exit 0
exec bun "$guard" --claude-hook
