/**
 * Demo: run one scraper against a REAL MyChart account and print what it
 * returns. This is the `if (import.meta.main)` block that used to sit at the
 * bottom of profile.ts, bills.ts, labResults.ts and visits.ts.
 *
 *   bun dev-scripts/scrape-demo.ts <profile|bills|labs|visits> <hostname>
 *
 * Credentials come from the test-credentials file `login_TEST` reads, and
 * cookies are cached in ./cookies.json — same as before.
 *
 * **The hostname is required, deliberately.** This signs in and scrapes a live
 * hospital with real credentials; the versions of this demo that lived inside
 * the scrapers all hardcoded a default host, so running one was a single
 * argument-free command away. Making the target explicit means a live scrape is
 * something you asked for by name rather than something you got by pressing
 * enter. Point it at fake-mychart (`localhost:<port>`) unless you mean it.
 */
import { login_TEST } from '../scrapers/myChart/auth/login';
import { getMyChartProfile } from '../scrapers/myChart/chart/profile';
import { getBillingHistory } from '../scrapers/myChart/chart/bills/bills';
import { listLabResults } from '../scrapers/myChart/chart/labs/labResults';
import { pastVisits } from '../scrapers/myChart/chart/visits/visits';
import { logger } from '../shared/logger';

type Session = Awaited<ReturnType<typeof login_TEST>>;

const DEMOS = {
  profile: (req: Session) => getMyChartProfile(req),
  bills: (req: Session) => getBillingHistory(req),
  labs: (req: Session) => listLabResults(req),
  visits: (req: Session) => pastVisits(req, new Date('2025-01-01T00:30:50.183Z')),
} as const;

const which = process.argv[2] as keyof typeof DEMOS | undefined;
const hostname = process.argv[3];

if (!which || !(which in DEMOS) || !hostname) {
  logger.debug(`usage: bun dev-scripts/scrape-demo.ts <${Object.keys(DEMOS).join('|')}> <hostname>`);
  logger.debug('the hostname is required — this scrapes a live account, so name the target');
  process.exit(1);
}

const request = await login_TEST(hostname);
logger.debug(JSON.stringify(await DEMOS[which](request), null, 2));
