/**
 * The organization's insurance payer catalogue — `Insurance/Coverages/GetPayors`,
 * the legacy Insurance activity's payer dropdown.
 *
 * Organization-level, so it is served from `data/organization`, never from the
 * per-patient dataset: the captured request carries no patient identifier and a
 * real department id returned the identical list, so every record — the account
 * holder's and every proxy record — sees the same catalogue.
 */

import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { insurancePayers } from '@/data/organization';
import { NextResponse } from 'next/server';
import { aspNetFailure, json } from './respond';
import type { ExactRoutes } from './types';

/**
 * POST-only, but unlike the Care Team pair a GET gets the *not-found* surface
 * rather than the 500 one (`/Home/Error?code=14` on November 2025) — captured
 * live.
 */
export const insurancePayersGet: ExactRoutes = {
  'insurance/coverages/getpayors': ({ request, path }) => aspNetFailure(request, 'fourohfour', path),
};

export const insurancePayersPost: ExactRoutes = {
  // The legacy controller form-posts the two encounter fields, both empty on
  // the standalone Insurance page. An encounter the instance does not
  // recognize is answered with a 200, no content type and an EMPTY body — not
  // an error — which is the trap a scraper must not read as "no payers".
  'insurance/coverages/getpayors': async ({ request, ds }) => {
    const params = new URLSearchParams(await request.text());
    const encounterCsn = params.get('encounterCsn') ?? '';
    const encounterDepartmentId = params.get('encounterDepartmentId') ?? '';
    const knownDepartments = new Set(ds.careTeam.ProvidersList.map((p) => p.DepartmentID));
    const unknownContext =
      (encounterCsn !== '' && !(encounterCsn in ds.visitNotesByCsn)) ||
      (encounterDepartmentId !== '' && !knownDepartments.has(encounterDepartmentId));
    if (unknownContext) return new NextResponse(null, { status: 200 });

    return json(conformToShape(shapes.insuranceGetPayors, { Payors: insurancePayers }));
  },
};
