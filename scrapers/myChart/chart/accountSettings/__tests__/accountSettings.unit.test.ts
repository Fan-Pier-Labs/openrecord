// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { describe, it, expect, mock } from 'bun:test'
import { fetchAccountSettingsRaw, accountSettingsProcessor } from '../accountSettings'
import { MyChartRequest } from '../../../core/myChartRequest'
import type { RawRequestRecord, RawResponse } from '../../../core/rawResponse'

const TOKEN_HTML = '<input name="__RequestVerificationToken" value="t" />'

const PAPERLESS = {
  billingInfo: { isLTCEnabled: false, hasAnAuthUser: false, status: 2, allowSignup: true, showNoNotifsPopup: false, allowCancel: false },
  eobInfo: { status: -1, allowSignup: false, showNoNotifsPopup: false, allowCancel: false },
  invoiceInfo: { status: 1, allowSignup: true, showNoNotifsPopup: false, allowCancel: true },
  avsInfo: { status: 3, allowSignup: true, showNoNotifsPopup: false, allowCancel: false },
  showContactInfo: true,
  expandID: '',
}
const RESULTS_RELEASE = {
  options: [{ value: '1', titleUtf8: 'Show me test results as soon as possible' }, { value: '2', titleUtf8: 'Wait to show me test results' }],
  chosenRRPreference: '',
}
const SECURITY = {
  passwordLastUpdated: 'Aug 29, 2023',
  twoFactorEmailSmsOn: true,
  twoFactorTOTPOn: false,
  twoFactorRequired: true,
  rememberWebDevices: false,
  rememberWebDevicesAllowed: false,
  passkeyLoginAvailable: true,
  allowEmailSmsToggle: false,
  allowTotpToggle: true,
  isMyChartCentral: false,
  deactivateAccountAllowed: true,
  systemMethodsList: [1, 2, 3],
}
const CONSENT = {
  consentData: { phone: '(555) 010-0000', shortCodesConsent: { '12345': true, '67890': false } },
  primarySender: { callToAction: 'Texts…', termsAndConditionsURL: 'https://example.com/terms.pdf', privacyPolicyURL: '', shortCode: '12345', displayName: '', hasRcsSender: false },
  secondarySenders: [{ shortCode: '67890', displayName: 'Billing', termsAndConditionsURL: '' }],
}
const CARE_EVERYWHERE = { isPatientOptedIn: true, canChangeCeStatus: true, doesPatientReqConsent: false, hasAuthsOnFile: false, needsAuthorization: false, dxtId: 1 }

const BODIES = [PAPERLESS, RESULTS_RELEASE, SECURITY, CONSENT, CARE_EVERYWHERE]
const PATHS = [
  '/api/paperless-settings/GetCombinedPaperless',
  '/api/test-results/GetResultsReleasePreferences',
  '/api/security-settings/GetInitialSettings',
  '/api/textoptin/GetConsentData',
  '/api/care-everywhere-opt-out/GetCeConfiguration',
]

function mockRequest(answers: Array<{ body: string; status?: number }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  const seen: string[] = []
  let i = 0
  req.transport = mock(async (url: string) => {
    seen.push(new URL(String(url)).pathname)
    const r = answers[i++]!
    return new Response(r.body, { status: r.status ?? 200, headers: { 'content-type': 'application/json' } })
  })
  return { req, seen }
}

const ok = (body: unknown) => ({ body: JSON.stringify(body) })
const fail = { body: '{"Message":"An error has occurred."}', status: 500 }

function envelope(override: Partial<Record<number, Partial<RawRequestRecord>>> = {}): RawResponse {
  return {
    requests: PATHS.map((path, i) => ({
      path,
      method: 'POST' as const,
      status: 200,
      contentType: 'application/json',
      body: BODIES[i],
      ...override[i],
    })),
  }
}

