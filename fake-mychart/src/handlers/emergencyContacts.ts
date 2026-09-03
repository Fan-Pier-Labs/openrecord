import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { emergencyContactsPage } from '@/lib/html';
import { state } from '@/lib/state';
import * as homer from '@/data/homer';
import { html, json } from './respond';
import { activeEmergencyContacts } from './records';
import type { ExactRoutes } from './types';

export const emergencyContactsGet: ExactRoutes = {
  'emergencycontacts': () => html(emergencyContactsPage()),
};

// Per-patient in real MyChart, and mutable, so they're keyed by record id
// rather than living in the immutable dataset — a child's chart must not list
// the account holder's contacts.
export const emergencyContactsPost: ExactRoutes = {
  'api/personalinformation/getrelationships': ({ request }) =>
    json(conformToShape(shapes.getRelationships, activeEmergencyContacts(request))),

  'api/personalinformation/addrelationship': async ({ request }) => {
    try {
      const body = await request.json();
      state.ecIdCounter++;
      const newContact = homer.makeEmergencyContact(
        `EC-${state.ecIdCounter}`,
        body.name || '',
        body.relationshipType || '',
        body.phoneNumber || '',
        body.isEmergencyContact ?? true,
      );
      activeEmergencyContacts(request).contacts.push(newContact);
      return json({ success: true, id: newContact.id });
    } catch {
      return json({ error: 'Invalid request' }, 400);
    }
  },

  'api/personalinformation/updaterelationship': async ({ request }) => {
    try {
      const body = await request.json();
      const store = activeEmergencyContacts(request);
      const idx = store.contacts.findIndex(
        (r) => r.id === body.id || r.formattedName === body.id
      );
      const existing = idx === -1 ? undefined : store.contacts[idx];
      if (!existing) return json({ error: 'Contact not found' }, 404);
      if (body.name) existing.formattedName = body.name;
      if (body.relationshipType) {
        existing.relationToPatient = { ...existing.relationToPatient, name: body.relationshipType, labelText: body.relationshipType };
      }
      if (body.phoneNumber) {
        existing.contactInformation.phoneNumbers = [{ phoneNumber: body.phoneNumber, type: 'Home' }];
      }
      if (body.isEmergencyContact !== undefined) existing.isEmergencyContact = body.isEmergencyContact;
      return json({ success: true });
    } catch {
      return json({ error: 'Invalid request' }, 400);
    }
  },

  'api/personalinformation/removerelationship': async ({ request }) => {
    try {
      const body = await request.json();
      const store = activeEmergencyContacts(request);
      store.contacts = store.contacts.filter(
        (r) => r.id !== body.id && r.formattedName !== body.id
      );
      return json({ success: true });
    } catch {
      return json({ error: 'Invalid request' }, 400);
    }
  },
};
