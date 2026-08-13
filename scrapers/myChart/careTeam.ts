import { makeAuthenticatedRequest } from './makeAuthenticatedRequest';
import { type MyChartRequest } from "./myChartRequest";
import { getRequestVerificationTokenFromBody } from "./util";
import * as cheerio from 'cheerio';
import { logger } from '../../shared/logger';

export type CareTeamMember = {
  name: string;
  role: string;
  specialty: string;
}

export async function getCareTeam(mychartRequest: MyChartRequest): Promise<CareTeamMember[]> {
  const resp = await makeAuthenticatedRequest(mychartRequest, { path: '/Clinical/CareTeam' });
  const html = await resp.text();
  const $ = cheerio.load(html);

  const members: CareTeamMember[] = [];

  // Try structured HTML selectors first (works for some instances and fake-mychart)
  $('.careteam-provider, .provider-card, [data-testid="care-team-member"]').each((_, el) => {
    const name = $(el).find('.provider-name, .name, h3, h4').first().text().trim();
    const role = $(el).find('.provider-role, .role').first().text().trim();
    const specialty = $(el).find('.provider-specialty, .specialty').first().text().trim();
    if (name) {
      members.push({ name, role, specialty });
    }
  });

  if (members.length > 0) return members;

  // Fallback: call the message recipients API which returns structured JSON.
  // Many instances (e.g. UCSF) render care team via client-side JS, so the HTML
  // above yields nothing. The recipients endpoint reliably returns providers.
  const token = getRequestVerificationTokenFromBody(html);
  if (token) {
    // "This instance doesn't serve the endpoint" stays non-fatal, but it is a
    // non-ok status or a non-JSON body — both checked explicitly below. The
    // bare `catch {}` this replaced also caught a dead session and reported it
    // as "this patient has no care team".
    const apiResp = await makeAuthenticatedRequest(mychartRequest, {
      path: '/api/medicaladvicerequests/GetMedicalAdviceRequestRecipients',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        '__RequestVerificationToken': token,
      },
      body: JSON.stringify({ organizationId: '' }),
    });

    if (!apiResp.ok) return members;

    const text = await apiResp.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      // Not a JSON endpoint on this instance (some serve an HTML page here).
      return members;
    }

    // Only the two shapes we have actually observed: a bare array, or a
    // `recipients` wrapper. Everything else logs and returns no care team.
    //
    // This deliberately does NOT guess at other spellings. It used to accept
    // five more wrapper keys and eleven more field spellings
    // (`ProviderList`, `DisplayName`, `Role`, …), none of which came from a
    // capture — they were plausible-looking inventions, so a hit would have
    // been luck and a miss was indistinguishable from "no care team". When a
    // real instance turns up serving a different shape, the log line below
    // names it and it gets added with a fixture.
    const wrapper = json as Record<string, unknown> | null;
    const unwrapped = Array.isArray(json) ? json : wrapper?.recipients;
    const list: unknown[] = Array.isArray(unwrapped) ? unwrapped : [];

    if (!Array.isArray(unwrapped)) {
      // Loud, because an unrecognised shape and a genuinely empty care team
      // both render as "no care team" to the patient.
      logger.debug(
        'careTeam: no recognised list in the response; top-level keys were',
        wrapper && typeof wrapper === 'object' ? Object.keys(wrapper) : typeof json,
      );
    }

    for (const item of list) {
      const r = item as Record<string, unknown>;
      // Every value is `unknown` here; a non-string was never a real name,
      // role or specialty — a nested object used to land in the chart as the
      // provider's name via String()'s "[object Object]".
      const field = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
      const name = field(r.displayName);
      if (!name) continue;
      members.push({
        name,
        role: field(r.pcpTypeDisplayName),
        specialty: field(r.specialty),
      });
    }
  }

  return members;
}
