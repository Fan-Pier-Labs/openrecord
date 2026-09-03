import { documentsPage } from '@/lib/html';
import { html, json } from './respond';
import type { ExactRoutes } from './types';

export const documentsGet: ExactRoutes = {
  'documents': () => html(documentsPage()),
};

export const documentsPost: ExactRoutes = {
  'api/documents/viewer/loadotherdocuments': ({ ds }) => json(ds.documents),
};
