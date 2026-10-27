// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * An error whose full explanation names chart data: a family member, a
 * document, a provider, what MyChart's page said. `message` says what went
 * wrong without any of it, and is all that error reporting (Sentry, analytics)
 * reads. `detailedMessage` is the full explanation, shown to Claude and the user.
 */
export class DetailedError extends Error {
  readonly detailedMessage: string;

  constructor(message: string, detailed: string) {
    super(message);
    this.detailedMessage = detailed;
  }
}

/** What to show Claude or the user for anything thrown: the detailed message when there is one. */
export function detailedMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const detailed = (err as Partial<DetailedError>).detailedMessage;
  return typeof detailed === 'string' ? detailed : err.message;
}
