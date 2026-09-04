/** The `Care` group — everything the care team sends, orders, or assigns. */

import { fetchCareTeamRaw, careTeamProcessor } from '../../../scrapers/myChart/chart/careTeam/careTeam';
import { fetchReferralsRaw, referralsProcessor } from '../../../scrapers/myChart/chart/referrals/referrals';
import {
  fetchLettersRaw,
  fetchLetterDetailsRaw,
  lettersProcessor,
  letterDetailsProcessor,
} from '../../../scrapers/myChart/chart/letters/letters';
import { fetchDocumentsRaw, documentsProcessor } from '../../../scrapers/myChart/chart/documents/documents';
import { fetchUpcomingOrdersRaw, upcomingOrdersProcessor } from '../../../scrapers/myChart/chart/upcomingOrders/upcomingOrders';
import { fetchQuestionnairesRaw, questionnairesProcessor } from '../../../scrapers/myChart/chart/questionnaires/questionnaires';
import { fetchCareJourneysRaw, careJourneysProcessor } from '../../../scrapers/myChart/chart/careJourneys/careJourneys';
import { fetchActivityFeedRaw, activityFeedProcessor } from '../../../scrapers/myChart/chart/activityFeed/activityFeed';
import { fetchEducationMaterialsRaw, educationMaterialsProcessor } from '../../../scrapers/myChart/chart/educationMaterials/educationMaterials';
import { fetchEhiExportRaw, ehiExportProcessor } from '../../../scrapers/myChart/chart/ehiExport/ehiExport';
import { fetchLinkedAccountsRaw, linkedAccountsProcessor } from '../../../scrapers/myChart/chart/otherMyCharts/otherMyCharts';
import { requireStr } from '../args';
import type { CapabilityImpl } from '../types';

export const CARE_CAPABILITIES: readonly CapabilityImpl[] = [
  {
    id: 'get_care_team',
    title: 'Care team',
    description: 'Providers on the care team, including outside providers, each with their role and specialty.',
    kind: 'read',
    group: 'Care',
    params: [],
    run: (request) => fetchCareTeamRaw(request),
    processor: careTeamProcessor,
  },
  {
    id: 'get_referrals',
    title: 'Referrals',
    description: 'Active and past referrals.',
    kind: 'read',
    group: 'Care',
    params: [],
    run: (request) => fetchReferralsRaw(request),
    processor: referralsProcessor,
  },
  {
    id: 'get_letters',
    title: 'Letters',
    description: 'Letters from providers. Each entry carries the hnoId/csn needed by get_letter_details.',
    kind: 'read',
    group: 'Care',
    lessFrequentlyUsed: true,
    params: [],
    run: (request) => fetchLettersRaw(request),
    processor: lettersProcessor,
  },
  {
    id: 'get_letter_details',
    title: 'Letter contents',
    description: 'The full contents of one letter listed by get_letters.',
    kind: 'read',
    group: 'Care',
    lessFrequentlyUsed: true,
    params: [
      { name: 'hno_id', type: 'string', description: 'hnoId from the chosen get_letters entry.', required: true },
      { name: 'csn', type: 'string', description: 'csn from the chosen get_letters entry.', required: true },
    ],
    run: (request, args) => fetchLetterDetailsRaw(request, requireStr(args, 'hno_id'), requireStr(args, 'csn')),
    processor: letterDetailsProcessor,
  },
  {
    id: 'get_documents',
    title: 'Documents',
    description: 'Clinical documents and visit records.',
    kind: 'read',
    group: 'Care',
    params: [],
    run: (request) => fetchDocumentsRaw(request),
    processor: documentsProcessor,
  },
  {
    id: 'get_upcoming_orders',
    title: 'Upcoming orders',
    description: 'Standing/upcoming orders — labs, imaging and procedures the care team has ordered.',
    kind: 'read',
    group: 'Care',
    params: [],
    run: (request) => fetchUpcomingOrdersRaw(request),
    processor: upcomingOrdersProcessor,
  },
  {
    id: 'get_questionnaires',
    title: 'Questionnaires',
    description: 'Open and completed questionnaires / health assessments.',
    kind: 'read',
    group: 'Care',
    lessFrequentlyUsed: true,
    unverified:
      'no real instance has ever returned a questionnaire here — three of four serve the legacy ' +
      'activity and answer with an empty list, and the fourth answers /Questionnaire itself with ' +
      'HTTP 500. The React /api/questionnaire/GetQuestionnaireList endpoint is the one to move to.',
    params: [],
    run: (request) => fetchQuestionnairesRaw(request),
    processor: questionnairesProcessor,
  },
  {
    id: 'get_care_journeys',
    title: 'Care journeys',
    description: 'Care journeys and care plans.',
    kind: 'read',
    group: 'Care',
    lessFrequentlyUsed: true,
    params: [],
    run: (request) => fetchCareJourneysRaw(request),
    processor: careJourneysProcessor,
  },
  {
    id: 'get_activity_feed',
    title: 'Activity feed',
    description: 'Recent account activity feed items.',
    kind: 'read',
    group: 'Care',
    lessFrequentlyUsed: true,
    params: [],
    run: (request) => fetchActivityFeedRaw(request),
    processor: activityFeedProcessor,
  },
  {
    id: 'get_education_materials',
    title: 'Education materials',
    description: 'Patient education materials assigned by the care team.',
    kind: 'read',
    group: 'Care',
    lessFrequentlyUsed: true,
    params: [],
    run: (request) => fetchEducationMaterialsRaw(request),
    processor: educationMaterialsProcessor,
  },
  {
    id: 'get_ehi_export',
    title: 'EHI export templates',
    description: 'Electronic Health Information export templates this instance offers.',
    kind: 'read',
    group: 'Care',
    lessFrequentlyUsed: true,
    params: [],
    run: (request) => fetchEhiExportRaw(request),
    processor: ehiExportProcessor,
  },
  {
    id: 'get_linked_accounts',
    title: 'Linked MyChart accounts',
    description: 'MyChart accounts at other organizations that are linked to this one.',
    kind: 'read',
    group: 'Care',
    lessFrequentlyUsed: true,
    params: [],
    run: (request) => fetchLinkedAccountsRaw(request),
    processor: linkedAccountsProcessor,
  },
];
