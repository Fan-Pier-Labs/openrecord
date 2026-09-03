import { json } from './respond';
import type { ExactRoutes } from './types';

export const questionnairesPost: ExactRoutes = {
  'questionnaire/getquestionnairelist': ({ ds }) => json(ds.questionnaires),
};
