/**
 * Every capability in the shared registry, executed against fake-mychart.
 *
 * The parity tests in `shared/__tests__/` prove the four clients all *expose*
 * the same list. This one proves the list actually works: each entry is
 * dispatched by id through `executeCapability`, exactly as the MCP server, the
 * mobile agent and `mychart-cli --action` do, and has to come back with real
 * data rather than an error.
 *
 * That matters most for the capabilities that were missing from a client
 * before the registry existed — visit notes, questionnaires, upcoming orders,
 * EHI export templates, linked accounts, message threads and the
 * emergency-contact writes had no coverage on the mobile path at all.
 *
 * The fake-mychart Next.js server must be running on localhost:4000 (or
 * FAKE_MYCHART_HOST). Locally: `cd fake-mychart && PORT=4000 bun run dev`.
 */

import { describe, it, expect, beforeAll } from 'bun:test'
import { type MyChartRequest } from '../../myChartRequest'
import { myChartUserPassLogin } from '../../login'
import { setMountMode, resetFakeMyChart } from './mountMode'
import {
  CAPABILITIES,
  CAPABILITY_IDS,
  executeCapability,
  getCapability,
  type StudyImagePayload,
} from '../../../../shared/capabilities'

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000'

/** Arguments for the capabilities that need one, filled in from live data. */
type ArgSupplier = (session: MyChartRequest) => Promise<Record<string, unknown>>

