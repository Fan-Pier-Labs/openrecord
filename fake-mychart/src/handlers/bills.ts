import { NextResponse } from 'next/server';
import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { billingDetailsPage, billingSummaryPage } from '@/lib/html';
import { html, json } from './respond';
import { prefix, type ExactRoutes, type PatternRoute } from './types';

export const billsGet: ExactRoutes = {
  'billing/summary': ({ ds }) => html(billingSummaryPage(ds.billingSummary)),
  'billing/details': ({ ds }) => html(billingDetailsPage(ds.billingEncId)),
};

/**
 * The billing activity's data endpoints all carry a query string, so they are
 * prefix routes. They sit below the `billing/details` page in the exact table,
 * which is checked first — that is what keeps the bare page from being
 * swallowed by its own children.
 */
export const billsGetPatterns: readonly PatternRoute[] = [
  prefix('billing/details/getvisits', ({ ds }) =>
    json(conformToShape(shapes.billingGetVisits, ds.billingVisits))),
  prefix('billing/details/getstatementlist', ({ ds }) =>
    json(conformToShape(shapes.getStatementList, ds.billingStatements))),
  prefix('billing/details/loadpaymentlist', ({ ds }) =>
    json(conformToShape(shapes.loadPaymentList, ds.billingPayments))),
  prefix('billing/details/downloadfromblob', () => {
    // Return a minimal fake PDF
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A]); // %PDF-1.4\n
    return new NextResponse(pdfBytes, { headers: { 'Content-Type': 'application/pdf' } });
  }),
];
