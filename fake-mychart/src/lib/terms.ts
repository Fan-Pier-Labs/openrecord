/**
 * Whether this instance makes patients accept Terms & Conditions before it lets
 * them into the chart.
 *
 * Real instances differ on this: most drop you straight on `/Home` after login,
 * some bounce you to `/Authentication/TermsConditions` until you accept once.
 * The scraper has to handle the second kind, so the fake has to be able to be
 * the second kind.
 *
 * This used to be the `FAKE_MYCHART_REQUIRE_TERMS` environment variable, which
 * meant a suite that wanted it needed a whole second server on another port —
 * and a second CI job, and its own test directory, to run against it. It's a
 * runtime knob now, like the mount and discovery modes, so one instance covers
 * both shapes: `POST /mode {"requireTerms": true}`.
 *
 * Off by default, because "straight to Home" is what most instances do and what
 * every other suite is written against. Global to the process and restored by
 * `/reset`, so a suite that turns it on is responsible for turning it back off.
 */

export const DEFAULT_REQUIRE_TERMS = false;

const termsState: { requireTerms: boolean } = {
  requireTerms: DEFAULT_REQUIRE_TERMS,
};

export function getRequireTerms(): boolean {
  return termsState.requireTerms;
}

export function setRequireTerms(requireTerms: boolean): void {
  termsState.requireTerms = requireTerms;
}

export function resetRequireTerms(): void {
  termsState.requireTerms = DEFAULT_REQUIRE_TERMS;
}
