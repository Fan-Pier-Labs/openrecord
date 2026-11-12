// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Notification preferences processor. Field decisions: this folder's README.
 *
 * `GetPreferences` is normalised: groups, topics, channel toggles and
 * sub-option sections are four maps keyed by opaque `WP-…` ids, joined by id
 * lists. The standard object resolves those joins into one tree in MyChart's
 * own order and drops the ids — they are encrypted handles, not something a
 * reader can compare between orgs.
 */

import { bodyOf, okBodyOf, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { boolOrNull, list, num, rec, strings, textOrNull } from '../../processors/read';
import type { GetContactInformation, GetPreferences } from './mychart.types';
import type {
  AdditionalItemSectionStandard,
  NotificationConceptStandard,
  NotificationContactInformationStandard,
  NotificationMediaStandard,
  NotificationPreferencesStandard,
} from './standardized.types';

export type {
  AdditionalItemSectionStandard,
  NotificationConceptStandard,
  NotificationContactInformationStandard,
  NotificationGrouperStandard,
  NotificationMediaStandard,
  NotificationOptionStandard,
  NotificationPreferencesStandard,
} from './standardized.types';

/** `epic.px.client.communication-preferences`, module 546: the bundle's own decode tables. */
export const MEDIA_TYPE_NAMES: Readonly<Record<string, string>> = { 1: 'Email', 3: 'Mail', 4: 'Phone', 6: 'Push', 100: 'Text' };
export const TOGGLE_STATUS_NAMES: Readonly<Record<number, string>> = { 0: 'Off', 1: 'On', 3: 'LockedOn' };

function media(value: unknown): NotificationMediaStandard {
  const m = rec<NonNullable<GetPreferences['medias']>[string]>(value);
  const type = textOrNull(m.type);
  const toggleStatus = num(m.toggleStatus);
  return {
    type,
    channel: type === null ? null : MEDIA_TYPE_NAMES[type] ?? null,
    toggleStatus,
    status: toggleStatus === null ? null : TOGGLE_STATUS_NAMES[toggleStatus] ?? null,
  };
}

function section(value: unknown): AdditionalItemSectionStandard {
  const s = rec<NonNullable<GetPreferences['additionalItemSections']>[string]>(value);
  const descriptions = rec(s.optionDescriptionMap);
  const selections = rec(s.optionSelectionMap);
  return {
    sectionType: textOrNull(s.sectionType),
    sectionDescription: textOrNull(s.sectionDescription),
    options: strings(s.optionIds).map((id) => ({
      description: textOrNull(descriptions[id]),
      selected: boolOrNull(selections[id]),
    })),
  };
}

function contactInformation(value: unknown): NotificationContactInformationStandard {
  const c = rec<GetContactInformation>(value);
  return {
    email: textOrNull(c.email),
    mobilePhone: textOrNull(c.mobilePhone),
    emailPending: boolOrNull(c.emailPending),
    mobilePending: boolOrNull(c.mobilePending),
    mobileIsVerified: boolOrNull(c.mobileIsVerified),
    mediaTypesMissingContactMethod: list(c.mediaTypesMissingContactMethod),
    proxyContextName: textOrNull(c.proxyContextName),
  };
}

export const notificationPreferencesProcessor: Processor<NotificationPreferencesStandard> = {
  standard(raw: RawResponse): NotificationPreferencesStandard {
    const body = rec<GetPreferences>(bodyOf(raw, 'GetPreferences'));
    const groupers = rec(body.groupers);
    const concepts = rec(body.concepts);
    const medias = rec(body.medias);
    const sections = rec(body.additionalItemSections);
    const paperlessRequired = new Set(strings(body.paperlessBillingRequiredConcepts));

    const concept = (id: string): NotificationConceptStandard => {
      const c = rec<NonNullable<GetPreferences['concepts']>[string]>(concepts[id]);
      const conceptMedias = strings(c.mediaIds).filter((m) => m in medias).map((m) => media(medias[m]));
      const sectionId = textOrNull(c.additionalItemSectionId);
      return {
        title: textOrNull(c.title),
        description: textOrNull(c.description),
        medias: conceptMedias,
        channelsOn: conceptMedias
          .filter((m) => m.status !== 'Off' && m.status !== null)
          .map((m) => m.channel ?? `type ${m.type}`),
        requiredForPaperlessBilling: paperlessRequired.has(id),
        additionalItemSection: sectionId && sectionId in sections ? section(sections[sectionId]) : null,
      };
    };

    const contact = okBodyOf(raw, 'GetContactInformation');
    return {
      groupers: strings(body.grouperOrder)
        .filter((id) => id in groupers)
        .map((id) => {
          const g = rec<NonNullable<GetPreferences['groupers']>[string]>(groupers[id]);
          return {
            title: textOrNull(g.title),
            description: textOrNull(g.description),
            concepts: strings(g.conceptIds).filter((c) => c in concepts).map(concept),
            otherPreferencesLinkText: textOrNull(g.otherPreferencesLinkText),
          };
        }),
      smsFlagOn: boolOrNull(body.smsFlagOn),
      userAcceptsSms: boolOrNull(body.userAcceptsSms),
      contactInformation: contact === undefined ? null : contactInformation(contact),
      ...(contact === undefined ? { contactInformationUnavailable: true as const } : {}),
    };
  },
  /** Each topic and the channels it reaches the patient on; nothing else. */
  concise(standard) {
    return {
      groupers: standard.groupers.map((g) => ({
        title: g.title,
        concepts: g.concepts.map((c) => ({ title: c.title, channelsOn: c.channelsOn })),
      })),
      userAcceptsSms: standard.userAcceptsSms,
      ...(standard.contactInformationUnavailable ? { contactInformationUnavailable: true } : {}),
    };
  },
};
