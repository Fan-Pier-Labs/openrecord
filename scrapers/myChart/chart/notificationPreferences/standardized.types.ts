// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * What `get_notification_preferences` returns: the standard object the
 * processor builds from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

/** One delivery channel for one notification topic. */
export interface NotificationMediaStandard {
  /** MyChart's numeric channel code, as sent (`"1"`, `"100"`, …). */
  type: string | null;
  /** Derived: `type` decoded with the bundle's own table — Email, Text, Push, Phone or Mail. */
  channel: string | null;
  /** MyChart's numeric toggle state, as sent. */
  toggleStatus: number | null;
  /** Derived: `toggleStatus` decoded — On, Off or LockedOn (on, and the patient cannot turn it off). */
  status: string | null;
}

export interface NotificationOptionStandard {
  /** The option's label, from `optionDescriptionMap`. */
  description: string | null;
  /** From `optionSelectionMap`. */
  selected: boolean | null;
}

/** A topic's sub-options — which appointment changes to hear about, how far ahead to remind. */
export interface AdditionalItemSectionStandard {
  sectionType: string | null;
  sectionDescription: string | null;
  /** Derived: `optionIds` resolved through the two option maps, in `optionIds` order. */
  options: NotificationOptionStandard[];
}

/** One notification topic ("Test Result", "New Message", …). */
export interface NotificationConceptStandard {
  title: string | null;
  description: string | null;
  /** Derived: `mediaIds` resolved through `medias`, in MyChart's order. */
  medias: NotificationMediaStandard[];
  /**
   * Derived: the channels whose `status` is not Off. One whose `toggleStatus` is not in the
   * table is listed with the code — `Email (toggleStatus 2)` — so unknown never reads as off.
   */
  channelsOn: string[];
  /** Derived: this topic is in `paperlessBillingRequiredConcepts` — paperless billing needs it on by email or text. */
  requiredForPaperlessBilling: boolean;
  /** Derived: `additionalItemSectionId` resolved; null when the topic has no sub-options. */
  additionalItemSection: AdditionalItemSectionStandard | null;
}

/** A group of topics as the org arranges them ("Appointments", "Billing", …). */
export interface NotificationGrouperStandard {
  title: string | null;
  description: string | null;
  /** Derived: `conceptIds` resolved through `concepts`, in MyChart's order. */
  concepts: NotificationConceptStandard[];
  /** Where this group's settings continue on another page, when the org points there. */
  otherPreferencesLinkText: string | null;
}

export interface NotificationContactInformationStandard {
  email: string | null;
  mobilePhone: string | null;
  emailPending: boolean | null;
  mobilePending: boolean | null;
  mobileIsVerified: boolean | null;
  /** Channels that are on but have nowhere to deliver to. */
  mediaTypesMissingContactMethod: unknown[];
  /** Set when reading a family member's preferences. */
  proxyContextName: string | null;
}

export interface NotificationPreferencesStandard {
  /** Derived: `groupers` in `grouperOrder`. */
  groupers: NotificationGrouperStandard[];
  /** The org sends text messages at all. */
  smsFlagOn: boolean | null;
  /** The patient has agreed to receive text messages — Text toggles do nothing without it. */
  userAcceptsSms: boolean | null;
  /** Where notifications are delivered. Null when that request failed (see `contactInformationUnavailable`). */
  contactInformation: NotificationContactInformationStandard | null;
  /** Derived: present and true only when `GetContactInformation` failed. */
  contactInformationUnavailable?: true;
}
