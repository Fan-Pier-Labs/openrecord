import { makeAuthenticatedRequest, SessionExpiredError } from '../../core/makeAuthenticatedRequest';
import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import fs from 'fs';
import { subYears, addYears } from 'date-fns';
import { date2dte } from './utils';
import type { BillingAccount, PaymentListResponse, StatementItem, StatementListResponse } from './types';
import { mkdirp } from 'mkdirp';
import { logger } from '../../../../shared/logger';
import { parseBillingAccountsHtml } from './summaryHtml';
import { billingProcessor, type BillingStandard } from './bills.processor';

export { parsePaymentUrl, parseBillingAccountsHtml, parseAmount } from './summaryHtml';
export type {
  BillingStandard,
  BillingAccountStandard,
  BillingVisitStandard,
  BillingVisitCategory,
  BillingStatementStandard,
  BillingPaymentStandard,
  BillingProcedureStandard,
  BillingProcedureGroupStandard,
  BillingCoverageInfoStandard,
} from './bills.processor';
export { billingProcessor, mergeVisitLists, VISIT_LIST_CATEGORIES } from './bills.processor';

// Two jobs live here: the `get_billing` read (fetchBillingRaw + the
// processor) and the statement-PDF download helpers, which other code calls
// directly and which are not part of the read capability.

function accountQuery(account: BillingAccount): string {
  return `id=${account.id}&context=${account.context}`;
}

/** A window wide enough to cover a lifetime of visits; the search is bounded by explicit dates. */
function visitsPath(account: BillingAccount): string {
  const date100YearsAgo = subYears(new Date(), 100);
  const date1YearFromNow = addYears(new Date(), 1);
  return `/Billing/Details/GetVisits?noCache=${Math.random()}&${accountQuery(account)}&filterOption=1&searchStartDTE=${date2dte(date100YearsAgo)}&searchStopDTE=${date2dte(date1YearFromNow)}&cid=`;
}

function paymentListPath(account: BillingAccount): string {
  return `/Billing/Details/LoadPaymentList?noCache=${Math.random()}&${accountQuery(account)}&searchStartDTE=&searchEndDTE=&cid=`;
}

function statementListPath(account: BillingAccount): string {
  return `/Billing/Details/GetStatementList?noCache=${Math.random()}&${accountQuery(account)}&cid=`;
}

function detailsPagePath(account: BillingAccount): string {
  return `/Billing/Details?ID=${account.id}&Context=${account.context}`;
}

/**
 * `GET /Billing/Summary`, then per account `GetVisits`, `GetStatementList`,
 * `LoadPaymentList` and the details page (for `EncID`). The summary is
 * parsed here only to learn which accounts to fetch; the processor re-parses
 * the recorded page to build the account rows. The three supplementary
 * calls are best-effort — a statement-list outage should not cost the
 * caller the visit history — and a non-OK response is still recorded.
 */
export async function fetchBillingRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const summary = await collector.send({ path: '/Billing/Summary' });

  for (const account of parseBillingAccountsHtml(summary.text, mychartRequest.hostname)) {
    await collector.send({ path: visitsPath(account) });
    for (const path of [statementListPath(account), paymentListPath(account), detailsPagePath(account)]) {
      try {
        await collector.send({ path });
      } catch (err) {
        if (err instanceof SessionExpiredError) throw err;
        logger.debug('Failed to fetch billing details:', (err as Error).message);
      }
    }
  }

  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getBillingHistory(mychartRequest: MyChartRequest): Promise<BillingStandard> {
  return billingProcessor.standard(await fetchBillingRaw(mychartRequest));
}

export async function getPaymentList(mychartRequest: MyChartRequest, billingAccount: BillingAccount): Promise<PaymentListResponse> {
  const paymentListResponse = await makeAuthenticatedRequest(mychartRequest, { path: paymentListPath(billingAccount) });
  return await paymentListResponse.json() as PaymentListResponse;
}

export async function getStatementList(mychartRequest: MyChartRequest, billingAccount: BillingAccount): Promise<StatementListResponse> {
  const statementsResponse = await makeAuthenticatedRequest(mychartRequest, { path: statementListPath(billingAccount) });
  return await statementsResponse.json() as StatementListResponse;
}

export async function getEncBillingId(mychartRequest: MyChartRequest, billingAccount: BillingAccount) {
  const res = await makeAuthenticatedRequest(mychartRequest, { path: detailsPagePath(billingAccount) });
  const body = await res.text();
  const match = /EncID"\s*:\s*"([^"]*)"/.exec(body);
  if (!match) {
    logger.debug('unable to find end id');
  }
  return match?.[1];
}

export async function saveStatementPdf(mychartRequest: MyChartRequest, encId: string, statement: StatementItem) {
  const path = `/Billing/Details/DownloadFromBlob/?type=1&id=${statement.RecordID}&earId=${encId}&billSys=${statement.EncBillingSystem}&fileKey=${statement.ImagePath}&token=${encodeURIComponent(statement.Token)}&fileName=Statement_${statement.DateDisplay}&DocExt=PDF&PesId=&cid=`;

  const statementPdf = await makeAuthenticatedRequest(mychartRequest, { path: path });
  const pdfArrayBuffer = await statementPdf.arrayBuffer();

  // Convert ArrayBuffer to a Node.js Buffer
  return Buffer.from(pdfArrayBuffer);
}

// Given a billing account, fetches all the statement PDFs associated with it.
// Will be needed later for downloading itemized bills.
export async function getBillingStatementPDFs(mychartRequest: MyChartRequest, billingAccount: BillingAccount) {
  const encId = await getEncBillingId(mychartRequest, billingAccount);
  const statementList = await getStatementList(mychartRequest, billingAccount);

  // TODO: this could be improved, the statement list has two different types of statements, the latter isn't really a statement.
  for (const statement of statementList.DataStatement.StatementList.concat(statementList.DataDetailBill.StatementList)) {
    const buffer = await saveStatementPdf(mychartRequest, encId!, statement);

    const name = 'Invoice on ' + statement.FormattedDateDisplay + ' for ' + statement.StatementAmountDisplay + '.pdf';

    // Write the buffer to a file
    await mkdirp('pdfs');
    await fs.promises.writeFile('./pdfs/' + name, new Uint8Array(buffer));
    logger.debug('Saved', name);
  }
}
