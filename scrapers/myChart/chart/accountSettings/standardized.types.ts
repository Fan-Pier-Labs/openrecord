// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * What `get_account_settings` returns: the standard object the processor
 * builds from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 *
 * Each section is null when its request failed; the failed endpoint is named
 * in `unavailable` rather than reported as a setting that is off.
 */

export interface PaperlessFeatureStandard {
  /** MyChart's numeric enrolment state, as sent. */
  status: number | null;
  /** Derived: `status` decoded — SignedUp, Declined, NoResponse, Mixed or NotEligible. */
  statusName: string | null;
  allowSignup: boolean | null;
  allowCancel: boolean | null;
}

export interface PaperlessStandard {
  /** Paperless billing statements. */
  billingInfo: PaperlessFeatureStandard;
  /** Explanation of benefits. */
  eobInfo: PaperlessFeatureStandard;
  /** Premium billing invoices. */
  invoiceInfo: PaperlessFeatureStandard;
  /** After-visit summaries. */
  avsInfo: PaperlessFeatureStandard;
}

export interface ResultsReleaseStandard {
  options: Array<{ value: string | null; titleUtf8: string | null }>;
  /** `""` when the patient never chose — the org's default applies. */
  chosenRRPreference: string | null;
  /** Derived: the chosen option's title; null when nothing was chosen. */
  chosenRRPreferenceTitle: string | null;
}

export interface SecurityStandard {
  passwordLastUpdated: string | null;
  twoFactorEmailSmsOn: boolean | null;
  twoFactorTOTPOn: boolean | null;
  twoFactorRequired: boolean | null;
  allowEmailSmsToggle: boolean | null;
  allowTotpToggle: boolean | null;
  passkeyLoginAvailable: boolean | null;
  rememberWebDevices: boolean | null;
  rememberWebDevicesAllowed: boolean | null;
  passwordChangeAvailable: boolean | null;
  isMyChartCentral: boolean | null;
  deactivateAccountAllowed: boolean | null;
}

export interface TextSenderStandard {
  shortCode: string | null;
  displayName: string | null;
  termsAndConditionsURL: string | null;
}

export interface TextMessagingStandard {
  consentData: {
    phone: string | null;
    shortCodesConsent: Record<string, boolean>;
  };
  primarySender: TextSenderStandard;
  /** Present when the instance sends it (four of five captured). */
  secondarySenders?: TextSenderStandard[];
  /** The same list under the other Epic release's name (one of five captured). */
  additionalSenders?: TextSenderStandard[];
}

export interface CareEverywhereStandard {
  isPatientOptedIn: boolean | null;
  canChangeCeStatus: boolean | null;
  doesPatientReqConsent: boolean | null;
  hasAuthsOnFile: boolean | null;
  needsAuthorization: boolean | null;
}

export interface AccountSettingsStandard {
  /** `GetCombinedPaperless`. */
  paperless: PaperlessStandard | null;
  /** `GetResultsReleasePreferences`: when new test results appear. */
  resultsRelease: ResultsReleaseStandard | null;
  /** `GetInitialSettings` on the security-settings activity. */
  security: SecurityStandard | null;
  /** `GetConsentData`: text-message consent per sender. */
  textMessaging: TextMessagingStandard | null;
  /** `GetCeConfiguration`: whether the record is shared through Care Everywhere. */
  careEverywhere: CareEverywhereStandard | null;
  /** Derived: the endpoints that failed, by path. */
  unavailable: string[];
}
