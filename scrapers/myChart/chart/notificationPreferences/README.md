# `notificationPreferences`

Which notifications this MyChart sends, and on which channels — the patient's
Communication Preferences page, topic by topic, as this org has configured it.

| | |
| --- | --- |
| **Capabilities** | `get_notification_preferences` (read, `lessFrequentlyUsed`) |
| **Source** | [`notificationPreferences.ts`](notificationPreferences.ts) · [`notificationPreferences.processor.ts`](notificationPreferences.processor.ts) |
| **Activity** | React `/app/communication-preferences` |

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /app/communication-preferences` | — | antiforgery token |
| `POST /api/communicationPreferences/GetPreferences` | `{}` | the topics and their channel toggles — the payload |
| `POST /api/communicationPreferences/GetContactInformation` | `{}` | the email and mobile number they are delivered to — tolerated |

Both bodies are what `epic.px.client.communication-preferences` sends. The
same bundle also names `UpdatePreferences` and `UpdateUserAcceptsSms`; this
scraper does not call them.

## Notes and research

Probed on **five real instances in November 2026, across two Epic releases**:
every request above answered 200 with `{}` on all five.

- **This is the setting that differs most between orgs.** Same patient, five
  orgs: 8–9 groups, 40–48 topics, 78–118 topic × channel toggles, group names
  that don't match ("Messages" / "Messages & Letters" / "Messages &
  Documents"), and different channels offered per topic. The bundles are
  byte-identical across the four instances on one release, so the variation is
  entirely in the org's configuration. Which is why the processor keeps titles,
  not ids.
- **The payload is normalised.** `groupers`, `concepts`, `medias` and
  `additionalItemSections` are four maps keyed by opaque `WP-…` ids, joined
  through `conceptIds` / `mediaIds` / `additionalItemSectionId`, with group
  order in `grouperOrder`. The processor resolves them into one tree in that
  order and drops the ids: they are encrypted handles, and nothing a reader
  can compare between orgs.
- **Two numeric codes, decoded with the bundle's own tables** (module 546 of
  `epic.px.client.communication-preferences`):
  `type` is a string — `1` Email, `3` Mail, `4` Phone, `6` Push, `100` Text;
  `toggleStatus` is a number — `0` Off, `1` On, `3` LockedOn. LockedOn is on and
  cannot be turned off (account-security topics, typically). Every code seen on
  the five instances is in those tables. An unknown code keeps its raw value and
  decodes to `null` rather than vanishing.
- **`userAcceptsSms` gates every Text toggle.** A topic can show Text on while
  the patient has never agreed to texts; the UI disables the toggle then.
  `smsFlagOn` is whether the org sends texts at all.
- **`paperlessBillingRequiredConcepts`** lists the topics that paperless
  billing needs delivered by email or text (the bundle refuses to save a
  paperless sign-up with all of them off). Surfaced as
  `requiredForPaperlessBilling` on the topic.
- **`additionalItemSections` are per-topic sub-options**: which appointment
  changes trigger a status update, how far ahead a reminder goes, whether the
  wait list auto-enrolls. `Checkbox` and `Dropdown` were both seen.
  `optionDescriptionMap` / `optionSelectionMap` are keyed by option id and read
  in `optionIds` order. Some sections come back with blank descriptions on
  some orgs.
- **Per patient.** A proxy record has its own preferences, and
  `GetContactInformation.proxyContextName` says whose they are. Not probed on a
  proxy record.

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

## `get_notification_preferences`

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `groupers[]` | Groups in `grouperOrder`, each with its topics | ✓ | ✓ | ✓ | The page's structure, resolved from the id maps. |
| `groupers[].title` | Group name | — | ✓ | ✓ | How the org labels it. |
| `groupers[].description` | Group description | — | ✓ | — | Detail. |
| `groupers[].otherPreferencesLinkText` | Where the group continues on another page | — | ✓ | — | Explains a group whose settings live elsewhere; detail. |
| `groupers[].concepts[].title` | Topic name | — | ✓ | ✓ | What the notification is about. |
| `groupers[].concepts[].description` | Topic description | — | ✓ | — | Detail. |
| `groupers[].concepts[].medias[].type`, `.toggleStatus` | Raw channel and state codes | — | ✓ | — | Kept beside their decodes; detail. |
| `groupers[].concepts[].medias[].channel`, `.status` | Decoded channel and state | ✓ | ✓ | — | Readable form of the codes. |
| `groupers[].concepts[].channelsOn` | Channels whose status is On or LockedOn | ✓ | ✓ | ✓ | The one answer per topic a person asks for. |
| `groupers[].concepts[].requiredForPaperlessBilling` | Topic is in `paperlessBillingRequiredConcepts` | ✓ | ✓ | — | Explains why a topic can't be turned off; detail. |
| `groupers[].concepts[].additionalItemSection` | `sectionType`, `sectionDescription`, `options[]` (`description`, `selected`) | ✓ | ✓ | — | Sub-options, resolved from the option maps; detail. |
| `smsFlagOn` | Org sends texts | — | ✓ | — | Detail. |
| `userAcceptsSms` | Patient agreed to texts | — | ✓ | ✓ | Without it no Text toggle does anything. |
| `contactInformation.email`, `.mobilePhone`, `.emailPending`, `.mobilePending`, `.mobileIsVerified`, `.mediaTypesMissingContactMethod`, `.proxyContextName` | Where notifications go | — | ✓ | — | Contact data; concise is the settings, not the address book. |
| `contactInformationUnavailable` | `GetContactInformation` failed | ✓ | ✓ | ✓ | Only when true; a gap, not "no email on file". |
| all `hstId`, `mediaId`, `sectionId`, `conceptIds`, `mediaIds`, `optionIds`, `grouperOrder`, `additionalItemSectionId`, `dropDownAdditionalItemId`, `paperlessBillingRequiredConcepts` | Opaque ids and the joins between them | — | — | — | Identifier; consumed by the processor. |
| `groupers[].otherPreferencesLinkPath`, `canApplyToAll`, `showContactInformation`, `grouperIdToExpandOnLoad`, `contactInformation.showLinkToContactInfo` | Page config | — | — | — | UI flag. |
