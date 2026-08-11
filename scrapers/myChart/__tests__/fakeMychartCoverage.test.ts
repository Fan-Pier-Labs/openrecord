/**
 * Guards the wiring that decides whether the fake-mychart suites run at all.
 *
 * Those suites need a server, so they sit outside the unit-test globs and are
 * named one file at a time in package.json scripts. That means adding a test
 * file there is not enough to get it run — and a suite nobody runs looks
 * exactly like a suite that passes. `marge-and-reset.test.ts` sat unwired for
 * a while for precisely this reason.
 *
 * Two scripts share the directory because they need differently-configured
 * servers: `test:fake-mychart-terms` runs against an instance started with
 * FAKE_MYCHART_REQUIRE_TERMS=true on another port, everything else against the
 * plain one. So this checks coverage rather than assuming a single glob.
 */

import { describe, it, expect } from 'bun:test'
import fs from 'fs'
import path from 'path'

const REPO_ROOT = path.resolve(import.meta.dir, '../../..')
const SUITE_DIR = path.join(REPO_ROOT, 'scrapers/myChart/__tests__/fake-mychart')
const RUNNER_SCRIPTS = ['test:fake-mychart', 'test:fake-mychart-terms']

describe('fake-mychart suite wiring', () => {
  it('runs every test file in the directory from one of the npm scripts', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8'))
    const commands = RUNNER_SCRIPTS.map(name => {
      const script = pkg.scripts?.[name]
      expect(script, `package.json is missing the ${name} script`).toBeTruthy()
      return script as string
    }).join(' ')

    const testFiles = fs.readdirSync(SUITE_DIR).filter(f => f.endsWith('.test.ts'))
    expect(testFiles.length).toBeGreaterThan(0)

    const unwired = testFiles.filter(f => !commands.includes(f))
    expect(
      unwired,
      `these fake-mychart test files are never run by CI — add them to one of ${RUNNER_SCRIPTS.join(' / ')}`,
    ).toEqual([])
  })
})
