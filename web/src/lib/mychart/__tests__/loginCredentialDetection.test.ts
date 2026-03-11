import { describe, it, expect } from 'bun:test'
import { load } from 'cheerio'

describe('LoginIdentifier vs Username detection', () => {
  it('defaults to LoginIdentifier when no loginpagecontroller script is found', () => {
    // When the login page has no script tag with "loginpagecontroller",
    // the code defaults to 'LoginIdentifier'
    const html = `
      <html>
        <head>
          <script src="/MyChart/scripts/other.min.js"></script>
        </head>
        <body>
          <input name="__RequestVerificationToken" value="tok" />
        </body>
      </html>
    `
    const $ = load(html)
    const loginControllerSrc = $('script[src*="loginpagecontroller"]').attr('src')
    expect(loginControllerSrc).toBeUndefined()
    // Default would be 'LoginIdentifier'
  })

  it('finds loginpagecontroller script tag with relative URL', () => {
    const html = `
      <html>
        <head>
          <script src="/MyChart/scripts/loginpagecontroller.min.js?v=123"></script>
        </head>
        <body></body>
      </html>
    `
    const $ = load(html)
    const loginControllerSrc = $('script[src*="loginpagecontroller"]').attr('src')
    expect(loginControllerSrc).toBe('/MyChart/scripts/loginpagecontroller.min.js?v=123')
  })

  it('finds loginpagecontroller script tag with absolute URL', () => {
    const html = `
      <html>
        <head>
          <script src="https://mychart.example.com/MyChart/scripts/loginpagecontroller.min.js"></script>
        </head>
        <body></body>
      </html>
    `
    const $ = load(html)
    const loginControllerSrc = $('script[src*="loginpagecontroller"]').attr('src')
    expect(loginControllerSrc).toBe('https://mychart.example.com/MyChart/scripts/loginpagecontroller.min.js')
  })

  it('detects Username field from JS containing Credentials with Username', () => {
    // Simulate the JS content from older MyChart instances
    const jsText = `
      function doLogin() {
        var data = {
          Type: "StandardLogin",
          Credentials: { Username: WP.Utils.b64EncodeUnicode(user), Password: WP.Utils.b64EncodeUnicode(pass) }
        };
      }
    `
    const credMatch = jsText.match(/Credentials:\s*\{([^}]{0,300})\}/)
    expect(credMatch).not.toBeNull()
    expect(credMatch![1]).toContain('Username')
    expect(credMatch![1]).not.toContain('LoginIdentifier')

    // The code uses this logic:
    let usernameField = 'LoginIdentifier'
    if (credMatch && credMatch[1].includes('Username') && !credMatch[1].includes('LoginIdentifier')) {
      usernameField = 'Username'
    }
    expect(usernameField).toBe('Username')
  })

  it('keeps LoginIdentifier when JS contains LoginIdentifier', () => {
    const jsText = `
      function doLogin() {
        var data = {
          Type: "StandardLogin",
          Credentials: { LoginIdentifier: WP.Utils.b64EncodeUnicode(user), Password: WP.Utils.b64EncodeUnicode(pass) }
        };
      }
    `
    const credMatch = jsText.match(/Credentials:\s*\{([^}]{0,300})\}/)
    expect(credMatch).not.toBeNull()
    expect(credMatch![1]).toContain('LoginIdentifier')

    let usernameField = 'LoginIdentifier'
    if (credMatch && credMatch[1].includes('Username') && !credMatch[1].includes('LoginIdentifier')) {
      usernameField = 'Username'
    }
    expect(usernameField).toBe('LoginIdentifier')
  })

  it('keeps LoginIdentifier when JS contains both Username and LoginIdentifier', () => {
    // Edge case: JS references both
    const jsText = `
      Credentials: { LoginIdentifier: encode(user), Username: "deprecated", Password: encode(pass) }
    `
    const credMatch = jsText.match(/Credentials:\s*\{([^}]{0,300})\}/)
    expect(credMatch).not.toBeNull()

    let usernameField = 'LoginIdentifier'
    if (credMatch && credMatch[1].includes('Username') && !credMatch[1].includes('LoginIdentifier')) {
      usernameField = 'Username'
    }
    // Should NOT switch to Username since LoginIdentifier is also present
    expect(usernameField).toBe('LoginIdentifier')
  })

  it('keeps LoginIdentifier when Credentials regex does not match', () => {
    const jsText = 'function doLogin() { /* minified code without credentials block */ }'
    const credMatch = jsText.match(/Credentials:\s*\{([^}]{0,300})\}/)
    expect(credMatch).toBeNull()

    let usernameField = 'LoginIdentifier'
    if (credMatch && credMatch[1].includes('Username') && !credMatch[1].includes('LoginIdentifier')) {
      usernameField = 'Username'
    }
    expect(usernameField).toBe('LoginIdentifier')
  })

  it('constructs correct JS URL from relative src', () => {
    const hostname = 'mychart.example.org'
    const loginControllerSrc = '/MyChart/scripts/loginpagecontroller.min.js?v=abc'

    const jsUrl = loginControllerSrc.startsWith('http')
      ? loginControllerSrc
      : 'https://' + hostname + loginControllerSrc

    expect(jsUrl).toBe('https://mychart.example.org/MyChart/scripts/loginpagecontroller.min.js?v=abc')
  })

  it('uses absolute URL as-is', () => {
    const hostname = 'mychart.example.org'
    const loginControllerSrc = 'https://cdn.example.com/loginpagecontroller.min.js'

    const jsUrl = loginControllerSrc.startsWith('http')
      ? loginControllerSrc
      : 'https://' + hostname + loginControllerSrc

    expect(jsUrl).toBe('https://cdn.example.com/loginpagecontroller.min.js')
  })
})

describe('b64EncodeUnicode', () => {
  // This is the encoding function used in the login flow
  const b64EncodeUnicode = (str: string) =>
    btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_: string, p1: string) => String.fromCharCode(parseInt(p1, 16))))

  it('encodes ASCII strings same as btoa', () => {
    expect(b64EncodeUnicode('testuser')).toBe(btoa('testuser'))
    expect(b64EncodeUnicode('password123')).toBe(btoa('password123'))
  })

  it('handles special characters in passwords', () => {
    const encoded = b64EncodeUnicode('p@$$w0rd!#%^&*()')
    const decoded = atob(encoded)
    expect(decoded).toBe('p@$$w0rd!#%^&*()')
  })

  it('handles unicode characters that btoa cannot', () => {
    // btoa would throw on this, but b64EncodeUnicode handles it
    const encoded = b64EncodeUnicode('user@例え.jp')
    expect(encoded).toBeTruthy()
    expect(typeof encoded).toBe('string')
  })

  it('handles empty string', () => {
    expect(b64EncodeUnicode('')).toBe(btoa(''))
  })
})
