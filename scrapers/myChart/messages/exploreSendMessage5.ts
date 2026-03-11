/**
 * Phase 5: Test the actual API endpoints with correct body format.
 * We know:
 * - SendReply needs: {conversationId, organizationId, viewers, messageBody, messageSubject, documentIds, includeOtherViewers, composeId}
 * - GetComposeId returns a compose ID
 * - GetComposeSettings needs {organizationId}
 * - GetConversationDetails needs {hthId} and returns conversation + reply info
 * - GetMessageMenuSettings returns the message menu (for new messages)
 */

import { getRequestVerificationTokenFromBody } from '../util';
import { MyChartRequest } from '../myChartRequest';
import fs from 'fs';

async function explore5() {
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

  // Get token from communication center
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

  // Step 1: GetMessageMenuSettings - understand what message types we can send
  console.log('=== GetMessageMenuSettings ===\n');
  const menuSettings = await makeApiRequest('/api/conversations/GetMessageMenuSettings', {});
  console.log('Status:', menuSettings.status);
  console.log('Response:', JSON.stringify(menuSettings.json, null, 2)?.substring(0, 2000));
  if (menuSettings.json) {
    await fs.promises.writeFile('/tmp/mychart_message_menu_settings.json', JSON.stringify(menuSettings.json, null, 2));
  }

  // Step 2: GetComposeId - get a compose ID
  console.log('\n=== GetComposeId ===\n');
  const composeId = await makeApiRequest('/api/conversations/GetComposeId', {});
  console.log('Status:', composeId.status);
  console.log('Response:', composeId.text?.substring(0, 500));

  // Step 3: GetComposeSettings - get compose settings (try with empty org first)
  console.log('\n=== GetComposeSettings ===\n');
  const composeSettingsEmpty = await makeApiRequest('/api/conversations/GetComposeSettings', { organizationId: '' });
  console.log('Empty org status:', composeSettingsEmpty.status);
  console.log('Response:', JSON.stringify(composeSettingsEmpty.json, null, 2)?.substring(0, 1000));

  // Step 4: GetOrganizations
  console.log('\n=== GetOrganizations ===\n');
  const orgs = await makeApiRequest('/api/conversations/GetOrganizations', {});
  console.log('Status:', orgs.status);
  console.log('Response:', JSON.stringify(orgs.json, null, 2)?.substring(0, 1000));

  // Step 5: GetFoldersList
  console.log('\n=== GetFoldersList ===\n');
  const folders = await makeApiRequest('/api/conversations/GetFoldersList', {});
  console.log('Status:', folders.status);
  console.log('Response:', JSON.stringify(folders.json, null, 2)?.substring(0, 500));

  // Step 6: GetConversationDetails - get details of a conversation we can reply to
  console.log('\n=== GetConversationDetails ===\n');

  // First get conversation list
  const convoList = await makeApiRequest('/api/conversations/GetConversationList', {
    tag: 1,
    localLoadParams: { loadStartInstantISO: '', loadEndInstantISO: '', pagingInfo: 1 },
    externalLoadParams: {},
    searchQuery: '',
    PageNonce: '',
  });

  const conversations = convoList.json?.conversations || [];
  console.log(`Total conversations: ${conversations.length}`);

  // Find the "Cough" conversation which has a provider audience
  const targetConvo = conversations.find((c: { audience: unknown[]; subject: string }) =>
    c.audience && c.audience.length > 0
  );

  if (targetConvo) {
    console.log(`\nTarget conversation: "${targetConvo.subject}"`);
    console.log('hthId:', targetConvo.hthId);
    console.log('messageType:', targetConvo.messageType);
    console.log('audience:', JSON.stringify(targetConvo.audience));

    // Try GetConversationDetails
    const detail = await makeApiRequest('/api/conversations/GetConversationDetails', {
      hthId: targetConvo.hthId,
    });
    console.log('\nDetail status:', detail.status, 'length:', detail.text?.length);
    console.log('Detail response:', detail.text?.substring(0, 200));

    // Try GetConversationMessages
    console.log('\n=== GetConversationMessages ===');
    const messages = await makeApiRequest('/api/conversations/GetConversationMessages', {
      hthId: targetConvo.hthId,
    });
    console.log('Messages status:', messages.status, 'length:', messages.text?.length);
    if (messages.json) {
      console.log('Messages response:', JSON.stringify(messages.json, null, 2)?.substring(0, 2000));
      await fs.promises.writeFile('/tmp/mychart_convo_messages.json', JSON.stringify(messages.json, null, 2));
    }

    // Step 7: Now try SendReply with the correct body format
    console.log('\n=== Testing SendReply (dry run - won\'t actually send yet) ===\n');

    // Get a composeId first
    const cid = await makeApiRequest('/api/conversations/GetComposeId', {});
    console.log('Compose ID:', cid.text);

    // For now, just log what we'd send - don't actually send yet
    console.log('\nSendReply body format would be:');
    const sendReplyBody = {
      conversationId: targetConvo.hthId,
      organizationId: '',
      viewers: [],
      messageBody: 'i have a questiion when is the availability to book a new appointment',
      messageSubject: '',
      documentIds: [],
      includeOtherViewers: false,
      composeId: cid.text?.replace(/"/g, '') || '',
    };
    console.log(JSON.stringify(sendReplyBody, null, 2));
  }

  // Step 8: Explore the disclaimer endpoint
  console.log('\n=== GetDisclaimer ===\n');
  const disclaimer = await makeApiRequest('/api/conversations/GetDisclaimer', {});
  console.log('Status:', disclaimer.status);
  console.log('Response:', disclaimer.text?.substring(0, 500));

  console.log('\n=== Done ===');
}

explore5().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
