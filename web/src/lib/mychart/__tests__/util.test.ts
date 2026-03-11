import { describe, it, expect } from 'bun:test'
import { getRequestVerificationTokenFromBody } from '../util'

describe('getRequestVerificationTokenFromBody', () => {
  it('extracts token from a standard hidden input', () => {
    const html = `
      <html>
        <body>
          <form>
            <input name="__RequestVerificationToken" type="hidden" value="CfDJ8ABC123XYZ" />
            <input type="submit" />
          </form>
        </body>
      </html>
    `
    expect(getRequestVerificationTokenFromBody(html)).toBe('CfDJ8ABC123XYZ')
  })

  it('extracts token when there are multiple form inputs', () => {
    const html = `
      <form>
        <input name="username" value="john" />
        <input name="__RequestVerificationToken" type="hidden" value="token_abc_def_456" />
        <input name="password" type="password" />
      </form>
    `
    expect(getRequestVerificationTokenFromBody(html)).toBe('token_abc_def_456')
  })

  it('returns first token when multiple tokens exist', () => {
    const html = `
      <form>
        <input name="__RequestVerificationToken" value="first_token" />
      </form>
      <form>
        <input name="__RequestVerificationToken" value="second_token" />
      </form>
    `
    expect(getRequestVerificationTokenFromBody(html)).toBe('first_token')
  })

  it('returns undefined when no token input exists', () => {
    const html = `
      <html>
        <body>
          <form>
            <input name="username" value="john" />
          </form>
        </body>
      </html>
    `
    expect(getRequestVerificationTokenFromBody(html)).toBeUndefined()
  })

  it('returns undefined for empty HTML', () => {
    expect(getRequestVerificationTokenFromBody('')).toBeUndefined()
  })

  it('returns undefined when input has no value attribute', () => {
    const html = `<input name="__RequestVerificationToken" />`
    expect(getRequestVerificationTokenFromBody(html)).toBeUndefined()
  })

  it('returns undefined when input value is empty string', () => {
    const html = `<input name="__RequestVerificationToken" value="" />`
    expect(getRequestVerificationTokenFromBody(html)).toBeUndefined()
  })

  it('handles token with special characters', () => {
    const html = `<input name="__RequestVerificationToken" value="CfDJ8N+/=abc123" />`
    expect(getRequestVerificationTokenFromBody(html)).toBe('CfDJ8N+/=abc123')
  })

  it('handles self-closing and non-self-closing input tags', () => {
    const html1 = `<input name="__RequestVerificationToken" value="token1" />`
    const html2 = `<input name="__RequestVerificationToken" value="token2">`
    expect(getRequestVerificationTokenFromBody(html1)).toBe('token1')
    expect(getRequestVerificationTokenFromBody(html2)).toBe('token2')
  })

  it('handles deeply nested token inputs', () => {
    const html = `
      <html>
        <body>
          <div class="container">
            <div class="wrapper">
              <form id="login">
                <div class="form-group">
                  <input name="__RequestVerificationToken" type="hidden" value="deeply_nested_token" />
                </div>
              </form>
            </div>
          </div>
        </body>
      </html>
    `
    expect(getRequestVerificationTokenFromBody(html)).toBe('deeply_nested_token')
  })

  it('handles realistic MyChart CSRF token page', () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>MyChart - Login</title></head>
      <body>
        <div id="loginForm">
          <form action="/MyChart/Authentication/Login/DoLogin" method="post">
            <input name="__RequestVerificationToken" type="hidden" value="CfDJ8Nzj4kHs2JKxMqR7vL9pW3bY6tA5fE1dG0cB8iH" />
            <input id="DeviceId" name="DeviceId" type="hidden" value="" />
            <label for="Username">Username</label>
            <input id="Username" name="Username" type="text" />
            <label for="Password">Password</label>
            <input id="Password" name="Password" type="password" />
            <button type="submit">Sign In</button>
          </form>
        </div>
      </body>
      </html>
    `
    expect(getRequestVerificationTokenFromBody(html)).toBe('CfDJ8Nzj4kHs2JKxMqR7vL9pW3bY6tA5fE1dG0cB8iH')
  })
})
