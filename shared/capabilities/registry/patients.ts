/**
 * The `Patients` group — MyChart proxy access to family members' charts.
 *
 * Thin wrappers over `scrapers/myChart/proxyTools.ts`, which owns the
 * semantics: reads assert which patient they are about and refuse on a
 * mismatch, and only an explicit switch changes MyChart's server-side
 * active patient. Everything below is exempt from that assertion — guarding
 * "you must already be on patient X" in front of the tools that list and
 * change X would make them unusable exactly when they are needed.
 */

import {
  runListProxyTargets,
  runSwitchProxyTarget,
} from '../../../scrapers/myChart/proxy/proxyTools';
import { requireStr } from '../args';
import type { CapabilityImpl } from '../types';

export const PATIENT_CAPABILITIES: readonly CapabilityImpl[] = [
  {
    id: 'list_proxy_targets',
    aliases: ['list_patients', 'get_active_patient'],
    title: 'List accessible patient records',
    description:
      'List every patient record this MyChart account can access — the account holder plus any family members reachable via proxy access (a parent viewing a child\'s chart) — and which one is currently active. Data tools always read the ACTIVE record; use switch_proxy_target to change it. Accounts without proxy access return count: 0.',
    kind: 'read',
    group: 'Patients',
    params: [],
    run: (request) => runListProxyTargets(request),
  },
  {
    id: 'switch_proxy_target',
    aliases: ['switch_patient'],
    title: 'Switch the active patient record',
    description:
      'Switch which patient\'s record MyChart is showing (e.g. from the account holder\'s own chart to a child\'s). This changes server-side MyChart state: EVERY data tool on this account reads the newly active record afterwards. The switch is verified against the profile page and fails rather than landing on the wrong patient. Pass patient: "me" to return to the account holder\'s own record when done.',
    kind: 'write',
    group: 'Patients',
    params: [
      {
        name: 'patient',
        type: 'string',
        description: 'Patient name from list_proxy_targets, or "me" for the account holder\'s own record.',
        required: true,
      },
    ],
    run: (request, args) => runSwitchProxyTarget(request, requireStr(args, 'patient')),
  },
];
