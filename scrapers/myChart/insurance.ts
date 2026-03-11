import { MyChartRequest } from "./myChartRequest";
import * as cheerio from 'cheerio';

export type InsuranceCoverage = {
  planName: string;
  subscriberName: string;
  memberId: string;
  groupNumber: string;
  details: string[];
}

export type InsuranceResult = {
  coverages: InsuranceCoverage[];
  hasCoverages: boolean;
}

export async function getInsurance(mychartRequest: MyChartRequest): Promise<InsuranceResult> {
  const resp = await mychartRequest.makeRequest({ path: '/Insurance' });
  const html = await resp.text();
  const $ = cheerio.load(html);

  const coverages: InsuranceCoverage[] = [];

  // Insurance coverages are rendered as cards/sections
  $('.coverage-card, .insurance-card, .coverage-item, [data-testid="coverage"]').each((_, el) => {
    const planName = $(el).find('.plan-name, .coverage-name, h3, h4').first().text().trim();
    const subscriberName = $(el).find('.subscriber-name').first().text().trim();
    const memberId = $(el).find('.member-id').first().text().trim();
    const groupNumber = $(el).find('.group-number').first().text().trim();
    const details: string[] = [];
    $(el).find('.detail, .info-row').each((_, d) => {
      details.push($(d).text().trim());
    });
    if (planName) {
      coverages.push({ planName, subscriberName, memberId, groupNumber, details });
    }
  });

  // Check if the page says "no coverages"
  const bodyText = $('body').text().toLowerCase();
  const hasCoverages = coverages.length > 0 || !bodyText.includes('do not have any available coverages');

  return {
    coverages,
    hasCoverages,
  };
}
