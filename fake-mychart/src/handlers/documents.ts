import * as homer from '@/data/homer';
import * as shapes from '@/data/realShapes';
import { documentsPage } from '@/lib/html';
import { conformToShape } from '@/lib/shape';
import { nextDocumentsPage } from '@/lib/session';
import { NextResponse, type NextRequest } from 'next/server';
import { findAttachment, readJsonBody, asString } from './messages';
import { html, json } from './respond';
import type { ExactRoutes, HandlerContext } from './types';

export const documentsGet: ExactRoutes = {
  'app/document-center': () => html(documentsPage()),
  // Epic's DCS blob store, shared by Document Center documents and message
  // attachments — one `dcsId` space, one download route, for both.
  'documents/viewdocument/download': downloadDcsFile,
  'documents/viewdocument/downloadorstream': downloadDcsFile,
};

/**
 * Documents per page, as measured on a live instance. The response says
 * nothing else about the walk — no count, no cursor, no `hasMore` — so a
 * short page is the only end-of-list signal a caller gets.
 */
const PAGE_SIZE = 25;

export const documentsPost: ExactRoutes = {
  /**
   * The cursor is session state, not a request parameter. `isInitialLoad`
   * rewinds it; anything else — including the `{}` body a caller sends when
   * it has not read the React bundle — asks for the page *after* the last one
   * served, which on a fresh session is an empty list with a 200. Modelling
   * that is the point: it is what made this endpoint read as an empty chart.
   */
  'api/documents/viewer/loadotherdocuments': async ({ request, ds }) => {
    const body = await request.json().catch(() => ({})) as { isInitialLoad?: boolean };
    const from = nextDocumentsPage(request.headers.get('cookie'), body.isInitialLoad === true, PAGE_SIZE);
    return json(conformToShape(shapes.loadOtherDocuments, {
      documents: ds.documents.documents.slice(from, from + PAGE_SIZE),
    }));
  },

  'api/documents/viewer/getdocumentdetailslegacy': documentDetails(true),
  'api/documents/viewer/getdocumentdetails': documentDetails(false),
};

/** One entry in the DCS blob store, whichever activity filed it. */
type DcsFile = {
  dcsId: string;
  /** MyChart's own name for the file, which the Content-Disposition carries. */
  displayName: string;
  /** What `fileDescription` reports — the attachment's or document's own name. */
  description: string;
  fileExtension: string;
  organizationId: string;
  mimeType: string;
  base64: string;
};

/**
 * Resolve a `dcsId` against both producers. A Document Center document with
 * no entry in `documentFiles` resolves to `undefined` on purpose: that is the
 * preview-only document, and MyChart answers for it with an empty
 * `downloadUrl` rather than a `null`.
 */
function findDcsFile(request: NextRequest, ds: HandlerContext['ds'], dcsId: string): DcsFile | undefined {
  if (!dcsId) return undefined;

  const document = ds.documents.documents.find(d => d.dcsID === dcsId);
  if (document) {
    const file = homer.documentFiles[dcsId];
    if (!file) return undefined;
    return {
      dcsId,
      displayName: file.displayName,
      description: document.docDesc || document.docType,
      fileExtension: document.docExt,
      organizationId: '',
      mimeType: file.mimeType,
      base64: file.base64,
    };
  }

  const attachment = findAttachment(request, dcsId);
  const file = attachment ? homer.messageAttachmentFiles[attachment.dcsId] : undefined;
  if (!attachment || !file) return undefined;
  return {
    dcsId,
    displayName: file.displayName,
    description: attachment.name,
    fileExtension: attachment.fileExtension,
    organizationId: attachment.organizationId,
    mimeType: file.mimeType,
    base64: file.base64,
  };
}

/** Whether the record holds this document at all, files or not. */
function knowsDcsId(request: NextRequest, ds: HandlerContext['ds'], dcsId: string): boolean {
  if (!dcsId) return false;
  return ds.documents.documents.some(d => d.dcsID === dcsId) || findAttachment(request, dcsId) !== undefined;
}

