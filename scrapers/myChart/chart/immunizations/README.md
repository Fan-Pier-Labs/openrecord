# `immunizations`

The vaccination record: each vaccine and every date it was administered, grouped by the
organization that gave it.

| | |
| --- | --- |
| **Capabilities** | `get_immunizations` (read) |
| **Source** | [`immunizations.ts`](immunizations.ts) · [`immunizations.processor.ts`](immunizations.processor.ts) |
| **Activity** | Legacy jQuery `/Clinical/Immunizations` |

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /Clinical/Immunizations` | — | antiforgery token |
| `POST /api/immunizations/LoadImmunizations` | `{}` | the record |

## Notes and research

- **The response is grouped by organization**, not flat:
  `organizationImmunizationList[].orgImmunizations[]`. On a Happy Together account the same
  vaccine can appear under more than one organization, so the processor lifts
  `organizationName` onto each row rather than flattening the groups away — otherwise two
  records of one dose read as two doses.
- A vaccine record **is its dates**: `formattedAdministeredDates[]` is an array, one entry
  per dose, and it is the only clinical content in the element. Everything else is an id or
  page chrome.
- Dates arrive pre-formatted by the instance; there is no ISO variant on this endpoint.

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

## `get_immunizations`

`POST /api/immunizations/LoadImmunizations`.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `organizationImmunizationList[].orgImmunizations[].name` | Vaccine | — | ✓ | ✓ | The vaccine. |
| `…orgImmunizations[].formattedAdministeredDates[]` | Every dose date | — | ✓ | ✓ | The doses; a vaccine record is its dates. |
| `…orgImmunizations[].id` | Immunization id | — | ✓ | — | Identifier; no capability takes it. |
| `organizationName` | `organization.organizationName` lifted onto the row | ✓ | ✓ | — | Derived. Which system administered it; detail. |
| `organizationImmunizationList[].organization.*` | The organization object | — | — | — | Org blob. |
| `organizationImmunizationList[].showViewDetailsLink`, `showPersonalNotes`, `immunizationsUrl` | Page config | — | — | — | UI flag / portal link. |
