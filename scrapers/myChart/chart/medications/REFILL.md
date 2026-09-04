# `request_refill` — declared, not implemented

`request_refill` is in the capability registry with `notImplemented` set, so every client lists
it and running it returns a notice instead of calling anything. There is no scraper. This file
is what the scraper knew, so that whoever implements it properly does not start from nothing.

## Why it was withdrawn

The scraper posted, with the antiforgery token off `/Clinical/Medications`:

```
POST /api/medications/RequestRefill
Content-Type: application/json

{ "medicationKey": "<prescription id>" }
```

`medicationKey` is a field **only `fake-mychart` has ever recognised**. The captured
`LoadMedicationsPage` response names the prescription `id`, and no capture, bundle read or live
request has ever shown MyChart accepting `medicationKey` — the name appears to have been
invented alongside the fake's fixture and then read back out of it.

The fake answered `{ "success": true }` to any body at all, so the scraper passed its unit and
integration tests while quite possibly sending something real MyChart ignores. A read that fails
this way returns an empty list; a *write* that fails this way returns HTTP 200, and the patient
believes a refill is on the way when nothing was submitted. That is why this one is a stub
rather than a scraper with a caveat attached.

## What a real implementation has to establish first

1. **The endpoint.** `/api/medications/RequestRefill` is the legacy path the old scraper used
   and has never been confirmed. Read `epic.px.client.medications` on a live instance for the
   path the shipped client actually posts to — the same method that found
   `Insurance/Coverages/GetCoverages` and the React questionnaires endpoint.
2. **The body.** Field names and any additional context the request carries (a pharmacy id, a
   delivery choice, a comment). Take them from the bundle, not from the fake.
3. **The response.** What success looks like, and — more important — what a *refusal* looks
   like, so the processor can tell "submitted" from "MyChart declined this". A 200 is not
   evidence of either until one has been seen.
4. **One observed refill.** The only real verification is watching a request reach the pharmacy
   on an account whose prescriptions are safe to touch. Until that happens this stays a stub;
   speculatively submitting refills against someone's real prescriptions to find out is not an
   acceptable way to test it.

Then rebuild the fake's handler around the captured request and response — it currently accepts
anything, which is the reason none of this was caught — and drop `notImplemented` from the
registry entry.

## Related

- The medications processor exposes `id` and not `medicationKey`, for the reason above.
- `docs/processor-layer-todo.md` §2 tracks the same open question.
