# `emergencyContacts`

The patient's emergency contacts — and the one place in `chart/` where a capability writes
back to the patient's own demographics.

| | |
| --- | --- |
| **Capabilities** | `get_emergency_contacts` (read) · `add_emergency_contact` · `update_emergency_contact` · `remove_emergency_contact` (writes) |
| **Source** | [`emergencyContacts.ts`](emergencyContacts.ts) · [`emergencyContacts.processor.ts`](emergencyContacts.processor.ts) |
| **Activity** | React `/app/personal-information` |

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /app/personal-information` | — | antiforgery token (every call below re-fetches it) |
| `POST /api/personalInformation/GetRelationships` | `{}` | the contacts |
| `POST /api/personalInformation/AddRelationship` | `{ name, relationshipType, phoneNumber, isEmergencyContact: true }` | add |
| `POST /api/personalInformation/UpdateRelationship` | `{ id, …changed fields, isEmergencyContact: true }` | edit |
| `POST /api/personalInformation/RemoveRelationship` | `{ id }` | remove |

## Notes and research

- **Relationships, not "emergency contacts".** The endpoints manage the patient's whole
  relationship list; `isEmergencyContact` is the flag that makes an entry one. The writes
  always send it `true`.
- **An update sends only the fields the caller supplied.** Callers build the input from
  optional capability args, so an unset field arrives as an explicit `undefined`; the body
  is keyed off `!== undefined` so those stay out of the payload entirely, rather than being
  sent as empty strings that would blank the stored value.
- The writes report success on HTTP 200 and otherwise return the status and the body text.
  They do not re-read the list to confirm the change landed.
- `isEmergencyContact` is present on the *read* shape of only one captured instance. Where
  it is absent, absence means true — the list is already the emergency-contact list.
- `hideEmergencyContacts` is instance configuration and is kept, because it explains an
  empty list that is not a patient with no contacts.
- The write surface dates to [#18](https://github.com/Fan-Pier-Labs/openrecord/pull/18).

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

## `get_emergency_contacts`

`POST /api/personalInformation/GetRelationships`.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `contacts[].id` | Contact id | — | ✓ | ✓ | Handle: `update_emergency_contact` and `remove_emergency_contact` take it. |
| `contacts[].formattedName` | Name | — | ✓ | ✓ | Who. |
| `contacts[].relationToPatient.name` | Relationship | — | ✓ | ✓ | How they are related. |
| `contacts[].contactInformation.phoneNumbers[].phoneNumber`, `.type` | Phones | — | ✓ | ✓ (first) | How to reach them; concise keeps one number. |
| `contacts[].contactInformation.emailAddress` | Email | — | ✓ | — | Detail. |
| `contacts[].contactInformation.address.formattedValues[]` | Address lines | — | ✓ | — | Detail. |
| `contacts[].isPrimaryContact` | Primary | — | ✓ | — | Detail. |
| `contacts[].isEmergencyContact` | Present on one captured instance only; absent means true | — | ✓ | — | Real where it exists; detail. |
| `hideEmergencyContacts` | Instance hides the section | — | ✓ | — | Explains an empty list; detail. |
| `contacts[].relationToPatient.labelText`, `.isInactive` | Code-table detail | — | — | — | Duplicate / internal. |
| `contacts[].contactInformation.address.*` other than `formattedValues` | Discrete address parts and code tables | — | — | — | Duplicate. |
| `contacts[].isLinkedToOtherPatient`, `.isHCA`, `.isAddressLinkedToPatient`, `.savedSuccessfully`, `.isPending`, `.isVRK` | Edit-form state | — | — | — | UI flag. |
| `relationToPatientChoices[]`, `requiredFields[]`, `vrkFields[]`, `hasEndOfLifePageMnemonic`, `isViewOnly` | Form config | — | — | — | UI flag. |
