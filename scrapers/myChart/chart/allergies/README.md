# `allergies`

The patient's allergy list, plus the review status that says whether an empty list means
"none on file" or "never reviewed".

| | |
| --- | --- |
| **Capabilities** | `get_allergies` (read) |
| **Source** | [`allergies.ts`](allergies.ts) · [`allergies.processor.ts`](allergies.processor.ts) |
| **Activity** | Legacy jQuery `/Clinical/Allergies` |

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /Clinical/Allergies` | — | antiforgery token |
| `POST /api/allergies/LoadAllergies` | `{}` | the list |

## Notes and research

- **The element shape is unverified.** Every account captured so far has an empty
  `dataList`, so the envelope (`dataList`, `allergiesStatus`, `dateOfBirth`) is confirmed
  and the *element* is not. The scraper hedges — `allergyItem.*` with flat fallbacks — and
  the processor passes elements through whole rather than narrowing to guessed names. See
  [`docs/processor-layer-todo.md`](../../../../docs/processor-layer-todo.md).
- Deliberately **not** flagged `unverified` in the registry
  ([#405](https://github.com/Fan-Pier-Labs/openrecord/pull/405)): the envelope *is*
  confirmed and elements pass through whole, so an empty answer here is honest. The flag is
  a warning about capabilities that would confidently invent an empty list, not a
  disclaimer to sprinkle.
- `allergiesStatus` is the field that earns its place: an empty list with an
  unreviewed status is not the same claim as an empty list with a reviewed one, and that
  distinction is the whole value of the field.
- `get_allergies` is one of the three capabilities `serverErrors.integration.test.ts` uses
  to pin that a failed answer throws in every output mode rather than rendering as "no
  allergies on file" — see [`../../core/`](../../core/).

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

## `get_allergies`

`POST /api/allergies/LoadAllergies`. The captured account had no allergies, so
the `dataList` element shape is unverified; the scraper hedges with
`allergyItem.*` and flat fallbacks.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `dataList[]` | One allergy per element, whole | — | ✓ | ✓ | Uncaptured; passed through whole. When captured, standard narrows to `name`, `formattedDateNoted`, `type`, `reaction`, `severity`, `id` and concise to `name`, `reaction`, `severity`. The list is emitted empty too: "no allergies on file" is the answer most readers want (rule 6). |
| `allergiesStatus` | Status code of the allergy list (reviewed / unreviewed) | — | ✓ | ✓ | Says whether an empty list means "none" or "not reviewed"; that distinction is the whole value of the field. |
| `dateOfBirth` | Patient DOB | — | ✓ | — | Real; already in `get_profile`, kept here because the endpoint sends it and it costs nothing. |
| `hasUpdateSecurity`, `hasStandAloneUpdateSecurity` | Whether the patient may edit | — | — | — | UI flag. |
| `showDxrRefreshBanner`, `showDxrBannerAction`, `preTextStringKey` | Care Everywhere banner state | — | — | — | DXR plumbing. |
