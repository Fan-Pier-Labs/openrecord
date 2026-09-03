/**
 * Emergency contacts processor. Field decisions: docs/processor-layer-proposal.md,
 * `get_emergency_contacts`.
 *
 * `GetRelationships` keys the list as `contacts`, with the name under
 * `formattedName`, the relationship under `relationToPatient` and the phone
 * numbers under `contactInformation.phoneNumbers`. `isEmergencyContact` is
 * sent by one captured instance only; where an instance omits it the field is
 * `null` (the page is the emergency-contacts page, so absent reads as true,
 * but the processor does not fill in a value MyChart did not send).
 */

import { bodyOf, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { boolOrNull, list, rec, strings, textOrNull } from '../../processors/read';

export interface PhoneNumberStandard {
  phoneNumber: string | null;
  type: string | null;
}

export interface EmergencyContactStandard {
  /** Handle: `update_emergency_contact` and `remove_emergency_contact` take it. */
  id: string | null;
  formattedName: string | null;
  relationToPatient: { name: string | null };
  contactInformation: {
    phoneNumbers: PhoneNumberStandard[];
    emailAddress: string | null;
    address: { formattedValues: string[] };
  };
  isPrimaryContact: boolean | null;
  isEmergencyContact: boolean | null;
}

export interface EmergencyContactsStandard {
  /** The instance hides the section; explains an empty list. */
  hideEmergencyContacts: boolean | null;
  contacts: EmergencyContactStandard[];
}

export const emergencyContactsProcessor: Processor<EmergencyContactsStandard> = {
  standard(raw: RawResponse): EmergencyContactsStandard {
    const body = rec(bodyOf(raw, 'GetRelationships'));
    return {
      hideEmergencyContacts: boolOrNull(body.hideEmergencyContacts),
      contacts: list(body.contacts).map((value) => {
        const c = rec(value);
        const info = rec(c.contactInformation);
        return {
          id: textOrNull(c.id),
          formattedName: textOrNull(c.formattedName),
          relationToPatient: { name: textOrNull(rec(c.relationToPatient).name) },
          contactInformation: {
            phoneNumbers: list(info.phoneNumbers).map((p) => ({
              phoneNumber: textOrNull(rec(p).phoneNumber),
              type: textOrNull(rec(p).type),
            })),
            emailAddress: textOrNull(info.emailAddress),
            address: { formattedValues: strings(rec(info.address).formattedValues) },
          },
          isPrimaryContact: boolOrNull(c.isPrimaryContact),
          isEmergencyContact: boolOrNull(c.isEmergencyContact),
        };
      }),
    };
  },
  /** One phone number per contact. */
  concise(standard) {
    return {
      contacts: standard.contacts.map((c) => ({
        id: c.id,
        formattedName: c.formattedName,
        relationToPatient: c.relationToPatient,
        contactInformation: { phoneNumbers: c.contactInformation.phoneNumbers.slice(0, 1) },
      })),
    };
  },
};
