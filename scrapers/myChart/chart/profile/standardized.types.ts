/**
 * What the `profile` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

export interface AddressStandard {
  FormattedValues: string[];
  Street: string | null;
  City: string | null;
  State: { Title: string | null };
  Zip: string | null;
  Country: { Title: string | null };
  HouseNumber: string | null;
  Building: string | null;
  Floor: string | null;
  Unit: string | null;
  PhoneNumber: string | null;
}

export interface TemporaryAddressStandard extends AddressStandard {
  StartDateDisplay: string | null;
  EndDateDisplay: string | null;
  StartDateISO: string | null;
  EndDateISO: string | null;
}

export interface ProfileStandard {
  /** Derived from the `/Home` print header. */
  name: string;
  dob: string;
  mrn: string;
  pcp: string;
  SecureCommunicationInfo: { EmailAddress: string | null; MobilePhone: string | null };
  HomePhone: string | null;
  WorkPhone: string | null;
  PreferredDevice: string | null;
  PermanentAddress: AddressStandard;
  TemporaryAddress: TemporaryAddressStandard;
  /**
   * Derived: `GetContactInformation` did not answer (the instance lacks it,
   * or it failed), so every field above from it is unknown, not empty.
   */
  contactInformationUnavailable: boolean;
}
