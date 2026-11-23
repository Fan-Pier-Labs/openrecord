// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Masked contacts as MyChart prints them on the 2FA page — a masked address
 * and a masked number. Both are rewrites of patterns whose adjacent quantifiers
 * could each claim the same `*`, so a long run of mask characters with no `@`
 * or trailing digits — easy to plant in scraped portal HTML — got divided
 * between them every possible way: 800 stars took 25s, on the login path. Each
 * accepts exactly the same strings as the pattern it replaces. The lookbehinds
 * are the other half of the fix: a match can never start mid-run (the star
 * before it would have started an equally good match one character earlier),
 * and refusing those start offsets is what takes the scan to linear.
 */
export const MASKED_EMAIL_RE = /(?<![\w*])[\w*]\w*\*[\w*]*@[\w.]+/;
export const MASKED_PHONE_RE = /(?<!\*)\*\*[\d*-]*\d{4}/;
