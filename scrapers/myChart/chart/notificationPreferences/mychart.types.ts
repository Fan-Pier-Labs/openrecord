// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Raw MyChart responses for the `notificationPreferences` scraper.
 *
 * Observed on five real instances (November 2026) — what we have seen, never
 * a contract Epic owes us. Every id below is an opaque `WP-…` string; the maps
 * keyed by them are the payload's own normalisation, not lists.
 *
 * Read a payload with `rec<T>()` from `../../processors/read.ts` — never `as`.
 *
 * Endpoints: /api/communicationPreferences/GetPreferences,
 * /api/communicationPreferences/GetContactInformation
 *
 * Keep in step with `realShapes.ts` when the captures are refreshed.
 */

/** `/api/communicationPreferences/GetPreferences` */
export type GetPreferences = {
  groupers?: Record<string, {
    hstId?: string;
    title?: string;
    description?: string;
    conceptIds?: string[];
    otherPreferencesLinkPath?: string;
    otherPreferencesLinkText?: string;
  }>;
  concepts?: Record<string, {
    hstId?: string;
    title?: string;
    description?: string;
    mediaIds?: string[];
    additionalItemSectionId?: string;
  }>;
  /** `type` is a numeric code as a string; `toggleStatus` a number. Both decoded in the processor. */
  medias?: Record<string, {
    mediaId?: string;
    type?: string;
    toggleStatus?: number;
  }>;
  additionalItemSections?: Record<string, {
    sectionType?: string;
    optionDescriptionMap?: Record<string, string>;
    optionSelectionMap?: Record<string, boolean>;
    optionIds?: string[];
    sectionDescription?: string;
    sectionId?: string;
    dropDownAdditionalItemId?: string;
  }>;
  grouperOrder?: string[];
  paperlessBillingRequiredConcepts?: string[];
  canApplyToAll?: boolean;
  smsFlagOn?: boolean;
  userAcceptsSms?: boolean;
  showContactInformation?: boolean;
  grouperIdToExpandOnLoad?: string;
};

/** `/api/communicationPreferences/GetContactInformation` */
export type GetContactInformation = {
  email?: string;
  mobilePhone?: string;
  emailPending?: boolean;
  mobilePending?: boolean;
  showLinkToContactInfo?: boolean;
  /** Always empty on the five instances captured. */
  mediaTypesMissingContactMethod?: unknown[];
  proxyContextName?: string;
  mobileIsVerified?: boolean;
};
