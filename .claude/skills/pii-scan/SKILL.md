# PII Scan

Exhaustively scan the entire git history across all branches for personally identifiable information (PII), credentials, and sensitive data.

## What to search for

1. **Passwords & credentials** — hardcoded passwords, base64-encoded credentials, OAuth tokens (access/refresh), session cookies, JWT tokens, TOTP secrets, API keys
2. **Medical/health data** — real patient names + diagnoses, MRNs, accession numbers, DOBs tied to health context, prescription details, lab values, provider names tied to real patients
3. **Personal identifiers** — real email addresses (not service/noreply emails), phone numbers, SSNs, physical addresses, credit card numbers
4. **Sensitive files** — screenshots of patient portals, medical images with patient overlays, credential JSON files, .env files, curl commands with session cookies, data dumps (CSV/SQL/XLSX)
5. **Images** — screenshots that may show PII, medical imaging viewer screenshots with patient metadata overlays

## How to run

Launch 4+ parallel agents to scan different categories simultaneously:

### Agent 1: Passwords & Credentials
- Base64-encoded strings in source code (`btoa`, `Buffer.from`)
- Password assignments: `password = "..."`, `pass: "..."`
- Bearer/Authorization headers with real token values
- Cookie headers with session values (`MyChart_Session`, `JSESSIONID`)
- OAuth tokens (`ya29.`, `1//`, refresh tokens)
- Private keys (`BEGIN PRIVATE KEY`)
- TOTP secrets (base32 strings 16+ chars)
- Search: `git log -p --all`

### Agent 2: Medical/Health PII
- Real diagnoses, medications with dosages, lab values outside test fixtures
- Scraped HTML containing patient data
- Real doctor/provider names outside test/mock context
- Insurance/member IDs outside test context
- PDFs, medical record dumps
- Images: `git log --all --diff-filter=A --name-only -- '*.png' '*.jpg' '*.jpeg'`

### Agent 3: Personal Identifiers
- All unique email addresses: `git log -p --all | grep -oE '[email pattern]' | sort -u`
- Phone numbers, SSNs, street addresses, credit cards
- Names paired with health/medical context outside test fixtures
- Data files: CSV, XLSX, SQL, DB

### Agent 4: Non-main branch deep scan
- Find branches with unique commits not on main
- Search those commits specifically for credentials, emails, screenshots
- Check for HTML files with scraped content
- Curl/fetch commands with hardcoded cookies

## Known accepted items (do NOT report)

Maintain a list of already-known/accepted items and instruct agents to skip them. This avoids re-reporting items the user has already reviewed.

## Output

Compile all agent results into a single summary table:
- Severity (CRITICAL / HIGH / MODERATE / LOW)
- File path
- What was found
- Location (currently tracked vs history only)
- Recommended action

For any CRITICAL/HIGH findings, offer to remove them with `git filter-repo`.
