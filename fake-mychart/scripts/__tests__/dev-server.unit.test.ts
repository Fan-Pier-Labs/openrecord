/**
 * Port selection for `bun run dev` in fake-mychart.
 *
 * The point of the random port is that two agents can each run their own
 * fake-mychart, so the two things worth pinning down are that the number stays
 * inside the advertised range and that a port already in use is skipped rather
 * than handed out.
 */
import { describe, expect, test } from 'bun:test'
import { createServer } from 'node:net'
import {
  PORT_RANGE_END,
  PORT_RANGE_START,
  isPortFree,
  pickDevPort,
  resolveDevPort,
  startupBanner,
} from '../dev-server'

describe('pickDevPort', () => {
  test('picks a port inside the advertised range', async () => {
    const seen: number[] = []
    for (const roll of [0, 0.5, 0.999999]) {
      const port = await pickDevPort({ random: () => roll, isFree: async () => true })
      seen.push(port)
      expect(port).toBeGreaterThanOrEqual(PORT_RANGE_START)
      expect(port).toBeLessThanOrEqual(PORT_RANGE_END)
    }
    // The whole range is reachable — a rounding slip that clipped the top end
    // would still pass the bounds assertions above.
    expect(seen[0]).toBe(PORT_RANGE_START)
    expect(seen[2]).toBe(PORT_RANGE_END)
  })

  test('skips ports that are already taken', async () => {
    const busy = new Set([4000, 4001])
    const rolls = [0, 1 / 1001, 2 / 1001]
    let i = 0
    const port = await pickDevPort({
      random: () => rolls[i++]!,
      isFree: async (p) => !busy.has(p),
    })
    expect(port).toBe(4002)
  })

  test('does not re-probe a port it already drew', async () => {
    const probed: number[] = []
    const port = await pickDevPort({
      // Same roll twice, then a fresh one: the repeat must not cost an attempt's
      // worth of probing.
      random: (() => {
        const rolls = [0, 0, 5 / 1001]
        let i = 0
        return () => rolls[Math.min(i++, rolls.length - 1)]!
      })(),
      isFree: async (p) => {
        probed.push(p)
        return p !== PORT_RANGE_START
      },
    })
    expect(probed).toEqual([PORT_RANGE_START, PORT_RANGE_START + 5])
    expect(port).toBe(PORT_RANGE_START + 5)
  })

  test('throws with an actionable message when the range is full', async () => {
    await expect(
      pickDevPort({ attempts: 5, isFree: async () => false }),
    ).rejects.toThrow(/No free port found in 4000-5000.*PORT=/s)
  })
})

describe('resolveDevPort', () => {
  test('pins the port when PORT is set', async () => {
    expect(await resolveDevPort({ PORT: '4321' })).toBe(4321)
  })

  test('FAKE_MYCHART_PORT wins over PORT', async () => {
    expect(await resolveDevPort({ PORT: '4321', FAKE_MYCHART_PORT: '4999' })).toBe(4999)
  })

  test('an empty PORT falls through to a random port', async () => {
    const port = await resolveDevPort({ PORT: '' }, { random: () => 0, isFree: async () => true })
    expect(port).toBe(PORT_RANGE_START)
  })

  test('rejects a nonsense port rather than handing it to Next', async () => {
    await expect(resolveDevPort({ PORT: 'donuts' })).rejects.toThrow(/Invalid port/)
    await expect(resolveDevPort({ PORT: '70000' })).rejects.toThrow(/Invalid port/)
  })

  test('picks a random free port when nothing is pinned', async () => {
    const port = await resolveDevPort({}, { random: () => 0.5, isFree: async () => true })
    expect(port).toBeGreaterThanOrEqual(PORT_RANGE_START)
    expect(port).toBeLessThanOrEqual(PORT_RANGE_END)
  })
})

describe('isPortFree', () => {
  test('reports a listening port as taken and a closed one as free', async () => {
    const server = createServer()
    const port: number = await new Promise((resolve) => {
      server.listen(0, '0.0.0.0', () => {
        const address = server.address()
        resolve(typeof address === 'object' && address ? address.port : 0)
      })
    })

    expect(await isPortFree(port)).toBe(false)
    await new Promise<void>((resolve) => server.close(() => resolve()))
    expect(await isPortFree(port)).toBe(true)
  })
})

describe('startupBanner', () => {
  test('names the port everywhere it will be needed', () => {
    const banner = startupBanner(4242)
    expect(banner).toContain('http://localhost:4242')
    expect(banner).toContain('localhost:4242')
    expect(banner).toContain('/reset')
  })
})
