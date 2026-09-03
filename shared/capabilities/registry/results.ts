/** The `Results` group — labs, imaging reports, and the pictures behind them. */

import {
  fetchLabResultsRaw,
  fetchImagingResultsRaw,
  getImagingResults,
  labResultsProcessor,
  imagingResultsProcessor,
} from '../../../scrapers/myChart/chart/labs/labResults';
import { downloadImagingStudyDirect } from '../../../scrapers/myChart/eunity/download';
import type { FdiContext } from '../../../scrapers/myChart/eunity/imagingViewer';
import { num, optStr } from '../args';
import { decodeImageId, type StudyImagePayload } from '../imaging';
import type { CapabilityImpl } from '../types';

export const RESULT_CAPABILITIES: readonly CapabilityImpl[] = [
  {
    id: 'get_lab_results',
    title: 'Lab results',
    description: 'Lab results with reference ranges and prior values for trending.',
    kind: 'read',
    group: 'Results',
    params: [],
    run: (request) => fetchLabResultsRaw(request),
    processor: labResultsProcessor,
  },
  {
    id: 'get_imaging_results',
    title: 'Imaging results',
    description:
      'Imaging result metadata (X-ray, MRI, CT, ultrasound, …) with reports. Entries that have viewable pictures carry an `image_id` — pass that to download_imaging_study to get the actual images.',
    kind: 'read',
    group: 'Results',
    params: [],
    // The processor mints `image_id` (one opaque token for the { fdi, ord }
    // pair — a single copy-paste value is far easier for a model to hand
    // back than two fields it can mix up) and `index`, the fallback handle.
    run: (request) => fetchImagingResultsRaw(request),
    processor: imagingResultsProcessor,
  },
  {
    id: 'download_imaging_study',
    aliases: ['get_xray_image'],
    title: 'Download imaging study',
    description:
      'Download every picture in one imaging study. Identify the study with the `image_id` from get_imaging_results (or its 0-based `imaging_index`). Images are downloaded and decoded on the user’s own device.',
    kind: 'read',
    group: 'Results',
    rendersMedia: true,
    params: [
      { name: 'image_id', type: 'string', description: 'The `image_id` from the chosen get_imaging_results entry. Copy it verbatim.' },
      { name: 'imaging_index', type: 'number', description: 'Alternative to image_id: the 0-based index of the study in get_imaging_results.', min: 0 },
      { name: 'study_name', type: 'string', description: 'Human-readable study name used to label the output. Optional.' },
    ],
    run: async (request, args): Promise<StudyImagePayload> => {
      let fdiContext: FdiContext;
      let studyName = optStr(args, 'study_name');

      const imageId = optStr(args, 'image_id');
      if (imageId) {
        fdiContext = decodeImageId(imageId);
      } else if (args.imaging_index !== undefined && args.imaging_index !== null && args.imaging_index !== '') {
        const index = num(args, 'imaging_index', -1);
        if (!Number.isInteger(index) || index < 0) {
          throw new Error('imaging_index must be a non-negative integer from get_imaging_results.');
        }
        const { orders } = await getImagingResults(request);
        const study = orders[index];
        if (!study) throw new Error(`No imaging result at index ${index} (this account has ${orders.length}).`);
        if (!study.image_id) throw new Error(`The imaging result at index ${index} has no viewable images.`);
        fdiContext = decodeImageId(study.image_id);
        studyName = studyName ?? study.orderName ?? undefined;
      } else {
        throw new Error('Pass either image_id (from get_imaging_results) or imaging_index.');
      }

      const result = await downloadImagingStudyDirect(request, fdiContext, studyName ?? 'study', '', {
        skipFileWrite: true,
      });

      return {
        studyName: result.studyName,
        totalImages: result.images.length,
        images: result.images.map((img, index) => ({
          index,
          seriesUID: img.seriesUID,
          seriesDescription: img.seriesDescription,
          // An image with no pixel or wrapper buffer omits the key rather than
          // reporting it as present-and-undefined.
          ...(img.pixelData !== undefined ? { pixelData: img.pixelData } : {}),
          ...(img.wrapperData !== undefined ? { wrapperData: img.wrapperData } : {}),
        })),
        errors: result.errors,
      };
    },
  },

];
