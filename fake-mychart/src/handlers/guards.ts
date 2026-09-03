import type { NextRequest, NextResponse } from 'next/server';
import { hasAcceptedTerms, validateSession } from '@/lib/session';
import { getRequireTerms } from '@/lib/terms';
import { redirectTo } from './respond';

export function acceptAny(): boolean {
  return process.env.FAKE_MYCHART_ACCEPT_ANY === 'true';
}

export function requireSession(request: NextRequest): NextResponse | null {
  if (!validateSession(request.headers.get('cookie'))) {
    return redirectTo(request, '/Authentication/Login');
  }
  return null;
}

export function requireTermsRedirect(request: NextRequest): NextResponse | null {
  if (!getRequireTerms()) return null;
  if (hasAcceptedTerms(request.headers.get('cookie'))) return null;
  return redirectTo(request, '/Authentication/TermsConditions');
}

/**
 * Which POST paths reject a request with no antiforgery token. Every `/api/*`
 * route does, and so does the legacy Care Team activity's own endpoint pair —
 * both live instances answered a token-less POST there with the same error
 * surface they give a token-less `/api/*` POST. So does the anonymous
 * scheduling workflow, which takes no session but does take the token off the
 * page that hosts it.
 */
export function requiresAntiforgeryToken(lower: string): boolean {
  return lower.startsWith('api/')
    || lower.startsWith('clinical/careteam/')
    || lower.startsWith('scheduling/anonymous/');
}
