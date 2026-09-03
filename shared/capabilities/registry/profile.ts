/** The `Profile` group — the standing facts about a patient's health. */

import { fetchProfileRaw, profileProcessor } from '../../../scrapers/myChart/chart/profile/profile';
import { fetchHealthSummaryRaw, healthSummaryProcessor } from '../../../scrapers/myChart/chart/healthSummary/healthSummary';
import { fetchMedicationsRaw, medicationsProcessor } from '../../../scrapers/myChart/chart/medications/medications';
import { fetchAllergiesRaw, allergiesProcessor } from '../../../scrapers/myChart/chart/allergies/allergies';
import { fetchHealthIssuesRaw, healthIssuesProcessor } from '../../../scrapers/myChart/chart/healthIssues/healthIssues';
import { fetchVitalsRaw, vitalsProcessor } from '../../../scrapers/myChart/chart/vitals/vitals';
import { fetchImmunizationsRaw, immunizationsProcessor } from '../../../scrapers/myChart/chart/immunizations/immunizations';
import { fetchPreventiveCareRaw, preventiveCareProcessor } from '../../../scrapers/myChart/chart/preventiveCare/preventiveCare';
import { fetchMedicalHistoryRaw, medicalHistoryProcessor } from '../../../scrapers/myChart/chart/medicalHistory/medicalHistory';
import { fetchGoalsRaw, goalsProcessor } from '../../../scrapers/myChart/chart/goals/goals';
import type { CapabilityImpl } from '../types';

export const PROFILE_CAPABILITIES: readonly CapabilityImpl[] = [
  {
    id: 'get_profile',
    title: 'Patient profile',
    description: 'Patient profile (name, date of birth, medical record number, primary care provider) plus the account email address.',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => fetchProfileRaw(request),
    processor: profileProcessor,
  },
  {
    id: 'get_health_summary',
    title: 'Health summary',
    description: 'Health summary — vitals snapshot, blood type, smoking status and similar top-level facts.',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => fetchHealthSummaryRaw(request),
    processor: healthSummaryProcessor,
  },
  {
    id: 'get_medications',
    title: 'Medications',
    description: 'Current medications with dosage, instructions, prescriber and pharmacy.',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => fetchMedicationsRaw(request),
    processor: medicationsProcessor,
  },
  {
    id: 'get_allergies',
    title: 'Allergies',
    description: 'Known allergies with reaction and severity.',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => fetchAllergiesRaw(request),
    processor: allergiesProcessor,
  },
  {
    id: 'get_health_issues',
    title: 'Health issues',
    description: 'Active health issues / problem list.',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => fetchHealthIssuesRaw(request),
    processor: healthIssuesProcessor,
  },
  {
    id: 'get_vitals',
    title: 'Vitals',
    description: 'Vitals and tracked flowsheet readings (weight, blood pressure, heart rate, glucose, etc.).',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => fetchVitalsRaw(request),
    processor: vitalsProcessor,
  },
  {
    id: 'get_immunizations',
    title: 'Immunizations',
    description: 'Vaccination history.',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => fetchImmunizationsRaw(request),
    processor: immunizationsProcessor,
  },
  {
    id: 'get_preventive_care',
    title: 'Preventive care',
    description: 'Preventive care recommendations — overdue and upcoming screenings.',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => fetchPreventiveCareRaw(request),
    processor: preventiveCareProcessor,
  },
  {
    id: 'get_medical_history',
    title: 'Medical history',
    description: 'Past medical, surgical, family and social history.',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => fetchMedicalHistoryRaw(request),
    processor: medicalHistoryProcessor,
  },
  {
    id: 'get_goals',
    title: 'Goals',
    description: 'Care team goals and patient-set goals.',
    kind: 'read',
    group: 'Profile',
    lessFrequentlyUsed: true,
    params: [],
    run: (request) => fetchGoalsRaw(request),
    processor: goalsProcessor,
  },

];
