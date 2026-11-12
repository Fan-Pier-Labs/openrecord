// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Account settings processor. Field decisions: this folder's README.
 *
 * Five independent reads, one section each. A section whose request failed is
 * `null` and its endpoint is named in `unavailable` — "paperless status
 * unknown" must never read as "not signed up".
 */

import { findRequest, okBodyOf, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { boolOrNull, list, num, rec, textOrNull } from '../../processors/read';
import type {
  GetCeConfiguration,
  GetCombinedPaperless,
  GetConsentData,
  GetInitialSettings,
  GetResultsReleasePreferences,
} from './mychart.types';
import type {
  AccountSettingsStandard,
  PaperlessFeatureStandard,
  TextMessagingStandard,
  TextSenderStandard,
} from './standardized.types';

export type {
  AccountSettingsStandard,
  CareEverywhereStandard,
  PaperlessFeatureStandard,
  PaperlessStandard,
  ResultsReleaseStandard,
  SecurityStandard,
  TextMessagingStandard,
  TextSenderStandard,
} from './standardized.types';

const PAPERLESS = '/api/paperless-settings/GetCombinedPaperless';
const RESULTS_RELEASE = '/api/test-results/GetResultsReleasePreferences';
const SECURITY = '/api/security-settings/GetInitialSettings';
const TEXT_OPT_IN = '/api/textoptin/GetConsentData';
const CARE_EVERYWHERE = '/api/care-everywhere-opt-out/GetCeConfiguration';

/** Each section's activity page (for the token) and endpoint, in request order. */
export const ACCOUNT_SETTINGS_SECTIONS = [
  { activity: '/app/paperless-settings', path: PAPERLESS },
  { activity: '/app/test-results', path: RESULTS_RELEASE },
  { activity: '/app/security-settings', path: SECURITY },
  { activity: '/app/text-opt-in', path: TEXT_OPT_IN },
  { activity: '/app/care-everywhere-opt-out', path: CARE_EVERYWHERE },
] as const;

/** `epic.px.client.paperless-settings`: the bundle's own decode table. `0` is its "NotLoaded" placeholder. */
export const PAPERLESS_STATUS_NAMES: Readonly<Record<number, string>> = {
  [-1]: 'NotEligible',
  1: 'SignedUp',
  2: 'Declined',
  3: 'NoResponse',
  4: 'Mixed',
};

function paperlessFeature(value: unknown): PaperlessFeatureStandard {
  const f = rec<NonNullable<GetCombinedPaperless['eobInfo']>>(value);
  const status = num(f.status);
  return {
    status,
    statusName: status === null ? null : PAPERLESS_STATUS_NAMES[status] ?? null,
    allowSignup: boolOrNull(f.allowSignup),
    allowCancel: boolOrNull(f.allowCancel),
  };
}

function sender(value: unknown): TextSenderStandard {
  const s = rec<NonNullable<GetConsentData['primarySender']>>(value);
  return {
    shortCode: textOrNull(s.shortCode),
    displayName: textOrNull(s.displayName),
    termsAndConditionsURL: textOrNull(s.termsAndConditionsURL),
  };
}

function textMessaging(value: unknown): TextMessagingStandard {
  const body = rec<GetConsentData>(value);
  const consent = rec(rec(body.consentData).shortCodesConsent);
  return {
    consentData: {
      phone: textOrNull(rec(body.consentData).phone),
      shortCodesConsent: Object.fromEntries(
        Object.entries(consent).filter((e): e is [string, boolean] => typeof e[1] === 'boolean'),
      ),
    },
    primarySender: sender(body.primarySender),
    ...('secondarySenders' in body ? { secondarySenders: list(body.secondarySenders).map(sender) } : {}),
    ...('additionalSenders' in body ? { additionalSenders: list(body.additionalSenders).map(sender) } : {}),
  };
}

export const accountSettingsProcessor: Processor<AccountSettingsStandard> = {
  standard(raw: RawResponse): AccountSettingsStandard {
    const unavailable: string[] = [];
    const section = <T>(path: string, build: (body: unknown) => T): T | null => {
      const body = okBodyOf(raw, path);
      if (body === undefined) {
        // A section the scraper never reached (its token page threw) is as
        // unknown as one that answered 500.
        unavailable.push(findRequest(raw, path)?.path ?? path);
        return null;
      }
      return build(body);
    };
    return {
      paperless: section(PAPERLESS, (b) => {
        const p = rec<GetCombinedPaperless>(b);
        return {
          billingInfo: paperlessFeature(p.billingInfo),
          eobInfo: paperlessFeature(p.eobInfo),
          invoiceInfo: paperlessFeature(p.invoiceInfo),
          avsInfo: paperlessFeature(p.avsInfo),
        };
      }),
      resultsRelease: section(RESULTS_RELEASE, (b) => {
        const r = rec<GetResultsReleasePreferences>(b);
        const options = list(r.options).map((o) => ({
          value: textOrNull(rec(o).value),
          titleUtf8: textOrNull(rec(o).titleUtf8),
        }));
        const chosen = textOrNull(r.chosenRRPreference);
        return {
          options,
          chosenRRPreference: chosen,
          chosenRRPreferenceTitle: chosen ? options.find((o) => o.value === chosen)?.titleUtf8 ?? null : null,
        };
      }),
      security: section(SECURITY, (b) => {
        const s = rec<GetInitialSettings>(b);
        return {
          passwordLastUpdated: textOrNull(s.passwordLastUpdated),
          twoFactorEmailSmsOn: boolOrNull(s.twoFactorEmailSmsOn),
          twoFactorTOTPOn: boolOrNull(s.twoFactorTOTPOn),
          twoFactorRequired: boolOrNull(s.twoFactorRequired),
          allowEmailSmsToggle: boolOrNull(s.allowEmailSmsToggle),
          allowTotpToggle: boolOrNull(s.allowTotpToggle),
          passkeyLoginAvailable: boolOrNull(s.passkeyLoginAvailable),
          rememberWebDevices: boolOrNull(s.rememberWebDevices),
          rememberWebDevicesAllowed: boolOrNull(s.rememberWebDevicesAllowed),
          passwordChangeAvailable: boolOrNull(s.passwordChangeAvailable),
          isMyChartCentral: boolOrNull(s.isMyChartCentral),
          deactivateAccountAllowed: boolOrNull(s.deactivateAccountAllowed),
        };
      }),
      textMessaging: section(TEXT_OPT_IN, textMessaging),
      careEverywhere: section(CARE_EVERYWHERE, (b) => {
        const c = rec<GetCeConfiguration>(b);
        return {
          isPatientOptedIn: boolOrNull(c.isPatientOptedIn),
          canChangeCeStatus: boolOrNull(c.canChangeCeStatus),
          doesPatientReqConsent: boolOrNull(c.doesPatientReqConsent),
          hasAuthsOnFile: boolOrNull(c.hasAuthsOnFile),
          needsAuthorization: boolOrNull(c.needsAuthorization),
        };
      }),
      unavailable,
    };
  },
  /** The one answer per setting a person asks about. */
  concise(standard) {
    const p = standard.paperless;
    return {
      paperless: p && {
        billingInfo: { statusName: p.billingInfo.statusName },
        eobInfo: { statusName: p.eobInfo.statusName },
        invoiceInfo: { statusName: p.invoiceInfo.statusName },
        avsInfo: { statusName: p.avsInfo.statusName },
      },
      resultsRelease: standard.resultsRelease && {
        chosenRRPreferenceTitle: standard.resultsRelease.chosenRRPreferenceTitle,
      },
      security: standard.security && {
        twoFactorEmailSmsOn: standard.security.twoFactorEmailSmsOn,
        twoFactorTOTPOn: standard.security.twoFactorTOTPOn,
        passwordLastUpdated: standard.security.passwordLastUpdated,
      },
      textMessaging: standard.textMessaging && {
        consentData: { shortCodesConsent: standard.textMessaging.consentData.shortCodesConsent },
      },
      careEverywhere: standard.careEverywhere && {
        isPatientOptedIn: standard.careEverywhere.isPatientOptedIn,
      },
      unavailable: standard.unavailable,
    };
  },
};
