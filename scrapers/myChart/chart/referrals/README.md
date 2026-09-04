# `referrals`

Referrals to other providers — who referred the patient where, the authorization status,
and the window the referral is valid for.

| | |
| --- | --- |
| **Capabilities** | `get_referrals` (read) |
| **Source** | [`referrals.ts`](referrals.ts) · [`referrals.processor.ts`](referrals.processor.ts) |
| **Activity** | React `/app/referrals` |

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /app/referrals` | — | antiforgery token |
| `POST /api/referrals/listReferrals` | `{}` | the referrals |

Note the lower-case `listReferrals` — most sibling endpoints are PascalCase.

## Notes and research

- **The validity window is the point.** A referral outside `start`–`end` is not usable,
  so both dates are in `concise` alongside the status; a status on its own is half an answer.
- Status arrives twice, as `statusString` and as a numeric `status`. Both are kept: the
  string for a reader, the code for a consumer that switches on it.
- `canSeeAuthorizations` is instance-level configuration. It explains why authorization
  detail can be missing on one deployment and present on another, which is why it survives
  into `standard` rather than being dropped as a UI flag.
- `dte` is Epic's mainframe day count (days since 1840-12-31) of `creationDate` — the same
  encoding the billing scraper converts in [`shared/epicDate.ts`](../../../../shared/epicDate.ts). It is
  dropped here because the formatted date is beside it.
- One of the capabilities pinned by
  [#406](https://github.com/Fan-Pier-Labs/openrecord/pull/406): the processor refuses to
  read a failed answer as "no referrals".

## Modes: what each mode carries

Part of the processor layer. The rules (never rename a MyChart field, membership by field
name, markup only in `raw`, never invent a shape) and the drop-reason tags used in the
Reasoning column are in [`docs/processor-layer-proposal.md`](../../../../docs/processor-layer-proposal.md);
example output in all four modes is in
[`docs/processor-layer-examples.md`](../../../../docs/processor-layer-examples.md).

Columns: **Field** (MyChart's name, or the derived name), **What it is**,
**Derived** (✓ when the processor computes it from other fields; such a field
is never in `raw`), **Standard / JSON**, **Concise**, **Reasoning** (why the
field is in or out of each of the two).

Fields that share a description and a fate are grouped on one row. A group's
members are all listed so nothing is implied.

## `get_referrals`

`POST /api/referrals/listReferrals`.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `referralList[].statusString` | Status as text | — | ✓ | ✓ | Whether the referral is approved, pending, expired. |
| `referralList[].status` | Status code | — | ✓ | — | Duplicate in code form; kept for consumers that switch on it. |
| `referralList[].referredToProviderName`, `.referredToFacility` | Where to | — | ✓ | ✓ | Who the patient is being sent to. |
| `referralList[].referredByProviderName` | Who referred | — | ✓ | ✓ | Who sent them. |
| `referralList[].start`, `.end` | Validity window | — | ✓ | ✓ | An expired referral is useless; the window matters. |
| `referralList[].creationDate` | Created | — | ✓ | — | Detail. |
| `referralList[].internalId`, `.externalId` | Ids | — | ✓ | — | Identifiers; detail. |
| `referralList[].dte` | Epic day count of `creationDate` | — | — | — | Internal. |
| `canSeeAuthorizations` | Instance shows authorization detail | — | ✓ | — | Explains why authorization fields may be missing; detail. |
| `canSendMessage`, `shouldRedirect` | Page config | — | — | — | UI flag. |
