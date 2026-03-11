import { MyChartRequest } from "./myChartRequest";
import * as cheerio from 'cheerio';

export type PreventiveCareItem = {
  name: string;
  status: 'overdue' | 'not_due' | 'completed' | 'unknown';
  overdueSince: string;
  notDueUntil: string;
  previouslyDone: string[];
  completedDate: string;
}

export async function getPreventiveCare(mychartRequest: MyChartRequest): Promise<PreventiveCareItem[]> {
  const resp = await mychartRequest.makeRequest({ path: '/HealthAdvisories' });
  const html = await resp.text();
  const $ = cheerio.load(html);

  const items: PreventiveCareItem[] = [];

  // Parse from the rendered HTML
  // The page has sections: "Overdue", "Not due"
  // Each item has a name, status details, and previously done dates
  const bodyText = $('body').text();

  // Split into sections by looking for overdue/not due markers
  const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let currentStatus: 'overdue' | 'not_due' | 'completed' | 'unknown' = 'unknown';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line === 'Overdue') {
      currentStatus = 'overdue';
      continue;
    }
    if (line === 'Not due') {
      currentStatus = 'not_due';
      continue;
    }

    // Look for item names followed by details
    // Items in the overdue section have "Overdue since <date>" or just "Overdue"
    const overdueSinceMatch = lines[i + 1]?.match(/Overdue since (.+)/);
    const overdueMatch = lines[i + 1] === 'Overdue';
    const notDueUntilMatch = lines[i + 1]?.match(/Not due until (.+)/);
    const notDueMatch = lines[i + 1] === 'Not due';
    const completedMatch = lines[i + 1]?.match(/Completed on (.+)/);

    if (overdueSinceMatch || overdueMatch || notDueUntilMatch || notDueMatch || completedMatch) {
      const name = line;
      let overdueSince = '';
      let notDueUntil = '';
      let completedDate = '';
      const previouslyDone: string[] = [];

      if (overdueSinceMatch) {
        overdueSince = overdueSinceMatch[1];
        currentStatus = 'overdue';
      }
      if (overdueMatch) {
        currentStatus = 'overdue';
      }
      if (notDueUntilMatch) {
        notDueUntil = notDueUntilMatch[1];
        currentStatus = 'not_due';
      }
      if (notDueMatch) {
        currentStatus = 'not_due';
      }
      if (completedMatch) {
        completedDate = completedMatch[1];
        currentStatus = 'completed';
      }

      // Look ahead for "Previously done:" lines
      for (let j = i + 2; j < Math.min(i + 6, lines.length); j++) {
        const prevMatch = lines[j].match(/Previously done: (.+)/);
        if (prevMatch) {
          previouslyDone.push(...prevMatch[1].split(',').map(d => d.trim()));
          break;
        }
      }

      items.push({
        name,
        status: currentStatus,
        overdueSince,
        notDueUntil,
        previouslyDone,
        completedDate,
      });
    }
  }

  return items;
}
