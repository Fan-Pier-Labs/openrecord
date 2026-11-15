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
    // Short on purpose: the mobile confirmation dialog shows this to the user.
    // How to offer it lives in the MCPB server instructions and the mobile
    // system prompt, the only two clients that offer it.
    description:
      "Email the OpenRecord developers what the user wanted to do that OpenRecord can't do yet, with their name, email and health system if they chose to include them.",
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
      { name: 'name', type: 'string', description: "The user's name. Omit to send without it." },
      { name: 'email', type: 'string', description: "The user's email, so the developers can reply. Omit to send without it." },
      {
        name: 'hospital',
        type: 'string',
        description: 'Their health system, or its MyChart hostname. Omit to send without it.',
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
