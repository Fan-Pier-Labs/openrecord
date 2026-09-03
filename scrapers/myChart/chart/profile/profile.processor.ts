/**
 * Profile processor. Field decisions: docs/processor-layer-proposal.md, `get_profile`.
 *
 * Two sources: the `/Home` page's print header (name, DOB, MRN, PCP — parsed,
 * so derived) and `GetContactInformation` (the rest). The contact call is
 * optional on some instances, so every field from it is nullable.
 */

import { bodyOf, findRequest, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { rec, strings, text, textOrNull } from '../../processors/read';
import { parseProfileHtml } from './profileHtml';

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
}

function address(value: unknown): AddressStandard {
  const a = rec(value);
  return {
    FormattedValues: strings(a.FormattedValues),
    Street: textOrNull(a.Street),
    City: textOrNull(a.City),
    State: { Title: textOrNull(rec(a.State).Title) },
    Zip: textOrNull(a.Zip),
    Country: { Title: textOrNull(rec(a.Country).Title) },
    HouseNumber: textOrNull(a.HouseNumber),
    Building: textOrNull(a.Building),
    Floor: textOrNull(a.Floor),
    Unit: textOrNull(a.Unit),
    PhoneNumber: textOrNull(a.PhoneNumber),
  };
}

export const profileProcessor: Processor<ProfileStandard> = {
  standard(raw: RawResponse): ProfileStandard {
    const home = text(findRequest(raw, '/Home')?.body);
    const header = parseProfileHtml(home) ?? { name: '', dob: '', mrn: '', pcp: '' };
    const contact = rec(bodyOf(raw, 'GetContactInformation'));
    const secure = rec(contact.SecureCommunicationInfo);
    const temporary = rec(contact.TemporaryAddress);
    return {
      ...header,
      SecureCommunicationInfo: {
        EmailAddress: textOrNull(secure.EmailAddress),
        MobilePhone: textOrNull(secure.MobilePhone),
      },
      HomePhone: textOrNull(contact.HomePhone),
      WorkPhone: textOrNull(contact.WorkPhone),
      PreferredDevice: textOrNull(contact.PreferredDevice),
      PermanentAddress: address(contact.PermanentAddress),
      TemporaryAddress: {
        ...address(temporary),
        StartDateDisplay: textOrNull(temporary.StartDateDisplay),
        EndDateDisplay: textOrNull(temporary.EndDateDisplay),
        StartDateISO: textOrNull(temporary.StartDateISO),
        EndDateISO: textOrNull(temporary.EndDateISO),
      },
    };
  },
  concise(standard) {
    return {
      name: standard.name,
      dob: standard.dob,
      mrn: standard.mrn,
      pcp: standard.pcp,
      EmailAddress: standard.SecureCommunicationInfo.EmailAddress,
    };
  },
};
