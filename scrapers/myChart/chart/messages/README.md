# `messages`

The communication center: the inbox, a whole thread, who can be written to and about what,
and the write side — new messages, replies, drafts and deletes.

| | |
| --- | --- |
| **Capabilities** | `get_messages` · `get_message_thread` · `get_message_recipients` · `get_message_topics` (reads) · `send_message` · `send_reply` · `delete_message` (writes) |
| **Source** | [`conversations.ts`](conversations.ts) · [`messageThreads.ts`](messageThreads.ts) · [`recipients.ts`](recipients.ts) · [`sendMessage.ts`](sendMessage.ts) · [`sendReply.ts`](sendReply.ts) · [`messageDrafts.ts`](messageDrafts.ts) · [`deleteMessage.ts`](deleteMessage.ts) · [`communicationCenterToken.ts`](communicationCenterToken.ts) |
| **Activity** | React `/app/communication-center` |

## Endpoints

Two areas, and **they are not interchangeable**: reading and replying live under
`/api/conversations/`, and composing a *new* message lives under
`/api/medicaladvicerequests/`.

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /app/communication-center` | — | the `__RequestVerificationToken` every call below needs |
| `POST /api/conversations/GetConversationList` | `{ tag: 1, localLoadParams: {…}, externalLoadParams: {}, searchQuery: '', PageNonce: '' }` | the inbox |
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

## Notes and research

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
- **The thread fields were invented once, and it showed as three empty messages.**
  `get_message_thread` used to parse `messageId` / `senderName` / `sentDate` /
  `messageBody` / `isFromPatient` — names no capture has ever shown, and `isFromPatient` is
  a derived boolean no Epic API sends. It returned the right *number* of messages with every
  field blank, which tells a caller they have three empty messages rather than that we could
  not read them. Epic serializes a WPR message as `wmgId` / `body` / `deliveryInstantISO` /
  `author.{displayName, empKey, wprKey}` wherever it appears
  ([#384](https://github.com/Fan-Pier-Labs/openrecord/pull/384)).
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
  bytes of markup around nine characters. It used to reach the model verbatim.
  `messageBodyToText` converts once at the scraper boundary, keeping paragraph structure as
  newlines, so no client ever holds the HTML — this is a health-data app where
  `dangerouslySetInnerHTML` is banned outright
  ([#386](https://github.com/Fan-Pier-Labs/openrecord/pull/386)).
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

`POST /api/conversations/GetConversationList`. The scraper returns the body
untouched today.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `legacyXUnreadCount` | Inbox unread count | — | ✓ | ✓ | The first thing a reader wants from an inbox. |
| `conversations[].hthId` | Conversation id | — | ✓ | ✓ | Handle: `get_message_thread`, `send_reply` and `delete_message` take it. |
| `conversations[].subject` | Subject | — | ✓ | ✓ | What. |
| `conversations[].audience[].name` | Who the thread is with | — | ✓ | ✓ | Who. |
| `conversations[].tags.Unread` | Unread | — | ✓ | ✓ | Unread threads come first. |
| `conversations[].hasUrgentMsgs` | Urgent | — | ✓ | ✓ | Urgency changes what a reader does next. |
| `conversations[].hasMoreMessages` | More messages than were inlined | — | ✓ | ✓ | Says whether `get_message_thread` is worth calling. |
| `conversations[].previewText` | Truncated latest body | — | ✓ | ✓ | The one-line gist; emitted even when full bodies are inlined (rule 6). |
| `conversations[].hasAttachments`, `.hasTasks`, `.messageType` | Thread flags | — | ✓ | — | Detail. |
| `conversations[].messages[].wmgId` | Message id | — | ✓ | — | Identifier; no capability takes it. |
| `conversations[].messages[].deliveryInstantISO` | Sent time | — | ✓ | ✓ | When. |
| `conversations[].messages[].isUnread` | Unread | — | ✓ | — | Per-message read state; the thread-level tag is enough for concise. |
| `conversations[].messages[].body` | Body | — | — | — | Markup stays in `raw` (rule 9); real bodies are plain text, and the derived field is what the other modes read either way. |
| `bodyText` | `body` with any markup stripped | ✓ | ✓ | ✓ | Derived from `body`. The message, readable. |
| `senderName` | `wprKey` → `viewers[].name`; `empKey` → `userOverrideNames[empKey]` else `users[empKey].name`; `displayName` last | ✓ | ✓ | ✓ | Derived, in the order the portal's own `getAuthorInfo` uses. Without it every message is anonymous. |
| `isFromPatient` | `wprKey` set and `empKey` absent | ✓ | ✓ | ✓ | Derived. Which side of the conversation each message is on. |
| `conversations[].messages[].author.empKey`, `.wprKey` | Author keys | — | ✓ | — | The inputs to `senderName`; kept so the resolution is checkable. |
| `conversations[].messages[].author.displayName` | Author display name | — | — | — | Always empty: `""` on every message of every captured instance; names live in `users` / `viewers`. |
| `conversations[].messages[].attachments[].name`, `.fileExtension` | Attachments | — | ✓ | — | What was attached; detail. |
| `conversations[].messages[].attachments[].type`, `.dcsId`, `.etxId`, `.legacyUrlForCommunityJump`, `.organizationId` | Attachment plumbing | — | — | — | Internal / portal link. |
| `conversations[].messages[].tasks[]`, `.suggestedActions[]` | Tasks and actions | — | ✓ | — | Uncaptured; passed through. |
| `conversations[].userOverrideNames{}` | Per-thread display-name overrides | — | — | — | Resolved into `senderName`. |
| `conversations[].contexts[]`, `.tags.Messages`, `.legacyMessageDetailsUrl`, `.hasLoadAllUsers`, `.allowBulkActions`, `.userKeys[]`, `.viewerKeys[]`, `.maskedUserNames[]`, `.showOtherViewersOption` | Thread rendering | — | — | — | UI flag / portal link / internal. |
| `conversations[].organizationId` | Organization | — | — | — | Always empty: `""` on all four captured instances. |
| `users{}` (`empId`, `name`, `outOfContactEndDate`, `outOfContactContext`, `outOfContactContextString`, `photoUrl`, `providerId`, `organizationId`) | Staff directory | — | — | — | Resolved into `senderName`; the rest is asset / internal. |
| `viewers{}` (`wprId`, `name`, `isSelf`, `isShown`, `isSelected`, `organizationId`) | Patient-side directory | — | — | — | Resolved into `senderName` / `isFromPatient`. |
| `localSummary.hasMoreConversations`, `.oldestLoadedInstantISO` | Older threads exist beyond this page | — | ✓ | — | Says whether the inbox is complete; detail. |
| `localSummary.newestLoadedInstantISO`, `.numberLoaded`, `.oldestSearchedInstantISO`, `.pagingInfo`, `externalSummaries{}` | Paging | — | — | — | Internal. |

---

## `get_message_thread`

`POST /api/conversations/GetConversationDetails` `{ id }`, then while
`hasMoreMessages`, `POST /api/conversations/GetConversationMessages`
`{ id, startInstantISO }` paging backwards. `raw` is the envelope. Merging the
pages into one ascending list and resolving names become processor work.
Message fields are as in `get_messages`; the table lists what details adds.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `hthId`, `subject`, `audience[].name` | Thread identity | — | ✓ | ✓ | Handle and the who / what. |
| `totalMessages`, `numUnread` | Counts | — | ✓ | ✓ | Cheap and useful. |
| `messages[]` (merged, ascending) with `senderName`, `isFromPatient`, `bodyText` | The thread | — | ✓ | ✓ | A thread has no shorter faithful form; concise is every message. |
| `truncated` | Paging stopped at the cap with `hasMoreMessages` still true | ✓ | ✓ | ✓ | Derived. A partial thread must never be presented as the whole exchange. |
| `replyFlags.canReply`, `.cannotReplyReason` | Whether `send_reply` will work | — | ✓ | — | Tells a consumer whether a follow-up write is possible; detail. |
| `hasPreviouslyViewed`, `hasAttachments`, `hasUrgentMsgs`, `hasTasks`, `messageType`, `previewText` | Thread flags | — | ✓ | — | Detail. |
| `lastViewedByStaffMsgId` / `firstUnreadMsgId`, `lastViewedByStaffInstantISO` | Which message staff last saw | — | — | — | Not a shape all instances share: three captured instances send the first pair, one sends the other. |
| `replyUrl` | Portal reply link | — | — | — | Portal link. |
| `users{}`, `viewers{}`, `userOverrideNames{}` | Name directories | — | — | — | Resolved into `senderName`. |
| `contexts[]`, `tags`, `legacyMessageDetailsUrl`, `hasLoadAllUsers`, `allowBulkActions`, `userKeys[]`, `viewerKeys[]`, `maskedUserNames[]`, `showOtherViewersOption`, `organizationId` | As in `get_messages` | — | — | — | UI flag / internal / always empty. |

Today's `ThreadMessage` renames `wmgId` → `messageId`, `deliveryInstantISO` →
`sentDate`, `body` → `messageBody`; rule 2 keeps MyChart's names.

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
