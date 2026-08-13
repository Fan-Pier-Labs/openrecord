/**
 * Demo: MyChart serialises billing dates as "dte" — whole days since the 1840
 * mainframe epoch. Prints a known value and today's, for eyeballing.
 *
 *   bun dev-scripts/dte-dates.ts
 */
import { dte2date, date2dte } from '../scrapers/myChart/chart/bills/utils';
import { logger } from '../shared/logger';

logger.debug('dte 18600 =', dte2date(18600));
logger.debug('today     =', date2dte(new Date()));
