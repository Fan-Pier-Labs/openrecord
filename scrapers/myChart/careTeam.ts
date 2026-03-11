import { MyChartRequest } from "./myChartRequest";
import * as cheerio from 'cheerio';

export type CareTeamMember = {
  name: string;
  role: string;
  specialty: string;
}

export async function getCareTeam(mychartRequest: MyChartRequest): Promise<CareTeamMember[]> {
  const resp = await mychartRequest.makeRequest({ path: '/Clinical/CareTeam' });
  const html = await resp.text();
  const $ = cheerio.load(html);

  const members: CareTeamMember[] = [];

  // Care team members are rendered as cards/list items in the page
  // Each provider card typically has a name, role, and specialty
  $('.careteam-provider, .provider-card, [data-testid="care-team-member"]').each((_, el) => {
    const name = $(el).find('.provider-name, .name, h3, h4').first().text().trim();
    const role = $(el).find('.provider-role, .role').first().text().trim();
    const specialty = $(el).find('.provider-specialty, .specialty').first().text().trim();
    if (name) {
      members.push({ name, role, specialty });
    }
  });

  // Fallback: parse from page text if structured selectors didn't match
  if (members.length === 0) {
    const bodyText = $('body').text();
    // Look for provider patterns in the text
    const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    let i = 0;
    while (i < lines.length) {
      // Provider names typically end with credentials like "MD", "NP", "DO", "PA"
      const nameMatch = lines[i].match(/^(.+\b(?:MD|DO|NP|PA|RN|LCSW|PhD|DNP|APRN)\b.*)$/i);
      if (nameMatch) {
        const name = nameMatch[1].trim();
        let role = '';
        let specialty = '';

        // Check next lines for role/specialty info
        if (i + 1 < lines.length && !lines[i + 1].match(/\b(?:MD|DO|NP|PA|RN)\b,?\s*$/i)) {
          // Could be role like "Primary Care Provider" or specialty like "Family Medicine"
          const next = lines[i + 1];
          if (next.toLowerCase().includes('primary care') || next.toLowerCase().includes('provider') || next.toLowerCase().includes('poc')) {
            role = next;
          } else {
            specialty = next;
          }
        }
        if (i + 2 < lines.length && !lines[i + 2].match(/\b(?:MD|DO|NP|PA|RN)\b,?\s*$/i)) {
          const next2 = lines[i + 2];
          if (!role && (next2.toLowerCase().includes('primary care') || next2.toLowerCase().includes('provider'))) {
            role = next2;
          } else if (!specialty) {
            specialty = next2;
          }
        }

        members.push({ name, role, specialty });
      }
      i++;
    }
  }

  return members;
}
