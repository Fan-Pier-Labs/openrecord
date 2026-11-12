# Capabilities

A **capability** is one thing OpenRecord can do with a MyChart account, such as reading lab
results, sending a message, or downloading a statement PDF. They are all defined in one registry
(`shared/capabilities/` in the repository), and every client derives its surface from it:

| Client | How a capability shows up |
| --- | --- |
| CLI | `mychart-cli --host <host> --action <id> --arg name=value` |
| Library | `client.runCapability('<id>', { name: value })`, plus a typed method for most of them |
| Claude Desktop extension | One MCP tool per capability, same id |
| Mobile app | One agent tool per capability, same id |

A capability added to the registry ships in all four. This page lists all of them. The CLI's
listing is generated from the same registry, so if this page and the CLI ever disagree, the CLI
is right:

```bash
mychart-cli --list-capabilities --show-all
```

## Reading the table

- **Arguments** use the registry's snake_case names. On the CLI each one is `--arg name=value`.
  In `runCapability` they're keys of the args object. Unknown names are an error, not ignored.
- **writes** means the capability changes something in the patient's MyChart record.
  **account settings** means it changes how the account signs in. Neither kind is part of the
  CLI's default full scrape.
- **no account needed** marks a public lookup. It needs no `--host`, no login and no session.
- **less used** marks a capability that `--help` hides unless you pass `--show-all`. This only
  affects the listing. Hidden capabilities still run.
