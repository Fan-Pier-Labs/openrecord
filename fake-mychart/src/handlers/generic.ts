import { genericTokenPage } from '@/lib/html';
import { aspNetFailure, html, json } from './respond';
import { prefix, type ExactRoutes, type Handler, type PatternRoute } from './types';

/**
 * Pages that exist only as a source of a CSRF token — a scraper GETs one to
 * read `__RequestVerificationToken` out of the markup before posting. Real
 * instances serve a full activity here; all the fake needs to be faithful
 * about is that the token is present.
 */
export const genericGet: ExactRoutes = {
  'questionnaire': () => html(genericTokenPage('MyChart')),
  'community/manage': () => html(genericTokenPage('MyChart')),
};

export const genericGetPatterns: readonly PatternRoute[] = [
  prefix('app/', () => html(genericTokenPage('MyChart'))),
];

/**
 * What an unrecognised path answers.
 *
 * An unknown `/api/*` path is an error on real instances, never a page:
 * ASP.NET's FourOhFour dance on November 2025 instances, a bare 500 on August
 * 2025. Anything else gets a token page, which is close enough to the real
 * activity surface for a scraper hunting a CSRF token.
 */
export const unknownGet: Handler = ({ request, path, lower }) =>
  lower.startsWith('api/')
    ? aspNetFailure(request, 'fourohfour', path)
    : html(genericTokenPage('MyChart'));

/** The POST equivalent, which has no token page to fall back to. */
export const unknownPost: Handler = ({ request, path, lower }) => {
  console.log(`[fake-mychart] Unhandled POST: /MyChart/${path}`);
  return lower.startsWith('api/')
    ? aspNetFailure(request, 'fourohfour', path)
    : json({ error: 'Not implemented', path }, 404);
};