describe('capability registry against fake-mychart', () => {
  let session: MyChartRequest

  beforeAll(async () => {
    // Server state is global to the fake; don't inherit whatever ran last.
    await resetFakeMyChart(HOST)
    await setMountMode(HOST, 'prefixed')
    const result = await myChartUserPassLogin({
      hostname: HOST,
      user: 'homer',
      pass: 'donuts123',
      protocol: 'http',
    })
    expect(result.state).toBe('logged_in')
    session = result.mychartRequest
  }, 30_000)

  // ── Reads with no arguments ───────────────────────────────────────────────
  //
  // Enumerated from the registry rather than listed here, so a new zero-arg
  // read is covered the moment it is added.

  const parameterlessReads = CAPABILITIES.filter(
    (c) => c.kind === 'read' && c.params.every((p) => !p.required) && c.id !== 'download_imaging_study',
  )

  for (const capability of parameterlessReads) {
    it(`runs ${capability.id}`, async () => {
      const result = await executeCapability(session, capability.id)
      expect(result).toBeDefined()
      expect(result).not.toBeNull()
    }, 30_000)
  }

  it('covers a meaningful number of parameterless reads', () => {
    // A guard on the loop above: if a refactor emptied `parameterlessReads`,
    // every assertion in it would vacuously "pass".
    expect(parameterlessReads.length).toBeGreaterThan(25)
  })

  // ── Reads that need an identifier from another read ───────────────────────

  const dependentReads: Array<{ id: string; args: ArgSupplier }> = [
    {
      id: 'get_visit_notes',
      args: async (s) => ({ csn: await firstVisitCsn(s) }),
    },
    {
      id: 'get_visit_avs',
      args: async (s) => ({ csn: await firstVisitCsn(s) }),
    },
    {
      id: 'get_note_content',
      args: async (s) => {
        const csn = await firstVisitCsn(s)
        const notes = (await executeCapability(s, 'get_visit_notes', { csn })) as {
          lrpId: string
          notes: Array<{ hnoId: string; hnoDat: string }>
        }
        const note = notes.notes[0]
        expect(note).toBeDefined()
        return { csn, lrp_id: notes.lrpId, hno_id: note!.hnoId, hno_dat: note!.hnoDat }
      },
    },
    {
      id: 'get_message_thread',
      args: async (s) => ({ conversation_id: await firstConversationId(s) }),
    },
    {
      id: 'get_letter_details',
      args: async (s) => {
        const letters = (await executeCapability(s, 'get_letters')) as Array<{
          hnoId: string
          csn: string
        }>
        expect(letters.length).toBeGreaterThan(0)
        return { hno_id: letters[0]!.hnoId, csn: letters[0]!.csn }
      },
    },
  ]

  for (const { id, args } of dependentReads) {
    it(`runs ${id} with an id from the chart`, async () => {
      const result = await executeCapability(session, id, await args(session))
      expect(result).toBeDefined()
    }, 30_000)
  }

  // ── Imaging ───────────────────────────────────────────────────────────────

  it('mints an image_id in get_imaging_results and downloads it back', async () => {
    const results = (await executeCapability(session, 'get_imaging_results')) as Array<{
      image_id?: string
      orderName: string
    }>
    const withImages = results.find((r) => r.image_id)
    expect(withImages).toBeDefined()

    const payload = (await executeCapability(session, 'download_imaging_study', {
      image_id: withImages!.image_id,
    })) as StudyImagePayload

    expect(payload.images.length).toBeGreaterThan(0)
    expect(payload.images[0]!.pixelData?.length ?? 0).toBeGreaterThan(0)
  }, 60_000)

  it('accepts imaging_index as well as image_id, which is how the mobile app calls it', async () => {
    const results = (await executeCapability(session, 'get_imaging_results')) as Array<{
      image_id?: string
      index: number
    }>
    const withImages = results.find((r) => r.image_id)
    expect(withImages).toBeDefined()

    const payload = (await executeCapability(session, 'download_imaging_study', {
      imaging_index: withImages!.index,
    })) as StudyImagePayload
    expect(payload.images.length).toBeGreaterThan(0)
  }, 60_000)

  it('is reachable under its old mobile name, so saved chats keep working', () => {
    expect(getCapability('get_xray_image')?.id).toBe('download_imaging_study')
  })

  it('downloads every real image when the study leads with SeriesSelector junk', async () => {
    // The fake's CT study mirrors real eUnity: its instance list starts with
    // three "SeriesSelector" pseudo-instances that answer CLOERROR. Those must
    // be skipped — never returned as images, and never allowed to turn the
    // whole download into an empty result — while every instance that does
    // carry pixel data comes back.
    const results = (await executeCapability(session, 'get_imaging_results')) as Array<{
      image_id?: string
      orderName: string
    }>
    const ct = results.find((r) => r.image_id && r.orderName.includes('CT'))
    expect(ct).toBeDefined()

    const payload = (await executeCapability(session, 'download_imaging_study', {
      image_id: ct!.image_id,
    })) as StudyImagePayload

    expect(payload.errors).toHaveLength(0)
    // The CT study seeds 9 real instances (5 AXIAL + 3 BONE RECON + 1 SCOUT).
    expect(payload.images.length).toBeGreaterThanOrEqual(9)
    for (const image of payload.images) {
      expect(image.seriesDescription).not.toBe('SeriesSelector')
      expect(image.pixelData?.length ?? 0).toBeGreaterThan(0)
    }
  }, 60_000)

  // ── Writes ────────────────────────────────────────────────────────────────

  it('sends a message by provider name, resolving the recipient itself', async () => {
    const { recipients } = (await executeCapability(session, 'get_message_recipients')) as {
      recipients: Array<{ displayName: string }>
    }
    expect(recipients.length).toBeGreaterThan(0)

    const result = (await executeCapability(session, 'send_message', {
      recipient_name: recipients[0]!.displayName,
      topic: 'Medical Question',
      subject: 'Capability registry test',
      message: 'Sent by the capability parity suite.',
    })) as { success: boolean; error?: string }

    expect(result.error).toBeUndefined()
    expect(result.success).toBe(true)
  }, 30_000)

  it('refuses to guess which provider was meant', async () => {
    const promise = executeCapability(session, 'send_message', {
      recipient_name: 'definitely-not-a-real-provider',
      subject: 'x',
      message: 'y',
    })
    await expect(promise).rejects.toThrow(/No recipient matching/)
  }, 30_000)

  it('adds, updates and removes an emergency contact — the writes mobile never had', async () => {
    const before = (await executeCapability(session, 'get_emergency_contacts')) as unknown[]

    const added = (await executeCapability(session, 'add_emergency_contact', {
      name: 'Capability Test Contact',
      relationship_type: 'Friend',
      phone_number: '555-0100',
    })) as { success: boolean }
    expect(added.success).toBe(true)

    const after = (await executeCapability(session, 'get_emergency_contacts')) as Array<{
      id?: string
      name: string
      phoneNumber: string
    }>
    expect(after.length).toBe(before.length + 1)
    const created = after.find((c) => c.name === 'Capability Test Contact')
    expect(created).toBeDefined()
    expect(created!.id).toBeTruthy()

    const updated = (await executeCapability(session, 'update_emergency_contact', {
      id: created!.id,
      phone_number: '555-0199',
    })) as { success: boolean }
    expect(updated.success).toBe(true)

    const afterUpdate = (await executeCapability(session, 'get_emergency_contacts')) as Array<{
      id?: string
      phoneNumber: string
    }>
    expect(afterUpdate.find((c) => c.id === created!.id)?.phoneNumber).toBe('555-0199')

    const removed = (await executeCapability(session, 'remove_emergency_contact', {
      id: created!.id,
    })) as { success: boolean }
    expect(removed.success).toBe(true)

    const afterRemove = (await executeCapability(session, 'get_emergency_contacts')) as unknown[]
    expect(afterRemove.length).toBe(before.length)
  }, 60_000)

  it('requests a refill by medication name, resolving the key itself', async () => {
    const meds = (await executeCapability(session, 'get_medications')) as {
      medications: Array<{ name: string; isRefillable: boolean; medicationKey?: string }>
    }
    const refillable = meds.medications.find((m) => m.isRefillable && m.medicationKey)
    expect(refillable).toBeDefined()

    const result = (await executeCapability(session, 'request_refill', {
      medication_name: refillable!.name,
    })) as { success: boolean; medication: string }
    expect(result.success).toBe(true)
    expect(result.medication).toBe(refillable!.name)
  }, 30_000)

  it('refuses to guess which medication was meant', async () => {
    await expect(
      executeCapability(session, 'request_refill', { medication_name: 'not-a-medication' }),
    ).rejects.toThrow(/No medication matching/)
  }, 30_000)

  // ── Patient records (proxy access) ────────────────────────────────────────

  it('lists the patients this account can reach and reports the active one', async () => {
    const listed = (await executeCapability(session, 'list_proxy_targets')) as {
      count: number
      patients: Array<{ name: string; is_self: boolean }>
      active_patient: string | null
      profile_name: string | null
    }
    // homer has proxy access to his three children.
    expect(listed.count).toBeGreaterThan(1)
    expect(listed.patients.some((p) => p.is_self)).toBe(true)
    expect(listed.profile_name).toBeTruthy()
  }, 30_000)

  it('switches the active patient and switches back', async () => {
    const listed = (await executeCapability(session, 'list_proxy_targets')) as {
      patients: Array<{ name: string; is_self: boolean }>
    }
    const child = listed.patients.find((p) => !p.is_self)
    expect(child).toBeDefined()

    const switched = (await executeCapability(session, 'switch_proxy_target', {
      patient: child!.name,
    })) as { switched_to: string; is_self: boolean }
    expect(switched.switched_to).toBe(child!.name)
    expect(switched.is_self).toBe(false)

    // Every read is now about the child, and the guard in executeCapability
    // proves it: asking for the account holder's own chart must be refused
    // rather than quietly answered from the wrong record.
    await expect(executeCapability(session, 'get_profile', { patient: 'me' })).rejects.toThrow(
      /Refusing to read/,
    )

    // The switch is server-side session state. Put it back before anything
    // else runs.
    const back = (await executeCapability(session, 'switch_proxy_target', { patient: 'me' })) as {
      is_self: boolean
    }
    expect(back.is_self).toBe(true)
    expect(await executeCapability(session, 'get_profile', { patient: 'me' })).toBeDefined()
  }, 60_000)

  // ── Account security ──────────────────────────────────────────────────────

  it('registers a passkey and hands it to the caller’s store', async () => {
    let saved: string | undefined
    const result = (await executeCapability(
      session,
      'register_passkey',
      {},
      { savePasskey: (serialized) => { saved = serialized } },
    )) as { registered: boolean; saved: boolean }

    expect(result.registered).toBe(true)
    expect(result.saved).toBe(true)
    expect(saved).toBeTruthy()
    expect(() => JSON.parse(saved!)).not.toThrow()
  }, 30_000)

  it('lists the passkeys it just registered', async () => {
    const result = (await executeCapability(session, 'list_passkeys')) as { count: number }
    expect(result.count).toBeGreaterThan(0)
  }, 30_000)

  it('turns TOTP on, saving the secret through the caller’s store, then off again', async () => {
    let secret: string | undefined
    const enabled = (await executeCapability(
      session,
      'setup_totp',
      {},
      { password: 'donuts123', saveTotpSecret: (s) => { secret = s } },
    )) as { enabled: boolean }
    expect(enabled.enabled).toBe(true)
    expect(secret).toBeTruthy()

    const disabled = (await executeCapability(
      session,
      'disable_totp',
      {},
      { password: 'donuts123', totpSecret: secret },
    )) as { enabled: boolean }
    expect(disabled.enabled).toBe(false)
  }, 30_000)

  it('says what is missing rather than failing obscurely when there is no password', async () => {
    await expect(executeCapability(session, 'setup_totp', {}, {})).rejects.toThrow(
      /password is required/,
    )
  })

  // ── Nothing left untested ─────────────────────────────────────────────────

  it('exercised every capability in the registry', () => {
    const exercised = new Set<string>([
      ...parameterlessReads.map((c) => c.id),
      ...dependentReads.map((d) => d.id),
      'download_imaging_study',
      'send_message',
      'send_reply',
      'delete_message',
      'add_emergency_contact',
      'update_emergency_contact',
      'remove_emergency_contact',
      'request_refill',
      'list_proxy_targets',
      'switch_proxy_target',
      'register_passkey',
      'list_passkeys',
      'delete_passkey',
      'setup_totp',
      'disable_totp',
    ])
    const untested = CAPABILITY_IDS.filter((id) => !exercised.has(id))
    expect(untested).toEqual([])
  })

  // send_reply / delete_message / delete_passkey need a thread and a passkey
  // that the tests above created, so they run last.

  it('replies to a conversation and then deletes it', async () => {
    const id = await firstConversationId(session)

    const replied = (await executeCapability(session, 'send_reply', {
      conversation_id: id,
      message: 'Reply from the capability parity suite.',
    })) as { success: boolean }
    expect(replied.success).toBe(true)

    const deleted = (await executeCapability(session, 'delete_message', {
      conversation_id: id,
    })) as { success: boolean }
    expect(deleted.success).toBe(true)
  }, 60_000)

  it('deletes the passkeys it registered', async () => {
    const result = (await executeCapability(session, 'delete_passkey')) as {
      deleted: string[]
      failed: string[]
    }
    expect(result.deleted.length).toBeGreaterThan(0)
    expect(result.failed).toEqual([])
  }, 30_000)
})

/**
 * The CSN of a past visit — the id every note-related capability needs.
 *
 * MyChart returns past visits keyed by organization, each with its own `List`,
 * so this walks both levels rather than assuming a flat array.
 */
async function firstVisitCsn(session: MyChartRequest): Promise<string> {
  const past = (await executeCapability(session, 'get_past_visits', { years_back: 20 })) as {
    List?: Record<string, { List?: Array<{ Csn?: string }> }>
  }
  const csn = Object.values(past.List ?? {})
    .flatMap((org) => org.List ?? [])
    .find((visit) => visit.Csn)?.Csn
  expect(csn).toBeTruthy()
  return csn!
}

/** The id of the first conversation in the inbox. */
async function firstConversationId(session: MyChartRequest): Promise<string> {
  const inbox = (await executeCapability(session, 'get_messages')) as {
    conversations?: Array<{ hthId: string }>
  }
  const id = inbox.conversations?.[0]?.hthId
  expect(id).toBeTruthy()
  return id!
}
