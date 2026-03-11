import { describe, it, expect } from 'bun:test'
import { SESSION_COOKIE_NAME, SESSION_COOKIE_MAX_AGE } from '../sessions'

describe('session-cookie constants', () => {
  it('SESSION_COOKIE_NAME is session_token', () => {
    expect(SESSION_COOKIE_NAME).toBe('session_token')
  })

  it('SESSION_COOKIE_MAX_AGE is 24 hours in seconds', () => {
    expect(SESSION_COOKIE_MAX_AGE).toBe(60 * 60 * 24)
    expect(SESSION_COOKIE_MAX_AGE).toBe(86400)
  })
})
