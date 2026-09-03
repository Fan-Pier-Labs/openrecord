/**
 * What this instance tells anyone before login: the organization's contact
 * lines, its "Find a Doctor" directory, and its billing entities.
 *
 * Shapes and values were cut from live captures of five instances, then
 * replaced with the Springfield cast. The ids are WP-encoded on real
 * instances; these keep the `WP-24…` prefix so a client that pattern-matches
 * on it still recognizes them, and are otherwise obviously synthetic.
 *
 * The scheduling payloads are served through `conformToShape` against the
 * skeletons in `realShapes.ts`, so every field a real instance sends is
 * present. Two keys exist only on the newer scheduling build
 * (`Providers[].SpecialtySearchTerms`, `WorkflowSettings.UseLegacyQuestionnaires`)
 * and are added by the route on the `November 2025` knob, not here.
 */

const id = (n: number) => `WP-24FAKE${String(n).padStart(4, '0')}-3D-3D-24xxxxxxxxxxxxxxxxxxxx-3D`;

// ─── Login shell mnemonics ──────────────────────────────────────────────────
//
// Every pre-login page registers these for its UI copy. Values are HTML —
// a `tel:` anchor for a phone the org set, Epic's `(555) 555-5555`
// placeholder for one it didn't, and `HTMLUnencode(...)` around plain text.
export const PRELOGIN_MNEMONICS: Record<string, { value: string; unencode?: boolean }> = {
  APPTITLE: { value: 'MyChart' },
  ORGNAME: { value: 'Springfield General Hospital', unencode: true },
  MYORGNAME: { value: 'Springfield General Hospital', unencode: true },
  HELPDESKPHONE: { value: "<span dir='ltr'><a href='tel:5550100100'>555-010-0100</a></span>" },
  SCHEDULINGPHONE: { value: "<span dir='ltr'><a href='tel:5550100200'>555-010-0200</a></span>" },
  BILLINGPHONE: { value: "<span dir='ltr'><a href='tel:5555555555'>(555) 555-5555</a></span>" },
  EMERGENCYPHONE: { value: ' 911 ' },
  HELPEMAIL: { value: 'MyChartSupport@DoNotUse.DoNotUse', unencode: true },
};

// ─── Open scheduling ────────────────────────────────────────────────────────

export const SPECIALTIES = [
  { Id: id(1), Name: 'Primary Care', HelpText: null, PhotoUrl: null, StandardSpecialtyValue: null },
  { Id: id(2), Name: 'Cardiology', HelpText: null, PhotoUrl: null, StandardSpecialtyValue: null },
  { Id: id(3), Name: 'Dermatology', HelpText: null, PhotoUrl: null, StandardSpecialtyValue: null },
];

export const WORKFLOW_DATA = {
  WorkflowSettings: {
    WorkflowType: 2,
    FromDaysOffset: 0,
    ToDaysOffset: 400,
    NewProvFromDaysOffset: 0,
    NewProvToDaysOffset: 120,
    AllowedSpecialtyIds: [],
    PromotedSpecialtyIds: [id(1)],
    DaysOfWeekList: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    AllowTeamScheduling: 2,
    ShowTeamBeforeSearch: 2,
    MaxCommentsLength: 500,
    MultiPhaseECheckInOn: true,
    AllowOpenSchedulingWizard: true,
    AllowOnMyWay: true,
    RequireRescheduleReason: true,
    RescheduleReasons: [
      { Value: '91', Number: '91', Title: 'Conflict in Schedule', Abbreviation: 'MyCht - Sch', IsInactive: false, TitleUtf8: 'Conflict in Schedule', AbbreviationUtf8: 'MyCht - Sch', IsFallbackUsed: true },
    ],
    LocationGroupMethod: 1,
    LocationGroupingBehavior: 1,
    ProviderNameDisplayFormat: 1,
    ShowSidebarLinks: true,
    GeolocationNumLocationsToSelect: 6,
    GeolocationInnerRadius: 10,
    GeolocationOuterRadius: 50,
    MaxOpenSchedulingApptCount: 999,
    CurrentDTE: 67816,
    IsReservationAllowed: true,
    GeolocationDistanceUnits: 1,
    AllowSelfSignup: false,
    IsLoginEnabled: true,
    IsWorkflowTurnedOn: true,
    DisableScheduleAsGuest: false,
    HasSeparateLocationSelectionInTicketBundles: true,
    HasPatientLocationRule: true,
    EmbeddedConsecutiveSlotLoadLimit: 5,
    SourceWorkflow: 2,
  },
  HomeOrganizationName: 'Springfield General Hospital',
  Specialties: SPECIALTIES,
  OnDemandTelehealthData: {
    TelehealthLocations: [
      { Number: '1', Value: '1', Title: 'United States', Abbreviation: 'US', SelectedByDefault: false, SubLocations: [] },
    ],
  },
};

