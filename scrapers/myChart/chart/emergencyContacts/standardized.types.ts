/**
 * What the `emergencyContacts` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

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
