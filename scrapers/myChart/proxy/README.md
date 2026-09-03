# `proxy` — what each mode carries

Part of the processor layer. The rules (never rename a MyChart field, membership by field
name, markup only in `raw`, never invent a shape) and the drop-reason tags used in the
Reasoning column are in [`docs/processor-layer-proposal.md`](../../../docs/processor-layer-proposal.md);
example output in all four modes is in
[`docs/processor-layer-examples.md`](../../../docs/processor-layer-examples.md).

Columns: **Field** (MyChart's name, or the derived name), **What it is**,
**Derived** (✓ when the processor computes it from other fields; such a field
is never in `raw`), **Standard / JSON**, **Concise**, **Reasoning** (why the
field is in or out of each of the two).

Fields that share a description and a fate are grouped on one row. A group's
members are all listed so nothing is implied.

## `list_proxy_targets`

`GET /Home` (proxy selector markup or script block) and, where the instance
serves it, `GET /ProxySwitch` (`ProxySubjectList[]`). This capability already
returns a designed shape; the change is that `raw` becomes available.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `ProxySubjectList[].Id` | Record id | — | ✓ | ✓ | Handle: `switch_proxy_target` takes it. |
| `ProxySubjectList[].DisplayName` | Patient | — | ✓ | ✓ | Who. |
| `ProxySubjectList[].IsSelf`, `.IsSelected` | The account holder; the active record | — | ✓ | ✓ | Which record every data tool is currently reading. |
| `selectionKnown` | Whether `IsSelected` came from the portal or is a default | ✓ | ✓ | ✓ | Derived. `IsSelected: false` means nothing unless this is true. |
| `active_patient`, `profile_name`, `count` | As the capability returns today | ✓ | ✓ | ✓ | Derived. Independent evidence of which record is active. |
| `ProxySubjectList[].Ids[]`, `.DisplayText`, `.ServiceAreaAbbreviationList` | Aliases | — | ✓ | — | Detail. |
| `ProxySubjectList[].PhotoUrl`, `.PhotoMagicId`, `.BlobToken`, `.TabColor`, `.LinkUrl`, `.Loading`, `.Disabled` | Selector rendering | — | — | — | Asset / portal link / UI flag. |
| `ShowFriendsAndFamily`, `ShouldTryAgain`, `ShowPersonalInformation`, `ShowAccountSettings`, `AvailableLanguageList[]`, `CurrentlySelectedTabColor` | Page config | — | — | — | UI flag. |

---

## Write capabilities

`send_message`, `send_reply`, `delete_message`, `request_refill`,
`add_emergency_contact`, `update_emergency_contact`, `remove_emergency_contact`
return `{ success, error? }` plus a few echo fields. `raw` returns the
endpoint's response body (a conversation id string, an HTTP status with an
error page). The other modes return today's shape. No processor logic beyond
that.
