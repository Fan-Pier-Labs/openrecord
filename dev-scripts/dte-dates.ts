/**
 * Demo: MyChart serialises billing dates as "dte" — whole days since the 1840
 * mainframe epoch. Prints a known value and today's, for eyeballing.
 *
 *   bun dev-scripts/dte-dates.ts
 */
import { fromEpicDteLocal, toEpicDteLocal } from '../shared/epicDate';
import { logger } from '../shared/logger';

logger.debug('dte 18600 =', fromEpicDteLocal(18600));
logger.debug('today     =', toEpicDteLocal(new Date()));
