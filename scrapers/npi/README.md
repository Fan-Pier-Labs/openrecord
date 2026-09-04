# `npi` — the NPI Registry

CMS's public directory of every US healthcare provider. **The one scraper in this repo whose
source is not MyChart**, and the only one that needs no account at all.

| | |
| --- | --- |
| **Capabilities** | `lookup_npi` · `search_npi_registry` — both `kind: 'public'`: no `account` parameter, no session, and they cannot reach a chart |
| **Source** | [`npiRegistry.ts`](npiRegistry.ts) · [`npiRegistry.processor.ts`](npiRegistry.processor.ts) |

A National Provider Identifier is the 10-digit number Medicare, insurers and MyChart itself
use to name a clinician or an organization. MyChart hands a few of them out — the care team
lists each provider's `NationalProviderID` — and names many more providers *without* one
(visits, notes, letters, message senders). This goes both directions: an NPI to the provider
it belongs to, or a name / specialty / place to the providers that match.

## Endpoint

| Request | Purpose |
| --- | --- |
| `GET https://npiregistry.cms.hhs.gov/api/?version=2.1&number=…` | `lookup_npi` |
| `GET https://npiregistry.cms.hhs.gov/api/?version=2.1&<name/specialty/place criteria>` | `search_npi_registry` |

One request, **no key and no login**. Both answer with the same
`{ result_count, results[] }` envelope, so one element mapping serves both; `lookup_npi`
returns `results[0]`, or `null` when the number is unheld.

## What the API enforces

Observed September 2026, API version 2.1:

- **At most 200 results per page.** A larger `limit` is silently clamped, and `0` silently
  becomes the default 10.
- **`skip` pages further, with a documented ceiling of 1,000** — so a single query yields at
  most 1,200 results. Narrow the query rather than paging past that.
- **A trailing `*` wildcard needs two or more leading characters**: `Jo*` works, `J*` is
  refused.
- **`state` and `enumeration_type` are refused on their own**; every other criterion may
  stand alone. No criteria at all is also refused.
- **Refusals are HTTP 200 with an `Errors` array**, not a non-2xx status. Each
  `description` is a complete sentence about what was wrong with the query, and that body
  reaches the caller unchanged in every mode rather than becoming an empty result set.

## Notes and research

- **Nothing is bundled.** The same data is published as a bulk file — about 1.1 GB zipped,
  ~10 GB of CSV, refreshed monthly with weekly deltas. It would not fit in any client, and
  the live API is current where the file is up to a month stale.
- **`RawCollector` is deliberately not reused.** It wraps `makeAuthenticatedRequest`, whose
  whole job is MyChart session expiry and the active-patient restore; there is no session
  here. These build their single record directly, still through `scraperFetch`, so the
  per-host permit and the test transport still apply. The `RawResponse` envelope *is* reused
  — nothing in it is Epic-specific, and that is what lets these capabilities take the same
  `mode` parameter as every MyChart read.
- **CMS stores a person's name only in parts**, so `providerName` is derived (parts joined,
  credential after a comma) rather than leaving every caller to re-implement the join.
  `primarySpecialty`, `primaryAddress` and `primaryPhone` are derived for the same reason.
- **`created_epoch` / `last_updated_epoch` are not duplicates of the date strings beside
  them** — the two disagreed on **102 of 883** sampled records, so keeping only one would
  silently pick a day. Both stay, neither is reformatted.
- **Evidence base:** field names and key sets come from **883 live records** across six
  queries spanning individuals, organizations, organization subparts, and populated
  `other_names` / `identifiers` / `practiceLocations` / `endpoints` arrays. The counts in the
  mode table are from that sample.
