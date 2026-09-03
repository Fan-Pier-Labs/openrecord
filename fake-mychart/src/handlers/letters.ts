import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { lettersPage } from '@/lib/html';
import { html, json } from './respond';
import type { ExactRoutes } from './types';

export const lettersGet: ExactRoutes = {
  'letters': () => html(lettersPage()),
};

export const lettersPost: ExactRoutes = {
  'api/letters/getletterslist': ({ ds }) => json(conformToShape(shapes.getLettersList, ds.letters)),

  'api/letters/getletterdetails': async ({ request, ds }) => {
    // Real instances answer an unknown hnoId with a literal JSON null body,
    // not an error status and not a placeholder document.
    try {
      const body = await request.json();
      const details = ds.letterDetails[body.hnoId];
      if (details) return json(details);
      return json(null);
    } catch {
      return json(null);
    }
  },
};