const DEPARTMENTS = [
  {
    ID: id(10),
    Name: 'Springfield Family Medicine',
    Address: ['742 Evergreen Terrace', 'Suite 100', 'Springfield OR 97475'],
    Coordinates: { Latitude: 44.05, Longitude: -123.09 },
    PhoneNumber: '555-010-0100',
    OverridePhoneNumber: '',
    IsUsingOverridePhoneNumber: false,
    TimeZone: {
      CacheTimeZone: { Number: '10', Title: 'America/Los_Angeles', Abbr: 'America/LA', Comment: '', IsInactive: false, IsFallbackUsed: false },
      DisplayName: 'PDT',
    },
    FromDaysOffset: 7,
    ToDaysOffset: 395,
    LookbackDays: 730,
    AllowAppointmentRequest: true,
    SpecialtyGroupId: id(1),
    IsEnabledForNewProviderWorkflow: true,
    HoursOfOperation: [],
    PhotoUrl: '',
    CanLoginToSchedule: false,
  },
  {
    ID: id(11),
    Name: 'Shelbyville Clinic',
    Address: ['1 Shelbyville Way', 'Shelbyville OR 97476'],
    Coordinates: { Latitude: 44.06, Longitude: -123.1 },
    PhoneNumber: '555-010-0300',
    OverridePhoneNumber: '555-010-0301',
    IsUsingOverridePhoneNumber: true,
    TimeZone: {
      CacheTimeZone: { Number: '10', Title: 'America/Los_Angeles', Abbr: 'America/LA', Comment: '', IsInactive: false, IsFallbackUsed: false },
      DisplayName: 'PDT',
    },
    FromDaysOffset: 7,
    ToDaysOffset: 395,
    LookbackDays: 730,
    AllowAppointmentRequest: true,
    SpecialtyGroupId: id(1),
    IsEnabledForNewProviderWorkflow: true,
    HoursOfOperation: [],
    PhotoUrl: '',
    CanLoginToSchedule: false,
  },
];

type Person = {
  n: number;
  name: string;
  lastFirst: string;
  gender: string;
  credentials: string;
  specialties: { Value: string; Title: string; Abbreviation: string }[];
  languages: string[];
  photo: string;
  departments: number[];
  /** Which "Find a Doctor" specialties list this provider (indexes into SPECIALTIES). */
  finder: number[];
};

const PEOPLE: Person[] = [
  { n: 20, name: 'Julius Hibbert, MD', lastFirst: 'Hibbert, Julius, MD', gender: 'Male', credentials: 'Physician', specialties: [{ Value: '9', Title: 'Family Practice', Abbreviation: 'FP' }], languages: ['English'], photo: '/MyChart/en-us/images/providers/hibbert.jpg', departments: [10], finder: [0, 1] },
  { n: 21, name: 'Nick Riviera, MD', lastFirst: 'Riviera, Nick, MD', gender: 'Male', credentials: 'Physician', specialties: [{ Value: '17', Title: 'Internal Medicine', Abbreviation: 'IM' }], languages: ['English', 'Spanish'], photo: '', departments: [10, 11], finder: [0] },
  { n: 22, name: 'Marvin Monroe, NP', lastFirst: 'Monroe, Marvin, NP', gender: 'Male', credentials: 'Nurse Practitioner', specialties: [{ Value: '64', Title: 'Nurse Practitioner', Abbreviation: 'NP' }, { Value: '17', Title: 'Internal Medicine', Abbreviation: 'IM' }], languages: ['English'], photo: '', departments: [11], finder: [0] },
  { n: 23, name: 'Cardio Carlson, MD', lastFirst: 'Carlson, Cardio, MD', gender: 'Female', credentials: 'Physician', specialties: [{ Value: '6', Title: 'Cardiology', Abbreviation: 'CARD' }], languages: ['English'], photo: '', departments: [11], finder: [1] },
];

