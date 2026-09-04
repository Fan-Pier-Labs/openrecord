# `activityFeed`

Recent account-activity items — the "what's new" feed the MyChart home page renders:
new results, new messages, upcoming appointments, filed documents.

| | |
| --- | --- |
| **Capabilities** | `get_activity_feed` (read, `lessFrequentlyUsed`) |
| **Source** | [`activityFeed.ts`](activityFeed.ts) · [`activityFeed.processor.ts`](activityFeed.processor.ts) |
| **Activity** | React `/app/home` |

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /app/home` | — | antiforgery token (recorded as `purpose: 'token'`) |
| `POST /api/item-feed/FetchItemFeed` | `{ maxItems: 50, offset: 0 }` | the feed |

`offset` is the paging cursor; the scraper takes one page of 50 and does not walk it,
because the feed is a recency view rather than a record — everything in it is reachable
in full from the capability that owns that data.

## Notes and research

- The feed is **derived**, not a source of record: every item points at data another
  capability returns in full. It is worth calling to find out *what changed*, not to read
  a chart.
- **On a proxy account the feed mixes patients.** Items sit under
  `singleItemFeedViewModels[]` — one view model per patient record the account can see —
  so every item has to be reported with the `displayName` of the record it belongs to, or a
  child's result reads as the account holder's.
- Feed items are heterogeneous: an announcement carries a title and body, a contact-info
  nag carries phone and email fields, a result item carries a portal link. `type`
  discriminates them.
- `priorityInstant` is **epoch milliseconds**, not the ISO string the rest of this API
  uses; the processor derives `priorityInstantISO` beside it.
- Some releases also serve `todayItems` / `forYouItems` alongside `feedItems`.
- The idea long predates the endpoint: a change-notification system was the subject of
  [#13](https://github.com/Fan-Pier-Labs/openrecord/pull/13), and the feed is the portal's
  own answer to the same question.

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

## `get_activity_feed`

`POST /api/item-feed/FetchItemFeed` `{ maxItems: 50, offset: 0 }`. Items sit
under `singleItemFeedViewModels[].feedItems` (some releases also `todayItems` /
`forYouItems`), one view model per patient record the account can see.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `singleItemFeedViewModels[].displayName` | Which patient the items are about | — | ✓ | ✓ | On a proxy account the feed mixes patients; each item must say whose it is. |
| `singleItemFeedViewModels[].eptId` | Patient record id | — | ✓ | — | Identifier; detail. |
| `…feedItems[].identifier` | Item id | — | ✓ | — | Identifier; detail. |
| `…feedItems[].displayText` | The item's text | — | ✓ | ✓ | The item. |
| `…feedItems[].titleDisplayText`, `.announcementBody` | Title and body for announcement items | — | ✓ | — | Present on some item types; detail. |
| `…feedItems[].type`, `.defaultType`, `.topicId` | Item kind | — | ✓ | — | Classification; detail. |
| `…feedItems[].priority`, `.priorityInstant`, `.groupCount` | Ordering; `priorityInstant` is epoch millis | — | ✓ | — | The raw ordering inputs. |
| `priorityInstantISO` | `priorityInstant` as ISO-8601 | ✓ | ✓ | ✓ | Derived. When. |
| `…feedItems[].primaryAction.uriDisplayText` | Label of the item's action ("View results") | — | ✓ | — | Says what kind of thing the item points at without the link; detail. |
| `…feedItems[].phone`, `.email`, `.smsActive`, `.allTextEnabled`, `.allEmailEnabled`, `.canEditInfo` | A contact-info nag item's own fields | — | — | — | UI flag. |
| `…feedItems[].primaryAction.uri`, `.uriId`, `.uriType`, `.uriIconKey`, `.uriAccessibleText`, `.isHidden`; same on `secondaryAction`, `tertiaryAction`, `defaultAction` | Portal links | — | — | — | Portal link. |
| `…feedItems[].iconKey`, `.subiconKey`, `.shouldShowWatermark`, `.isH2GEnabled` | Icons | — | — | — | Asset / DXR plumbing. |
| `singleItemFeedViewModels[].photoUrl`, `.tabColor`, `.zeroStateIconKey`, `.isSelected` | Tab rendering | — | — | — | Asset / UI flag. |
| `linkedAccountsViewModel.*` | Linked-organization widget | — | — | — | Duplicate of `get_linked_accounts`. |
