/** The `Visits` group — appointments, the notes written at them, and the AVS. */

import {
  fetchUpcomingVisitsRaw,
  fetchPastVisitsRaw,
  upcomingVisitsProcessor,
  pastVisitsProcessor,
} from '../../../scrapers/myChart/chart/visits/visits';
import {
  fetchVisitNotesRaw,
  fetchNoteContentRaw,
  fetchVisitAvsRaw,
  visitNotesProcessor,
  noteContentProcessor,
} from '../../../scrapers/myChart/chart/notes/notes';
import { requireStr } from '../args';
import type { CapabilityImpl } from '../types';

export const VISIT_CAPABILITIES: readonly CapabilityImpl[] = [
  {
    id: 'get_upcoming_visits',
    title: 'Upcoming visits',
    description: 'Upcoming appointments.',
    kind: 'read',
    group: 'Visits',
    params: [],
    run: (request) => fetchUpcomingVisitsRaw(request),
    processor: upcomingVisitsProcessor,
  },
  {
    id: 'get_past_visits',
    title: 'Past visits',
    description:
      'Every past visit MyChart holds, newest first. `hasOlderVisits` says whether the page cap stopped the walk before the end.',
    kind: 'read',
    group: 'Visits',
    params: [],
    run: (request) => fetchPastVisitsRaw(request),
    processor: pastVisitsProcessor,
  },
  {
    id: 'get_visit_notes',
    title: 'Visit notes',
    description:
      'List the clinical notes (operative, progress, anesthesia, …) attached to a past visit. Returns lrpID and, per note, hnoID and hnoDAT — pass those to get_note_content.',
    kind: 'read',
    group: 'Visits',
    params: [{ name: 'csn', type: 'string', description: 'Visit CSN (encounter id) from get_past_visits.', required: true }],
    run: (request, args) => fetchVisitNotesRaw(request, requireStr(args, 'csn')),
    processor: visitNotesProcessor,
  },
  {
    id: 'get_note_content',
    title: 'Note content',
    description: 'Fetch the rendered content of a single clinical note listed by get_visit_notes.',
    kind: 'read',
    group: 'Visits',
    params: [
      { name: 'csn', type: 'string', description: 'Visit CSN from get_past_visits.', required: true },
      { name: 'lrp_id', type: 'string', description: 'lrpID from get_visit_notes.', required: true },
      { name: 'hno_id', type: 'string', description: 'hnoID of the chosen note.', required: true },
      { name: 'hno_dat', type: 'string', description: 'hnoDAT of the chosen note.', required: true },
    ],
    run: (request, args) =>
      fetchNoteContentRaw(request, {
        csn: requireStr(args, 'csn'),
        lrpId: requireStr(args, 'lrp_id'),
        hnoId: requireStr(args, 'hno_id'),
        hnoDat: requireStr(args, 'hno_dat'),
      }),
    processor: noteContentProcessor,
  },
  {
    id: 'get_visit_avs',
    title: 'After Visit Summary',
    description: 'The After Visit Summary for a past visit.',
    kind: 'read',
    group: 'Visits',
    params: [{ name: 'csn', type: 'string', description: 'Visit CSN from get_past_visits.', required: true }],
    run: (request, args) => fetchVisitAvsRaw(request, requireStr(args, 'csn')),
    processor: noteContentProcessor,
  },

];
