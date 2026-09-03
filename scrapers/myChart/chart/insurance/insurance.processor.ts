/**
 * Insurance processor. Field decisions: docs/processor-layer-proposal.md, `get_insurance`.
 *
 * `/Insurance` is an HTML page, so every field is derived. The selectors
 * (`.coverage-card`, `.plan-name`, `.member-id`) match the fake's page and
 * nothing captured from a real instance: the captured account had no
 * coverage on file and every `/api/insurance-hub/*` endpoint answered 500
 * (`docs/api-surface-gaps.md`, tier 4). `pageText` keeps the parser honest until
 * a coverage page is captured.
 */

import * as cheerio from 'cheerio';
import { findRequest, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { text } from '../../processors/read';

export interface InsuranceCoverageStandard {
  planName: string;
  subscriberName: string;
  memberId: string;
  groupNumber: string;
  /** Whatever else the card printed. */
  details: string[];
}

export interface InsuranceStandard {
  coverages: InsuranceCoverageStandard[];
  /** The page did not say "no coverages" — "no coverage on file" is an answer. */
  hasCoverages: boolean;
}

/** Parse the insurance page. Exported for tests. */
export function parseInsuranceHtml(html: string): Pick<InsuranceStandard, 'coverages' | 'hasCoverages'> {
  const $ = cheerio.load(html);
  const coverages: InsuranceCoverageStandard[] = [];

  // Insurance coverages are rendered as cards/sections
  $('.coverage-card, .insurance-card, .coverage-item, [data-testid="coverage"]').each((_, el) => {
    const planName = $(el).find('.plan-name, .coverage-name, h3, h4').first().text().trim();
    const subscriberName = $(el).find('.subscriber-name').first().text().trim();
    const memberId = $(el).find('.member-id').first().text().trim();
    const groupNumber = $(el).find('.group-number').first().text().trim();
    const details: string[] = [];
    $(el).find('.detail, .info-row').each((_d, d) => {
      details.push($(d).text().trim());
    });
    if (planName) {
      coverages.push({ planName, subscriberName, memberId, groupNumber, details });
    }
  });

  const bodyText = $('body').text().toLowerCase();
  const hasCoverages = coverages.length > 0 || !bodyText.includes('do not have any available coverages');
  return { coverages, hasCoverages };
}

export const insuranceProcessor: Processor<InsuranceStandard> = {
  standard(raw: RawResponse): InsuranceStandard {
    const html = text(findRequest(raw, '/Insurance')?.body);
    return { ...parseInsuranceHtml(html) };
  },
  concise(standard) {
    return {
      coverages: standard.coverages.map(({ planName, memberId, groupNumber }) => ({ planName, memberId, groupNumber })),
      hasCoverages: standard.hasCoverages,
    };
  },
};
