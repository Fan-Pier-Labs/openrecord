import { makeAuthenticatedRequest } from './makeAuthenticatedRequest';
import { type MyChartRequest } from "./myChartRequest";
import { getRequestVerificationTokenFromBody } from "./util";
import * as cheerio from 'cheerio';

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

    // Different instances wrap the list differently; a shape we don't know is
    // no care team, not an error.
    const wrapper = json as Record<string, unknown> | null;
    const unwrapped = Array.isArray(json)
      ? json
      : (wrapper?.recipients ?? wrapper?.recipientList ?? wrapper?.Providers ??
         wrapper?.providers ?? wrapper?.ProviderList ?? wrapper?.providerList);
    const list: unknown[] = Array.isArray(unwrapped) ? unwrapped : [];

    // Every value here is `unknown`: the response shape varies per instance
    // (see the six wrapper keys above), so `r` is a bag of unknowns rather
    // than a typed row. A nested object used to stringify as "[object Object]"
    // and land in the chart as the provider's NAME; anything but a string is
    // now treated as no value, and a member with no name is skipped entirely.
    const field = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

    for (const item of list) {
      const r = item as Record<string, unknown>;
      const name = field(r.displayName ?? r.DisplayName ?? r.name ?? r.Name);
      if (!name) continue;
      members.push({
        name,
        role: field(r.pcpTypeDisplayName ?? r.PcpTypeDisplayName ?? r.role ?? r.Role),
        specialty: field(r.specialty ?? r.Specialty),
      });
    }
  }

  return members;
}
