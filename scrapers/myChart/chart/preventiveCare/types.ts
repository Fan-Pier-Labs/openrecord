/**
 * Raw MyChart responses for the `preventiveCare` scraper.
 *
 * Observed by the capture harness behind `fake-mychart/src/data/realShapes.ts`
 * on three real instances — what we have seen, never a contract Epic owes us.
 *
 * `unknown` means the field was `null` on every instance captured: we saw no
 * value, so we know no type. `unknown[]` means the array was always empty, so
 * we have never seen an element. Neither is `null` or `never[]`, which would
 * read as settled.
 *
 * Read a payload with `rec<T>()` from `processors/read.ts` — it checks the
 * field names and leaves every value to `text()` / `num()` / `list()`. Never
 * `as`: that checks the same names and then lies about the values.
 *
 * Keep in step with `realShapes.ts` when the captures are refreshed.
 */

/** `a bare string.` */
export type HealthAdvisoriesGetTopics = {
  HealthAdvisoryViewModelList?: Array<{
    TopicId?: string;
    CareGapType?: string;
    Name?: string;
    DueDateISO?: string;
    LastCompletedDateISO?: string;
    PostponedDateISO?: string;
    LastDoneDateISO?: string;
    StatusCode?: string;
    DueDateOverride?: string;
    Status?: string;
    CanRequestAppointment?: boolean;
    CanScheduleAppointment?: boolean;
    IsProviderFirst?: boolean;
    ContentLinkURL?: string;
    ContentLinkTarget?: string;
    FormattedDueDate?: string;
    FormattedPostponedDate?: string;
    FormattedLastDoneDate?: string;
    FormattedLastCompletedDate?: string;
    FormattedDoneDates?: string[];
    UpdateInformation?: {
      CanMarkAsComplete?: boolean;
      EarliestCompletionDateISO?: string;
      IsUpdatePending?: boolean;
      FormattedEnteredDate?: unknown;
      CanSubmitAttestation?: boolean;
      HasActiveAttestation?: boolean;
      HasHSDeclinedAttestation?: boolean;
      AttestationVersion?: number;
      PotentialCompletionInfo?: {
        RelevantAttestationTopicID?: unknown;
        AttestationStatus?: number;
        ServiceDateISO?: string;
        ServiceDateFormatted?: string;
        ServiceLocation?: string;
        Comments?: string;
        DocumentID?: unknown;
      };
      FormattedPendingAttestedDates?: unknown[];
      CanHideReminderFromHomePage?: boolean;
      IsHomePageReminderSnoozed?: boolean;
      HomePageReminderSnoozedUntilDateISO?: string;
      HomePageReminderSnoozedUntilDate?: string;
      HomePageReminderSnoozeDefaultDuration?: number;
    };
    HasUpcomingOrder?: boolean;
    HasScheduledOrder?: boolean;
    OrderId?: string;
    OrderTicketId?: string;
    IsActionable?: boolean;
    ActionDateISO?: string;
    SchedReasonForVisit?: string;
    SchedAppointmentDateISO?: string;
    SchedAppointmentCSN?: string;
    IsSchedulingSuppressed?: boolean;
    IsAppointmentPotentialCompletion?: boolean;
    FormattedSchedAppointmentDateISO?: string;
    LastRequestedDateISO?: string;
    FormattedLastRequestedDate?: string;
  }>;
  HealthAdvisorySettings?: {
    FormattedGeneralVisitDate?: string;
    GeneralVisitCSN?: string;
    HasApptDetailsSecurity?: boolean;
    HasUpcomingApptSecurity?: boolean;
  };
};
