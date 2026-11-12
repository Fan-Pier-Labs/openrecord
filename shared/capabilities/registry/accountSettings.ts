// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * The `Settings` group — how this MyChart account is set up, read
 * only. Every org configures these pages differently, which is the point of
 * reading them: comparing the same account's settings across health systems.
 */

import {
  fetchNotificationPreferencesRaw,
  notificationPreferencesProcessor,
} from '../../../scrapers/myChart/chart/notificationPreferences/notificationPreferences';
import { fetchAccountSettingsRaw, accountSettingsProcessor } from '../../../scrapers/myChart/chart/accountSettings/accountSettings';
import type { CapabilityImpl } from '../types';

export const ACCOUNT_SETTINGS_CAPABILITIES: readonly CapabilityImpl[] = [
  {
    id: 'get_notification_preferences',
    title: 'Notification preferences',
    description:
      'Which notifications this MyChart sends and on which channels (email, text, push, phone, mail), topic by topic, as this health system arranges them — including the ones locked on — plus the email and mobile number they go to.',
    kind: 'read',
    group: 'Settings',
    lessFrequentlyUsed: true,
    params: [],
    run: (request) => fetchNotificationPreferencesRaw(request),
    processor: notificationPreferencesProcessor,
  },
  {
    id: 'get_account_settings',
    title: 'Account settings',
    description:
      'Paperless enrollment (statements, EOBs, invoices, after-visit summaries), when new test results are released, two-step verification and password age, text-message consent, and whether the record is shared through Care Everywhere.',
    kind: 'read',
    group: 'Settings',
    lessFrequentlyUsed: true,
    params: [],
    run: (request) => fetchAccountSettingsRaw(request),
    processor: accountSettingsProcessor,
  },
];
