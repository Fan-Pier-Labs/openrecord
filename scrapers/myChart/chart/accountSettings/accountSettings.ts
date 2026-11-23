// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import { SessionExpiredError } from '../../core/makeAuthenticatedRequest';
import {
  ACCOUNT_SETTINGS_SECTIONS,
  accountSettingsProcessor,
  type AccountSettingsStandard,
} from './accountSettings.processor';

export type {
  AccountSettingsStandard,
  CareEverywhereStandard,
  PaperlessFeatureStandard,
  PaperlessStandard,
  ResultsReleaseStandard,
  SecurityStandard,
  TextMessagingStandard,
  TextSenderStandard,
} from './accountSettings.processor';
export { accountSettingsProcessor } from './accountSettings.processor';

/**
 * For each section: `GET` its activity page for the token, then `POST` its
 * endpoint with `{}`, exactly as the activity sends.
 *
 * Each section is tolerated on its own — an org that has not turned on one
 * setting page still has the other four. All five failing is a failed read and
 * throws the first failure; an expired session always throws.
 */
export async function fetchAccountSettingsRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const failures: Error[] = [];
  for (const { activity, path } of ACCOUNT_SETTINGS_SECTIONS) {
    try {
      const token = await collector.pageToken(activity);
      const { failure } = await collector.send(
        {
          path,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', __RequestVerificationToken: token },
          body: JSON.stringify({}),
        },
        { tolerateFailure: true },
      );
      if (failure) failures.push(failure);
    } catch (err) {
      if (err instanceof SessionExpiredError) throw err;
      failures.push(err as Error);
    }
  }
  if (failures.length === ACCOUNT_SETTINGS_SECTIONS.length) throw failures[0]!;
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getAccountSettings(mychartRequest: MyChartRequest): Promise<AccountSettingsStandard> {
  return accountSettingsProcessor.standard(await fetchAccountSettingsRaw(mychartRequest));
}
