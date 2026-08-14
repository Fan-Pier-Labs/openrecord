/**
 * Which patient records the demo account can reach.
 *
 * A MyChart login often sees more than one chart: the account holder's own,
 * plus any family member who granted proxy access. Which one the portal serves
 * is server-side state, so `list_proxy_targets` reports it and
 * `switch_proxy_target` changes it — see `scrapers/myChart/proxy/proxyTools.ts`
 * for the real thing.
 *
 * This module exists so the two charts never have to import each other.
 */

import { bartRecord, BART_PATIENT_ID } from './bartRecord';
import * as data from './data';
import type { PatientRecord } from './types';

export type PatientSeed = {
  id: string;
  /** The name MyChart shows in its patient switcher. */
  name: string;
  isSelf: boolean;
  relationship: string;
  dateOfBirth: string;
  record: PatientRecord;
};

export const SELF_PATIENT_ID = 'WP-demo-proxy-self';

export const PATIENT_SEEDS: PatientSeed[] = [
  {
    id: SELF_PATIENT_ID,
    name: 'Homer Simpson',
    isSelf: true,
    relationship: 'Self',
    dateOfBirth: data.profile.dateOfBirth,
    record: data.homerRecord,
  },
  {
    id: BART_PATIENT_ID,
    name: 'Bart Simpson',
    isSelf: false,
    relationship: 'Child — proxy access',
    dateOfBirth: bartRecord.profile.dateOfBirth,
    record: bartRecord,
  },
];