- Every chart-reading capability also accepts `patient` (`--arg patient="<name>"`, or the
  CLI's `--patient`). It asserts which family member's record the call is about. See
  [Family records](#family-records-proxy-access).
- Every read with a processor also accepts `mode`. See [Output modes](#output-modes).

## Output modes

Every read capability returns its data in one of four modes:

| Mode | What you get | Default for |
| --- | --- | --- |
| `json` | The **standard object**: every useful field under MyChart's own names, plus derived fields (`bodyText`, `instantISO`, …) | the CLI, `runCapability`, every typed `MyChartClient` method |
| `standard` | The same object rendered as markdown | — |
| `concise` | The useful subset as markdown, which is what the desktop extension and the app show a model | the Claude Desktop extension and the app |
| `raw` | Exactly what MyChart sent, untouched, or an envelope of every request the scraper made. Large, and includes HTML and Epic's UI flags | — |

```bash
mychart-cli --host mychart.example.org --action get_medications --mode concise
```

```ts
const md = await client.runCapability('get_lab_results', { mode: 'concise' });
```

`mode` is ignored by writes, account settings, `search_mycharts`, and the capabilities that
return files or images. Field-by-field decisions for each capability are in
[`docs/processor-layer-proposal.md`](../../docs/processor-layer-proposal.md), and example output
in every mode is in [`docs/processor-layer-examples.md`](../../docs/processor-layer-examples.md).

## Chaining ids

Many capabilities take an id that another capability returned. Copy ids verbatim, because they
are opaque and specific to the instance.

| To call | You need | Which comes from |
| --- | --- | --- |
| `get_visit_notes`, `get_visit_avs` | `csn` | `get_past_visits` → `visits[].Csn` |
| `get_note_content` | `csn`, `lrp_id`, `hno_id`, `hno_dat` | `get_visit_notes` → `lrpID`, and per note `hnoID` / `hnoDAT` |
| `download_imaging_study` | `image_id` | `get_imaging_results` → `orders[].image_id` (only when `hasViewableImages`) |
| `get_message_thread`, `send_reply`, `delete_message` | `conversation_id` | `get_messages` → `conversations[].hthId` |
| `get_message_attachment` | `conversation_id`, `attachment_id` | `get_messages` → `hthId`; `get_message_thread` → the attachment's `dcsId` |
| `send_message` | `recipient_name` (and optionally `topic`) | `get_message_recipients` / `get_message_topics` → display names |
| `download_billing_statement` | `record_id` | `get_billing` → a statement's `RecordID` |
| `download_document` | `document_id` | `get_documents` → a document's `dcsID` |
| `get_letter_details` | `hno_id`, `csn` | `get_letters` |
| `update_emergency_contact`, `remove_emergency_contact` | `id` | `get_emergency_contacts` |
| `switch_proxy_target` | `patient` | `list_proxy_targets` → a patient name, or `me` |
| `lookup_npi` | `npi` | `get_care_team` → each provider's `npi`, or `search_npi_registry` |

## Files and images

Three capabilities return a **file** (`returnsFile`): `get_message_attachment`,
`download_billing_statement` and `download_document`. From the library you get a `FilePayload`
(`{ fileName, mimeType, bytes }` plus a few capability-specific fields). The CLI writes the file
into `--output <dir>` (default: the current directory). A repeat download gets a numeric suffix
rather than overwriting, and the CLI prints a JSON summary with the path.

`download_imaging_study` returns **raw CLO image data** (`rendersMedia`), which each client
decodes itself. The CLI writes one JPEG per image into `--output` (default `./imaging-output`).
The library hands you the bytes; see
[Imaging](api.md#imaging-and-clo-image-conversion).

## Family records (proxy access)

Some MyChart accounts can open more than one patient's chart, for example a parent reading a
child's. **Which chart MyChart returns is server-side session state.** There is no per-request
patient parameter. So every chart-reading capability first checks which record is active:

- With no `patient` argument, the call is about the **account holder**, and it refuses if MyChart
  is currently on someone else.
- With `patient: "Bart"` (a full or unambiguous partial name, or `me`), it refuses unless that
  record is active.
- A refusal tells you the exact `switch_proxy_target` call that fixes it. Reads never switch on
  their own.

`list_proxy_targets` and `switch_proxy_target` are exempt from the check, because they're how you
inspect and change the active record. The account-settings and public capabilities are exempt
too.

> [!IMPORTANT]
> This check runs in `runCapability` and in the CLI. The **typed `MyChartClient` methods**
> (`getMedications()` and the rest) call the scrapers directly and **do not check**. On an
> account with proxy access, call `client.assertProxyReadContext(patient)` first, or use
> `runCapability`.

## Every capability

The tables below are generated from the registry. The description is its first sentence.
`mychart-cli --list-capabilities --show-all` prints the full text and each argument's own
description.

### Profile

| Capability | What it does | Arguments | `MyChartClient` method |
| --- | --- | --- | --- |
| `get_profile` | Patient profile (name, date of birth, medical record number, primary care provider) plus the account email address. | — | `getProfile()` |
| `get_health_summary` | Health summary — vitals snapshot, blood type, smoking status and similar top-level facts. | — | `getHealthSummary()` |
| `get_medications` | Current medications with dosage, instructions, prescriber and pharmacy. | — | `getMedications()` |
| `get_allergies` | Known allergies with reaction and severity. | — | `getAllergies()` |
| `get_health_issues` | Active health issues / problem list. | — | `getHealthIssues()` |
| `get_vitals` | Vitals and tracked flowsheet readings (weight, blood pressure, heart rate, glucose, etc.). | — | `getVitals()` |
| `get_immunizations` | Vaccination history. | — | `getImmunizations()` |
| `get_preventive_care` | Preventive care recommendations — overdue and upcoming screenings. | — | `getPreventiveCare()` |
| `get_medical_history` | Past medical, surgical, family and social history. | — | `getMedicalHistory()` |
| `get_goals`<br>_less used_ | Care team goals and patient-set goals. | — | `getGoals()` |

### Visits

| Capability | What it does | Arguments | `MyChartClient` method |
| --- | --- | --- | --- |
| `get_upcoming_visits` | Upcoming appointments. | — | `upcomingVisits()` |
| `get_past_visits` | Every past visit MyChart holds, newest first. | — | `pastVisits()` |
| `get_visit_notes` | List the clinical notes (operative, progress, anesthesia, …) attached to a past visit. | `csn` | `getVisitNotes(csn)` |
| `get_note_content` | Fetch the rendered content of a single clinical note listed by get_visit_notes. | `csn`<br>`lrp_id`<br>`hno_id`<br>`hno_dat` | `getNoteContent({ csn, lrpId, hnoId, hnoDat })` |
| `get_visit_avs` | The After Visit Summary for a past visit. | `csn` | `getVisitAVS(csn)` |

### Results

| Capability | What it does | Arguments | `MyChartClient` method |
| --- | --- | --- | --- |
| `get_lab_results` | Lab results with reference ranges and prior values for trending. | — | `listLabResults()` |
| `get_imaging_results` | Imaging result metadata (X-ray, MRI, CT, ultrasound, …) with reports. | — | `getImagingResults()` |
| `download_imaging_study`<br><sub>alias: `get_xray_image`</sub> | Download every picture in one imaging study. | `image_id` _(optional)_<br>`imaging_index` _(optional)_<br>`study_name` _(optional)_ | `downloadImagingStudy(decodeImageId(imageId), name, dir)` |

### Messages

| Capability | What it does | Arguments | `MyChartClient` method |
| --- | --- | --- | --- |
| `get_messages` | Every conversation in the inbox: its id, subject, who it is with, when the latest message arrived, and whether it is unread, urgent or has attachments. | — | `listConversations()` |
| `get_message_thread` | Every message in one conversation: text, date, sender, and for each attachment its name and dcsId. | `conversation_id` | `getConversationMessages(conversationId)` |
| `get_message_attachment` | Download one file attached to a message — a PDF, photo or other document a provider or the patient attached. | `conversation_id`<br>`attachment_id` | `getMessageAttachment(conversationId, dcsId)` |
| `get_message_recipients` | Providers and departments that can receive a new message. | — | `getMessageRecipients(token)` |
| `get_message_topics`<br>_less used_ | Topics/categories a new message can be filed under. | — | `getMessageTopics(token)` |
| `send_message`<br>**writes** | Send a new message to a provider or department. | `recipient_name`<br>`topic` _(optional)_<br>`subject`<br>`message`<br>`attachments` _(optional)_ | `sendMessage(params)` |
| `send_reply`<br>**writes** | Reply in an existing conversation. | `conversation_id`<br>`message`<br>`attachments` _(optional)_ | `sendReply(params)` |
| `delete_message`<br>**writes** · _less used_ | Delete a message conversation from the inbox. | `conversation_id` | `deleteMessage(conversationId)` |

### Billing

| Capability | What it does | Arguments | `MyChartClient` method |
| --- | --- | --- | --- |
| `get_billing` | Billing history and account balances. | — | `getBillingHistory()` |
| `download_billing_statement` | Download one billing statement or itemized bill as the PDF MyChart serves for it. | `record_id` | `downloadBillingStatement(recordId)` |
| `get_insurance` | Insurance coverages on file: payer, plan, member and group numbers, effective dates. | — | `getInsurance()` |
| `get_insurance_benefits` | How much of the deductible and the out-of-pocket maximum has been used, how much is left, and when each resets. | — | `getInsuranceBenefits()` |
| `get_insurance_payers`<br>_less used_ | The insurance payers this organization's MyChart offers when adding a coverage — the organization's configured payer catalogue, the same for every patient on the instance. | — | `getInsurancePayers()` |

### Care

| Capability | What it does | Arguments | `MyChartClient` method |
| --- | --- | --- | --- |
| `get_care_team` | Providers on the care team, including outside providers, each with their role, specialty and NPI. | — | `getCareTeam()` |
| `get_referrals` | Active and past referrals. | — | `getReferrals()` |
| `get_letters`<br>_less used_ | Letters from providers. | — | `getLetters()` |
| `get_letter_details`<br>_less used_ | The full contents of one letter listed by get_letters. | `hno_id`<br>`csn` | `getLetterDetails(hnoId, csn)` |
| `get_documents` | Clinical documents and visit records. | — | `getDocuments()` |
| `download_document` | Download one Document Center document as the file MyChart serves for it — a PDF, an image (TIF/JPG/PNG) or an e-signed HTML document. | `document_id` | `downloadDocument(dcsID)` |
| `get_upcoming_orders` | Standing/upcoming orders — labs, imaging and procedures the care team has ordered. | — | `getUpcomingOrders()` |
| `get_questionnaires`<br>_less used_ | Open and completed questionnaires / health assessments. | — | `getQuestionnaires()` |
| `get_care_journeys`<br>_less used_ | Care journeys and care plans. | — | `getCareJourneys()` |
| `get_activity_feed`<br>_less used_ | Recent account activity feed items. | — | `getActivityFeed()` |
| `get_education_materials`<br>_less used_ | Patient education materials assigned by the care team. | — | `getEducationMaterials()` |
| `get_ehi_export`<br>_less used_ | Electronic Health Information export templates this instance offers. | — | `getEhiExportTemplates()` |
| `get_linked_accounts`<br>_less used_ | MyChart accounts at other organizations that are linked to this one. | — | `getLinkedMyChartAccounts()` |

### Emergency contacts

| Capability | What it does | Arguments | `MyChartClient` method |
| --- | --- | --- | --- |
| `get_emergency_contacts`<br>_less used_ | Emergency contacts on file. | — | `getEmergencyContacts()` |
| `add_emergency_contact`<br>**writes** · _less used_ | Add a new emergency contact to the record. | `name`<br>`relationship_type`<br>`phone_number` | `addEmergencyContact(input)` |
| `update_emergency_contact`<br>**writes** · _less used_ | Update an existing emergency contact. | `id`<br>`name` _(optional)_<br>`relationship_type` _(optional)_<br>`phone_number` _(optional)_ | `updateEmergencyContact(input)` |
| `remove_emergency_contact`<br>**writes** · _less used_ | Remove an emergency contact by id. | `id` | `removeEmergencyContact(id)` |

### Prescriptions

| Capability | What it does | Arguments | `MyChartClient` method |
| --- | --- | --- | --- |
| `request_refill`<br>**writes** · **not implemented** | Request a refill for a current medication. | `medication_name` _(optional)_<br>`medication_key` _(optional)_ | — |

### Patients

| Capability | What it does | Arguments | `MyChartClient` method |
| --- | --- | --- | --- |
| `list_proxy_targets`<br><sub>alias: `list_patients`, `get_active_patient`</sub> | List every patient record this MyChart account can access — the account holder plus any family members reachable via proxy access (a parent viewing a child's chart) — and which one is currently active. | — | `listProxyTargets()` |
| `switch_proxy_target`<br>**writes**<br><sub>alias: `switch_patient`</sub> | Switch which patient's record MyChart has active. Changes server-side state: every later read on the account returns the new record. Verified against the profile page. | `patient` | `switchToPatient(name)` |

### Account security

| Capability | What it does | Arguments | `MyChartClient` method |
| --- | --- | --- | --- |
| `register_passkey`<br>**account settings** · _less used_ | Register a passkey on this MyChart account so future logins skip the password and the 2FA prompt. | — | `setupPasskey()` |
| `list_passkeys`<br>**account settings** · _less used_ | List the passkeys registered on this MyChart account. | — | `listPasskeys()` |
| `delete_passkey`<br>**account settings** · _less used_ | Delete a passkey from the MyChart account by rawId, or every registered passkey when no id is given. | `raw_id` _(optional)_ | `deletePasskey(rawId)` |
| `setup_totp`<br>**account settings** · _less used_ | Turn on authenticator-app (TOTP) two-factor authentication and store the secret locally so future logins can generate their own codes. | — | `setupTotp(password)` |
| `disable_totp`<br>**account settings** · _less used_ | Turn off authenticator-app (TOTP) two-factor authentication on this MyChart account. | — | `disableTotp(password, secret)` |

### Providers

| Capability | What it does | Arguments | `MyChartClient` method |
| --- | --- | --- | --- |
| `lookup_npi`<br>no account needed | Look up a US healthcare provider by National Provider Identifier — the 10-digit number MyChart, Medicare and insurers use to name a clinician or organization. | `npi` | `MyChartClient.lookupNpi(npi)` |
| `search_npi_registry`<br>no account needed | Find US healthcare providers by name, specialty and/or place in CMS's public NPI Registry — the way to turn a provider name from a chart into an NPI, an address and a specialty. | `first_name` _(optional)_<br>`last_name` _(optional)_<br>`organization_name` _(optional)_<br>`specialty` _(optional)_<br>`city` _(optional)_<br>`state` _(optional)_<br>`postal_code` _(optional)_<br>`type` _(optional)_<br>`limit` _(optional)_<br>`skip` _(optional)_ | `MyChartClient.searchNpiRegistry(query)` |

### Directory

| Capability | What it does | Arguments | `MyChartClient` method |
| --- | --- | --- | --- |
| `search_mycharts`<br>no account needed | Look up a MyChart hostname for setup. | `query`<br>`limit` _(optional)_ | `MyChartClient.searchMyCharts(query)` |

### Not in the registry yet: hospital info

The CLI has one more account-free action that isn't a registry entry:

```bash
mychart-cli --host mychart.example.org --action hospital-info
```

It prints what a MyChart instance publishes to anyone about the health system behind it: support
phone lines and email, the "Find a Doctor" provider directory with clinic addresses, billing
entities and their customer-service lines, and the portal's feature flags.
`--arg specialties=a,b` limits the provider crawl, which can run 0.6–2 MB of JSON per specialty.
`--arg providers=false` or `--arg billing=false` skips a section. The library function is
`fetchHospitalNetworkProfile(hostname, options)`.
