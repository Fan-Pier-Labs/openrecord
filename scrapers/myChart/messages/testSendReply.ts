/**
 * Test sending an actual reply to a conversation.
 * This sends a real message to Dr. Claudia Ma via the "Cough (allergies ?)" conversation.
 */

import { getRequestVerificationTokenFromBody } from '../util';
import { MyChartRequest } from '../myChartRequest';

async function testSendReply() {
  const hostname = 'mychart.example.org';

  const mychartRequest = new MyChartRequest(hostname);
  const pathResponse = await mychartRequest.makeRequest({ followRedirects: false, url: 'https://' + hostname });
  const locationHeader = pathResponse.headers.get('Location');
  if (locationHeader) {
    const url = new URL(locationHeader, 'https://' + hostname);
    mychartRequest.setFirstPathPart(url.pathname.split('/')[1]);
  }
  await mychartRequest.loadCookies_TEST('/tmp/mychart_explore_cookies.json');

  const testRes = await mychartRequest.makeRequest({ path: '/Home', followRedirects: false });
  if (testRes.status !== 200) { console.log('Cookies expired!'); process.exit(1); }
  console.log('Cookies valid!\n');

  // Get token
  const commRes = await mychartRequest.makeRequest({ path: '/app/communication-center' });
  const commHtml = await commRes.text();
  const token = getRequestVerificationTokenFromBody(commHtml)!;

  const makeApiRequest = async (path: string, body: unknown) => {
    const res = await mychartRequest.makeRequest({
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        '__RequestVerificationToken': token,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null };
  };

  // Get conversation list
  const convoList = await makeApiRequest('/api/conversations/GetConversationList', {
    tag: 1,
    localLoadParams: { loadStartInstantISO: '', loadEndInstantISO: '', pagingInfo: 1 },
    externalLoadParams: {},
    searchQuery: '',
    PageNonce: '',
  });

  const conversations = convoList.json?.conversations || [];
  const targetConvo = conversations.find((c: { audience: unknown[]; subject: string }) =>
    c.audience && c.audience.length > 0
  );

  if (!targetConvo) {
    console.log('No conversation with audience found');
    process.exit(1);
  }

  console.log(`Replying to: "${targetConvo.subject}"`);
  console.log(`Provider: ${targetConvo.audience[0].name}`);

  // Get compose ID
  const composeIdRes = await makeApiRequest('/api/conversations/GetComposeId', {});
  const composeId = composeIdRes.text?.replace(/"/g, '') || '';
  console.log('Compose ID:', composeId.substring(0, 30) + '...');

  // Send the reply
  const replyBody = {
    conversationId: targetConvo.hthId,
    organizationId: '',
    viewers: [],
    messageBody: 'i have a questiion when is the availability to book a new appointment',
    messageSubject: '',
    documentIds: [],
    includeOtherViewers: false,
    composeId,
  };

  console.log('\nSending reply...');
  console.log('Body:', JSON.stringify(replyBody, null, 2));

  const sendResult = await makeApiRequest('/api/conversations/SendReply', replyBody);
  console.log('\nSend result status:', sendResult.status);
  console.log('Send result response:', sendResult.text);
  console.log('Send result json:', JSON.stringify(sendResult.json, null, 2));
}

testSendReply().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