- Added in [#391](https://github.com/Fan-Pier-Labs/openrecord/pull/391); wired into the
  capability registry as account-free reads by
  [#396](https://github.com/Fan-Pier-Labs/openrecord/pull/396).

## Modes: what each mode carries

Part of the processor layer. The rules (never rename a source field, membership by field
name, markup only in `raw`, never invent a shape) and the drop-reason tags used in the
Reasoning column are in [`docs/processor-layer-proposal.md`](../../docs/processor-layer-proposal.md);
example output in all four modes is in
[`docs/processor-layer-examples.md`](../../docs/processor-layer-examples.md).

Columns: **Field** (CMS's name, or the derived name), **What it is**,
**Derived** (✓ when the processor computes it from other fields; such a field
is never in `raw`), **Standard / JSON**, **Concise**, **Reasoning** (why the
field is in or out of each of the two).

Fields that share a description and a fate are grouped on one row. A group's
members are all listed so nothing is implied.

This is the one scraper whose source is not MyChart. The rules are about a
source's fields rather than about Epic, so they apply unchanged: `basic.first_name`
keeps CMS's snake_case, and the four derived fields carry camelCase names no CMS
field uses.

## `lookup_npi` and `search_npi_registry`

`GET https://npiregistry.cms.hhs.gov/api/?version=2.1&…`. One request, no key and
no login. `lookup_npi` sends `number`; `search_npi_registry` sends the name,
specialty and place criteria. Both answer with the same `{ result_count, results[] }`
envelope, so one element mapping serves both — `lookup_npi` returns `results[0]`,
or `null` when the number is unheld.

**Evidence.** Field names and key sets come from 883 live records sampled across
six queries spanning individuals, organizations, organization subparts, and
populated `other_names` / `identifiers` / `practiceLocations` / `endpoints`
arrays. Counts quoted below are from that sample.

### Top level

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `result_count` | How many providers matched | — | ✓ | ✓ | Says whether a search was narrow enough; a capped page looks identical without it. |
| `results[]` | One provider each | — | ✓ | ✓ | The payload. |
| `Errors[]` | A refused query | — | ✓ | ✓ | Rule 7. The API refuses with HTTP 200 and this array; each `description` is a complete sentence about what was wrong with the query. Returned unchanged in every mode instead of becoming an empty result set. |

### A provider

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `number` | The 10-digit NPI | — | ✓ | ✓ | **handle** — what `lookup_npi` and every downstream system takes as input (rule 5). |
| `enumeration_type` | `NPI-1` person, `NPI-2` organization | — | ✓ | ✓ | Decides how every name field reads. |
| `providerName` | Display name: the person's parts joined with the credential after a comma, or the organization's name | ✓ | ✓ | ✓ | **derived** from `basic`. CMS stores a person's name only in parts, so without this every caller re-implements the join. |
| `primarySpecialty` | The primary taxonomy's `desc` | ✓ | ✓ | ✓ | **derived** from `taxonomies`. "What kind of provider" otherwise means scanning the array for `primary`. |
| `primaryAddress` | The `LOCATION` address on one line, falling back to the first address | ✓ | ✓ | ✓ | **derived** from `addresses`. Where the patient would go. |
| `primaryPhone` | That address's `telephone_number` | ✓ | ✓ | ✓ | **derived** from `addresses`. How to reach them. |
| `basic{}` | Names, dates, status, sole-proprietor and authorized-official fields | — | ✓ | — | Every field kept, as the union of the person and organization key sets (below). Out of concise because `providerName` and `primarySpecialty` already answer who and what. |
| `taxonomies[]` | Specialty, license and taxonomy group | — | ✓ | — | Real clinical categorization; a provider may hold several. Concise carries only `primarySpecialty`. |
| `addresses[]` | Mailing and location addresses | — | ✓ | — | Kept whole; concise carries the flattened `primaryAddress` and `primaryPhone`. |
| `practiceLocations[]` | Additional practice sites beyond the primary one | — | ✓ | — | Same shape as `addresses`. Where else the provider works. |
| `identifiers[]` | Medicaid numbers and other payer ids (`identifier`, `code`, `desc`, `issuer`, `state`) | — | ✓ | — | Real cross-system ids. Too rarely needed for concise. |
| `other_names[]` | Former names and doing-business-as names | — | ✓ | — | **uncaptured** element shape: the person keys (`first_name`, `last_name`, `middle_name`, `prefix`) and the organization key (`organization_name`) differ, so the element passes through whole (rule 10). |
| `endpoints[]` | Direct / FHIR addresses for exchanging records | — | ✓ | — | **uncaptured** element shape: 14–18 keys across sampled records (`contentOtherDescription`, `affiliationName`, `useOtherDescription` appear only sometimes), so the element passes through whole (rule 10). Real data, so it is not dropped. |
| `created_epoch`, `last_updated_epoch` | Enumeration and last-change instants, in epoch millis | — | ✓ | — | **Not** a duplicate of the date strings beside them: the two disagreed on 102 of 883 sampled records, so keeping only one would silently pick a day. Both stay; neither is formatted (rule 8). |

### `basic{}`

Rule 6 is why this is one list rather than two. The key set differs between the
two record types, so the processor emits the union on every provider, `null`
where that record type has no such field. A reader never has to check
`enumeration_type` before knowing which names to expect, and nothing decides at
runtime by looking at a value.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `status` | Registry status; `A` is active | — | ✓ | — | `A` on all 883 sampled records, because the API serves active providers and deactivations ship in a separate file. Kept in standard since a non-active value would matter; out of concise because it never varies in practice. |
| `enumeration_date`, `last_updated`, `certification_date` | When the NPI was issued, last changed, last certified | — | ✓ | — | How current the record is. |
| `first_name`, `middle_name`, `last_name`, `name_prefix`, `name_suffix`, `credential`, `sex`, `sole_proprietor` | The person fields | — | ✓ | — | All real. `providerName` joins four of them for concise; the parts stay so a caller can re-format. |
| `organization_name`, `organizational_subpart`, `parent_organization_legal_business_name` | The organization fields | — | ✓ | — | `parent_…` is the only way to tell a hospital department from the hospital. |
| `authorized_official_first_name`, `authorized_official_middle_name`, `authorized_official_last_name`, `authorized_official_name_prefix`, `authorized_official_name_suffix`, `authorized_official_credential`, `authorized_official_title_or_position`, `authorized_official_telephone_number` | Who registered the organization, and how to reach them | — | ✓ | — | A real contact for an organization. Never populated on a person. |

### `taxonomies[]`

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `code`, `desc` | The taxonomy code and its description | — | ✓ | — | The specialty itself. `desc` feeds `primarySpecialty`. |
| `primary` | Whether this is the provider's main specialty | — | ✓ | — | Picks which `desc` becomes `primarySpecialty`. |
| `license`, `state` | State licence number and the state that issued it | — | ✓ | — | Verifiable credential. |
| `taxonomy_group` | CMS's coarser grouping | — | ✓ | — | Populated on 323 of 1,368 sampled taxonomies, so **not** an always-empty field. |

### `addresses[]` and `practiceLocations[]`

One mapping, used for both. `address_2` was present on 303 of 1,766 sampled
addresses, `telephone_number` on 1,608 and `fax_number` on 721; all are on the
list and emitted `null` when absent (rule 6).

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `address_purpose` | `LOCATION` or `MAILING` | — | ✓ | — | Which of the two an entry is; picks the one `primaryAddress` flattens. |
| `address_type` | `DOM`, `FGN` or military | — | ✓ | — | Distinguishes a foreign address. |
| `address_1`, `address_2`, `city`, `state`, `postal_code`, `country_code`, `country_name` | The address | — | ✓ | — | Where the provider is. Flattened into `primaryAddress` for concise. |
| `telephone_number`, `fax_number` | Contact numbers | — | ✓ | — | `telephone_number` feeds `primaryPhone`. |
