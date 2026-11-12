// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { describe, it, expect, mock } from 'bun:test'
import {
  fetchNotificationPreferencesRaw,
  notificationPreferencesProcessor,
} from '../notificationPreferences'
import { MyChartRequest } from '../../../core/myChartRequest'
import type { RawResponse } from '../../../core/rawResponse'
import { renderOutput } from '../../../processors/processor'

function mockRequest(responses: Array<{ body: string; status?: number }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  const seen: string[] = []
  let i = 0
  req.transport = mock(async (url: string) => {
    seen.push(String(url))
    const r = responses[i++]
    return new Response(r!.body, { status: r!.status ?? 200, headers: { 'content-type': 'application/json' } })
  })
  return { req, seen }
}

const TOKEN_HTML = '<input name="__RequestVerificationToken" value="t" />'

/**
 * The captured wire shape, trimmed: four id-keyed maps joined by id lists,
 * with `grouperOrder` deliberately not the maps' key order.
 */
const PREFERENCES = {
  groupers: {
    'WP-G2': { hstId: 'WP-G2', title: 'Billing', description: 'Statements', conceptIds: ['WP-C3'] },
    'WP-G1': {
      hstId: 'WP-G1',
      title: 'Appointments',
      description: 'Upcoming visits',
      conceptIds: ['WP-C1', 'WP-C2'],
      otherPreferencesLinkPath: '/app/care-companion/settings',
      otherPreferencesLinkText: 'Care Companion Settings',
    },
  },
  concepts: {
    'WP-C1': { hstId: 'WP-C1', title: 'Status Updates', description: 'When a visit changes', mediaIds: ['WP-M1', 'WP-M2', 'WP-M3'], additionalItemSectionId: 'WP-S1' },
    'WP-C2': { hstId: 'WP-C2', title: 'Reminders', description: '', mediaIds: ['WP-M4'], additionalItemSectionId: '' },
    'WP-C3': { hstId: 'WP-C3', title: 'Statement', description: '', mediaIds: ['WP-M5', 'WP-M6'], additionalItemSectionId: '' },
  },
  medias: {
    'WP-M1': { mediaId: 'WP-M1', type: '1', toggleStatus: 1 },
    'WP-M2': { mediaId: 'WP-M2', type: '100', toggleStatus: 0 },
    'WP-M3': { mediaId: 'WP-M3', type: '6', toggleStatus: 3 },
    'WP-M4': { mediaId: 'WP-M4', type: '4', toggleStatus: 1 },
    'WP-M5': { mediaId: 'WP-M5', type: '1', toggleStatus: 1 },
    'WP-M6': { mediaId: 'WP-M6', type: '3', toggleStatus: 0 },
  },
  additionalItemSections: {
    'WP-S1': {
      sectionType: 'Checkbox',
      optionDescriptionMap: { 'WP-O2': 'Changed', 'WP-O1': 'Scheduled' },
      optionSelectionMap: { 'WP-O1': true, 'WP-O2': false },
      optionIds: ['WP-O1', 'WP-O2'],
      sectionDescription: 'Receive reminders when your appointment has been: ',
      sectionId: 'WP-S1',
      dropDownAdditionalItemId: '',
    },
  },
  grouperOrder: ['WP-G1', 'WP-G2'],
  paperlessBillingRequiredConcepts: ['WP-C3'],
  canApplyToAll: false,
  smsFlagOn: true,
  userAcceptsSms: false,
  showContactInformation: true,
  grouperIdToExpandOnLoad: '',
}

const CONTACT = {
  email: 'pat@example.com',
  mobilePhone: '(555) 010-0000',
  emailPending: false,
  mobilePending: false,
  showLinkToContactInfo: true,
  mediaTypesMissingContactMethod: [],
  proxyContextName: '',
  mobileIsVerified: true,
}

function raw(contact: { status: number; body: unknown; failure?: string }): RawResponse {
  return {
    requests: [
      { path: '/app/communication-preferences', method: 'GET', status: 200, contentType: 'text/html', body: TOKEN_HTML, purpose: 'token' },
      { path: '/api/communicationPreferences/GetPreferences', method: 'POST', status: 200, contentType: 'application/json', body: PREFERENCES },
      { path: '/api/communicationPreferences/GetContactInformation', method: 'POST', contentType: 'application/json', ...contact },
    ],
  }
}

describe('fetchNotificationPreferencesRaw', () => {
  it('gets the token from the activity page, then posts both endpoints', async () => {
    const { req, seen } = mockRequest([
      { body: TOKEN_HTML },
      { body: JSON.stringify(PREFERENCES) },
      { body: JSON.stringify(CONTACT) },
    ])
    const result = await fetchNotificationPreferencesRaw(req)
    expect(seen.map((u) => new URL(u).pathname)).toEqual([
      '/MyChart/app/communication-preferences',
      '/MyChart/api/communicationPreferences/GetPreferences',
      '/MyChart/api/communicationPreferences/GetContactInformation',
    ])
    expect(result.requests.map((r) => r.status)).toEqual([200, 200, 200])
  })

  it('fails the read when GetPreferences fails — an outage is not an org with no topics', async () => {
    const { req } = mockRequest([
      { body: TOKEN_HTML },
      { body: '{"Message":"An error has occurred."}', status: 500 },
    ])
    await expect(fetchNotificationPreferencesRaw(req)).rejects.toThrow(/HTTP 500/)
  })

  it('tolerates a failed GetContactInformation and records it', async () => {
    const { req } = mockRequest([
      { body: TOKEN_HTML },
      { body: JSON.stringify(PREFERENCES) },
      { body: '{"Message":"An error has occurred."}', status: 500 },
    ])
    const result = await fetchNotificationPreferencesRaw(req)
    expect(notificationPreferencesProcessor.standard(result).contactInformationUnavailable).toBe(true)
  })
})

