/** The `Emergency contacts` group — read, add, update, remove. */

import {
  fetchEmergencyContactsRaw,
  emergencyContactsProcessor,
  addEmergencyContact,
  updateEmergencyContact,
  removeEmergencyContact,
} from '../../../scrapers/myChart/chart/emergencyContacts/emergencyContacts';
import { optStr, requireStr } from '../args';
import type { CapabilityImpl } from '../types';

export const EMERGENCY_CONTACT_CAPABILITIES: readonly CapabilityImpl[] = [
  {
    id: 'get_emergency_contacts',
    title: 'Emergency contacts',
    description: 'Emergency contacts on file.',
    kind: 'read',
    group: 'Emergency contacts',
    lessFrequentlyUsed: true,
    params: [],
    run: (request) => fetchEmergencyContactsRaw(request),
    processor: emergencyContactsProcessor,
  },
  {
    id: 'add_emergency_contact',
    title: 'Add an emergency contact',
    description: 'Add a new emergency contact to the record.',
    kind: 'write',
    group: 'Emergency contacts',
    lessFrequentlyUsed: true,
    params: [
      { name: 'name', type: 'string', description: 'Contact’s full name.', required: true },
      { name: 'relationship_type', type: 'string', description: 'Relationship, e.g. "Spouse", "Parent", "Sibling", "Friend".', required: true },
      { name: 'phone_number', type: 'string', description: 'Contact phone number.', required: true },
    ],
    run: (request, args) =>
      addEmergencyContact(request, {
        name: requireStr(args, 'name'),
        relationshipType: requireStr(args, 'relationship_type'),
        phoneNumber: requireStr(args, 'phone_number'),
      }),
  },
  {
    id: 'update_emergency_contact',
    title: 'Update an emergency contact',
    description: 'Update an existing emergency contact. Only the fields you pass are changed.',
    kind: 'write',
    group: 'Emergency contacts',
    lessFrequentlyUsed: true,
    params: [
      { name: 'id', type: 'string', description: 'Contact id from get_emergency_contacts.', required: true },
      { name: 'name', type: 'string', description: 'New name.' },
      { name: 'relationship_type', type: 'string', description: 'New relationship.' },
      { name: 'phone_number', type: 'string', description: 'New phone number.' },
    ],
    run: (request, args) =>
      updateEmergencyContact(request, {
        id: requireStr(args, 'id'),
        name: optStr(args, 'name'),
        relationshipType: optStr(args, 'relationship_type'),
        phoneNumber: optStr(args, 'phone_number'),
      }),
  },
  {
    id: 'remove_emergency_contact',
    title: 'Remove an emergency contact',
    description: 'Remove an emergency contact by id.',
    kind: 'write',
    group: 'Emergency contacts',
    lessFrequentlyUsed: true,
    params: [{ name: 'id', type: 'string', description: 'Contact id from get_emergency_contacts.', required: true }],
    run: (request, args) => removeEmergencyContact(request, requireStr(args, 'id')),
  },
];
