/**
 * Raw MyChart responses for the `emergencyContacts` scraper.
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
 * Endpoints: /api/personalinformation/getrelationships
 *
 * Keep in step with `realShapes.ts` when the captures are refreshed.
 */

/** `/api/personalinformation/getrelationships` */
export type GetRelationships = {
  isViewOnly?: boolean;
  hideEmergencyContacts?: boolean;
  contacts?: Array<{
    id?: string;
    formattedName?: string;
    relationToPatient?: {
      name?: string;
      labelText?: string;
      isInactive?: boolean;
    };
    isPrimaryContact?: boolean;
    isLinkedToOtherPatient?: boolean;
    isHCA?: boolean;
    isAddressLinkedToPatient?: boolean;
    contactInformation?: {
      address?: {
        street?: string;
        city?: string;
        county?: {
          number?: string;
          title?: string;
          isInactive?: boolean;
        };
        state?: {
          number?: string;
          title?: string;
          abbreviation?: string;
          isInactive?: boolean;
        };
        zip?: string;
        country?: {
          number?: string;
          title?: string;
          isInactive?: boolean;
        };
        houseNumber?: string;
        district?: {
          number?: string;
          abbreviation?: string;
          isInactive?: boolean;
        };
        formattedValues?: string[];
        allowArbitraryInput?: boolean;
        allowDefaults?: boolean;
      };
      emailAddress?: string;
      phoneNumbers?: Array<{
        phoneNumber?: string;
        type?: string;
      }>;
    };
    savedSuccessfully?: boolean;
    isPending?: boolean;
    isVRK?: boolean;
  }>;
  relationToPatientChoices?: Array<{
    name?: string;
    labelText?: string;
    isInactive?: boolean;
  }>;
  requiredFields?: unknown[];
  vrkFields?: unknown[];
  hasEndOfLifePageMnemonic?: boolean;
};
