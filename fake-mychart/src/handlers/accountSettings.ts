// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { json } from './respond';
import { currentUser } from './records';
import type { ExactRoutes } from './types';

export const accountSettingsPost: ExactRoutes = {
  'api/paperless-settings/getcombinedpaperless': ({ ds }) => json(conformToShape(shapes.getCombinedPaperless, ds.paperlessSettings)),
  'api/test-results/getresultsreleasepreferences': ({ ds }) =>
    json(conformToShape(shapes.getResultsReleasePreferences, ds.resultsReleasePreferences)),
  // Account-level, not per record: the TOTP flag is the session user's live
  // state, so this agrees with `GetTwoFactorInfo` after a setup or opt-out.
  'api/security-settings/getinitialsettings': ({ ds, request }) =>
    json(conformToShape(shapes.getSecurityInitialSettings, {
      ...ds.securitySettings,
      twoFactorTOTPOn: currentUser(request)?.totpEnabled ?? false,
    })),
  'api/textoptin/getconsentdata': ({ ds }) => json(conformToShape(shapes.getTextOptInConsentData, ds.textOptInConsent)),
  'api/care-everywhere-opt-out/getceconfiguration': ({ ds }) =>
    json(conformToShape(shapes.getCeConfiguration, ds.careEverywhereConfiguration)),
};
