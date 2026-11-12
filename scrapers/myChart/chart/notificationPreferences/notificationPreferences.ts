// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import { notificationPreferencesProcessor, type NotificationPreferencesStandard } from './notificationPreferences.processor';

export type {
  AdditionalItemSectionStandard,
  NotificationConceptStandard,
  NotificationContactInformationStandard,
  NotificationGrouperStandard,
  NotificationMediaStandard,
  NotificationOptionStandard,
  NotificationPreferencesStandard,
} from './notificationPreferences.processor';
export { notificationPreferencesProcessor } from './notificationPreferences.processor';

/**
 * `GET /app/communication-preferences` for the token, then
 * `POST /api/communicationPreferences/GetPreferences` (the payload) and
 * `POST /api/communicationPreferences/GetContactInformation` (where those
 * notifications are delivered). Both take `{}`, exactly as the activity sends.
 *
 * Only the contact read is tolerated: a failed `GetPreferences` is a failed
 * read, not an org with no notification topics.
 */
export async function fetchNotificationPreferencesRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/app/communication-preferences');
  await collector.postJson('/api/communicationPreferences/GetPreferences', token, {});
  await collector.postJson('/api/communicationPreferences/GetContactInformation', token, {}, { tolerateFailure: true });
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getNotificationPreferences(mychartRequest: MyChartRequest): Promise<NotificationPreferencesStandard> {
  return notificationPreferencesProcessor.standard(await fetchNotificationPreferencesRaw(mychartRequest));
}
