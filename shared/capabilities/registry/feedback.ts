// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * The `Feedback` group — telling the developers what a user wanted that
 * OpenRecord can't do yet.
 *
 * An `accountFree` write: it never touches a chart (it posts to the shared Fan
 * Pier Labs forms Lambda, which emails it on), but it sends what the user typed
 * — and, if they agree, who they are — off the device, so every client gates it
 * like any other write.
 */

import { sendFeatureRequest } from '../../featureRequest';
import { optStr, requireStr } from '../args';
import type { CapabilityImpl } from '../types';

export const FEEDBACK_CAPABILITIES: readonly CapabilityImpl[] = [
  {
    id: 'send_feature_request',
    title: 'Send a feature request',
    description:
      "Email the OpenRecord developers a short description of something the user wanted to do with their health records that OpenRecord can't do yet. " +
      "When a request about their records or MyChart needs something none of your OpenRecord tools can do, say OpenRecord can't do that yet, " +
      "that the developers would love to hear what they're trying to do, and offer to send it. Give three choices: " +
      '(1) send it with their name, email and health system so the developers can reply — the default; ' +
      '(2) send it without their name, email or health system; ' +
      '(3) send nothing. ' +
      'For choice 1, ask the user for their name and email, and use the health system of the account they are using. ' +
      'For choice 2, pass only `request`. ' +
      'Describe the feature, not their chart: leave out diagnoses, medications, results and dates of care unless the user asks to include them.',
    kind: 'write',
    accountFree: true,
    modelOnly: true,
    group: 'Feedback',
    lessFrequentlyUsed: true,
    params: [
      {
        name: 'request',
        type: 'string',
        description: 'A few sentences on what the user was trying to do and what they would want OpenRecord to do.',
        required: true,
      },
      { name: 'name', type: 'string', description: "The user's name. Omit for choice 2." },
      { name: 'email', type: 'string', description: "The user's email, so the developers can reply. Omit for choice 2." },
      {
        name: 'hospital',
        type: 'string',
        description: 'Their health system, or its MyChart hostname. Omit for choice 2.',
      },
    ],
    run: (args) =>
      sendFeatureRequest({
        request: requireStr(args, 'request'),
        name: optStr(args, 'name'),
        email: optStr(args, 'email'),
        hospital: optStr(args, 'hospital'),
      }),
  },
];
