/**
 * Demo: run one scraper against a REAL MyChart account and print what it
 * returns. This is the `if (import.meta.main)` block that used to sit at the
 * bottom of profile.ts, bills.ts, labResults.ts and visits.ts.
 *
 *   bun dev-scripts/scrape-demo.ts <profile|bills|labs|visits> [hostname]
 *
 * Credentials come from the test-credentials file `login_TEST` reads, and
 * cookies are cached in ./cookies.json — same as before. Sends real requests
 * to a real hospital, so don't point it at anything you don't have an account
 * on.
 */
import { login_TEST } from '../scrapers/myChart/login';
import { getMyChartProfile } from '../scrapers/myChart/profile';
import { getBillingHistory } from '../scrapers/myChart/bills/bills';
import { listLabResults } from '../scrapers/myChart/labs_and_procedure_results/labResults';
import { pastVisits } from '../scrapers/myChart/visits/visits';
import { logger } from '../shared/logger';

const DEMOS = {
  profile: (req: Awaited<ReturnType<typeof login_TEST>>) => getMyChartProfile(req),
  bills: (req: Awaited<ReturnType<typeof login_TEST>>) => getBillingHistory(req),
  labs: (req: Awaited<ReturnType<typeof login_TEST>>) => listLabResults(req),
  visits: (req: Awaited<ReturnType<typeof login_TEST>>) =>
    pastVisits(req, new Date('2025-01-01T00:30:50.183Z')),
} as const;

const which = process.argv[2] as keyof typeof DEMOS | undefined;
const hostname = process.argv[3] ?? 'mychart.example.org';

if (!which || !(which in DEMOS)) {
  logger.debug(`usage: bun dev-scripts/scrape-demo.ts <${Object.keys(DEMOS).join('|')}> [hostname]`);
  process.exit(1);
}

const request = await login_TEST(hostname);
logger.debug(JSON.stringify(await DEMOS[which](request), null, 2));
