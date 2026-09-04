/**
 * The patient's own insurance coverages — the legacy Insurance activity.
 *
 * `GET /Insurance` is a shell on a real instance: its whole body is an empty
 * `<div id="coverages-list">` that `$$WP.Insurance.CoveragesController` fills
 * over AJAX. The fake serves the same shell, so a scraper that reads the
 * page's markup gets from the fake exactly what it gets from real MyChart —
 * nothing. That is the fidelity that matters here: the previous fake page
 * rendered `.coverage-card` markup no Epic instance has ever served, which is
 * how a scraper that could only ever return an empty list shipped green.
 *
 * The payload is `POST Insurance/Coverages/GetCoverages`, form-encoded exactly
 * like its sibling `GetPayors` on the same controller, and answered with the
 * same 200-and-an-empty-body when the encounter context is unrecognized.
 */

import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { insurancePage } from '@/lib/html';
import { NextResponse } from 'next/server';
import { aspNetFailure, html, json } from './respond';
import type { ExactRoutes } from './types';

export const insuranceGet: ExactRoutes = {
  'insurance': () => html(insurancePage()),
  // POST-only, and a GET gets the not-found surface — the same as GetPayors.
  'insurance/coverages/getcoverages': ({ request, path }) => aspNetFailure(request, 'fourohfour', path),
};

export const insurancePost: ExactRoutes = {
  'insurance/coverages/getcoverages': async ({ request, ds }) => {
    const params = new URLSearchParams(await request.text());
    const encounterCsn = params.get('encounterCsn') ?? '';
    if (encounterCsn !== '' && !(encounterCsn in ds.visitNotesByCsn)) {
      return new NextResponse(null, { status: 200 });
    }
    return json(conformToShape(shapes.insuranceGetCoverages, ds.insurance));
  },
};
