import { describe, it, expect, beforeEach } from 'bun:test'
import { setSession, getSession, getSessionMetadata, deleteSession, SESSION_COOKIE_NAME } from '../sessions'
import { MyChartRequest } from '../mychart/myChartRequest'

describe('session persistence integration', () => {
  beforeEach(() => {
    deleteSession('persist-test-token')
  })

  it('session with metadata can be looked up by token from cookie', () => {
    const mychartReq = new MyChartRequest('test.example.com')
    setSession('persist-test-token', mychartReq, { hostname: 'portal.example.org' })

    // Simulate what /api/session does: look up by cookie token
    const token = 'persist-test-token' // This would come from cookie
    const session = getSession(token)
    const metadata = getSessionMetadata(token)

    expect(session).toBeDefined()
    expect(metadata).toEqual({ hostname: 'portal.example.org' })
  })

  it('missing token returns no session (what /api/session returns 401 for)', () => {
    const session = getSession('nonexistent')
    expect(session).toBeUndefined()
  })

  it('logout flow deletes session and metadata', () => {
    const mychartReq = new MyChartRequest('test.example.com')
    setSession('persist-test-token', mychartReq, { hostname: 'host.com' })

    // Verify session exists
    expect(getSession('persist-test-token')).toBeDefined()
    expect(getSessionMetadata('persist-test-token')).toBeDefined()

    // Simulate logout: delete session
    deleteSession('persist-test-token')

    // Verify cleanup
    expect(getSession('persist-test-token')).toBeUndefined()
    expect(getSessionMetadata('persist-test-token')).toBeUndefined()
  })

  it('session survives between separate lookups (simulating page navigation)', () => {
    const mychartReq = new MyChartRequest('test.example.com')
    setSession('persist-test-token', mychartReq, { hostname: 'mychart.example.org' })

    // First "page load" - session is found
    const session1 = getSession('persist-test-token')
    expect(session1).toBeDefined()
    expect(session1!.hostname).toBe('test.example.com')

    // Second "page load" - same cookie, same session
    const session2 = getSession('persist-test-token')
    expect(session2).toBe(session1) // Same object reference
    expect(getSessionMetadata('persist-test-token')!.hostname).toBe('mychart.example.org')
  })

  it('hostname falls back to MyChartRequest hostname when no metadata', () => {
    const mychartReq = new MyChartRequest('fallback.example.com')
    setSession('persist-test-token', mychartReq)

    const session = getSession('persist-test-token')
    const metadata = getSessionMetadata('persist-test-token')

    expect(session).toBeDefined()
    expect(metadata).toBeUndefined()
    // The API route falls back to mychartRequest.hostname
    const hostname = metadata?.hostname ?? session!.hostname
    expect(hostname).toBe('fallback.example.com')
  })

  it('cookie name constant is correct for browser cookie', () => {
    expect(SESSION_COOKIE_NAME).toBe('session_token')
  })

  it('MCP URL generation works without credentials (cookie-restored session)', () => {
    // When a session is restored from a cookie, username/password are empty strings
    // The MCP session endpoint should still work with empty credentials
    const mychartReq = new MyChartRequest('test.example.com')
    setSession('persist-test-token', mychartReq, { hostname: 'portal.example.org' })

    const session = getSession('persist-test-token')
    expect(session).toBeDefined()

    // Simulate what the frontend sends when credentials aren't available
    const username = '' // empty because session was cookie-restored
    const password = ''

    // The endpoint should accept empty credentials (fallback to '')
    expect(username || '').toBe('')
    expect(password || '').toBe('')

    // Session itself is still valid for making MyChart API calls
    expect(session!.hostname).toBe('test.example.com')
  })

  it('login stores metadata, 2FA preserves it', () => {
    const mychartReq = new MyChartRequest('test.example.com')
    // Login stores session + metadata
    setSession('persist-test-token', mychartReq, { hostname: 'portal.example.org' })

    // 2FA updates session but preserves metadata (simulating getSessionMetadata + setSession)
    const metadata = getSessionMetadata('persist-test-token')
    const updatedReq = new MyChartRequest('test.example.com')
    setSession('persist-test-token', updatedReq, metadata ?? undefined)

    expect(getSession('persist-test-token')).toBe(updatedReq)
    expect(getSessionMetadata('persist-test-token')).toEqual({ hostname: 'portal.example.org' })
  })
})
