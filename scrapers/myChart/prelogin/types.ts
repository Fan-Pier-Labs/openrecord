/**
 * What a MyChart instance says about the health system behind it, to anyone —
 * no account, no login.
 *
 * Every field here comes from a page or endpoint an anonymous browser can open:
 * the login shell, the "Find a Doctor" open-scheduling workflow, and the guest
 * price-estimate flow. See `networkProfile.ts` for where each one is read.
 *
 * `fax` is deliberately absent. MyChart never publishes one — not on the login
 * page, the FAQ, the terms, the privacy policy, nor any captured post-login
 * response — so a field for it would only ever be null.
 */

/** A phone number as MyChart renders it, plus the digits behind it. */
export type PhoneNumber = {
  /** The text a patient sees: "555-010-0100", or a vanity "800-4Sprng". */
  display: string;
  /**
   * The digits from the `tel:` link when the page rendered one, else the
   * digits found in `display`. Null for a vanity number with no `tel:` link.
   */
  digits: string | null;
};

/** The organization's own contact lines, as inlined on every pre-login page. */
export type OrgProfile = {
  /** `@MYCHART@ORGNAME@` — "Springfield General Hospital". */
  organizationName: string | null;
  /** `@MYCHART@APPTITLE@` — what the org calls its portal ("MySpringfield Chart"). */
  portalBrand: string | null;
  /** `@MYCHART@ABSOLUTEURL@` — the mount prefix the page was served under ("/MyChart-SGH/"). */
  mountPath: string | null;
  phones: {
    helpDesk: PhoneNumber | null;
    scheduling: PhoneNumber | null;
    billing: PhoneNumber | null;
  };
  /** `@MYCHART@HELPEMAIL@`, when it is not Epic's `DoNotUse` placeholder. */
  supportEmail: string | null;
};

export type Specialty = {
  id: string;
  name: string;
};

export type Provider = {
  /** Opaque, per-instance provider id (WP-encoded). Stable across specialties. */
  id: string;
  /** "Jane Doe, MD" */
  name: string;
  /** "Doe, Jane, MD" */
  nameLastFirst: string;
  /** "Physician", "Nurse Practitioner", … */
  credentials: string;
  /** Clinical specialties as the instance titles them ("Internal Medicine"). */
  specialties: string[];
  gender: string;
  languages: string[];
  photoUrl: string | null;
  /** URL slug of the provider's bio page (the page itself needs a login). */
  bioSlug: string | null;
  /** Ids into `clinics` — every department this provider is bookable at. */
  clinicIds: string[];
  /** The "Find a Doctor" specialties this provider was listed under. */
  finderSpecialties: string[];
  /**
   * Search terms the newer scheduling build attaches to a provider. Absent on
   * older builds — three of the five captured instances sent it, two did not.
   */
  searchTerms?: string[];
};

export type Clinic = {
  /** Opaque department id (WP-encoded). */
  id: string;
  name: string;
  /** Street lines then "City ST 12345", exactly as the instance renders them. */
  addressLines: string[];
  phone: string | null;
  coordinates: { latitude: number; longitude: number } | null;
  /** IANA zone name ("America/New_York") when the instance sent one. */
  timeZone: string | null;
};

/** A billing entity from the guest price-estimate flow, with its facilities. */
export type BillingEntity = {
  id: string;
  name: string;
  /** The customer-service line for this entity's bills. */
  phone: string | null;
  logoUrl: string | null;
  /** Hospitals / campuses under this entity, when the instance groups by location. */
  facilities: { id: string; name: string }[];
};

/**
 * Which features this portal has switched on, from the open-scheduling
 * workflow settings. Useful before anyone has an account.
 */
export type PortalFeatures = {
  selfSignup: boolean;
  loginEnabled: boolean;
  openScheduling: boolean;
  scheduleAsGuest: boolean;
  onMyWay: boolean;
  onDemandVideoVisits: boolean;
};

export type ProviderDirectory = {
  specialties: Specialty[];
  providers: Provider[];
  clinics: Clinic[];
  features: PortalFeatures;
  /** `HomeOrganizationName` from the workflow, which can differ from the login page's. */
  organizationName: string | null;
};

/**
 * Accepted-insurance status. The payer list sits on the last page of the
 * guest estimate flow, behind a price-transparency disclaimer whose accept
 * step is protected by reCAPTCHA. The scraper reports the gate; it never
 * tries to get past it.
 */
export type InsuranceAvailability = {
  status: 'gated';
  reason: string;
};

export type HospitalNetworkProfile = {
  /** The host that actually serves MyChart — discovery may have moved us. */
  hostname: string;
  /** Mount prefix without slashes ("MyChart-SGH"), or null at the domain root. */
  mount: string | null;
  profile: OrgProfile;
  directory: ProviderDirectory | null;
  billingEntities: BillingEntity[] | null;
  insurance: InsuranceAvailability;
  /**
   * Sections that could not be read, with why. A portal with open scheduling
   * switched off is not an error for the contact profile, so each section
   * fails on its own.
   */
  warnings: string[];
};

/**
 * One open appointment slot, as the anonymous scheduling search returns it.
 *
 * `providerId` and `clinicId` are the same opaque ids `Provider.id` and
 * `Clinic.id` carry, so a slot joins straight onto the directory.
 */
export type OpenSlot = {
  providerId: string;
  clinicId: string;
  visitTypeId: string | null;
  /** ISO instant ("2026-09-08T17:00:00Z"). Null if the instance omitted it. */
  startUtc: string | null;
  /** The clinic's own rendering — "Tuesday September 8, 2026" / "1:00 PM". */
  localDate: string | null;
  localTime: string | null;
  /** "EDT", "PST" — the marker MyChart displays, not an IANA zone. */
  timeZoneMarker: string | null;
  lengthInMinutes: number | null;
  /** 1 = in person, 2 = video, on every instance captured so far. */
  telehealthMode: number | null;
  /** The untouched slot record, so nothing MyChart sent is lost. */
  raw: unknown;
};

export type SlotSearchResult = {
  specialty: Specialty;
  slots: OpenSlot[];
  /** How many `GetSlots` round trips it took. */
  pages: number;
  /** The instance applied back-pressure and the walk stopped early. */
  throttled: boolean;
  /** The server reported the search finished rather than the page cap hitting. */
  complete: boolean;
};
