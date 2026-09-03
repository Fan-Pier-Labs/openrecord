# `referrals` — what each mode carries

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
