# Changelog

## Next major — the MyChart directory is checked in (breaking)

`searchMyChartDirectory` no longer fetches Epic's live directory. It searches `listMyCharts()`:
Epic's directory as it was checked at the last release, every login URL confirmed or corrected,
merged with hand corrections and the organizations Epic doesn't list. Epic's live list carried
URLs that send a patient nowhere (UCSF's pointed at an information page), and an offline caller
got the checked-in list anyway.

| Removed | What to do |
| --- | --- |
| `source` on `MyChartDirectorySearchResult`, and the `MyChartDirectorySource` type | Nothing. There is one source now. |
| `directoryUrl` and `mediaBase` on `MyChartDirectorySearchOptions` | Search has no endpoint to point anywhere. `fetchMyChartDirectory({ directoryUrl, mediaBase })` still fetches a directory from wherever you say. |
| `clearDirectoryCache`, `DIRECTORY_CACHE_TTL_MS` | Nothing. There is no cache to clear. |

Added: `listMyCharts()`, and `extraHosts` on `MyChartInstanceSeed`.

## 2.0.0 — withdrawn exports (breaking)

Two functions are gone from the public surface. Both removals are deliberate, and neither has a
drop-in replacement, which is why this is a major release rather than a patch.

| Removed | Why | What to do |
| --- | --- | --- |
| `requestMedicationRefill` | The capability it wrapped is now declared **not implemented**. Its request body was never confirmed against a real MyChart, and the field it posted (`medicationKey`) is one only the test server has ever recognised. A refill request that silently never reaches the pharmacy is worse than none. See `scrapers/myChart/chart/medications/REFILL.md`. | Ask the patient to request the refill in MyChart directly. `runCapability('request_refill')` still resolves and returns a notice saying the same. |
| `base64UrlEncode`, `base64UrlDecode` | The hand-rolled codec they wrapped was replaced by `js-base64`, which does the same job correctly. | Depend on [`js-base64`](https://www.npmjs.com/package/js-base64) directly. |

`RefillRequestResult` goes with the first of those.

## 1.0.0 — the processor layer (breaking)

Every read function now returns the **standard object**: MyChart's own field names and casing,
derived fields under new names, and markup only in `raw`. The projected types the 0.x line
exported are gone. These are the renames a 0.x consumer will hit:

| 0.x | 1.0 |
| --- | --- |
| `Medication`, `MedicationsResult` (`medications[]`, `commonName`, `isRefillable`, `medicationKey`) | `PrescriptionStandard`, `MedicationsStandard` (`prescriptions[]`, `patientFriendlyName.text`, `refillDetails.isRefillable`, `id`) |
| `Flowsheet`, `VitalReading` (`date`, `units`) | `FlowsheetStandard`, `VitalReadingStandard` (`instantTakenIso`, row `unitsDisplayName`) |
| `MedicalHistoryResult` (`familyHistory`) | `MedicalHistoryStandard` (`familyHistoryAndStatus`, plus `socialHistory`) |
| `ConversationThread`, `ThreadMessage` (`conversationId`, `messageId`, `sentDate`, `messageBody`) | `ConversationThreadStandard` (`hthId`, `wmgId`, `deliveryInstantISO`, `bodyText`) |
| `GetVisitNotesResult`, `VisitNote` (`lrpId`, `notes[]`, `hnoId`, `hnoDat`, `providerName`) | `VisitNotesStandard` (`lrpID`, `noteList[]`, `hnoID`, `hnoDAT`, `provider.name`) |
| `NoteContent` (`contentHtml`) | `NoteContentStandard` (`reportContentText`) |
| `LetterDetailsResponse` (`bodyHTML`) | `LetterDetailsStandard` (`bodyHTMLText`) |
| `CareTeam`, `CareTeamMember` (`members[]`, `name`, `relation`) | `CareTeamStandard` (`ProvidersList[]`, `Name`, `Relation`) |
| `LabTestResultWithHistory[]` | `LabResultsStandard` (`orders[]`), abnormal flag gone (raw only) |
| `ImagingResult[]` (`fdiContext`, `samlUrl`) | `ImagingResultsStandard` (`orders[]`, `image_id`) |
| `BillingAccount[]` | `BillingStandard` (`accounts[]`, merged `visits[]`) |
| `upcomingVisits()` / `pastVisits()` containers (`List`, `InProgressVisits`, …) | `UpcomingVisitsStandard` / `PastVisitsStandard` (`visits[]`, `status`, `instantISO`) |
| every other `get…()` array | `{ <listName>: [...] }` with MyChart's list name |

A missing verification token throws `MissingVerificationTokenError` instead of returning an empty
result. `runCapability(id, { mode })` selects `raw`, `standard`, `concise` or `json`.
