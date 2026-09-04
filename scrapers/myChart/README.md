# `myChart/` — the Epic MyChart scrapers

Everything that talks to a MyChart portal. **Each folder's `README.md` is the documentation
for that scraper**: what it reads, the endpoints and request bodies, the behaviours that
bite, the research behind them, and which fields each output mode carries.

## The machinery

| Folder | What it does |
| --- | --- |
| [`core/`](core/) | the request path everything shares — cookies, redirects, the deployment prefix, the antiforgery token, session expiry and renewal, keepalive, and the `RawResponse` envelope |
| [`auth/`](auth/) | finding where a deployment lives, logging in with a password or a passkey, 2FA and TOTP, terms, credential enrollment |
| [`proxy/`](proxy/) | reading a family member's chart without ever reading the wrong one |
| [`processors/`](processors/) | the shared half of the processor layer: the four modes, the markdown renderer, the never-throwing readers |
| [`prelogin/`](prelogin/) | what an instance publishes to anyone, with no account |
| [`eunity/`](eunity/) | downloading imaging pixels from Epic's DICOM viewer |
| [`clo-image-parser/`](clo-image-parser/) | turning those pixels into images |

## The chart

One folder per data category. Every one of them: `GET` an activity page for its antiforgery
token, then `POST` the endpoint(s) below it.

| Folder | Capabilities | Activity |
| --- | --- | --- |
| [`activityFeed/`](chart/activityFeed/) | `get_activity_feed` | React `/app/home` |
| [`allergies/`](chart/allergies/) | `get_allergies` | legacy `/Clinical/Allergies` |
| [`bills/`](chart/bills/) | `get_billing` | legacy `/Billing/*` |
| [`careJourneys/`](chart/careJourneys/) | `get_care_journeys` | React `/app/care-journeys` |
| [`careTeam/`](chart/careTeam/) | `get_care_team` | legacy `/Clinical/CareTeam` |
| [`documents/`](chart/documents/) | `get_documents` | React `/app/documents` |
| [`educationMaterials/`](chart/educationMaterials/) | `get_education_materials` | React `/app/education` |
| [`ehiExport/`](chart/ehiExport/) | `get_ehi_export` | React `/app/release-of-information` |
| [`emergencyContacts/`](chart/emergencyContacts/) | `get_emergency_contacts` + three writes | React `/app/personal-information` |
| [`goals/`](chart/goals/) | `get_goals` | React `/app/goals` |
| [`healthIssues/`](chart/healthIssues/) | `get_health_issues` | legacy `/Clinical/HealthIssues` |
| [`healthSummary/`](chart/healthSummary/) | `get_health_summary` | React `/app/health-summary` |
| [`immunizations/`](chart/immunizations/) | `get_immunizations` | legacy `/Clinical/Immunizations` |
| [`insurance/`](chart/insurance/) | `get_insurance` | legacy `/Insurance` |
| [`insurancePayers/`](chart/insurancePayers/) | `get_insurance_payers` | legacy `/Insurance` |
| [`labs/`](chart/labs/) | `get_lab_results`, `get_imaging_results`, `download_imaging_study` | React `/app/test-results` |
| [`letters/`](chart/letters/) | `get_letters`, `get_letter_details` | React `/app/letters` |
| [`medicalHistory/`](chart/medicalHistory/) | `get_medical_history` | React `/app/histories` |
| [`medications/`](chart/medications/) | `get_medications` (`request_refill` is declared, not implemented) | legacy `/Clinical/Medications` |
| [`messages/`](chart/messages/) | four reads and three writes | React `/app/communication-center` |
| [`notes/`](chart/notes/) | `get_visit_notes`, `get_note_content`, `get_visit_avs` | legacy `/Visits/VisitsList` |
| [`otherMyCharts/`](chart/otherMyCharts/) | `get_linked_accounts` | legacy `/Community/Manage` |
| [`preventiveCare/`](chart/preventiveCare/) | `get_preventive_care` | legacy `/HealthAdvisories` (HTML only) |
| [`profile/`](chart/profile/) | `get_profile` | `/Home` + legacy `/PersonalInformation` |
| [`questionnaires/`](chart/questionnaires/) | `get_questionnaires` | legacy `/Questionnaire` |
| [`referrals/`](chart/referrals/) | `get_referrals` | React `/app/referrals` |
| [`upcomingOrders/`](chart/upcomingOrders/) | `get_upcoming_orders` | React `/app/upcoming-orders` |
| [`visits/`](chart/visits/) | `get_past_visits`, `get_upcoming_visits` | legacy `/Visits/VisitsList` |
| [`vitals/`](chart/vitals/) | `get_vitals` | React `/app/track-my-health` |

## Two generations of activity, and it matters

MyChart is mid-migration. **React `/app/*` activities** answer camelCase JSON under
`/api/<area>/<Action>`. **Legacy jQuery activities** answer PascalCase, often form-encoded,
under `<Area>/<Controller>/<Action>` — and sometimes want a lower-case
`__requestverificationtoken` header.

**The same activity is React on one instance and legacy on another**, and the failure is
invisible: an instance still on the legacy version answers `GET /app/<activity>` with a
**200 Home page**, and every `/api/*` endpoint that activity's React bundle names 500s with
`{"Message":"An error has occurred."}` whatever it is sent — which reads exactly like "no
data on file". The bundle is still downloadable, so the caller looks perfectly real. See
[`../SCRAPING.md`](../SCRAPING.md), and
[`chart/insurancePayers/`](chart/insurancePayers/) for the canonical case.

## Not on this API

- **`/api/FHIR/R4/metadata` is 404 on every mount.** Epic does expose FHIR, but its base
  lives on a different host — it is not reachable by adding a path to a MyChart deployment,
  and probing mounts for it finds nothing.
- eUnity exposes no DICOMweb; see [`eunity/`](eunity/) for that list.

## Also here

- [`NOT-SCRAPED.md`](NOT-SCRAPED.md) — MyChart features we have looked at and deliberately
  do not scrape, so nobody re-explores the portal to rediscover why.
- [`api-surface-gaps.md`](api-surface-gaps.md) — a ranking of the read-only endpoints worth
  building next, sorted by how much a patient learns that a shipped capability cannot
  already tell them.
