import { describe, it, expect } from 'bun:test'
import { randomToken, setSession, getSession, getSessionMetadata, deleteSession, SESSION_COOKIE_NAME, SESSION_COOKIE_MAX_AGE } from '../sessions'
import { MyChartRequest } from '../mychart/myChartRequest'

describe('sessions', () => {
  describe('randomToken', () => {
    it('returns a non-empty string', () => {
      const token = randomToken()
      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(0)
    })

    it('generates unique tokens', () => {
      const tokens = new Set(Array.from({ length: 100 }, () => randomToken()))
      expect(tokens.size).toBe(100)
    })

    it('contains alphanumeric characters', () => {
      const token = randomToken()
      expect(token).toMatch(/^[a-z0-9]+$/)
    })
  })

  describe('session CRUD', () => {
    it('stores and retrieves a session', () => {
      const req = new MyChartRequest('test.example.com')
      setSession('test-token-1', req)
      expect(getSession('test-token-1')).toBe(req)
    })

    it('returns undefined for unknown token', () => {
      expect(getSession('nonexistent-token')).toBeUndefined()
    })

    it('deletes a session', () => {
      const req = new MyChartRequest('test.example.com')
      setSession('test-token-2', req)
      expect(getSession('test-token-2')).toBe(req)
      deleteSession('test-token-2')
      expect(getSession('test-token-2')).toBeUndefined()
    })

    it('delete is idempotent for nonexistent token', () => {
      // Should not throw
      deleteSession('never-existed')
    })

    it('overwrites session with same token', () => {
      const req1 = new MyChartRequest('host1.com')
      const req2 = new MyChartRequest('host2.com')
      setSession('overwrite-token', req1)
      setSession('overwrite-token', req2)
      expect(getSession('overwrite-token')!.hostname).toBe('host2.com')
    })
  })

  describe('session metadata', () => {
    it('stores and retrieves metadata when provided', () => {
      const req = new MyChartRequest('test.example.com')
      setSession('meta-token-1', req, { hostname: 'portal.example.org' })
      const metadata = getSessionMetadata('meta-token-1')
      expect(metadata).toEqual({ hostname: 'portal.example.org' })
    })

    it('returns undefined metadata when not provided', () => {
      const req = new MyChartRequest('test.example.com')
      setSession('meta-token-2', req)
      expect(getSessionMetadata('meta-token-2')).toBeUndefined()
    })

    it('deletes metadata when session is deleted', () => {
      const req = new MyChartRequest('test.example.com')
      setSession('meta-token-3', req, { hostname: 'host.com' })
      expect(getSessionMetadata('meta-token-3')).toBeDefined()
      deleteSession('meta-token-3')
      expect(getSessionMetadata('meta-token-3')).toBeUndefined()
    })

    it('updates metadata when session is overwritten with metadata', () => {
      const req1 = new MyChartRequest('host1.com')
      const req2 = new MyChartRequest('host2.com')
      setSession('meta-token-4', req1, { hostname: 'old-host.com' })
      setSession('meta-token-4', req2, { hostname: 'new-host.com' })
      expect(getSessionMetadata('meta-token-4')).toEqual({ hostname: 'new-host.com' })
    })

    it('preserves metadata when session is overwritten without metadata', () => {
      const req1 = new MyChartRequest('host1.com')
      const req2 = new MyChartRequest('host2.com')
      setSession('meta-token-5', req1, { hostname: 'original-host.com' })
      setSession('meta-token-5', req2)
      // Metadata is not overwritten when not provided
      expect(getSessionMetadata('meta-token-5')).toEqual({ hostname: 'original-host.com' })
    })
  })

  describe('constants', () => {
    it('exports SESSION_COOKIE_NAME', () => {
      expect(SESSION_COOKIE_NAME).toBe('session_token')
    })

    it('exports SESSION_COOKIE_MAX_AGE as 24 hours', () => {
      expect(SESSION_COOKIE_MAX_AGE).toBe(86400)
    })
  })
})
