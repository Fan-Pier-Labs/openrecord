# `upcomingOrders` — what each mode carries

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

## `get_upcoming_orders`

`POST /api/upcoming-orders/GetUpcomingOrders`: three maps keyed by id.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `orderList{}` values | One order each, whole | — | ✓ | ✓ | Uncaptured (maps empty on every capture); passed through. Concise narrows to name, type, status, date and provider once captured. |
| `providerName` | Resolved from `providerList` when the order carries a provider key | ✓ | ✓ | ✓ | Derived. Who ordered it. |
| `orderGroupList{}` | Grouping | — | ✓ | — | Uncaptured; passed through. |
| `providerList{}` | Provider directory | — | — | — | Resolved into `providerName`. |
| `upcomingOrdersSettings.canHideOrUnhideReminders` | Page config | — | — | — | UI flag. |
