# `messages` — what each mode carries

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
