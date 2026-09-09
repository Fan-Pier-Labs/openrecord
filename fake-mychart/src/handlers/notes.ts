import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { json } from './respond';
import type { ExactRoutes } from './types';

export const notesPost: ExactRoutes = {
  'api/visit-notes/getvisitnotes': async ({ request, ds }) => {
    // Real instances answer an unknown CSN with a literal JSON null body.
    try {
      const body = await request.json();
      const data = ds.visitNotesByCsn[body.CSN];
      if (data) return json(conformToShape(shapes.getVisitNotes, data));
    } catch { /* fall through */ }
    return json(null);
  },

  'api/report-content/loadreportcontent': async ({ request, ds }) => {
    try {
      const body = await request.json();
      // Clinical note content (see getNoteContent in scrapers/myChart/notes/notes.ts).
      if (body.reportMnemonic === 'OPEN_NOTES') {
        const note = ds.noteContent[body.contextID];
        if (note) return json(conformToShape(shapes.loadReportContent, note));
      }
      // After Visit Summary (see getVisitAVS in scrapers/myChart/notes/notes.ts).
      else if (body.reportMnemonic === 'AMB_AVS') {
        const avs = ds.avsByCsn[body.csn];
        if (avs) return json(conformToShape(shapes.loadReportContent, avs));
      }
      // Imaging report bodies. `reportID` is a template id shared by every
      // imaging result, so the order in `assumedVariables` picks the report —
      // as on a real instance (see scrapers/myChart/chart/labs/README.md).
      else if (body.reportID) {
        const report = ds.imagingReportsByOrder[body.assumedVariables?.ordId];
        if (report) return json(conformToShape(shapes.loadReportContent, report));
      }
    } catch { /* fall through */ }
    return json(conformToShape(shapes.loadReportContent, { reportContent: '', reportCss: '' }));
  },
};
