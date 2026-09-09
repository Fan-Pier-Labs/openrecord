# `messages`

The communication center: the inbox, a whole thread, who can be written to and about what,
and the write side — new messages, replies, drafts and deletes.

| | |
| --- | --- |
| **Capabilities** | `get_messages` · `get_message_thread` · `get_message_attachment` · `get_message_recipients` · `get_message_topics` (reads) · `send_message` · `send_reply` · `delete_message` (writes) |
| **Source** | [`conversations.ts`](conversations.ts) · [`messageThreads.ts`](messageThreads.ts) · [`messageAttachment.ts`](messageAttachment.ts) · [`recipients.ts`](recipients.ts) · [`sendMessage.ts`](sendMessage.ts) · [`sendReply.ts`](sendReply.ts) · [`messageDrafts.ts`](messageDrafts.ts) · [`deleteMessage.ts`](deleteMessage.ts) · [`communicationCenterToken.ts`](communicationCenterToken.ts) |
| **Activity** | React `/app/communication-center` |

## Endpoints

Two areas, and **they are not interchangeable**: reading and replying live under
`/api/conversations/`, and composing a *new* message lives under
`/api/medicaladvicerequests/`.

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /app/communication-center` | — | the `__RequestVerificationToken` every call below needs |
| `POST /api/conversations/GetConversationList` | `{ tag: 1, localLoadParams: { loadStartInstantISO, loadEndInstantISO: '', pagingInfo }, externalLoadParams: {}, searchQuery: '', PageNonce: '' }` | the inbox, 50 threads per page |
| `POST /api/documents/viewer/GetDocumentDetailsLegacy` | `{ dcsId, fileExtension, organizationId, useOldMobileLink: false }` | where an attachment's file is — `downloadUrl`, `mimeType`, `allowPreview` |
| `GET /Documents/ViewDocument/Download?dcsid=…&displayName=…&dcsExt=…` | — | the attachment's bytes (the `downloadUrl` above, mount-relative) |
| `POST /api/conversations/GetConversationDetails` | `{ id, maxReadMessages, PageNonce }` | one thread — the seed page, plus subject and name maps |
| `POST /api/conversations/GetConversationMessages` | `{ id, startInstantISO?, maxReadMessages, PageNonce }` | older pages of that thread |
| `POST /api/medicaladvicerequests/GetMedicalAdviceRequestRecipients` | `{ organizationId }` | who can be written to |
| `POST /api/medicaladvicerequests/GetSubtopics` | `{ organizationId }` | what about (`topicList[]`) |
| `POST /api/medicaladvicerequests/GetViewers` | `{ organizationId }` | the patient's own `wprId` |
| `POST /api/conversations/GetComposeId` | `{}` | a compose id (a bare JSON string) |
| `POST /api/medicaladvicerequests/SendMedicalAdviceRequest` | see below | send a new message |
| `POST /api/conversations/SendReply` | `{ conversationId, organizationId, viewers, messageBody, documentIds, includeOtherViewers, composeId }` | reply |
| `POST /api/conversations/RemoveComposeId` | `{ composeId }` | cleanup after a send |
| `POST /api/conversations/DeleteConversation` | `{ conversationId }` | delete |
| `POST /api/medicaladvicerequests/SaveMedicalAdviceRequestDraft` · `POST /api/conversations/SaveReplyDraft` · `POST /api/conversations/DeleteDraft` | — | drafts |

The send body:

```jsonc
{
  "recipient": { "recipientType": 1, "displayName": "…", "userId": "WP-…",
                 "poolId": "", "providerId": "WP-…", "departmentId": "", "oocContext": 0 },
  "topic":     { "title": "Help with Booking an Appointment", "value": "12" },
  "conversationId": "", "organizationId": "",
  "viewers": [{ "wprId": "WP-…" }],
  "messageBody": ["the message text"],     // an ARRAY of strings, never a string
  "messageSubject": "the subject line",
  "documentIds": [], "includeOtherViewers": false,
  "composeId": "WP-…"
}
```

`sendNewMessage` is **five requests**: token → `GetViewers` (for the patient's `wprId`) →
`GetComposeId` → `SendMedicalAdviceRequest` → `RemoveComposeId`. The recipient and topic it
posts come from `GetMedicalAdviceRequestRecipients` and `GetSubtopics`, which the capability
resolves by name first. `sendReply` is the same five without a recipient or topic.

Ids throughout are Epic's `WP-`-prefixed opaque strings.

The three reads are meant to be called in sequence: `get_messages` is the list of threads
(id, subject, who, when, flags — never the messages), `get_message_thread` is every message
of one thread with each attachment's `dcsId`, and `get_message_attachment` is one
attachment's bytes, by the thread's `hthId` and the attachment's `dcsId`.

## Notes and research

- **The inbox is paged, 50 threads at a time.** The first request sends
  `localLoadParams: { loadStartInstantISO: '', loadEndInstantISO: '', pagingInfo: 1 }`;
  `localSummary.hasMoreConversations` says whether older threads exist, and the portal's
  own load-more re-posts with `loadStartInstantISO` set to the page's
  `oldestLoadedInstantISO` and `pagingInfo` to the page's `pagingInfo` (`0` after the first
  page). Threads come newest-first. Measured on the one live instance with more than 50
  threads (a page of 50, then the remainder, no overlap); the other three fit in one page.
  `fetchConversationsRaw` walks every page, bounded by `MAX_PAGES = 40`, and the processor
  merges them.
- **Attachments are described by the thread and downloaded through the document viewer.**
  A message's `attachments[]` carry `name`, `fileExtension`, `dcsId`, `etxId`, `type`,
  `organizationId` and `legacyUrlForCommunityJump`, never the bytes. The portal's own
  `useDcsDocument` hook (`epic.px.client.document-viewer.js`) fetches a `type: 2`
  (`MessageDocType.DCS`) attachment with `GetDocumentDetailsLegacy` and then GETs the
  mount-relative `downloadUrl` it answers, which streams the file with its real
  `Content-Type`, a `Content-Length` and `Content-Disposition: attachment; filename="…"`.
  Verified on two instances across 18 attachments (PDF, PNG, JPG). `fileDescription` in
  the details is the attachment's `name`; `displayName` is a system name that also rides in
  the link. The `fileExtension` posted is ignored — a wrong one still gets the document's real
  `mimeType`. `previewUrl` and `allowPreview: true` come back for images only. The non-legacy
  `GetDocumentDetails` answers the same fields with a `DownloadOrStream` link; the scraper
  uses the legacy variant because that is what the communication center passes
  (`legacyEncryption: true`). Attachments run to several MB (a 1.5 MB PDF was among the
  first downloaded on one instance) and the listing has no size field: a `HEAD` on the
  download URL answers 500 on one instance and an HTML page on another, so there is no way
  to learn the size without downloading.
- **Two payload traps on that path, both measured on the same two instances.** An id the
  record does not hold gets **200 with a literal JSON `null`** from `GetDocumentDetailsLegacy`
  (the `GetConversationDetails` pattern), and a bogus `dcsid` on the download GET gets **200,
  no `Content-Type`, empty body** — not a 404 (four of four instances). `downloadMessageAttachment`
  checks the payload on both, or an unknown id becomes a zero-byte file.
- **Only `type: 2` attachments have been observed.** `MessageDocType` is `ETX = 1`, `DCS = 2`,
  `DCS_HNO = 3`; the portal renders an ETX attachment as a popup via
  `POST /api/conversations/GetClinicalReferenceDetails { organizationId, type, etxId, dcsId }`
  and opens a `legacyUrlForCommunityJump` attachment in another organization's portal. Neither
  has appeared on any instance there are credentials for, so the scraper refuses them with the
  reason rather than modelling unobserved behaviour.

- **`GetConversationMessages` keys the thread on `id`, not `conversationId`.** This is the
  single most expensive lesson in this folder. Sending `conversationId` gets **500
  `{"Message":"An error has occurred."}` for every conversation and every body variant** —
  indistinguishable from a retired endpoint, and it was read as one for a while.
  **Parameter names on this API are per-endpoint, not per-area**: the *read* endpoints take
  `id`, while the *mutating* siblings (`SendReply`, `DeleteConversation`) really do take
  `conversationId`, which is where the guess came from. An id for a thread the record does
  not have gets the same opaque 500
  ([#385](https://github.com/Fan-Pier-Labs/openrecord/pull/385)).
- **The two read endpoints reject a bad id differently.**
  `GetConversationMessages` answers 500; `GetConversationDetails` answers **200 with a
  literal JSON `null`** — as `GetVisitNotes` and `GetLetterDetails` also do. So
  `if (!response.ok) throw` is not enough here: check the payload too, or an unknown id
  becomes an empty medical record.
- **Paging.** `startInstantISO` is an **exclusive upper bound** — the response holds the
  newest `maxReadMessages` messages strictly older than it — and omitting it means "now".
  `maxReadMessages` defaults to 5 server-side, which is also all the inbox ever inlines;
  this scraper asks for 100, bounded by `MAX_PAGES = 50`. `messages` come back ascending by
  `deliveryInstantISO`, and `hasMoreMessages` says whether older ones exist before
  `messages[0]`.
- **Epic serializes a WPR message the same way wherever it appears**: `wmgId` / `body` /
  `deliveryInstantISO` / `author.{displayName, empKey, wprKey}`, in the thread endpoints and
  in the conversation list alike, and that shape is held to a captured skeleton
  ([#384](https://github.com/Fan-Pier-Labs/openrecord/pull/384)). There is no `messageId`,
  `senderName`, `sentDate` or `messageBody`, and no API sends `isFromPatient` — a reader
  keyed on those names returns the right *number* of messages with every field blank, which
  tells a caller they have three empty messages rather than that the thread could not be
  read.
- **`isFromPatient` is derived from both sides of the author discriminator** — `wprKey` set
  *and* `empKey` empty — so an author object that cannot be read falls to "not from the
  patient" rather than mislabelling a provider's message as the patient's.
- **`author.displayName` is empty on every captured instance.** Names live in the `users`
  and `viewers` maps, and the portal's own `getAuthorInfo` resolves maps first
  (`userOverrideNames[empKey] || users[empKey].name`) with `displayName` only as a last
  resort. The processor uses that order.
- **Message bodies are Epic markup, not text.** A one-line message arrives as a
  `div.fmtConv` wrapper holding one `<div data-paragraph="N">` per paragraph, each with an
  inline-styled `<span>`, `&nbsp;` for a blank line and `\r\n` between blocks — roughly 200
  bytes of markup around nine characters. `messageBodyToText` converts once at the scraper
  boundary, keeping paragraph structure as newlines, so **no client ever holds the HTML** —
  this is a health-data app where `dangerouslySetInnerHTML` is banned outright. A render
  site that ever needs the markup gets its own explicitly-named field, the way visit notes
  have `contentHtml` ([#386](https://github.com/Fan-Pier-Labs/openrecord/pull/386)).
- **A send can silently do nothing.** Measured live: `SendMedicalAdviceRequest` answers
  **HTTP 200 with an empty conversation id and files nothing** for message bodies over 500
  characters — no error, no status code. `sendNewMessage` refuses an over-length body
  up front, and treats *any* 200 without a durable conversation id as **indeterminate,
  never success**, because the caller cannot safely retry
  ([#368](https://github.com/Fan-Pier-Labs/openrecord/pull/368); modelled in fake-mychart by
  [#376](https://github.com/Fan-Pier-Labs/openrecord/pull/376), so CI actually exercises it).
  Other instances may accept more; the 200-without-id branch catches a silent drop whatever
  the cause.
- `recipientType` and `oocContext` always go out: harmless on instances that ignore them,
  required on some.
- Topic `value` codes seen in the wild: COVID 15, New Medical 10, Follow-Up 11, Lab Results
  2, Imaging 6, Booking 12, Medication 7, Med Renewals 4, Referral 16, Form/Letter 3,
  Other 8.
- The token lives in one leaf module ([`communicationCenterToken.ts`](communicationCenterToken.ts))
  on purpose: every messaging module needs it and several import each other, so it sits
  apart from all of them to keep the graph acyclic
  ([#383](https://github.com/Fan-Pier-Labs/openrecord/pull/383)).
- The web UI's own request shapes are readable without credentials at
  `/<mount>/scripts/lib/pxbuild/epic.px.client.communication-center.js` — see
  [`../../../SCRAPING.md`](../../../SCRAPING.md).

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

## `get_messages`

`POST /api/conversations/GetConversationList`, once per page while
`localSummary.hasMoreConversations`. `raw` is the envelope. Merging the pages
and flattening the who / when of each thread become processor work.

Concise is the list of threads and nothing more: one flat row per thread with
the `hthId` that `get_message_thread` takes. The newest five messages the
listing inlines stay in `standard` / `json`.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `legacyXUnreadCount` | Inbox unread count | — | ✓ | ✓ | The first thing a reader wants from an inbox. |
| `truncated` | Paging stopped at the cap with `hasMoreConversations` still true | ✓ | ✓ | ✓ | Derived. A partial inbox must never be presented as the whole one. |
| `conversations[].hthId` | Conversation id | — | ✓ | ✓ | Handle: `get_message_thread`, `send_reply` and `delete_message` take it. |
| `conversations[].subject` | Subject | — | ✓ | ✓ | What. |
| `conversations[].audience[].name` | Who the thread is with | — | ✓ | — | Who; the flat form below is what concise carries. |
| `audienceNames` | `audience[].name`, flattened | ✓ | ✓ | ✓ | Derived. A list of names keeps a thread on one table row. |
| `latestMessageInstantISO` | `deliveryInstantISO` of the newest inlined message | ✓ | ✓ | ✓ | Derived. When the thread last moved; the listing has no thread-level date. |
| `conversations[].tags.Unread` | Unread | — | ✓ | — | Unread threads come first; the flat form below is what concise carries. |
| `hasUnreadMessages` | `tags.Unread`, flat | ✓ | ✓ | ✓ | Derived. Same reason as `audienceNames`. |
| `conversations[].hasUrgentMsgs` | Urgent | — | ✓ | ✓ | Urgency changes what a reader does next. |
| `conversations[].hasAttachments` | The thread has an attachment | — | ✓ | ✓ | Says whether `get_message_thread` will list a `dcsId` worth fetching. |
| `conversations[].hasMoreMessages` | More messages than were inlined | — | ✓ | — | Detail; concise never carries the inlined messages, so the thread call is the answer either way. |
| `conversations[].previewText` | Truncated latest body | — | ✓ | — | The one-line gist; detail. |
| `conversations[].hasTasks`, `.messageType` | Thread flags | — | ✓ | — | Detail. |
| `conversations[].messages[]` | The newest five messages, as in `get_message_thread` | — | ✓ | — | The listing inlines them; a reader who wants the messages takes the thread. Fields as in `get_message_thread`. |
| `conversations[].userOverrideNames{}` | Per-thread display-name overrides | — | — | — | Resolved into `senderName`. |
| `conversations[].contexts[]`, `.tags.Messages`, `.legacyMessageDetailsUrl`, `.hasLoadAllUsers`, `.allowBulkActions`, `.userKeys[]`, `.viewerKeys[]`, `.maskedUserNames[]`, `.showOtherViewersOption` | Thread rendering | — | — | — | UI flag / portal link / internal. |
| `conversations[].organizationId` | Organization | — | — | — | Always empty: `""` on all four captured instances. |
| `users{}` (`empId`, `name`, `outOfContactEndDate`, `outOfContactContext`, `outOfContactContextString`, `photoUrl`, `providerId`, `organizationId`) | Staff directory | — | — | — | Resolved into `senderName`; the rest is asset / internal. |
| `viewers{}` (`wprId`, `name`, `isSelf`, `isShown`, `isSelected`, `organizationId`) | Patient-side directory | — | — | — | Resolved into `senderName` / `isFromPatient`. |
| `localSummary.hasMoreConversations`, `.oldestLoadedInstantISO` | Older threads exist beyond the last page | — | ✓ | — | Says whether the inbox is complete; detail. From the last page. |
| `localSummary.newestLoadedInstantISO`, `.numberLoaded`, `.oldestSearchedInstantISO`, `.pagingInfo`, `externalSummaries{}` | Paging | — | — | — | Internal. |

---

## `get_message_thread`

`POST /api/conversations/GetConversationDetails` `{ id }`, then while
`hasMoreMessages`, `POST /api/conversations/GetConversationMessages`
`{ id, startInstantISO }` paging backwards. `raw` is the envelope. Merging the
pages into one ascending list and resolving names become processor work.
The first table is the message element, shared with the inlined messages of
`get_messages`; the second lists what details adds around it.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `messages[].wmgId` | Message id | — | ✓ | — | Identifier; no capability takes it. |
| `messages[].deliveryInstantISO` | Sent time | — | ✓ | ✓ | When. |
| `messages[].isUnread` | Unread | — | ✓ | — | Per-message read state; the thread-level count is enough for concise. |
| `messages[].body` | Body | — | — | — | Markup stays in `raw` (rule 9); the derived field is what the other modes read. |
| `bodyText` | `body` with any markup stripped | ✓ | ✓ | ✓ | Derived from `body`. The message, readable. |
| `senderName` | `wprKey` → `viewers[].name`; `empKey` → `userOverrideNames[empKey]` else `users[empKey].name`; `displayName` last | ✓ | ✓ | ✓ | Derived, in the order the portal's own `getAuthorInfo` uses. Without it every message is anonymous. |
| `isFromPatient` | `wprKey` set and `empKey` absent | ✓ | ✓ | ✓ | Derived. Which side of the conversation each message is on. |
| `messages[].author.empKey`, `.wprKey` | Author keys | — | ✓ | — | The inputs to `senderName`; kept so the resolution is checkable. |
| `messages[].author.displayName` | Author display name | — | — | — | Always empty: `""` on every message of every captured instance; names live in `users` / `viewers`. |
| `messages[].attachments[].name` | The attachment's file name | — | ✓ | ✓ | What was attached — a reader deciding whether to download it needs the name. |
| `messages[].attachments[].dcsId` | The attachment's document id | — | ✓ | ✓ | Handle: `get_message_attachment` takes it as `attachment_id` (rule 5). |
| `messages[].attachments[].fileExtension` | `PDF`, `PNG`, … | — | ✓ | — | Detail; the name carries it. |
| `messages[].attachments[].type` | Attachment kind; `2` is a DCS document | — | ✓ | — | The discriminator the bundle switches on; detail. |
| `messages[].attachments[].etxId`, `.organizationId`, `.legacyUrlForCommunityJump` | Other attachment kinds' plumbing | — | — | — | Always empty on every captured attachment. |
| `messages[].tasks[]`, `.suggestedActions[]` | Tasks and actions | — | ✓ | — | Uncaptured; passed through. |

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `hthId`, `subject`, `audience[].name` | Thread identity | — | ✓ | ✓ | Handle and the who / what. |
| `totalMessages`, `numUnread` | Counts | — | ✓ | ✓ | Cheap and useful. |
| `messages[]` (merged, ascending), as above | The thread | — | ✓ | ✓ | A thread has no shorter faithful form; concise is every message. |
| `truncated` | Paging stopped at the cap with `hasMoreMessages` still true | ✓ | ✓ | ✓ | Derived. A partial thread must never be presented as the whole exchange. |
| `replyFlags.canReply`, `.cannotReplyReason` | Whether `send_reply` will work | — | ✓ | — | Tells a consumer whether a follow-up write is possible; detail. |
| `hasPreviouslyViewed`, `hasAttachments`, `hasUrgentMsgs`, `hasTasks`, `messageType`, `previewText` | Thread flags | — | ✓ | — | Detail. |
| `lastViewedByStaffMsgId` / `firstUnreadMsgId`, `lastViewedByStaffInstantISO` | Which message staff last saw | — | — | — | Not a shape all instances share: three captured instances send the first pair, one sends the other. |
| `replyUrl` | Portal reply link | — | — | — | Portal link. |
| `users{}`, `viewers{}`, `userOverrideNames{}` | Name directories | — | — | — | Resolved into `senderName`. |
| `contexts[]`, `tags`, `legacyMessageDetailsUrl`, `hasLoadAllUsers`, `allowBulkActions`, `userKeys[]`, `viewerKeys[]`, `maskedUserNames[]`, `showOtherViewersOption`, `organizationId` | As in `get_messages` | — | — | — | UI flag / internal / always empty. |

---

## `get_message_attachment`

`GetConversationDetails` (paged as above, to find the attachment and take its
`fileExtension` and `organizationId` as MyChart lists them), then
`POST /api/documents/viewer/GetDocumentDetailsLegacy`, then `GET` the
`downloadUrl` it answers. The payload is one file, not JSON, so this
capability has **no output modes**: `run` returns a `MessageAttachmentFile`
(a `FilePayload` — `fileName`, `mimeType`, `bytes` — plus `conversationId`,
`dcsId` and `fileExtension`) and each client delivers it its own way, keyed off
the registry's `returnsFile` flag — the Claude Desktop extension writes it to
the Downloads folder and shows an image inline, the CLI writes it under
`--output` (default: the current directory), the mobile app shows an image in
the chat and says so for anything else.

---

## `get_message_recipients`

`POST /api/medicaladvicerequests/GetMedicalAdviceRequestRecipients`, a bare
array on captured instances (the scraper also tolerates six wrapper keys).

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `displayName` | Name | — | ✓ | ✓ | What `send_message` resolves by. |
| `specialty` | Specialty | — | ✓ | ✓ | Tells a reader which recipient is the right one. |
| `pcpTypeDisplayName` | "Primary Care Provider" etc. | — | ✓ | ✓ | Same. |
| `recipientType` | Provider vs department pool | — | ✓ | — | Detail. |
| `oocContext` | Out-of-contact; messages will not be read promptly | — | ✓ | — | Worth knowing before sending; detail. |
| `userId`, `departmentId`, `poolId`, `providerId` | Ids `send_message` posts | — | ✓ | — | Plumbing the capability resolves by name (#380); standard keeps them for library callers that post directly. |
| `photoUrl` | Photo | — | — | — | Asset. |
| `organizationId` | Organization | — | — | — | Always empty on capture. |

---

## `get_message_topics`

`POST /api/medicaladvicerequests/GetSubtopics`.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `topicList[].displayName`, `.value` | Topic label and code | — | ✓ | ✓ | The whole payload; `value` is what `send_message` posts. |
| `organizationId` | Organization | — | — | — | Always empty on capture. |