describe('fetchAccountSettingsRaw', () => {
  it('fetches each section’s own activity page for its token, then its endpoint', async () => {
    const { req, seen } = mockRequest(BODIES.flatMap((b) => [{ body: TOKEN_HTML }, ok(b)]))
    await fetchAccountSettingsRaw(req)
    expect(seen).toEqual([
      '/MyChart/app/paperless-settings', `/MyChart${PATHS[0]}`,
      '/MyChart/app/test-results', `/MyChart${PATHS[1]}`,
      '/MyChart/app/security-settings', `/MyChart${PATHS[2]}`,
      '/MyChart/app/text-opt-in', `/MyChart${PATHS[3]}`,
      '/MyChart/app/care-everywhere-opt-out', `/MyChart${PATHS[4]}`,
    ])
  })

  it('keeps the other sections when one fails', async () => {
    const { req } = mockRequest([
      { body: TOKEN_HTML }, ok(PAPERLESS),
      { body: TOKEN_HTML }, fail,
      { body: TOKEN_HTML }, ok(SECURITY),
      { body: TOKEN_HTML }, ok(CONSENT),
      { body: TOKEN_HTML }, ok(CARE_EVERYWHERE),
    ])
    const standard = accountSettingsProcessor.standard(await fetchAccountSettingsRaw(req))
    expect(standard.resultsRelease).toBeNull()
    expect(standard.unavailable).toEqual(['/api/test-results/GetResultsReleasePreferences'])
    expect(standard.paperless?.billingInfo.statusName).toBe('Declined')
  })

  it('throws when every section fails', async () => {
    const { req } = mockRequest(PATHS.flatMap(() => [{ body: TOKEN_HTML }, fail]))
    await expect(fetchAccountSettingsRaw(req)).rejects.toThrow(/HTTP 500/)
  })
})

describe('accountSettingsProcessor', () => {
  const standard = accountSettingsProcessor.standard(envelope())

  it('decodes paperless status with the bundle table, keeping the code', () => {
    expect(standard.paperless).toEqual({
      billingInfo: { status: 2, statusName: 'Declined', allowSignup: true, allowCancel: false },
      eobInfo: { status: -1, statusName: 'NotEligible', allowSignup: false, allowCancel: false },
      invoiceInfo: { status: 1, statusName: 'SignedUp', allowSignup: true, allowCancel: true },
      avsInfo: { status: 3, statusName: 'NoResponse', allowSignup: true, allowCancel: false },
    })
  })

  it('reports no results-release choice as null, and resolves a choice to its title', () => {
    expect(standard.resultsRelease?.chosenRRPreference).toBe('')
    expect(standard.resultsRelease?.chosenRRPreferenceTitle).toBeNull()
    const chose = accountSettingsProcessor.standard(envelope({ 1: { body: { ...RESULTS_RELEASE, chosenRRPreference: '2' } } }))
    expect(chose.resultsRelease?.chosenRRPreferenceTitle).toBe('Wait to show me test results')
  })

  it('keeps text-consent per short code and whichever sender list the release sends', () => {
    expect(standard.textMessaging?.consentData.shortCodesConsent).toEqual({ '12345': true, '67890': false })
    expect(standard.textMessaging?.secondarySenders?.[0]?.shortCode).toBe('67890')
    expect(standard.textMessaging && 'additionalSenders' in standard.textMessaging).toBe(false)

    const { secondarySenders, ...rest } = CONSENT
    const other = accountSettingsProcessor.standard(envelope({ 3: { body: { ...rest, additionalSenders: secondarySenders } } }))
    expect(other.textMessaging?.additionalSenders?.[0]?.shortCode).toBe('67890')
    expect(other.textMessaging && 'secondarySenders' in other.textMessaging).toBe(false)
  })

  it('carries security and Care Everywhere state', () => {
    expect(standard.security?.twoFactorEmailSmsOn).toBe(true)
    expect(standard.security?.passwordLastUpdated).toBe('Aug 29, 2023')
    expect(standard.careEverywhere?.isPatientOptedIn).toBe(true)
    expect(standard.unavailable).toEqual([])
  })

  it('names a section the scraper never reached', () => {
    const missing: RawResponse = { requests: envelope().requests.filter((r) => !r.path.includes('textoptin')) }
    const s = accountSettingsProcessor.standard(missing)
    expect(s.textMessaging).toBeNull()
    expect(s.unavailable).toEqual(['/api/textoptin/GetConsentData'])
  })

  it('concise is one answer per setting', () => {
    expect(accountSettingsProcessor.concise(standard)).toEqual({
      paperless: {
        billingInfo: { statusName: 'Declined' },
        eobInfo: { statusName: 'NotEligible' },
        invoiceInfo: { statusName: 'SignedUp' },
        avsInfo: { statusName: 'NoResponse' },
      },
      resultsRelease: { chosenRRPreferenceTitle: null },
      security: { twoFactorEmailSmsOn: true, twoFactorTOTPOn: false, passwordLastUpdated: 'Aug 29, 2023' },
      textMessaging: { consentData: { shortCodesConsent: { '12345': true, '67890': false } } },
      careEverywhere: { isPatientOptedIn: true },
      unavailable: [],
    })
  })
})
