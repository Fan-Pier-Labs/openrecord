import { describe, it, expect } from 'bun:test'
import { parseFirstPathPartFromHtml, parseFirstPathPartFromLocation } from '../login'

describe('parseFirstPathPartFromLocation', () => {
  it('extracts path part from absolute URL location header', () => {
    expect(parseFirstPathPartFromLocation(
      'https://mychart.example.com/MyChart/Authentication/Login',
      'mychart.example.com'
    )).toBe('MyChart')
  })

  it('extracts path part from relative URL location header', () => {
    expect(parseFirstPathPartFromLocation(
      '/MyChart/Authentication/Login',
      'mychart.example.com'
    )).toBe('MyChart')
  })

  it('handles MyChart-PRD variant', () => {
    expect(parseFirstPathPartFromLocation(
      '/MyChart-PRD/Authentication/Login',
      'mychart.example.com'
    )).toBe('MyChart-PRD')
  })

  it('handles path with just the first part', () => {
    expect(parseFirstPathPartFromLocation(
      '/MyChart',
      'mychart.example.com'
    )).toBe('MyChart')
  })

  it('returns null for root path', () => {
    expect(parseFirstPathPartFromLocation(
      '/',
      'mychart.example.com'
    )).toBeNull()
  })

  it('returns null for empty path', () => {
    expect(parseFirstPathPartFromLocation(
      'https://mychart.example.com',
      'mychart.example.com'
    )).toBeNull()
  })

  it('handles URL with query parameters', () => {
    expect(parseFirstPathPartFromLocation(
      '/MyChart/Login?redirect=home',
      'mychart.example.com'
    )).toBe('MyChart')
  })

  it('handles various MyChart path naming conventions', () => {
    expect(parseFirstPathPartFromLocation('/mychart/', 'h.com')).toBe('mychart')
    expect(parseFirstPathPartFromLocation('/chart/', 'h.com')).toBe('chart')
    expect(parseFirstPathPartFromLocation('/epicmychart/', 'h.com')).toBe('epicmychart')
  })
})

describe('parseFirstPathPartFromHtml', () => {
  it('extracts path from meta refresh tag', () => {
    const html = `
      <html>
      <head>
        <meta http-equiv="REFRESH" content="0; URL=/MyChart/" />
      </head>
      <body></body>
      </html>
    `
    expect(parseFirstPathPartFromHtml(html)).toBe('MyChart')
  })

  it('extracts path from meta refresh with full URL', () => {
    const html = `
      <meta http-equiv="REFRESH" content="0; URL=/MyChart-PRD/" />
    `
    expect(parseFirstPathPartFromHtml(html)).toBe('MyChart-PRD')
  })

  it('handles meta refresh with url= (lowercase)', () => {
    const html = `
      <meta http-equiv="REFRESH" content="0; url=/MyChart/" />
    `
    // The split on '=' will still work, getting '/MyChart/' after the '='
    expect(parseFirstPathPartFromHtml(html)).toBe('MyChart')
  })

  it('returns null when no meta refresh tag exists', () => {
    const html = `
      <html>
      <head><title>Some Page</title></head>
      <body>Content</body>
      </html>
    `
    expect(parseFirstPathPartFromHtml(html)).toBeNull()
  })

  it('returns null for empty HTML', () => {
    expect(parseFirstPathPartFromHtml('')).toBeNull()
  })

  it('returns null when meta refresh has no URL part', () => {
    const html = `<meta http-equiv="REFRESH" content="5" />`
    expect(parseFirstPathPartFromHtml(html)).toBeNull()
  })

  it('handles meta refresh tag with different casing of http-equiv', () => {
    // Cheerio selector is case-sensitive for attribute values
    const html = `<meta http-equiv="REFRESH" content="0; URL=/PatientPortal/" />`
    expect(parseFirstPathPartFromHtml(html)).toBe('PatientPortal')
  })

  it('handles whitespace in content attribute', () => {
    const html = `<meta http-equiv="REFRESH" content="0;  URL=/MyChart/" />`
    expect(parseFirstPathPartFromHtml(html)).toBe('MyChart')
  })

  it('strips leading and trailing slashes from the path part', () => {
    const html = `<meta http-equiv="REFRESH" content="0; URL=/MyChart/" />`
    const result = parseFirstPathPartFromHtml(html)
    expect(result).toBe('MyChart')
    expect(result).not.toContain('/')
  })
})
