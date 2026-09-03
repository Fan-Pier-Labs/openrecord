/**
 * The `/Home` print header: `Name: … | DOB: … | MRN: … | PCP: …`.
 *
 * Shared by the profile processor and by the proxy-context verification in
 * `proxy/proxyContext.ts`, which reads the same header to confirm which
 * patient MyChart is on.
 */

import * as cheerio from 'cheerio';
import { logger } from '../../../shared/logger';

export type ProfileData = {
  name: string;
  dob: string;
  mrn: string;
  pcp: string;
};

export function parseProfileHtml(body: string): ProfileData | null {
  const $ = cheerio.load(body);
  const printheaderDiv = $('.printheader').text();

  // Full format: Name | DOB | MRN | PCP (most MyChart instances)
  const fullRegex = /Name: (.+) \| DOB: (\d{1,2}\/\d{1,2}\/\d{4}) \| MRN: (\d+) \| PCP: (.*)/;
  const fullMatch = fullRegex.exec(printheaderDiv);
  if (fullMatch) {
    return {
      // All four capture groups are non-optional, so they exist on any match.
      name: fullMatch[1]!.trim(),
      dob: fullMatch[2]!,
      mrn: fullMatch[3]!,
      pcp: fullMatch[4]!.trim(),
    };
  }

  // Partial format: Name | DOB only (e.g. MyChart Central at central.mychart.org)
  const partialRegex = /Name: (.+?) \| DOB: (\d{1,2}\/\d{1,2}\/\d{4})/;
  const partialMatch = partialRegex.exec(printheaderDiv);
  if (partialMatch) {
    // Try to pick up MRN and PCP if present after DOB with different formats
    const afterDob = printheaderDiv.slice(partialMatch.index + partialMatch[0].length);
    const mrnMatch = /MRN:\s*(\d+)/.exec(afterDob);
    const pcpMatch = /PCP:\s*(.*)/.exec(afterDob);
    return {
      // Both capture groups are non-optional, so they exist on any match.
      name: partialMatch[1]!.trim(),
      dob: partialMatch[2]!,
      mrn: mrnMatch?.[1] || '',
      pcp: pcpMatch?.[1]?.trim() || '',
    };
  }

  logger.debug('Could not parse profile from /Home page, no regex match', printheaderDiv.trim());
  return null;
}
