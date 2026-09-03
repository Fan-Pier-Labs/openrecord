import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { profilePage, settingsPage } from '@/lib/html';
import { html, json } from './respond';
import { currentUser } from './records';
import { prefix, type ExactRoutes, type PatternRoute } from './types';

export const profileGet: ExactRoutes = {
  'personalinformation': () => html(profilePage()),
  'settings': ({ request }) => {
    const user = currentUser(request);
    return html(settingsPage(user?.totpEnabled ?? false, user?.passkeys ?? []));
  },
};

export const profilePostPatterns: readonly PatternRoute[] = [
  prefix('personalinformation/getcontactinformation', ({ ds }) =>
    json(conformToShape(shapes.getContactInformation, ds.contactInfo))),
];
