// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { getPreferencesWireShape } from '@/lib/notificationPreferences';
import { json } from './respond';
import type { ExactRoutes } from './types';

export const notificationPreferencesPost: ExactRoutes = {
  // Not conformed: the grouper skeleton carries the two link keys that a real
  // instance sends on one group only, and conforming would add them to all.
  'api/communicationpreferences/getpreferences': ({ ds }) => json(getPreferencesWireShape(ds.notificationPreferences)),
  'api/communicationpreferences/getcontactinformation': ({ ds }) =>
    json(conformToShape(shapes.getCommunicationPreferencesContactInformation, ds.notificationContactInformation)),
};
