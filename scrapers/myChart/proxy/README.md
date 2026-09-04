# `proxy` — reading a family member's chart, safely

MyChart's active patient is **server-side session state**. There is no per-request patient
parameter: you get a family member's chart by following a switch URL, and every subsequent
request silently returns *that* patient until something switches back. This package is what
makes that visible at the call site.

| | |
| --- | --- |
| **Capabilities** | `list_proxy_targets` (read) · `switch_proxy_target` (write — it mutates session state) |
| **Source** | [`proxyContext.ts`](proxyContext.ts) · [`proxyTools.ts`](proxyTools.ts) |

## The invariant

**Never read a chart without asserting whose it is.** Every chart-touching capability
asserts the active patient before running and refuses with the fix — naming
`switch_proxy_target` and `list_proxy_targets`, so a model that hits the refusal knows which
call resolves it — rather than returning the wrong family member's record.

This matters more than it looks: sessions are resumed from cached cookies, so a stale active
patient can persist **across processes**.

## Endpoints

| Request | Purpose |
| --- | --- |
| `GET /ProxySwitch?noCache=<random>` | `ProxySubjectList[]` — the records, with `IsSelf` and `IsSelected` |
| `GET /Home` | fallback discovery: the proxy selector markup, or the `EpicPx.ReactContext.personalizations.proxySubjects` script block |
| `GET <target.LinkUrl>` | the switch itself — a redirect chain, capped at 5 hops |
| `GET /Home` | after the switch: the print header, re-read to confirm **who** the portal is now showing |

## Notes and research

- **The account holder's own record has a real id.** It is not blank. Identify it with
  `isSelf`, never by inspecting the id — proxy ids are opaque `WP-…` strings, different on
  every organization and meaningless outside the session that produced them. Confirmed on
  three instances ([#206](https://github.com/Fan-Pier-Labs/openrecord/pull/206), reviving
  [#194](https://github.com/Fan-Pier-Labs/openrecord/pull/194) by @rossenp).
- **`isSelected: false` means nothing on its own.** The `/Home` script-block discovery
  surface carries no selection flag at all, so targets recovered from it report
  `selectionKnown: false`. A consumer must check `selectionKnown` before reading
  `isSelected`.
- **A switch is verified against the profile page, never against `IsSelected`.** After
  following the chain, the `/Home` print header is re-read and the name compared to the
  record that was asked for.
- **Name comparison is deliberately three-valued.** MyChart's proxy list and its profile
  page do not agree on how a name is written — the list says "Bart Simpson" where the
  profile says "Bartholomew JoJo Simpson" — so a two-valued match/mismatch would reject
  perfectly good switches. `unknown` is the honest answer when two names share a surname but
  not a recognizable given name: that is either a nickname or **a sibling**, and the
  comparison cannot tell which.
- **The sharpest signal is the impostor check.** When the profile landed on matches a
  *different* record in the list, the switch went to the wrong patient — most often a
  sibling, whom a surname comparison alone would wave through — and it throws. This is the
  check that catches what a name heuristic cannot.
- **Some instances label the account holder generically** ("Me", "Myself", "My record").
  Those names carry no identity signal, so verification treats them as "no opinion" rather
  than as a mismatch.
- **Ambiguity is always an error.** `findProxyTarget` accepts a self alias, an exact id, an
  exact display name, then a unique case-insensitive partial — and a query matching two
  records fails, listing the candidates. Guessing which patient was meant is precisely the
  failure this codebase must never produce.
- **Switching to self requires asking for self explicitly.** A selector that resolves to the
  account holder by accident is refused.
- **A silent re-login resets MyChart to the account holder, server-side.** So a switch
  records the active target *and* arms a `restoreProxyContext` hook in the same step —
  session renewal fails closed if it ever finds a recorded non-self target with no restore
  hook. The hook re-runs the verified switch with `autoRenew: false`, so it can only fail,
  never re-enter renewal. See [`../core/`](../core/).
- `withProxyTarget(fn)` is the wrapper that puts the patient back at the call site: state
  who you mean, every time, and let switching be an implementation detail. Passing no target
  means the account holder **explicitly** — not "whoever the session happens to be pointed
  at". The switch is skipped when the portal already reports the wanted record as active, so
  the common case costs one discovery request. An account with no proxy access has no proxy
  surface at all, and there `fn` simply runs.
- `MYCHART_DEBUG_PROXY_CONTEXT=1` turns on the discovery/switch trace.

## Modes: what each mode carries

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
