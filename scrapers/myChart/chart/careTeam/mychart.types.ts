/**
 * Raw MyChart responses for the `careTeam` scraper.
 *
 * Observed by the capture harness behind `fake-mychart/src/data/realShapes.ts`
 * on three real instances — what we have seen, never a contract Epic owes us.
 *
 * `unknown` means the field was `null` on every instance captured: we saw no
 * value, so we know no type. `unknown[]` means the array was always empty, so
 * we have never seen an element. Neither is `null` or `never[]`, which would
 * read as settled.
 *
 * Read a payload with `rec<T>()` from `../../processors/read.ts` — it checks the
 * field names and leaves every value to `text()` / `num()` / `list()`. Never
 * `as`: that checks the same names and then lies about the values.
 *
 * Endpoints: /
 *
 * Keep in step with `realShapes.ts` when the captures are refreshed.
 */

/** `/ `SchedulableVisitTypes` are null on both instances.` */
export type CareTeamLoad = {
  ProvidersList?: Array<{
    ID?: string;
    Name?: string;
    Photo?: string;
    NationalProviderID?: string;
    WebPageUrl?: string;
    InfoBlurbUrl?: string;
    AboutMeBlurb?: unknown[];
    CanViewProviderDetails?: boolean;
    CanDirectSchedule?: boolean;
    CanRequestAppointment?: boolean;
    CanMessage?: boolean;
    CommCenterMessageUrl?: string;
    CanRequestCustomAppt?: boolean;
    HasNoProviderRecord?: boolean;
    IsNewSchedulingEnabled?: boolean;
    Specialty?: string;
    Relation?: string;
    SchedulableVisitTypes?: unknown;
    DepartmentID?: string;
    Organizations?: unknown;
    IsExternal?: boolean;
    CareTeamStatus?: number;
    CanHideProvider?: boolean;
  }>;
  DescriptiveTitle?: string;
  TabColorClass?: string;
  IsCustomApptReqEnabled?: boolean;
  CustomRequestAppointmentLink?: string;
};

/** `because their element shape has never been seen.` */
export type GetProviderBioPrivate = {
  name?: string;
  photoUrl?: string;
  staticPhotoUrl?: string;
  bioPath?: string;
  bioSlug?: string;
  bioId?: string;
  nameLastFirst?: string;
  providerPatientRelation?: number;
  gender?: string;
  race?: unknown[];
  ethnicity?: unknown[];
  credentials?: string;
  languages?: unknown[];
  clinicalInterests?: unknown[];
  specialtyIds?: string[];
  locations?: Array<{
    id?: string;
    recordType?: number;
    name?: string;
    address?: string[];
    discreteAddress?: {
      streetAddress?: string[];
      city?: string;
      state?: string;
      stateName?: string;
      zip?: string;
      country?: string;
    };
    coordinates?: {
      latitude?: number;
      longitude?: number;
    };
    phoneNumber?: string;
    accessRestrictions?: unknown[];
    telehealthStyles?: unknown[];
    isInNetwork?: boolean;
    seesNewPatients?: string;
    bioSlug?: string;
    bioId?: string;
  }>;
  aboutMe?: string;
  videos?: unknown[];
  webPageUrl?: string;
  npi?: string;
  patientGroupsSeen?: unknown[];
  seesNewPatients?: string;
  specialties?: string[];
  standardFilterNames?: unknown[];
  nrxFilterNames?: unknown[];
  managedCareFilterName?: string;
  rating?: {
    ratingValue?: number;
    ratingMaxValue?: number;
    ratingCount?: number;
  };
  reviews?: unknown[];
  educationEntries?: unknown[];
  publications?: unknown[];
  allPublicationsUrl?: string;
  affiliations?: unknown[];
  keywords?: unknown[];
  boardCertifications?: unknown[];
  licenses?: Array<{
    state?: string;
    licenseNumber?: string;
  }>;
  hospitalAffiliations?: unknown[];
  isInternal?: boolean;
  completedCulturalTraining?: string;
  specialtySearchTerms?: unknown[];
  id?: string;
};
