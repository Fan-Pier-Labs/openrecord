// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { scraperFetch } from '../scrapers/http';
import { optStr, requireStr } from './capabilities/args';
import type { CapabilityParam } from './capabilities/types';
import { DetailedError } from './detailedError';

/**
 * The shared `fanpierlabs-forms` Lambda (owned by the
 * `fanpierlabs-projects-email-submission` project, not this repo). It emails
 * every submission to the developers and logs it to CloudWatch. The splash's
 * waitlist form posts here too.
 */
export const FEATURE_REQUEST_ENDPOINT = 'https://ns8remz3t7.execute-api.us-east-2.amazonaws.com';

export const FEATURE_REQUEST_SITE = 'openrecord-feature-request';

/**
 * The Lambda refuses a submission without a well-formed `email` (it becomes
 * the reply-to). A request sent without the user's email carries this
 * instead. It has no mailbox, so a reply to it bounces — which is the point.
 */
export const ANONYMOUS_EMAIL = 'anonymous@openrecord.fanpierlabs.com';

export interface FeatureRequest {
  /** What the user was trying to do that OpenRecord can't. */
  request: string;
  name?: string | undefined;
  email?: string | undefined;
  /** Health system name or MyChart hostname. */
  hospital?: string | undefined;
}

export interface FeatureRequestResult {
  /**
   * The Lambda accepted it. It answers 200 once the submission is logged, even
   * if the email itself then fails, so this means "recorded", not "delivered".
   */
  sent: true;
  /** Exactly what left the device, so the model can tell the user. */
  submitted: Record<string, string>;
}

/** `endpoint` is the test seam: integration tests point it at fake-mychart. */
export async function sendFeatureRequest(
  input: FeatureRequest,
  options: { endpoint?: string } = {},
): Promise<FeatureRequestResult> {
  const request = input.request.trim();
  if (!request) throw new Error('A feature request needs a description of what the user wanted to do.');

  const name = input.name?.trim();
  const email = input.email?.trim();
  const hospital = input.hospital?.trim();

  const submitted: Record<string, string> = { request };
  if (name) submitted.name = name;
  if (email) submitted.email = email;
  if (hospital) submitted.hospital = hospital;

  const response = await scraperFetch(options.endpoint ?? FEATURE_REQUEST_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ site: FEATURE_REQUEST_SITE, ...submitted, email: email || ANONYMOUS_EMAIL }),
  });
  if (!response.ok) {
    // The Lambda answers 400 only for a malformed `email`; anything else is it
    // being down. Either way the body may echo what was sent, so it stays out
    // of the message — this reaches Sentry.
    throw new DetailedError(
      `Feature request failed: HTTP ${response.status}`,
      response.status === 400
        ? "The feedback service rejected the email address. Check it, or send the request without it."
        : "Couldn't reach the OpenRecord feedback service. Try again later.",
    );
  }
  return { sent: true, submitted };
}

/**
 * The model-facing tool. The Claude Desktop extension and the mobile app each
 * register it by hand, behind their own confirmation. Deliberately not a
 * capability: the npm package exports the registry for consumers to map onto
 * their own model's tools, and this one emails us.
 */
export const FEATURE_REQUEST_TOOL: {
  name: string;
  title: string;
  description: string;
  params: readonly CapabilityParam[];
} = {
  name: 'send_feature_request',
  title: 'Send a feature request',
  // Short on purpose: the mobile confirmation dialog shows this to the user.
  // How to offer it lives in the MCPB server instructions and the mobile
  // system prompt.
  description:
    "Email the OpenRecord developers what the user wanted to do that OpenRecord can't do yet, with their name, email and health system if they chose to include them.",
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
};

/** Runs the tool from the untyped arguments a model emits. */
export async function runFeatureRequestTool(args: Record<string, unknown>): Promise<FeatureRequestResult> {
  return sendFeatureRequest({
    request: requireStr(args, 'request'),
    name: optStr(args, 'name'),
    email: optStr(args, 'email'),
    hospital: optStr(args, 'hospital'),
  });
}
