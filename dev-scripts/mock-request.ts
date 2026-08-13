/**
 * Demo: hit the mock-data router with a MyChart URL and print the canned
 * Response it serves. Handy for checking a fixture is wired to the path you
 * think it is — `mockRequest` exits the process when nothing matches.
 *
 *   bun dev-scripts/mock-request.ts [url]
 */
import { mockRequest } from '../scrapers/myChart/mock_data/index';
import { logger } from '../shared/logger';

const url = process.argv[2] ?? 'https://mychart.example.org/Authentication/Login';

logger.debug(await mockRequest(url, {}));
