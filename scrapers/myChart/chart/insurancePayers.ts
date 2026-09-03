/**
 * The organization's insurance payer catalogue — the list of payers MyChart
 * offers when a patient adds a coverage on the legacy Insurance activity.
 *
 * Captured 2026-09 on four live instances. Every one of them serves the
 * legacy `/Insurance` page rather than the React `/app/insurance` activity
 * (which falls through to the Home page with a 200), so the endpoint is the
 * legacy MVC one — `POST /Insurance/Coverages/GetPayors`, form-encoded — and
 * not `/api/insurance/LoadPayers`, which answers 500 on all four regardless
 * of payload. `docs/api-surface-gaps.md` has the full capture.
 *
 * What the list is: each organization's *configured* payers, not an
 * in-network guarantee and not the patient's own coverage. Zero payer ids
 * were shared between the four instances and the name overlap was small and
 * regional. The request carries no patient identifier — only an optional
 * encounter context, and a real department id returned the identical list —
 * so the catalogue is treated as organization-level.
 */

import { makeAuthenticatedRequest } from '../core/makeAuthenticatedRequest';
import { fetchSessionCsrfToken } from '../core/csrf';
import type { MyChartRequest } from '../core/myChartRequest';

export const GET_PAYORS_PATH = '/Insurance/Coverages/GetPayors';

/** Whether the add-coverage form collects a field for this payer, and how firmly. */
export type InsurancePayerFieldRequirement = 'optional' | 'required';

export type InsurancePayer = {
  /**
   * The organization's opaque `WP-` catalogue id for the payer. Not stable
   * across organizations and not parseable; only ever echoed back to the same
   * instance when filing a coverage.
   */
  id: string;
  name: string;
  /**
   * The coverage-form fields MyChart collects for this payer (`MemberId`,
   * `GroupNumber`, `SubscriberId`, `SubscriberFirstName`, `SubscriberLastName`,
   * `SubscriberDateOfBirth`, …), each optional or required. Fields the payer
   * does not collect are absent.
   */
  fields: Record<string, InsurancePayerFieldRequirement>;
  /** Whether MyChart accepts an insurance-card image for this payer. */
  canUploadCard: boolean;
  /**
   * A free-text payer the organization has not configured. None of the four
   * captured catalogues carried one; the flag exists in Epic's model and is
   * surfaced so a catalogue that does is read correctly.
   */
  isNonConfigured: boolean;
};

export type InsurancePayerCatalogue = {
  /**
   * Always `organization`: the same list for every patient on the instance.
   * Present so a reader of the payload — a model, a UI — cannot mistake this
   * for the patient's own coverage.
   */
  scope: 'organization';
  payers: InsurancePayer[];
};

/**
 * One `Payors` entry as all four instances returned it. `Fields` maps a field
 * name to 1 (shown, optional) or 2 (shown, required); the legacy controller
 * reads `> 0` for "show" and `> 1` for "required". `SortKey` and `NameUTF8`
 * were null on every entry of every instance and `SampleCardImages` was an
 * empty array, so none of the three is surfaced.
 */
type PayorResponse = {
  ID?: string;
  Name?: string;
  NameUTF8?: string | null;
  Fields?: Record<string, number> | null;
  SampleCardImages?: unknown[];
  CanUpload?: boolean;
  IsNonConfiguredPayer?: boolean;
  SortKey?: unknown;
};

type GetPayorsResponse = {
  Payors?: PayorResponse[];
};

function fieldRequirements(fields: Record<string, number> | null | undefined): Record<string, InsurancePayerFieldRequirement> {
  const out: Record<string, InsurancePayerFieldRequirement> = {};
  for (const [name, level] of Object.entries(fields ?? {})) {
    if (typeof level !== 'number' || level <= 0) continue;
    out[name] = level > 1 ? 'required' : 'optional';
  }
  return out;
}

function toPayer(raw: PayorResponse): InsurancePayer {
  return {
    id: raw.ID ?? '',
    name: raw.Name ?? '',
    fields: fieldRequirements(raw.Fields),
    canUploadCard: raw.CanUpload === true,
    isNonConfigured: raw.IsNonConfiguredPayer === true,
  };
}

/**
 * The payers this organization's MyChart offers when adding a coverage.
 *
 * Throws on anything that is not the recognized envelope. Two of those look
 * harmless and are not: an expired session serves the login page here, and
 * an unrecognized encounter context is answered with a **200 and an empty
 * body**, not an error. Neither means "no payers", so neither may return an
 * empty catalogue.
 */
export async function getInsurancePayers(mychartRequest: MyChartRequest): Promise<InsurancePayerCatalogue> {
  // Enforced exactly as on /api/*: a token-less POST is bounced to the
  // instance's error page with a 200, which would otherwise read as HTML below.
  const token = await fetchSessionCsrfToken(mychartRequest);
  if (!token) {
    throw new Error(
      `No request verification token could be obtained for ${GET_PAYORS_PATH}. ` +
      'The session may have expired, or this instance does not serve the Insurance activity.',
    );
  }

  // The legacy controller posts these two form fields, both empty on the
  // standalone Insurance page. A real department id returned the same list
  // on the captured instance, so the standalone form is the one to send.
  const body = new URLSearchParams({ encounterCsn: '', encounterDepartmentId: '' }).toString();
  const resp = await makeAuthenticatedRequest(mychartRequest, {
    path: GET_PAYORS_PATH,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      '__RequestVerificationToken': token,
    },
    body,
  });

  if (!resp.ok) {
    throw new Error(`${GET_PAYORS_PATH} returned HTTP ${resp.status}`);
  }

  const text = await resp.text();
  if (!text.trim()) {
    throw new Error(
      `${GET_PAYORS_PATH} returned an empty body, which is how MyChart answers an ` +
      'unrecognized encounter context. Refusing to report an empty payer catalogue from it.',
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    const contentType = resp.headers.get('content-type') || 'no content-type';
    throw new Error(
      `${GET_PAYORS_PATH} returned ${contentType} rather than JSON. ` +
      'The session may have expired, or this instance does not serve the Insurance activity.',
    );
  }

  const list = (payload as GetPayorsResponse | null)?.Payors;
  if (!Array.isArray(list)) {
    throw new Error(
      `${GET_PAYORS_PATH} returned JSON with no Payors array. Refusing to report an ` +
      'empty payer catalogue from a response shape we don\'t recognize.',
    );
  }

  return { scope: 'organization', payers: list.map(toPayer) };
}