/**
 * `GetDocumentDetailsLegacy` / `GetDocumentDetails` as measured on live
 * instances: an unknown `dcsId` (or an empty one) answers **200 with a
 * literal JSON `null`** — the GetConversationDetails pattern — and the
 * `fileExtension` posted is ignored (measured five ways on one account:
 * correct, empty, omitted, wrong and absent all returned the same file).
 * `displayName` is a system name, not the document's; `fileDescription` is
 * the document's own name. The legacy variant links to `Download` and reports
 * `legacyEncryption: true`, the other to `DownloadOrStream`; both are
 * mount-relative, and both stream identical bytes.
 *
 * A document the record holds but will not release — 1 of 42 on the captured
 * account — answers with `downloadUrl` and `token` both empty and a
 * `previewUrl` that serves nothing, rather than with a `null`.
 */
function documentDetails(legacy: boolean) {
  return async ({ request, ds }: HandlerContext) => {
    const body = await readJsonBody(request);
    const dcsId = asString(body.dcsId);
    if (!knowsDcsId(request, ds, dcsId)) return json(null);

    const file = findDcsFile(request, ds, dcsId);
    const shared = {
      dcsId,
      orgId: file?.organizationId ?? '',
      displayName: file?.displayName ?? documentName(ds, dcsId),
      userFriendlyDisplayName: '',
      legacyEncryption: legacy,
      isMobile: false,
      fileDescription: file?.description ?? documentName(ds, dcsId),
      allowPreview: true,
      mimeType: file?.mimeType ?? 'text/html',
    };
    if (!file) {
      // Preview-only: no token, no download link, and a preview that streams
      // an empty body (see downloadDcsFile).
      return json(conformToShape(shapes.getDocumentDetailsLegacy, {
        ...shared,
        token: '',
        downloadUrl: '',
        previewUrl: `/Documents/ViewDocument/DownloadOrStream?dcsid=${encodeURIComponent(dcsId)}&method=preview`,
      }));
    }
    const query =
      `dcsid=${encodeURIComponent(dcsId)}` +
      `&displayName=${encodeURIComponent(file.displayName)}` +
      `&dcsExt=${encodeURIComponent(file.fileExtension)}`;
    const isImage = file.mimeType.startsWith('image/');
    return json(conformToShape(shapes.getDocumentDetailsLegacy, {
      ...shared,
      token: `TOKEN-${dcsId}`,
      // Real instances preview images and e-signed HTML, and not PDFs.
      allowPreview: isImage || file.mimeType.includes('html'),
      downloadUrl: `/Documents/ViewDocument/${legacy ? 'Download' : 'DownloadOrStream'}?${query}`,
      previewUrl: isImage ? `/Documents/ViewDocument/Download?${query}&method=preview` : '',
    }));
  };
}

/** The document's own name, for the entries with no file behind them. */
function documentName(ds: HandlerContext['ds'], dcsId: string): string {
  const document = ds.documents.documents.find(d => d.dcsID === dcsId);
  return document ? document.docDesc || document.docType : '';
}

/**
 * The download link itself. A real instance streams the file with its MIME
 * type, a `Content-Length` and `Content-Disposition: attachment;
 * filename="…"`; for an id the record does not hold — and for the
 * preview-only document's own `previewUrl` — it answers **200 with an empty
 * body and no Content-Type**, not a 404, so a client that trusts the status
 * code saves a zero-byte file.
 */
function downloadDcsFile({ request, ds }: HandlerContext): NextResponse {
  const dcsId = request.nextUrl.searchParams.get('dcsid') ?? '';
  const file = findDcsFile(request, ds, dcsId);
  if (!file) return new NextResponse(null, { status: 200 });
  const bytes = Buffer.from(file.base64, 'base64');
  const extension = file.fileExtension ? `.${file.fileExtension.toLowerCase()}` : '';
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': String(bytes.length),
      'Content-Disposition': `attachment; filename="${file.displayName}${extension}"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
