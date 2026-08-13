/**
 * Demo: parse a saved conversation-details API response into the trimmed
 * Conversation shape and print it.
 *
 *   bun dev-scripts/parse-convo.ts [path/to/convo.json]
 *
 * Defaults to ./sample_data/convo.json, which is where this demo looked when
 * it lived at the bottom of parseConvo.ts.
 */
import fs from 'fs';
import { parseConvo } from '../scrapers/myChart/messages/parseConvo';
import type { InputFormat } from '../scrapers/myChart/types';
import { logger } from '../shared/logger';

const file = process.argv[2] ?? './sample_data/convo.json';
const json = JSON.parse(fs.readFileSync(file, 'utf-8')) as InputFormat;

logger.debug(JSON.stringify(parseConvo(json), null, 4));
