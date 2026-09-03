# `activityFeed` — what each mode carries

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
