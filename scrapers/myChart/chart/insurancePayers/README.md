# `insurancePayers`

The **organization's** insurance payer catalogue — the payers MyChart offers when a patient
files a new coverage, and the closest thing the portal has to "which insurance does this
hospital take".

| | |
| --- | --- |
| **Capabilities** | `get_insurance_payers` (read, `lessFrequentlyUsed`) |
| **Source** | [`insurancePayers.ts`](insurancePayers.ts) · [`insurancePayers.processor.ts`](insurancePayers.processor.ts) |
| **Activity** | Legacy jQuery `/Insurance` |

For the **patient's** own coverages see the sibling [`../insurance/`](../insurance/).

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /Insurance` | — | antiforgery token |
| `POST /Insurance/Coverages/GetPayors` | `encounterCsn=&encounterDepartmentId=` (form-encoded) | `{ Payors: [...] }` |

## Notes and research

- **`POST /api/insurance/LoadPayers` is not the endpoint**, though it looks like it should
  be. It belongs to the React `/app/insurance` activity, which **none of the four captured
  instances serves**: `GET /app/insurance` answers 200 with the *Home* page, and `LoadPayers`
  500s there whatever it is sent — the bundle calls it with no request data at all, so no
  payload fixes it (`{}`, no body and exact runtime headers all 500; `GET` gives 405). This
  was the canonical instance of the "check the React activity is actually served" trap; see
  [`../../../SCRAPING.md`](../../../SCRAPING.md).
- **The catalogue is organization-level, as far as the capture can show.** No patient
  identifier is in the request, a real department id returned the identical list, and zero
  payer ids are shared between the four organizations. The two-patient diff was **not** run
  — none of the four accounts has proxy access — so "same for every patient" is documented
  as this capability's assumption rather than as a finding.
- **There is no "Other / not listed" entry** in any captured catalogue: the web UI adds
  that option client-side. A payer absent from this list is not necessarily unfileable.
- Error surface, all three observed: a token-less POST does the ASP.NET dance to
  `/Home/Error?code=15`; a `GET` gives `code=14`; and an **unrecognized encounter context
  answers 200 with an empty body and no content type** — which a status check alone reads as
  success. The processor rejects all three rather than reporting an empty catalogue, because
  "this hospital accepts no insurance" is the failure this capability exists to avoid.
- This is also the post-login route around a pre-login gate: the anonymous network profile
  in [`../../prelogin/`](../../prelogin/) reports the accepted-insurance list as `gated`,
  because the public route to it sits behind a reCAPTCHA-protected price-transparency
  disclaimer.
- Shipped in [#390](https://github.com/Fan-Pier-Labs/openrecord/pull/390); 18–40 payers per
  organization, identical field set and types on both Epic releases.

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

## `get_insurance_payers`

`POST /Insurance/Coverages/GetPayors`, form-encoded with two empty encounter
fields, plus the antiforgery token off `/Insurance`. Legacy MVC, so the
envelope is PascalCase. Captured on four live instances spanning both Epic
releases (18–40 payers each, identical field set and types); see
[`api-surface-gaps.md`](../../api-surface-gaps.md), "Insurance payer catalogue".

**This is the organization's catalogue, not the patient's coverage** (that is
`get_insurance`) and not an in-network guarantee. The request carries no
patient identifier, a real `encounterDepartmentId` returned the identical list,
and no two of the four organizations shared a single payer id.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `Payors[]` | The catalogue | — | ✓ | ✓ | The payload. MyChart's own name. |
| `Name` | Payer name as the organization typed it | — | ✓ | ✓ | The answer to "which payers does this hospital take". Free text: one instance appends a phone number to two of them. |
| `ID` | Opaque `WP-` catalogue id | — | ✓ | — | handle — what filing a coverage echoes back. Unique per organization, so useless to a reader. |
| `Fields{}` | Coverage-form field name → 1 (shown) or 2 (required) | — | ✓ | — | What the org collects for this payer. Passes through as MyChart sent it (rule 2); the levels are named by the two derived lists below. |
| `requiredFields[]`, `optionalFields[]` | The `Fields` names at level 2 and level 1 | ✓ | ✓ | `requiredFields` only | derived — the legacy controller reads `> 0` as "show" and `> 1` as "require" (`_buildFieldsViewModelFromPayor`). What a patient would have to have on hand. Level 0 is in neither list. |
| `CanUpload` | Instance accepts a card image for this payer | — | ✓ | — | About the upload UI, but it is per-payer chart-adjacent state, not a button flag. `true` on every captured entry. |
| `IsNonConfiguredPayer` | A free-text payer the org has not configured | — | ✓ | ✓ | Says the row is not a real catalogue entry. `false` on every captured entry, and kept in both modes because a reader must be able to tell a configured payer from a placeholder (rule 6). |
| `SortKey`, `NameUTF8` | — | — | — | — | always empty — `null` on every entry of all four instances. |
| `SampleCardImages[]` | Example card images | — | — | — | always empty — `[]` on every entry of all four instances, so the element shape is unknown. asset besides. |

There is **no "Other / not listed" entry** in any captured catalogue: the web
UI adds that option client-side (id `-1`, free-text payer name), and
`IsNonConfiguredPayer` was never set. A reader should not conclude that a payer
absent from this list cannot be filed at all.

The processor throws rather than returning an empty catalogue for a non-2xx,
for a response with no `Payors` array, and for the **200 with an empty body**
MyChart answers an unrecognized encounter context with. That last one has no
error status and no content type, so a status check alone reads it as success.
