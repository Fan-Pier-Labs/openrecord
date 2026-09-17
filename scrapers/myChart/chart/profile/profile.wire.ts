/**
 * Raw MyChart responses for the `profile` scraper.
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
 * Endpoints: /personalinformation/getcontactinformation
 *
 * Keep in step with the captures; `scrapers/myChart/__tests__/wireShapes.unit.test.ts`
 * fails the build if these miss a field or invent one.
 */

import type { County } from '../../wire/shared';

/** `/personalinformation/getcontactinformation` */
export type GetContactInformation = {
  PermanentAddress: {
    IsViewOnly: boolean;
    RequiredFieldNames: unknown[];
    Success: boolean;
    IsPending: boolean;
    Street: string;
    City: string;
    County: County;
    State: County;
    Zip: string;
    Country: County;
    HouseNumber: string;
    District: County;
    Building: string;
    Floor: string;
    Unit: string;
    FormattedValues: string[];
    AllowArbitraryInput: boolean;
    AllowDefaults: boolean;
    GeocodeScore: unknown;
    GeocodeLatitude: unknown;
    GeocodeLongitude: unknown;
    GeocodeGranularity: unknown;
  };
  TemporaryAddress: {
    PhoneNumber: string;
    StartDateDisplay: unknown;
    EndDateDisplay: unknown;
    StartDateISO: string;
    EndDateISO: string;
    RequiredFieldNames: unknown[];
    Success: boolean;
    IsPending: boolean;
    CollapsedStatus: unknown;
    Street: string;
    City: string;
    County: County;
    State: County;
    Zip: string;
    Country: County;
    HouseNumber: string;
    District: County;
    Building: string;
    Floor: string;
    Unit: string;
    FormattedValues: unknown[];
    AllowArbitraryInput: boolean;
    AllowDefaults: boolean;
    GeocodeScore: unknown;
    GeocodeLatitude: unknown;
    GeocodeLongitude: unknown;
    GeocodeGranularity: unknown;
  };
  PermanentDefaults: unknown[];
  TemporaryDefaults: unknown[];
  AllowArbitraryInput: boolean;
  AllowDefaults: boolean;
  SecureCommunicationInfo: {
    SecureEmail: string;
    EmailAddress: string;
    SecureMobile: string;
    MobilePhone: string;
    CanSupportEmail: boolean;
    CanSupportMobile: boolean;
    CanSupportOverwrite: boolean;
    DoesEmailNeedAttention: boolean;
    DoesMobileNeedAttention: boolean;
    IsEmailDeleted: boolean;
    IsMobileDeleted: boolean;
    AreBothDeleted: boolean;
    AreNeitherDeleted: boolean;
    DoBothNeedAttention: boolean;
    DoNeitherNeedAttention: boolean;
    ContactVerificationDisabled: boolean;
  };
  HomePhone: string;
  WorkPhone: string;
  PreferredDevice: string;
  RequiredFieldNames: unknown[];
  IsNonPatientProxyRecord: boolean;
  IsTemporaryAddressDisabled: boolean;
  ValidationErrors: unknown[];
  IsPending: boolean;
  ReadOnlyFieldNames: unknown[];
  HasEditableField: boolean;
};
