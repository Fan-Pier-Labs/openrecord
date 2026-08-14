/**
 * Deciding which shell commands publish something, and what to scan first.
 *
 * The Claude Code hook sees every Bash command the agent wants to run. Most are
 * none of this tool's business; the ones that are, are the commands that move
 * content somewhere it can't easily be taken back from — a commit object, a
 * remote, a pull request, a comment on someone else's issue.
 *
 * The command STRING is scanned too, not just the diff. A commit message, a PR
 * body and a review comment all arrive as arguments, and CLAUDE.md is explicit
 * that those count: "That applies to commit messages, PR descriptions, docs,
 * and code comments, not just code."
 */

/** What a gated command needs checked before it is allowed to run. */
export interface CommandPlan {
  /** Human name for the thing being gated, used in the report. */
  subject: string;
  /** Diffs to scan, in order. */
  diffs: DiffSource[];
  /** Whether the command text itself is scanned as prose. */
  scanCommandText: boolean;
  /** The command is trying to skip the guard. */
  bypass: boolean;
}

export type DiffSource = 'staged' | 'worktree' | 'branch';

const COMMIT = /\bgit\s+(?:-[^\s]+\s+)*commit\b/;
const PUSH = /\bgit\s+(?:-[^\s]+\s+)*push\b/;
const PR_CREATE = /\bgh\s+pr\s+create\b/;
const GH_WRITE = /\bgh\s+(?:pr|issue)\s+(?:comment|edit|create|review)\b/;
const GH_API_BODY = /\bgh\s+api\b[\s\S]*?-f\s*(?:body|title)=/;
const COMMIT_ALL = /\bcommit\b[^\n]*?(?:\s-[a-zA-Z]*a[a-zA-Z]*\b|\s--all\b)/;
const BYPASS = /--no-verify\b|\bPII_GUARD_SKIP\b|\bgit\s+commit\b[^\n]*\s-[a-zA-Z]*n[a-zA-Z]*\b/;

export function planForCommand(command: string): CommandPlan | null {
  const bypass = BYPASS.test(command);

  if (COMMIT.test(command)) {
    const diffs: DiffSource[] = COMMIT_ALL.test(command) ? ['staged', 'worktree'] : ['staged'];
    return { subject: 'this commit', diffs, scanCommandText: true, bypass };
  }
  if (PR_CREATE.test(command)) {
    return { subject: 'this pull request', diffs: ['branch'], scanCommandText: true, bypass };
  }
  if (PUSH.test(command)) {
    return { subject: 'the commits being pushed', diffs: ['branch'], scanCommandText: true, bypass };
  }
  if (GH_WRITE.test(command) || GH_API_BODY.test(command)) {
    return { subject: 'this GitHub comment or edit', diffs: [], scanCommandText: true, bypass };
  }
  return null;
}
