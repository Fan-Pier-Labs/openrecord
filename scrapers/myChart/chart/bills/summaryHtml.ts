/**
 * The `/Billing/Summary` page: one `.ba_card` per guarantor account. Both
 * the scraper (to know which accounts to fetch details for) and the
 * processor (to build the account rows from the recorded page) parse it, so
 * it lives apart from either.
 */

import * as cheerio from 'cheerio';
import { logger } from '../../../../shared/logger';
import type { BillingAccount } from './types';

/**
 * The pay-online path the summary page carries in its inline config
 * (`"URLMakePayment": "~/Billing/Payment?ID=…\u0026Context=…"`), as a path
 * relative to the instance root. On the four live instances checked, this is
 * where the link lives — `GetVisits`' `URLMakePayment` is null on all of them.
 */
export function parsePaymentPath(html: string): string | null {
  const match = /"URLMakePayment":\s*"([^"]+)"/.exec(html);
  if (!match) return null;
  const path = match[1]!.replace(/^~/, '').replaceAll('\\u0026', '&');
  return path.startsWith('/') ? path : `/${path}`;
}

export function parsePaymentUrl(html: string): { id: string; context: string } | null {
  const regex = /"URLMakePayment":\s*"([^"]+)"/;
  const match = regex.exec(html);
  if (match) {
    // Remove the leading '~/'
    const urlStr = match[1]!.replace(/^~\//, ''); // the one capture group is non-optional
    // Split into path and query string
    let [, queryString] = urlStr.split('?');
    if (!queryString) {
      logger.debug('returning null');
      return null;
    }
    queryString = queryString.replaceAll('\\u0026', '&');

    if (queryString) {
      const params = new URLSearchParams(queryString);
      const id = params.get('ID');
      const context = params.get('Context');
      if (id && context) {
        return { id, context };
      }
    }
  }
  logger.debug('returning null');
  return null;
}

/**
 * "$1,234.56" → 1234.56. Anything that is not a digit, a sign or a decimal
 * point is formatting; a plain `parseFloat` stopped at the thousands comma
 * and read "$1,234.56" as 1.
 */
export function parseAmount(display: string): number | undefined {
  const cleaned = display.replace(/[^0-9.-]/g, '');
  if (!cleaned) return undefined;
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : undefined;
}

/**
 * The accounts on the summary page. `hostname` only serves to resolve a
 * relative detail link far enough to read its query string, so any host does.
 */
export function parseBillingAccountsHtml(html: string, hostname = 'mychart.invalid'): BillingAccount[] {
  const $ = cheerio.load(html);
  const billing_accounts = $('.ba_card');
  const accounts: BillingAccount[] = [];

  for (const billing_account of billing_accounts.toArray()) {
    const guarantorText = $('p.ba_card_header_account_idAndType', billing_account).text().trim();
    const guarantorNumber = (/Guarantor #(\d+)/.exec(guarantorText))?.[1] || 'unknown';
    const patientName = (/\((.*)\)/.exec(guarantorText))?.[1] || 'unknown';
    const amountdue = $('p.ba_card_status_due_amount', billing_account).text().trim();
    const amountDueNum = amountdue ? parseAmount(amountdue) : undefined;

    const link = $('p.ba_card_status_recentPaymentLabel a', billing_account).attr('href');
    let ID, Context;
    if (link) {
      ID = new URL(link, 'https://' + hostname).searchParams.get('ID');
      Context = new URL(link, 'https://' + hostname).searchParams.get('Context');
    }
    // Fallback: look for any link to /Billing/Details within the card (e.g. "View Account Details" link)
    if (!ID || !Context) {
      const detailsLink = $('a[href*="Billing/Details"]', billing_account).attr('href');
      if (detailsLink) {
        const detailsUrl = new URL(detailsLink, 'https://' + hostname);
        ID = detailsUrl.searchParams.get('ID');
        Context = detailsUrl.searchParams.get('Context');
      }
    }
    if (!ID || !Context) {
      const paymentUrl = parsePaymentUrl(html);
      ID = paymentUrl?.id;
      Context = paymentUrl?.context;
    }
    if (!ID || !Context) continue;

    accounts.push({ guarantorNumber, patientName, amountDue: amountDueNum, id: ID, context: Context });
  }
  return accounts;
}
