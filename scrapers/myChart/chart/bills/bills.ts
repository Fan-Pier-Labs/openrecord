import { makeAuthenticatedRequest, SessionExpiredError } from '../../core/makeAuthenticatedRequest';
import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import { subYears, addYears } from 'date-fns';
import type { BillingAccount, PaymentListResponse, StatementItem, StatementListResponse } from './types';
import { logger } from '../../../../shared/logger';
import { toEpicDteLocal } from '../../../../shared/epicDate';
import type { FilePayload } from '../../../../shared/capabilities/types';
import { parseBillingAccountsHtml } from './summaryHtml';
import { billingProcessor, statementDateISO, type BillingStandard } from './bills.processor';

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
// processor) and the `download_billing_statement` file download, which
// re-walks the summary and statement lists to find the one statement asked for.

function accountQuery(account: BillingAccount): string {
  return `id=${account.id}&context=${account.context}`;
}

/** A window wide enough to cover a lifetime of visits; the search is bounded by explicit dates. */
function visitsPath(account: BillingAccount): string {
  const date100YearsAgo = subYears(new Date(), 100);
  const date1YearFromNow = addYears(new Date(), 1);
  return `/Billing/Details/GetVisits?noCache=${Math.random()}&${accountQuery(account)}&filterOption=1&searchStartDTE=${toEpicDteLocal(date100YearsAgo)}&searchStopDTE=${toEpicDteLocal(date1YearFromNow)}&cid=`;
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
 * caller the visit history — and a non-OK response is still recorded. The
 * summary and the visit list are the payload: a failure there throws.
 */
export async function fetchBillingRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const summary = await collector.send({ path: '/Billing/Summary' });

  for (const account of parseBillingAccountsHtml(summary.text, mychartRequest.hostname)) {
    await collector.send({ path: visitsPath(account) });
    for (const path of [statementListPath(account), paymentListPath(account), detailsPagePath(account)]) {
      try {
        await collector.send({ path }, { tolerateFailure: true });
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

/** What `download_billing_statement` returns: the PDF plus the statement it is. */
export interface BillingStatementPdf extends FilePayload {
  statement: {
    RecordID: string;
    dateISO: string | null;
    FormattedDateDisplay: string | null;
    Description: string | null;
    StatementAmountDisplay: string | null;
    IsDetailBill: boolean | null;
  };
}

/**
 * Find the statement whose `RecordID` a caller copied out of `get_billing`,
 * and which guarantor account it belongs to. Both lists are searched, because
 * the itemized bills (`DataDetailBill`) download the same way as statements.
 */
async function findStatement(
  mychartRequest: MyChartRequest,
  recordId: string,
): Promise<{ account: BillingAccount; statement: StatementItem }> {
  const summary = await makeAuthenticatedRequest(mychartRequest, { path: '/Billing/Summary' });
  const accounts = parseBillingAccountsHtml(await summary.text(), mychartRequest.hostname);
  const seen: string[] = [];
  for (const account of accounts) {
    const list = await getStatementList(mychartRequest, account);
    const statements = [
      ...(list.DataStatement?.StatementList ?? []),
      ...(list.DataDetailBill?.StatementList ?? []),
    ];
    const statement = statements.find((s) => s.RecordID === recordId);
    if (statement) return { account, statement };
    seen.push(...statements.map((s) => s.RecordID).filter(Boolean));
  }
  throw new Error(
    `No billing statement has RecordID "${recordId}". get_billing lists each statement's RecordID; ` +
      (seen.length ? `this account has: ${seen.join(', ')}.` : 'this account has no statements.'),
  );
}

/**
 * One statement or itemized bill as the PDF MyChart serves for it.
 *
 * The bytes are checked for the `%PDF` signature rather than trusted: a
 * stale token or a bad `EncID` comes back from `DownloadFromBlob` as an HTML
 * error page with status 200, and handing that to a caller as a `.pdf` is the
 * silent failure this exists to prevent.
 */
export async function downloadBillingStatement(
  mychartRequest: MyChartRequest,
  recordId: string,
): Promise<BillingStatementPdf> {
  const { account, statement } = await findStatement(mychartRequest, recordId);
  const encId = await getEncBillingId(mychartRequest, account);
  if (!encId) {
    throw new Error(
      `MyChart's billing details page for account ${account.guarantorNumber} carried no EncID, which the statement download needs.`,
    );
  }
  const bytes = await saveStatementPdf(mychartRequest, encId, statement);
  if (bytes.subarray(0, 4).toString() !== '%PDF') {
    throw new Error(
      `MyChart did not return a PDF for statement ${recordId} (${bytes.length} bytes, starting "${bytes.subarray(0, 40).toString().replace(/\s+/g, ' ')}").`,
    );
  }
  return {
    fileName: `Statement_${statement.DateDisplay || recordId}.pdf`.replace(/[^A-Za-z0-9._-]+/g, '_'),
    mimeType: 'application/pdf',
    bytes,
    statement: {
      RecordID: statement.RecordID,
      dateISO: statementDateISO(statement.DateDisplay),
      FormattedDateDisplay: statement.FormattedDateDisplay ?? null,
      Description: statement.Description ?? null,
      StatementAmountDisplay: statement.StatementAmountDisplay ?? null,
      IsDetailBill: statement.IsDetailBill ?? null,
    },
  };
}
