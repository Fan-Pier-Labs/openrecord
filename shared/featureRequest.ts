// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { scraperFetch } from '../scrapers/http';
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
 * the reply-to). An anonymous request has none, so it carries this instead.
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
  sent: true;
  anonymous: boolean;
  /** Exactly what left the device, so the model can tell the user. */
  submitted: Record<string, string>;
}

export async function sendFeatureRequest(input: FeatureRequest): Promise<FeatureRequestResult> {
  const request = input.request.trim();
  if (!request) throw new Error('A feature request needs a description of what the user wanted to do.');

  const name = input.name?.trim();
  const email = input.email?.trim();
  const hospital = input.hospital?.trim();
  const anonymous = !name && !email && !hospital;

  const submitted: Record<string, string> = { request };
  if (name) submitted.name = name;
  if (email) submitted.email = email;
  if (hospital) submitted.hospital = hospital;

  const response = await scraperFetch(FEATURE_REQUEST_ENDPOINT, {
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
        ? "The feedback service rejected the email address. Check it, or send the request anonymously."
        : "Couldn't reach the OpenRecord feedback service. Try again later.",
    );
  }
  return { sent: true, anonymous, submitted };
}
