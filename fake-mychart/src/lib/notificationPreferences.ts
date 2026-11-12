// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import type * as homer from '../data/homer';

/**
 * Real `GetPreferences` is normalised: groups, topics, channel toggles and
 * sub-option sections are four maps keyed by opaque `WP-…` ids, joined by id
 * lists, with group order in `grouperOrder`. The fixture is the readable tree;
 * this builds the wire shape from it.
 */
export function getPreferencesWireShape(prefs: typeof homer.notificationPreferences) {
  const groupers: Record<string, unknown> = {};
  const concepts: Record<string, unknown> = {};
  const medias: Record<string, unknown> = {};
  const additionalItemSections: Record<string, unknown> = {};
  const grouperOrder: string[] = [];
  const paperlessBillingRequiredConcepts: string[] = [];

  prefs.groupers.forEach((g, gi) => {
    const grouperId = `WP-24GRP${gi}`;
    grouperOrder.push(grouperId);
    const conceptIds = g.concepts.map((c, ci) => {
      const conceptId = `WP-24CPT${gi}x${ci}`;
      const mediaIds = c.medias.map((m, mi) => {
        const mediaId = `WP-24MED${gi}x${ci}x${mi}`;
        medias[mediaId] = { mediaId, type: m.type, toggleStatus: m.toggleStatus };
        return mediaId;
      });
      let additionalItemSectionId = '';
      if (c.additionalItemSection) {
        additionalItemSectionId = `WP-24SEC${gi}x${ci}`;
        const optionIds = c.additionalItemSection.options.map((_, oi) => `WP-24OPT${gi}x${ci}x${oi}`);
        additionalItemSections[additionalItemSectionId] = {
          sectionType: c.additionalItemSection.sectionType,
          optionDescriptionMap: Object.fromEntries(optionIds.map((id, oi) => [id, c.additionalItemSection!.options[oi]!.description])),
          optionSelectionMap: Object.fromEntries(optionIds.map((id, oi) => [id, c.additionalItemSection!.options[oi]!.selected])),
          optionIds,
          sectionDescription: c.additionalItemSection.sectionDescription,
          sectionId: additionalItemSectionId,
          dropDownAdditionalItemId: '',
        };
      }
      if (c.requiredForPaperlessBilling) paperlessBillingRequiredConcepts.push(conceptId);
      concepts[conceptId] = { hstId: conceptId, title: c.title, description: c.description, mediaIds, additionalItemSectionId };
      return conceptId;
    });
    groupers[grouperId] = {
      hstId: grouperId,
      title: g.title,
      description: g.description,
      conceptIds,
      // Only the group that links elsewhere carries these two keys on a real instance.
      ...(g.otherPreferencesLinkPath ? { otherPreferencesLinkPath: g.otherPreferencesLinkPath, otherPreferencesLinkText: g.otherPreferencesLinkText ?? '' } : {}),
    };
  });

  return {
    groupers,
    concepts,
    medias,
    additionalItemSections,
    grouperOrder,
    paperlessBillingRequiredConcepts,
    canApplyToAll: prefs.canApplyToAll,
    smsFlagOn: prefs.smsFlagOn,
    userAcceptsSms: prefs.userAcceptsSms,
    showContactInformation: prefs.showContactInformation,
    grouperIdToExpandOnLoad: '',
  };
}
