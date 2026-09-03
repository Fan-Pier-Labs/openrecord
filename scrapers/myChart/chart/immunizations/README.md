# `immunizations` — what each mode carries

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
