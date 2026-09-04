# `upcomingOrders`

Standing and future orders — labs, imaging and procedures the care team has ordered but
that have not happened yet.

| | |
| --- | --- |
| **Capabilities** | `get_upcoming_orders` (read) |
| **Source** | [`upcomingOrders.ts`](upcomingOrders.ts) · [`upcomingOrders.processor.ts`](upcomingOrders.processor.ts) |
| **Activity** | React `/app/upcoming-orders` |

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /app/upcoming-orders` | — | antiforgery token |
| `POST /api/upcoming-orders/GetUpcomingOrders` | `{}` | the orders |

## Notes and research

- **The response is three maps keyed by id**, not arrays: `orderList{}`, `orderGroupList{}`
  and `providerList{}`. A consumer that expects a list gets nothing.
- `providerList{}` is a directory: the order carries a provider key, and the processor
  resolves it into a `providerName` on the order rather than making a caller join two maps.
- **All three maps are empty on every capture so far**, so the order element's shape is
  unknown and orders pass through whole. Deliberately *not* flagged `unverified` in the
  registry ([#405](https://github.com/Fan-Pier-Labs/openrecord/pull/405)) — the envelope is
  real and elements are not narrowed, so the empty answer is honest.
- These are orders, not appointments. An order that has been scheduled shows up in
  `get_upcoming_visits`; an order that has resulted shows up in `get_lab_results`.

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

## `get_upcoming_orders`

`POST /api/upcoming-orders/GetUpcomingOrders`: three maps keyed by id.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `orderList{}` values | One order each, whole | — | ✓ | ✓ | Uncaptured (maps empty on every capture); passed through. Concise narrows to name, type, status, date and provider once captured. |
| `providerName` | Resolved from `providerList` when the order carries a provider key | ✓ | ✓ | ✓ | Derived. Who ordered it. |
| `orderGroupList{}` | Grouping | — | ✓ | — | Uncaptured; passed through. |
| `providerList{}` | Provider directory | — | — | — | Resolved into `providerName`. |
| `upcomingOrdersSettings.canHideOrUnhideReminders` | Page config | — | — | — | UI flag. |
