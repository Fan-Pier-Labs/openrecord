# MyChart features we don't cover

What the product *does* cover is not documented here — the capability registry
([`shared/capabilities.ts`](../shared/capabilities.ts)) is the single source of truth, currently 51
capabilities across every client. Run `bun run cli --list-capabilities --show-all` for the live
list.

This file is the remainder: MyChart features we have looked at and **do not** scrape, so nobody has
to re-explore the portal to rediscover why. Last verified against the capability registry in
August 2026. If you ship a scraper for one of these, delete its entry.

## Not covered yet

| Feature | URL | Notes |
|---------|-----|-------|
| COVID-19 Status | `/CovidStatus` | Almost entirely overlaps immunizations + test results, which we scrape. Low value on its own. |
| To Do | `/todo` | Pending patient tasks (questionnaires, forms). Actionable items, not records; questionnaires themselves are covered by `get_questionnaires`. |
| Estimates | `/Estimates` | Cost estimates for upcoming procedures. Forward-looking, not part of the historical record. |

## Deliberately out of scope

Account/UI actions rather than health-record data — writing a scraper for these is a product
decision, not a backlog item: appointment scheduling (`/Scheduling`), Symptom Checker, Ask a
Question, specialty-referral/PCP request questionnaires, Sharing Hub / Share Everywhere, account
settings and personalization, communication preferences, linked apps (OAuth review), and organ-donor
registration.
