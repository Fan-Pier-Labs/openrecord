# Library API reference

`mychart-cli` is also a library. Import it and you get the same scraper engine the CLI, the
Claude Desktop extension and the mobile app run on, with full TypeScript types.

```ts
import { MyChartClient } from 'mychart-cli';
```

It ships ESM and CommonJS builds with `.d.ts` for both, and needs Node 18 or newer (Bun works
too). Everything runs in your process, and requests go straight from your machine to the MyChart
portal.

- [Choosing an entry point](#choosing-an-entry-point)
- [`MyChartClient`](#mychartclient)
  - [Connecting](#connecting) · [Session lifecycle](#session-lifecycle) ·
    [Running capabilities by id](#running-capabilities-by-id)
  - [Typed methods](#typed-methods) · [Family records](#family-records) ·
    [Account security](#account-security)
  - [Public lookups](#public-lookups-no-account)
- [Errors](#errors)
- [Imaging and CLO image conversion](#imaging-and-clo-image-conversion)
- [Lower level: raw scraper functions](#lower-level-raw-scraper-functions)
- [Raw responses and processors](#raw-responses-and-processors)
- [The capability registry](#the-capability-registry)
- [Public health-system information](#public-health-system-information)
- [Directories: MyChart instances and the NPI Registry](#directories-mychart-instances-and-the-npi-registry)

## Choosing an entry point

| You want to… | Use |
| --- | --- |
| Read and act on one account from your own code | **`MyChartClient`** and its typed methods |
| Dispatch on a capability name you were handed (an AI tool call, a queue message, a CLI arg) | `client.runCapability(id, args)` |
| Build your own tool layer covering exactly what OpenRecord supports | `CAPABILITIES` + `executeCapability` |
| Total control of the request flow | The raw scraper functions with a `MyChartRequest` |
| Look up public data with no account | `MyChartClient.searchMyCharts` / `lookupNpi` / `searchNpiRegistry` |

## `MyChartClient`

A `MyChartClient` owns one signed-in MyChart session. It handles four things:

- **Keepalive.** While the client is open, it pings MyChart's keepalive endpoints every 30
  seconds, like the official web client. The timer is `unref`'d, so it never keeps your process
  alive on its own.
- **Silent renewal.** If the session expires mid-call, the client signs in again with the
  credentials you connected with, restores the active family-member record, and retries the call
  once.
- **Cookies and headers.** It keeps the cookie jar, CSRF tokens and browser-like headers MyChart
  expects.
- **Politeness.** At most 10 requests are in flight to one portal at a time, and each request
  has a 2-minute deadline.

You can't `new` a client. Use one of the factories below.

### Connecting

```ts
class MyChartClient {
  static connect(args: ConnectArgs): Promise<ConnectResult>;
  static connectWithPasskey(args: MyChartClientOptions & { credential: PasskeyCredential }): Promise<ConnectResult>;
  static fromSerialized(json: string, opts?: { keepalive?: boolean }): Promise<MyChartClient | null>;
  static totpCode(secret: string): Promise<string>;
}

interface MyChartClientOptions {
  hostname: string;               // e.g. 'mychart.example.org'
  protocol?: 'http' | 'https';    // default 'https'; 'http' is picked automatically for localhost / dotless hosts
  keepalive?: boolean;            // default true
  autoRenew?: boolean;            // default true — silent re-login on expiry
}

interface ConnectArgs extends MyChartClientOptions {
  user: string;
  pass: string;
  skipSendCode?: boolean;         // don't ask MyChart to send an email/SMS code (use with TOTP)
  totpSecret?: string;            // lets a silent re-login answer 2FA by itself
}

type ConnectResult =
  | { state: 'connected'; client: MyChartClient }
  | PendingTwoFa
  | { state: 'invalid_login'; error?: string }
  | { state: 'error'; error?: string };

interface PendingTwoFa {
  state: 'need_2fa';
  delivery?: { method: 'email' | 'sms'; contact?: string };  // where the code went (masked)
  sentAt?: number;                                            // epoch ms
  complete(code: string, opts?: { isTOTP?: boolean }): Promise<MyChartClient>;  // throws on a bad code
}
```

**Username and password.** Handle all four `state`s:

```ts
const result = await MyChartClient.connect({ hostname, user, pass });

if (result.state === 'invalid_login') throw new Error('Wrong username or password');
if (result.state === 'error') throw new Error(result.error);

const client =
  result.state === 'connected'
    ? result.client
    : await result.complete(await askUserForCode(result.delivery));
```

`complete()` throws on a rejected code, and the pending session stays usable, so you can call
`complete()` again with a corrected code. It never asks MyChart to send a new one.

**TOTP (authenticator app).** If you hold the account's TOTP secret, no human is needed:

```ts
const result = await MyChartClient.connect({ hostname, user, pass, totpSecret, skipSendCode: true });
const client = result.state === 'connected'
  ? result.client
  : result.state === 'need_2fa'
    ? await result.complete(await MyChartClient.totpCode(totpSecret), { isTOTP: true })
    : null;
```

**Passkey.** Passkeys skip 2FA entirely and are the recommended choice for anything unattended.
**The credential changes on every login and must be saved back.** See
[authentication](authentication.md#passkeys).

```ts
import { MyChartClient, deserializeCredential, serializeCredential } from 'mychart-cli';
import * as fs from 'node:fs/promises';

const file = '.passkey-credentials/mychart.example.org.json';
const credential = deserializeCredential(await fs.readFile(file, 'utf8'));

const result = await MyChartClient.connectWithPasskey({ hostname: 'mychart.example.org', credential });
await fs.writeFile(file, serializeCredential(credential));   // save the advanced signCount — always
if (result.state !== 'connected') throw new Error(`passkey login: ${result.state}`);
const client = result.client;
```

A silent re-login during the session advances the counter again, in place on the same
`credential` object, so save it once more when you're done.

**Restoring a saved session.** `fromSerialized` revives a session saved with `serialize()`
without logging in. It has no credentials to renew with, so an expired session throws
`SessionExpiredError`. Check it first:

```ts
const client = await MyChartClient.fromSerialized(json);   // null if the JSON is malformed
if (!client || !(await client.isSessionValid())) { /* connect again */ }
```

### Session lifecycle

| Member | Returns | Notes |
| --- | --- | --- |
| `client.serialize()` | `Promise<string>` | The session (cookies and host) as JSON. **Treat it like a password** |
| `client.isSessionValid()` | `Promise<boolean>` | One cheap round-trip to MyChart |
| `client.close()` | `void` | Stops keepalive. Any later call throws. Idempotent |
| `client.request` | `MyChartRequest` | The underlying session, for the [raw scraper functions](#lower-level-raw-scraper-functions) |

Always `close()` a client you're finished with. MyChart sessions time out after roughly 15 minutes
of inactivity, and an open client keeps its session alive.

### Running capabilities by id

```ts
client.runCapability(id: string, args?: Record<string, unknown>, ctx?: CapabilityContext): Promise<unknown>;
MyChartClient.capabilities(): readonly Capability[];
```

`runCapability` runs any id from the [capability list](capabilities.md), using the registry's
snake_case argument names, and checks [whose chart is active](#family-records) before every
chart read. It is how the CLI, the extension and the app dispatch.

```ts
const visits  = await client.runCapability('get_past_visits');
const notes   = await client.runCapability('get_visit_notes', { csn: '123456789' });
const summary = await client.runCapability('get_lab_results', { mode: 'concise' });  // markdown string
const kid     = await client.runCapability('get_immunizations', { patient: 'Bart' });
```

- `mode` is `'json'` (the default: the standard object), `'standard'` or `'concise'` (markdown
  strings), or `'raw'` (MyChart's own response). See
  [output modes](capabilities.md#output-modes).
- `ctx` matters only to the account-security capabilities. It carries the account password and
  callbacks to persist a new TOTP secret or passkey. For `send_message`/`send_reply` attachments,
  `ctx.readFile` turns a path into bytes.
- The result is typed `unknown`. For typed results, use the matching method below.
- A capability marked not implemented (today, `request_refill`) resolves to a sentence explaining
  why, rather than throwing.

### Typed methods

Every method returns the capability's **standard object**, which is the same thing
`runCapability(id)` returns in `json` mode. Types are exported under the names shown.

> [!IMPORTANT]
> Typed methods call the scrapers directly and **don't check which family member's record is
> active**. On an account with proxy access, call `await client.assertProxyReadContext()` (or
> `assertProxyReadContext('Bart')`) first, or use `runCapability`.

**Profile and health record**

| Method | Returns | Capability |
| --- | --- | --- |
| `getProfile()` | `ProfileData \| null`: `{ name, dob, mrn, pcp }` | `get_profile` (which also adds the email) |
| `getEmail()` | `string \| null` | — |
| `getHealthSummary()` | `HealthSummaryStandard` | `get_health_summary` |
| `getVitals()` | `VitalsStandard` (flowsheets of readings) | `get_vitals` |
| `getMedications()` | `MedicationsStandard`: `{ prescriptions[], prescriptionLists[] }` | `get_medications` |
| `getAllergies()` | `AllergiesStandard` | `get_allergies` |
| `getHealthIssues()` | `HealthIssuesStandard` | `get_health_issues` |
| `getMedicalHistory()` | `MedicalHistoryStandard` (medical, surgical, family, social) | `get_medical_history` |
| `getImmunizations()` | `ImmunizationsStandard` | `get_immunizations` |
| `getPreventiveCare()` | `PreventiveCareStandard` | `get_preventive_care` |
| `getGoals()` | `GoalsStandard` | `get_goals` |

**Results**

| Method | Returns | Capability |
| --- | --- | --- |
| `listLabResults()` | `LabResultsStandard`: `{ orders[] }`, each with `results[]` and `historicalResults` for trending | `get_lab_results` |
| `getImagingResults()` | `ImagingResultsStandard`: `{ orders[] }`, each with `image_id` when it has pictures | `get_imaging_results` |
| `downloadImagingStudy(fdiContext, studyName, outputDir, opts?)` | `DirectDownloadResult` | `download_imaging_study`. See [imaging](#imaging-and-clo-image-conversion) |

**Visits and notes**

| Method | Returns | Capability |
| --- | --- | --- |
| `upcomingVisits()` | `UpcomingVisitsStandard \| null` | `get_upcoming_visits` |
| `pastVisits()` | `PastVisitsStandard \| null`: `{ count, hasOlderVisits, visits[] }` | `get_past_visits` |
| `getVisitNotes(csn)` | `VisitNotesStandard \| null` | `get_visit_notes` |
| `getNoteContent({ csn, lrpId, hnoId, hnoDat })` | `NoteContentStandard \| null` (`reportContentText`) | `get_note_content` |
| `getVisitAVS(csn)` | `NoteContentStandard \| null` | `get_visit_avs` |

**Messages**

| Method | Returns | Capability |
| --- | --- | --- |
| `listConversations()` | `ConversationsStandard`: `{ conversations[] }`, each keyed by `hthId` | `get_messages` |
| `getConversationMessages(conversationId)` | `ConversationThreadStandard \| null` | `get_message_thread` |
| `getMessageAttachment(conversationId, dcsId)` | `MessageAttachmentFile` (`{ fileName, mimeType, bytes, … }`) | `get_message_attachment` |
| `getMessageRecipients(token)` / `getMessageTopics(token)` | `MessageRecipient[]` / `MessageTopic[]` | `get_message_recipients` / `get_message_topics` |
| `sendMessage({ recipient, topic, subject, messageBody, attachments? })` | `{ success, conversationId?, error? }` | `send_message` |
| `sendReply({ conversationId, messageBody, attachments? })` | `{ success, conversationId?, error? }` | `send_reply` |
| `deleteMessage(conversationId)` | `{ success, error? }` | `delete_message` |

`getMessageRecipients` and `getMessageTopics` need a verification token from the compose page:

```ts
import { getVerificationToken, resolveRecipient, resolveTopic } from 'mychart-cli';

const token = await getVerificationToken(client.request);
const recipient = resolveRecipient(await client.getMessageRecipients(token!), 'Dr. Example'); // throws if ambiguous
const { topic } = resolveTopic(await client.getMessageTopics(token!), 'Medical Question');
await client.sendMessage({ recipient, topic, subject: 'Question', messageBody: 'Hi — …' });
```

`runCapability('send_message', { recipient_name, subject, message, topic? })` does those steps for
you. Attachments are `FilePayload`s (`{ fileName, mimeType, bytes }`). The portal's own type, size
and count limits are checked before anything is sent.

**Billing and insurance**

| Method | Returns | Capability |
| --- | --- | --- |
| `getBillingHistory()` | `BillingStandard`: `{ totalDue, accounts[] }` | `get_billing` |
| `downloadBillingStatement(recordId)` | `BillingStatementPdf` (PDF bytes plus `statement` details) | `download_billing_statement` |
| `getInsurance()` | `InsuranceStandard` | `get_insurance` |
| `getInsuranceBenefits()` | `InsuranceBenefitsStandard` (deductible and out-of-pocket progress) | `get_insurance_benefits` |
| `getInsurancePayers()` | `InsurancePayersStandard` (the organization's payer catalogue) | `get_insurance_payers` |

**Care coordination**

| Method | Returns | Capability |
| --- | --- | --- |
| `getCareTeam()` | `CareTeamStandard` | `get_care_team` |
| `getReferrals()` | `ReferralsStandard` | `get_referrals` |
| `getDocuments()` / `downloadDocument(dcsID)` | `DocumentsStandard` / `DocumentFile` | `get_documents` / `download_document` |
| `getLetters()` / `getLetterDetails(hnoId, csn)` | `LettersStandard` / `LetterDetailsStandard \| null` | `get_letters` / `get_letter_details` |
| `getUpcomingOrders()` | `UpcomingOrdersStandard` | `get_upcoming_orders` |
| `getQuestionnaires()` | `QuestionnairesStandard` | `get_questionnaires` |
| `getCareJourneys()` | `CareJourneysStandard` | `get_care_journeys` |
| `getActivityFeed()` | `ActivityFeedStandard` | `get_activity_feed` |
| `getEducationMaterials()` | `EducationMaterialsStandard` | `get_education_materials` |
| `getLinkedMyChartAccounts()` | `LinkedAccountsStandard` | `get_linked_accounts` |
| `getEhiExportTemplates()` | `EhiExportStandard` | `get_ehi_export` |

**Emergency contacts**

| Method | Returns | Capability |
| --- | --- | --- |
| `getEmergencyContacts()` | `EmergencyContactsStandard` | `get_emergency_contacts` |
| `addEmergencyContact({ name, relationshipType, phoneNumber })` | `{ success, error? }` | `add_emergency_contact` |
| `updateEmergencyContact({ id, name?, relationshipType?, phoneNumber? })` | `{ success, error? }` | `update_emergency_contact` |
| `removeEmergencyContact(id)` | `{ success, error? }` | `remove_emergency_contact` |

There is no refill method. Refill requests are declared but not implemented, because the request
has never been confirmed to reach a real pharmacy. See the [changelog](../CHANGELOG.md).

### Family records

Some accounts can open a family member's chart. MyChart keeps **which record is active on the
server**, and every read returns that record.

| Method | Returns |
| --- | --- |
| `listProxyTargets()` | `{ count, patients[], active_patient, profile_name, message }`. `count: 0` means no proxy access |
| `switchToPatient(name)` | `{ switched_to, is_self, verified_profile_name, verified_dob, message }`. Pass `'me'` to go back |
| `assertProxyReadContext(patient?)` | Resolves if the active record is `patient` (default: the account holder). Throws with the fix if not |
| `discoverProxyTargets()` | `ProxyTarget[]`, the lower-level list: `{ id, displayName, isSelf, isSelected, selectionKnown, … }` |
| `switchProxyTarget({ id } \| { displayName })` | Lower-level switch, verified against the profile page |
| `verifyActiveProxyTarget()` | What the profile page says is active |

```ts
await client.switchToPatient('Bart');
await client.assertProxyReadContext('Bart');
const shots = await client.getImmunizations();
await client.switchToPatient('me');
```

Things worth knowing:

- A `ProxyTarget.id` is a long opaque string that is only meaningful on one portal. Never build or
  parse one. Match on names, or use `isSelf` for the account holder.
- `isSelected` is only meaningful when `selectionKnown` is `true`. Some portals list the records
  without saying which one is active.
- The switch persists in the session, and it survives `serialize()`. Switch back when you're done.

### Account security

These change how the MyChart account signs in. The library **stores nothing**. Persisting what
they return (the passkey, the TOTP secret) is up to you.

| Method | Returns |
| --- | --- |
| `setupPasskey()` | `PasskeyCredential \| null`. Save it with `serializeCredential` |
| `listPasskeys()` | `unknown[] \| null`, the passkeys MyChart reports |
| `deletePasskey(rawId)` | `boolean` |
| `setupTotp(password)` | `{ secret: string \| null, error? }` |
| `disableTotp(password, totpSecret)` | `boolean` |
| `MyChartClient.totpCode(secret)` | `Promise<string>`, the current 6-digit code |

### Public lookups (no account)

These are `static`, because no session is involved.

```ts
const { source, matches } = await MyChartClient.searchMyCharts('uchealth', { limit: 5 });
// matches[]: { hostname, name, loginUrl, logoUrl, aliases, unavailable? }

const provider = await MyChartClient.lookupNpi('1234567893');          // null if nobody holds that NPI
const found = await MyChartClient.searchNpiRegistry({ lastName: 'Smith', state: 'MA', specialty: 'Cardiology' });

await MyChartClient.runPublicCapability('lookup_npi', { npi: '1234567893' });  // by id
```

- `searchMyCharts` asks Epic's live directory and falls back to a list bundled in the package.
  `source` says which one answered. An entry with `unavailable` can't be connected right now, so
  show that message instead.
- The NPI Registry reports a refused query as **data, not an exception**:
  `{ Errors: [{ description }] }`. Narrow with `isNpiRegistryErrors(result)`.
- `runPublicCapability` throws if you pass it a chart capability's id.

## Errors

| Error | Thrown when |
| --- | --- |
| `SessionExpiredError` | The session expired and couldn't be renewed: `autoRenew: false`, a client from `fromSerialized`, or the renewal sign-in failed |
| `MyChartResponseError` | MyChart answered with something the scraper can't use. Has `method`, `path`, `status` |
| `BillingNotFullyLoadedError` | MyChart paged out charge rows it then wouldn't return. Rather than report a too-low balance, billing reads fail. Retry later |
| `PreloginEndpointError` | A public health-system endpoint failed. Has `path`, `status` |
| `Error` named `MissingVerificationTokenError` | A page didn't carry its CSRF token, usually an expired session or a feature the portal doesn't offer. Check `err.name` |
| Plain `Error` | An active-patient mismatch (the message includes the switch to run), an unknown capability id, missing arguments, or `MyChartClient has been closed` |

All of these error classes are exported except `MissingVerificationTokenError`.

## Imaging and CLO image conversion

MyChart serves imaging through Epic's eUnity viewer as **CLO** files, a compressed pixel format.
Downloading a study and turning it into pictures takes three steps:

```ts
import { decodeImageId, convertCloToBitmap16, convertBitmap16ToPng } from 'mychart-cli';

const { orders } = await client.getImagingResults();
const study = orders.find((o) => o.image_id);
if (study) {
  const result = await client.downloadImagingStudy(
    decodeImageId(study.image_id!),     // image_id → the eUnity context
    study.orderName ?? 'study',
    './imaging',                        // used only if files are written
    { skipFileWrite: true },            // keep pixel data in memory
  );
  for (const [i, image] of result.images.entries()) {
    if (!image.pixelData) continue;
    const bitmap = convertCloToBitmap16(image.pixelData, image.wrapperData);  // windowing applied
    await convertBitmap16ToPng(bitmap, {}, `./imaging/${i}.png`);
  }
  console.log(result.errors);           // per-image failures; the rest still downloaded
}
```

`runCapability('download_imaging_study', { image_id })` returns a `StudyImagePayload` with the raw
`pixelData`/`wrapperData` per image, ready for the same conversion.

Decoding:

| Function | Result |
| --- | --- |
| `convertCloToBitmap16(pixel, wrapper?)` | `Bitmap16`, 16-bit, with the study's VOI window applied |
| `convertCloToBitmap(pixel, wrapper?)` | `Bitmap`, 8-bit grayscale |
| `parseWrapper`, `applyVoiLut`, `to8bit`, `to16bit` | The pieces, for your own windowing |

Encoding (from `sharp`, except the pure-JS ones):

| Function | Output |
| --- | --- |
| `convertBitmap16ToPng(b, opts?, path?)` | PNG, 16-bit grayscale supported |
| `convertBitmap16ToJpg(b, opts?, path?)` / `convertBitmapToJpg(b, path?)` | JPEG |
| `convertBitmap16ToWebp(b, path?)` / `convertBitmapToWebp(b, path?)` | Lossless WebP |
| `convertBitmap16ToTiff(b, opts?, path?)` | TIFF |
| `convertBitmap16ToAvif(b, opts?, path?)` | AVIF (8-bit with the prebuilt `sharp`) |
| `convertCloToJpgPureJs(pixel, wrapper?)` / `convertBitmapToJpgPureJs(b)` | JPEG with no native dependency, as a `PureJsJpeg` |

The `sharp`-based encoders return a `Buffer` and also write to `path` when you give one.

## Lower level: raw scraper functions

Every scraper is also exported as a plain function whose first argument is a `MyChartRequest`.
Use them when the class doesn't fit your control flow, for example when you manage sessions
yourself.

```ts
import { myChartUserPassLogin, complete2faFlow, getMedications, listLabResults } from 'mychart-cli';

let login = await myChartUserPassLogin({ hostname, user, pass });
if (login.state === 'need_2fa') {
  const done = await complete2faFlow({ mychartRequest: login.mychartRequest, code });
  if (done.state !== 'logged_in') throw new Error(done.state);   // 'invalid_2fa' | 'error'
}
if (login.state === 'invalid_login' || login.state === 'error') throw new Error(login.error);

const req = login.mychartRequest;
const meds = await getMedications(req);
```

| Area | Functions |
| --- | --- |
| Sign-in | `myChartUserPassLogin`, `myChartPasskeyLogin`, `complete2faFlow`, `areCookiesValid`, `parse2faDeliveryMethods` |
| Sessions | `MyChartRequest` (`serialize()`, `MyChartRequest.unserialize(json)`), `makeAuthenticatedRequest`, `silentLogin`, `wireSilentReauthentication`, `renewMyChartSession` |
| Passkeys | `setupPasskey`, `listPasskeys`, `deletePasskey`, `serializeCredential`, `deserializeCredential` |
| TOTP | `setupTotp`, `disableTotp`, `generateTotpCode(secret, timestamp?)`, `parseTotpUri(uri)` |
| Profile and proxy | `getMyChartProfile`, `getProfile`, `getEmail`, `discoverProxyTargets`, `switchProxyTarget`, `verifyActiveProxyTarget`, `compareProfileNames` |
| Chart reads | `getHealthSummary`, `getVitals`, `getMedications`, `getAllergies`, `getHealthIssues`, `getMedicalHistory`, `getImmunizations`, `listLabResults`, `getImagingResults`, `upcomingVisits`, `pastVisits`, `getVisitNotes`, `getNoteContent`, `getVisitAVS`, `getBillingHistory`, `getCareTeam`, `getReferrals`, `getInsurance`, `getInsuranceBenefits`, `getInsurancePayers`, `getDocuments`, `getGoals`, `getCareJourneys`, `getUpcomingOrders`, `getPreventiveCare`, `getEducationMaterials`, `getQuestionnaires`, `getActivityFeed`, `getLetters`, `getLetterDetails`, `getEmergencyContacts`, `getLinkedMyChartAccounts`, `getEhiExportTemplates` |
| Messages | `listConversations`, `getConversationMessages`, `downloadMessageAttachment`, `getVerificationToken`, `getMessageRecipients`, `getMessageTopics`, `listMessageRecipients`, `listMessageTopics`, `sendNewMessage`, `sendReply`, `deleteMessage` |
| Files | `downloadBillingStatement`, `downloadImagingStudyDirect` |
| Writes | `addEmergencyContact`, `updateEmergencyContact`, `removeEmergencyContact` |

Two rules carry over from the client:

- **Save the passkey after `myChartPasskeyLogin`.** It advances `credential.signCount` in place
  and doesn't persist it. A stale counter makes the next login fail. See
  [authentication](authentication.md#signcount-must-be-saved-after-every-login).
- **Raw scrapers don't check the active patient.** Call `assertProxyReadContext` yourself on a
  proxy account, or use `executeCapability`.

## Raw responses and processors

Each read is split in two. A `fetch…Raw(request)` function records every request it makes into a
`RawResponse` envelope and never edits a field. Its **processor** then turns the envelope into
what you see:

```ts
import { fetchMedicationsRaw, medicationsProcessor } from 'mychart-cli';

const raw = await fetchMedicationsRaw(client.request);          // keep this if you want to re-project later
const standard = medicationsProcessor.standard(raw);           // = getMedications()
const concise = medicationsProcessor.concise(standard);        // the model-facing subset
```

Every read has the pair, for example `fetchLabResultsRaw` / `labResultsProcessor` and
`fetchPastVisitsRaw` / `pastVisitsProcessor`. The standard object uses **MyChart's own field
names and casing**. Derived fields get new names (`bodyText`, `instantISO`, `organizationName`),
and HTML only appears in `raw`. No field is dropped for being empty. The reasoning and each
capability's field contract are in
[`docs/processor-layer-proposal.md`](../../docs/processor-layer-proposal.md).

## The capability registry

The registry is exported so you can build a tool layer that covers exactly what OpenRecord
supports. For example, you can expose every capability to your own AI agent:

```ts
import { AGENT_CAPABILITIES, executeCapability, describeCapability } from 'mychart-cli';

const tools = AGENT_CAPABILITIES.map((c) => ({
  name: c.id,
  description: c.description,
  parameters: c.params,        // { name, type, description, required?, min?, max? }[]
  readOnly: c.kind === 'read' || c.kind === 'public',
}));

// When the model calls a tool:
const output = await executeCapability(client.request, call.name, { ...call.args, mode: 'concise' });
```

| Export | What it is |
| --- | --- |
| `CAPABILITIES`, `CAPABILITY_IDS` | Every capability, in registry order |
| `AGENT_CAPABILITIES` | Everything except account-settings ones, i.e. what's safe to offer a model |
| `PUBLIC_CAPABILITIES`, `PUBLIC_CAPABILITY_IDS` | The account-free lookups |
| `WRITE_CAPABILITY_IDS` | Capabilities that change the record. Confirm these with a human |
| `getCapability(idOrAlias)`, `capabilitiesByGroup(list?)`, `describeCapability(c)` | Lookups and help text |
| `executeCapability(request \| null, id, args, ctx?)` | The single dispatch path, including the active-patient check. `null` request is for public ones |
| `acceptsPatientParam(c)`, `isPublicCapability(c)`, `PATIENT_PARAM` | Which extra parameters apply |
| `encodeImageId`, `decodeImageId` | `image_id` ⇄ eUnity context |
| `resolveRecipient`, `resolveTopic`, `resolveUnique` | Name matching that refuses to guess |

A `Capability` is `{ id, aliases?, title, description, kind, group, params, lessFrequentlyUsed?,
notImplemented?, rendersMedia?, returnsFile? }`, where `kind` is `'read' | 'write' | 'account' |
'public'`.

## Public health-system information

These describe what a portal shows anyone, with no login: support lines, the bookable provider
directory, open appointment slots and billing entities.

```ts
import { fetchHospitalNetworkProfile, fetchProviderDirectory, MyChartRequest } from 'mychart-cli';

const profile = await fetchHospitalNetworkProfile('mychart.example.org', { includeBilling: false });

// The finer-grained functions take a MyChartRequest that has never signed in:
const directory = await fetchProviderDirectory(new MyChartRequest('mychart.example.org'));
```

| Function | Returns |
| --- | --- |
| `fetchHospitalNetworkProfile(hostname, opts?)` | Everything below in one `HospitalNetworkProfile`: support lines, providers, billing entities, portal features. `opts`: `includeProviders`, `includeBilling`, `specialties`, `maxSpecialties` |
| `fetchProviderDirectory(request, opts?)` | Providers with clinics, addresses and phone numbers |
| `fetchBillingEntities(request)` | Billing organizations and their customer-service lines |
| `fetchOpenSlots(request, opts?)`, `fetchProviderAvailability`, `windowDates` | Open-scheduling availability, where the portal offers it |
| `fetchSchedulingQuestionnaire`, `submitSchedulingAnswers` | The open-scheduling questionnaire |

Behaviour and the portal quirks behind each one are documented in
[`scrapers/myChart/prelogin/README.md`](../../scrapers/myChart/prelogin/README.md).

## Directories: MyChart instances and the NPI Registry

Beyond the static helpers on `MyChartClient`:

| Function | Purpose |
| --- | --- |
| `searchMyChartDirectory(query, opts?)` | What `MyChartClient.searchMyCharts` calls. Results are cached for `DIRECTORY_CACHE_TTL_MS` |
| `fetchMyChartDirectory()`, `rankDirectoryMatches`, `clearDirectoryCache` | The full directory and the ranking |
| `listMyCharts()` | The checked-in directory with every correction and addition applied. No request; what search falls back to |
| `withFixes(list)` | Apply those corrections and additions to a list you fetched yourself |
| `SANDBOX_INSTANCE` | The fake-mychart sandbox entry, for testing a setup flow |
| `lookupNpi`, `searchNpiRegistry`, `isValidNpi`, `buildNpiSearchUrl` | CMS NPI Registry |
| `fetchNpiLookupRaw`, `fetchNpiSearchRaw`, `npiLookupProcessor`, `npiSearchProcessor` | The raw/processor split for NPI |