describe('notificationPreferencesProcessor', () => {
  const standard = notificationPreferencesProcessor.standard(raw({ status: 200, body: CONTACT }))

  it('resolves the id maps into one tree in grouperOrder', () => {
    expect(standard.groupers.map((g) => g.title)).toEqual(['Appointments', 'Billing'])
    expect(standard.groupers[0]!.concepts.map((c) => c.title)).toEqual(['Status Updates', 'Reminders'])
    expect(standard.groupers[0]!.otherPreferencesLinkText).toBe('Care Companion Settings')
    expect(standard.groupers[1]!.otherPreferencesLinkText).toBeNull()
  })

  it('decodes channel and status with the bundle tables, keeping the raw codes', () => {
    expect(standard.groupers[0]!.concepts[0]!.medias).toEqual([
      { type: '1', channel: 'Email', toggleStatus: 1, status: 'On' },
      { type: '100', channel: 'Text', toggleStatus: 0, status: 'Off' },
      { type: '6', channel: 'Push', toggleStatus: 3, status: 'LockedOn' },
    ])
    expect(standard.groupers[0]!.concepts[1]!.medias[0]!.channel).toBe('Phone')
    expect(standard.groupers[1]!.concepts[0]!.medias[1]!.channel).toBe('Mail')
  })

  it('counts LockedOn as on in channelsOn', () => {
    expect(standard.groupers[0]!.concepts[0]!.channelsOn).toEqual(['Email', 'Push'])
  })

  it('names an unknown code instead of dropping the channel', () => {
    const odd = structuredClone(PREFERENCES)
    odd.medias['WP-M4'] = { mediaId: 'WP-M4', type: '7', toggleStatus: 2 }
    odd.medias['WP-M5'] = { mediaId: 'WP-M5', type: '1', toggleStatus: 2 }
    const s = notificationPreferencesProcessor.standard({
      requests: [{ path: '/api/communicationPreferences/GetPreferences', method: 'POST', status: 200, contentType: 'application/json', body: odd }],
    })
    const m = s.groupers[0]!.concepts[1]!
    expect(m.medias[0]).toEqual({ type: '7', channel: null, toggleStatus: 2, status: null })
    expect(m.channelsOn).toEqual(['type 7 (toggleStatus 2)'])
    // Mail is Off and stays out; Email's state is unknown, which is not the same thing.
    expect(s.groupers[1]!.concepts[0]!.channelsOn).toEqual(['Email (toggleStatus 2)'])
    expect(notificationPreferencesProcessor.concise(s)).toMatchObject({
      groupers: [{}, { concepts: [{ title: 'Statement', channelsOn: ['Email (toggleStatus 2)'] }] }],
    })
  })

  it('resolves sub-options in optionIds order', () => {
    expect(standard.groupers[0]!.concepts[0]!.additionalItemSection).toEqual({
      sectionType: 'Checkbox',
      sectionDescription: 'Receive reminders when your appointment has been: ',
      options: [
        { description: 'Scheduled', selected: true },
        { description: 'Changed', selected: false },
      ],
    })
    expect(standard.groupers[0]!.concepts[1]!.additionalItemSection).toBeNull()
  })

  it('flags the topics paperless billing depends on', () => {
    expect(standard.groupers[1]!.concepts[0]!.requiredForPaperlessBilling).toBe(true)
    expect(standard.groupers[0]!.concepts[0]!.requiredForPaperlessBilling).toBe(false)
  })

  it('carries where notifications go, and says so when that read failed', () => {
    expect(standard.contactInformation?.email).toBe('pat@example.com')
    expect(standard.contactInformationUnavailable).toBeUndefined()
    const failed = notificationPreferencesProcessor.standard(raw({ status: 500, body: '', failure: 'HTTP 500' }))
    expect(failed.contactInformation).toBeNull()
    expect(failed.contactInformationUnavailable).toBe(true)
  })

  it('concise keeps topics and the channels they are on, and no contact details', () => {
    const concise = notificationPreferencesProcessor.concise(standard)
    expect(concise).toEqual({
      groupers: [
        { title: 'Appointments', concepts: [{ title: 'Status Updates', channelsOn: ['Email', 'Push'] }, { title: 'Reminders', channelsOn: ['Phone'] }] },
        { title: 'Billing', concepts: [{ title: 'Statement', channelsOn: ['Email'] }] },
      ],
      userAcceptsSms: false,
    })
    expect(String(renderOutput(notificationPreferencesProcessor, raw({ status: 200, body: CONTACT }), 'concise'))).not.toContain('pat@example.com')
  })
})