function provider(p: Person) {
  return {
    Name: p.name,
    NameLastFirst: p.lastFirst,
    BioSlug: p.name.replace(/[^A-Za-z]/g, ''),
    BioId: id(p.n + 100),
    PcpType: null,
    SpecialtyIds: p.specialties.map((s) => s.Value),
    Specialties: p.specialties.map((s) => ({ ...s, Number: s.Value, Abbr: null, Comment: null, IsInactive: false, TitleUtf8: s.Title, AbbreviationUtf8: s.Abbreviation, IsFallbackUsed: true })),
    PhotoUrl: p.photo,
    WebPageUrl: `app/providers/details?id=${id(p.n)}`,
    AllowedTelemedicineLocations: '1:,2',
    PhotoClass: 'color1',
    IsStandardProvider: false,
    IsPCP: false,
    TeamProviders: [],
    Languages: p.languages,
    Gender: p.gender,
    Credentials: p.credentials,
    ClinicalInterests: [],
    Affiliations: null,
    ID: id(p.n),
    NameUTF8: null,
  };
}

/** The search terms the newer build attaches to a provider (`November 2025` knob). */
export function specialtySearchTermsFor(p: { Specialties: { Title: string }[] }) {
  return p.Specialties.map((s, i) => ({ Id: String(1000 + i), Title: s.Title, Description: null, IconCategoryValue: 0, IconPath: null, TermSlug: null }));
}

/** One specialty's payload: the providers listed under it, and every department they work at. */
export function specialtyData(specialtyId: string) {
  const index = SPECIALTIES.findIndex((s) => s.Id === specialtyId);
  const people = index < 0 ? [] : PEOPLE.filter((p) => p.finder.includes(index));
  const departmentIds = new Set(people.flatMap((p) => p.departments));
  return {
    WorkflowSettings: null,
    Providers: people.map(provider),
    Departments: DEPARTMENTS.filter((d) => [...departmentIds].some((n) => d.ID === id(n))),
    Locations: [
      { Name: 'Springfield Area', Address: [], Coordinates: { Latitude: null, Longitude: null }, DistanceFromHome: null, DepartmentIds: DEPARTMENTS.map((d) => d.ID), ID: id(30), NameUTF8: null },
    ],
    TelehealthLocations: null,
    HomeOrganizationName: 'Springfield General Hospital',
    ProviderDepartmentPairs: people.flatMap((p) =>
      p.departments.map((d) => ({
        ProviderId: id(p.n),
        DepartmentId: id(d),
        ChildProviderIds: [],
        IsTeamMember: false,
        CanRequest: false,
        CanScheduleTelemedicine: true,
        CanLoginToSchedule: false,
        VisitTypeInformation: [],
        IsInNetwork: false,
        PoolLine: null,
        PoolTier: null,
      })),
    ),
    ReasonsForVisit: [
      { Id: id(40), CategoryValue: 'newprov_1', Title: 'New Patient Visit', DisplayName: 'New Patient Visit', CanDirectSchedule: true, CanRequest: true, CanRequestWithoutOverrides: true, DefaultVisitTypeId: id(41), AllowProviderSelect: true, ReasonForVisitFirst: true, ProviderFirst: false },
    ],
    ReasonForVisitDepartmentOverrides: [],
    VisitTypes: [],
    ActionPreviews: [],
    VisitTypeDepartmentOverrides: [],
    Specialties: [],
    Tickets: [],
    OrderMap: {},
  };
}

// ─── Guest estimates ────────────────────────────────────────────────────────

export const SERVICE_AREAS = [
  { Id: id(50), Title: 'Springfield General Hospital', Phone: '555-010-0400', PhoneText: 'Customer service: 555-010-0400', Description: '', LogoURL: '', DefaultLogoURL: null, SelectLocations: true, BillingSystem: 3 },
  { Id: id(51), Title: 'Shelbyville Physicians Group', Phone: '555-010-0500', PhoneText: 'Customer service: 555-010-0500', Description: '', LogoURL: '', DefaultLogoURL: null, SelectLocations: false, BillingSystem: 1 },
];

export const FACILITIES = [
  { Id: id(60), Title: 'Springfield General Hospital Main Campus', Phone: '555-010-0400', PhoneText: 'Customer service: 555-010-0400', Description: '', LogoURL: '', DefaultLogoURL: null, SelectLocations: false, BillingSystem: 3 },
  { Id: id(61), Title: 'Springfield Outpatient Center', Phone: '555-010-0400', PhoneText: 'Customer service: 555-010-0400', Description: '', LogoURL: '', DefaultLogoURL: null, SelectLocations: false, BillingSystem: 3 },
];
