/**
 * Phase 2: Fetch the JS bundles to find messaging API endpoints, then try them.
 */

import { getRequestVerificationTokenFromBody } from '../util';
import { MyChartRequest } from '../myChartRequest';
import fs from 'fs';

async function explore2() {
  const hostname = 'mychart.example.org';

  // Load saved cookies
  const mychartRequest = new MyChartRequest(hostname);
  const pathResponse = await mychartRequest.makeRequest({ followRedirects: false, url: 'https://' + hostname });
  const locationHeader = pathResponse.headers.get('Location');
  if (locationHeader) {
    const url = new URL(locationHeader, 'https://' + hostname);
    mychartRequest.setFirstPathPart(url.pathname.split('/')[1]);
  }
  await mychartRequest.loadCookies_TEST('/tmp/mychart_explore_cookies.json');

  // Verify cookies are valid
  const testRes = await mychartRequest.makeRequest({ path: '/Home', followRedirects: false });
  if (testRes.status !== 200) {
    console.log('Cookies expired! Re-run exploreSendMessage.ts first.');
    process.exit(1);
  }
  console.log('Cookies valid!\n');

  // Get verification token
  const commRes = await mychartRequest.makeRequest({ path: '/app/communication-center' });
  const commHtml = await commRes.text();
  const token = getRequestVerificationTokenFromBody(commHtml)!;
  console.log('Token:', token.substring(0, 20) + '...\n');

  // Fetch the mychart-web-server JS bundle to find API endpoints
  console.log('=== Fetching JS bundles for API endpoint discovery ===\n');

  const jsBundles = [
    '/scripts/lib/pxbuild/epic.px.client.mychart-web-server.js',
    '/scripts/lib/pxbuild/epic.px.client.sdk.js',
  ];

  const allEndpoints: string[] = [];

  for (const bundle of jsBundles) {
    console.log(`Fetching ${bundle}...`);
    try {
      const res = await mychartRequest.makeRequest({ path: bundle });
      const js = await res.text();
      console.log(`  Size: ${js.length} chars`);

      // Find all API endpoint patterns
      const apiPatterns = js.match(/["']\/api\/[^"']+["']/g) || [];
      const uniqueEndpoints = [...new Set(apiPatterns)].sort();
      console.log(`  Found ${uniqueEndpoints.length} API endpoints`);

      // Filter for messaging-related
      const messagingEndpoints = uniqueEndpoints.filter(e =>
        /message|conversation|compose|send|reply|recipient|ask|advice|communication/i.test(e)
      );
      if (messagingEndpoints.length > 0) {
        console.log(`  Messaging-related endpoints:`);
        for (const e of messagingEndpoints) {
          console.log(`    ${e}`);
          allEndpoints.push(e.replace(/["']/g, ''));
        }
      }

      // Also save all endpoints to file
      await fs.promises.writeFile(`/tmp/mychart_js_endpoints_${bundle.split('/').pop()}.txt`, uniqueEndpoints.join('\n'));
    } catch (err) {
      console.log(`  Error: ${(err as Error).message}`);
    }
  }

  // Also try to find the communication-center specific bundle
  console.log('\nLooking for communication-center specific JS...');
  const askQuestionHtml = await fs.promises.readFile('/tmp/mychart_ask_question.html', 'utf8');

  // Find all script src URLs
  const scriptUrls = [...askQuestionHtml.matchAll(/src="([^"]+\.js[^"]*)"/g)].map(m => m[1]);
  console.log(`Found ${scriptUrls.length} script URLs in ask-question page`);

  // Look for any that might be loaded dynamically or contain "communication" or "message"
  // Since it's a React SPA, the routes/APIs are likely in the client SDK
  // Let's fetch ALL the JS and search
  for (const url of scriptUrls) {
    if (url.includes('pxbuild') || url.includes('core-') || url.includes('bundle')) {
      console.log(`\nFetching ${url.split('?')[0]}...`);
      try {
        const fullUrl = url.startsWith('http') ? url : undefined;
        const path = fullUrl ? undefined : url.replace(/\?.*/, '');
        const res = await mychartRequest.makeRequest(fullUrl ? { url: fullUrl } : { path: path! });
        const js = await res.text();

        // Search for messaging patterns
        const patterns = [
          ...js.matchAll(/["'](?:\/api)?\/[a-zA-Z-]+\/(?:Send|Reply|Compose|CreateMessage|PostMessage|Submit|GetRecipient|GetProvider|AskQuestion|MedicalAdvice)[^"']*["']/gi),
          ...js.matchAll(/["'][^"']*(?:sendMessage|replyMessage|composeMessage|askQuestion|medicalAdvice|newMessage|createConversation)[^"']*["']/gi),
        ];

        if (patterns.length > 0) {
          console.log(`  Found messaging patterns:`);
          for (const m of [...new Set(patterns.map(p => p[0]))]) {
            console.log(`    ${m}`);
          }
        }

        // Broader search for "send" and "reply" in API context
        const sendPatterns = js.match(/["']\/api\/[^"']*(?:send|reply|compose|post|create|submit)[^"']*["']/gi) || [];
        if (sendPatterns.length > 0) {
          console.log(`  Send/Reply API endpoints:`);
          for (const e of [...new Set(sendPatterns)]) {
            console.log(`    ${e}`);
            allEndpoints.push(e.replace(/["']/g, ''));
          }
        }
      } catch (err) {
        console.log(`  Error: ${(err as Error).message}`);
      }
    }
  }

  // Now try the discovered endpoints
  console.log('\n=== Testing discovered messaging endpoints ===\n');

  const uniqueAllEndpoints = [...new Set(allEndpoints)];
  for (const endpoint of uniqueAllEndpoints) {
    try {
      console.log(`POST ${endpoint}...`);
      const res = await mychartRequest.makeRequest({
        path: endpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          '__RequestVerificationToken': token,
        },
        body: JSON.stringify({}),
      });
      const text = await res.text();
      console.log(`  Status: ${res.status}, Length: ${text.length}`);
      if (res.status === 200 && text.length > 2) {
        console.log(`  Response: ${text.substring(0, 500)}`);
      }
    } catch (err) {
      console.log(`  Error: ${(err as Error).message}`);
    }
  }

  // Step: Also try to directly load the "ask a question" page as an API call
  // Since /AskQuestion redirects to /app/communication-center/ask-question
  // The React app likely has a specific API it calls on that route
  console.log('\n=== Trying communication-center API patterns ===\n');

  const commEndpoints = [
    '/api/communication-center/ask-question',
    '/api/communication-center/Initialize',
    '/api/communication-center/GetRecipients',
    '/api/communication-center/LoadPage',
    '/api/communication-center/compose',
    '/api/communication-center/new-message',
    '/api/ask-question/Initialize',
    '/api/ask-question/GetRecipients',
    '/api/ask-question/LoadPage',
    '/api/conversation/Reply',
    '/api/conversation/Send',
    '/api/conversation/Create',
    '/api/conversations/Reply',
    '/api/conversations/Send',
    '/api/conversations/Create',
    '/api/conversations/SendReply',
    '/api/conversations/SendMessage',
    '/api/conversations/CreateMessage',
    '/api/conversations/ComposeMessage',
    '/api/conversations/NewMessage',
  ];

  for (const endpoint of commEndpoints) {
    try {
      console.log(`POST ${endpoint}...`);
      const res = await mychartRequest.makeRequest({
        path: endpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          '__RequestVerificationToken': token,
        },
        body: JSON.stringify({}),
      });
      const text = await res.text();
      console.log(`  Status: ${res.status}, Length: ${text.length}`);
      if (res.status === 200 && text.length > 2) {
        console.log(`  Response: ${text.substring(0, 500)}`);
        await fs.promises.writeFile(`/tmp/mychart_comm_${endpoint.replace(/\//g, '_')}.json`, text);
      }
    } catch (err) {
      console.log(`  Error: ${(err as Error).message}`);
    }
  }

  console.log('\n=== Done ===');
}

explore2().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
