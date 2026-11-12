// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * The `Feedback` group — telling the developers what a user wanted that
 * OpenRecord can't do yet.
 *
 * `public`-kind because it never touches a chart: it posts a description to
 * the shared Fan Pier Labs forms Lambda, which emails it on. The consent step —
 * the three choices in the description — is conversational, so it reaches
 * every model-facing client without client wiring.
 */

import { sendFeatureRequest } from '../../featureRequest';
import { optStr, requireStr } from '../args';
import type { CapabilityImpl } from '../types';

export const FEEDBACK_CAPABILITIES: readonly CapabilityImpl[] = [
  {
    id: 'send_feature_request',
    title: 'Send a feature request',
    description:
      "Tell the OpenRecord developers about something the user wanted to do that OpenRecord can't. " +
      "When a user asks for something none of your OpenRecord tools can do, say plainly that OpenRecord " +
      "can't do that yet, that the developers would love to hear what they're trying to do, and offer to " +
      'send them a short description. Give the user three choices: ' +
      '(1) send it with their name, email and health system, so the developers can follow up — the default; ' +
      '(2) send it anonymously, with only the description; ' +
      '(3) send nothing. ' +
      'Show the exact text you will send and call this only after they pick 1 or 2. ' +
      'For choice 1, take name and email from get_profile and the health system from the account they use ' +
      '(ask if you have no account), and let the user drop any of them. For choice 2, pass only `request`. ' +
      "Describe the feature, not their chart: leave out diagnoses, medications, results and dates of care " +
      'unless the user asks to include them.',
    kind: 'public',
    group: 'Feedback',
    lessFrequentlyUsed: true,
    params: [
      {
        name: 'request',
        type: 'string',
        description: 'A few sentences on what the user was trying to do and what they would want OpenRecord to do.',
        required: true,
      },
      { name: 'name', type: 'string', description: "The user's name. Omit to send anonymously." },
      { name: 'email', type: 'string', description: "The user's email, so the developers can reply. Omit to send anonymously." },
      {
        name: 'hospital',
        type: 'string',
        description: 'Their health system, or its MyChart hostname. Omit to send anonymously.',
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
