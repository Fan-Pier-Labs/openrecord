import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { getOauth2Client } from './util';
import * as cheerio from 'cheerio';
import { MOCK_DATA } from '../env';

// This file is the code that scans the user's email for the 2fa code.

type CodeArray = {
  code: string,
  score: number,
  subject?: string
  emailTimestamp: number
}[]

/**
 * Lists messages from the desired sender and returns the first one whose
 * internalDate is >= minTime. Returns null if none found.
 */
async function fetchEmailAfterMinTime(
  auth: OAuth2Client,
  minTime: number,
  hostname: string
): Promise<CodeArray> {
  const gmail = google.gmail({ version: 'v1', auth });

  console.log("looking for emails from", hostname, minTime)

  // When we extract codes from emails, we have varying levels of confidence that the code is correct
  // depending on the email content. The score is arbitrary, and each extraction is just assigned a number.
  // We could sort these by confience later.
  const extractedCodes: CodeArray = []
  const queryDate = new Date(minTime);
  queryDate.setDate(queryDate.getDate() - 1);

  console.log('query st', `after:${queryDate.toISOString().split('T')[0].replace(/-/g, '/')}`)
  // Try listing all emails from the sender after minTime
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    maxResults: 500,
    q: `after:${queryDate.toISOString().split('T')[0].replace(/-/g, '/')}`,
  });

  const messages = listRes.data.messages;
  console.log('messages', messages?.length)
  if (!messages || messages.length === 0) {
    console.log("no messages found for", hostname, minTime)
    return [];
  }

  // Iterate through messages to find one that meets the minTime condition
  for (const msg of messages) {
    const messageRes = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id!,
      format: 'full',
    });

    const message = messageRes.data;

    // Email was sent after the minTime, so ignore it.
    if (message.internalDate && parseInt(message.internalDate, 10) < minTime) {
      console.log('email was sent after minTime, so ignoring it', message.internalDate, minTime, new Date(parseInt(message.internalDate, 10)).toISOString(), new Date(minTime).toISOString(), new Date().toISOString())
      continue;
    }

    // Emails typically include two formats: html and plain text.
    // We want to read the plain text format if it exists.
    let textBody = '';
    for (const part of message.payload?.parts ?? []) {
      if (part.mimeType === 'text/plain') {
        const base64 = part.body?.data?.replace(/-/g, '+').replace(/_/g, '/');

        textBody = atob(base64 ?? '');
      }
    }

    let htmlBody = '';

    // If no text body, convert the html to text
    for (const part of message.payload?.parts ?? []) {
      if (part.mimeType === 'text/html') {


        // console.log('part', part.body?.data)

        // GOogle's b64 isn'nt real  base 64, so we have to fix it first
        const base64 = part.body?.data?.replace(/-/g, '+').replace(/_/g, '/');
        htmlBody = atob(base64 ?? '');
      }
    }

    // Create the text body from html if no text body exists
    if (!textBody && htmlBody) {
      // Convert to text with cheerio
      const $ = cheerio.load(htmlBody);
      textBody = $.text();
    }

    let confidenceScore = 0;

    const fromHeader = message.payload?.headers?.find(header => header.name === 'From')?.value;

    const fromDomain = fromHeader?.replaceAll('<', '').replaceAll('>', '').split('@')[1].trim();

    const subject = message.payload?.headers?.find(header => header.name === 'Subject')?.value;

    // if the domain of the email exactly matches the hostname, its the right email
    if (fromDomain === hostname) {
      confidenceScore = 0.99;
    }
    else {
      // if the last two parts of the domain match the last two parts ("eg bmc.org" but not "fjdlasjf.bmc.org") its the right email

      // extract the last two parts of the domain
      const parts = fromDomain?.split('.');
      const lastTwoPartsOfDomain = parts?.slice(-2).join('.');

      const hostnameParts = hostname.split('.');
      const lastTwoPartsOfHostname = hostnameParts?.slice(-2).join('.');
      console.log('lastTwoPartsOfDomain', lastTwoPartsOfDomain, 'lastTwoPartsOfHostname', lastTwoPartsOfHostname);
      if (lastTwoPartsOfDomain === lastTwoPartsOfHostname) {
        confidenceScore = 0.95;
      }
    }

    // if the html of the email contains a link to the hostname, its the right email
    if (!confidenceScore && htmlBody) {
      const $ = cheerio.load(htmlBody);
      const links = $('a').map((_, el) => $(el).attr('href')).get();
      for (const link of links) {
        if (!link.trim() || link.trim() === '#') {
          continue;
        }
        try {
          const linkUrl = new URL(link);
          console.log('linkUrl', linkUrl.hostname, hostname)
          if (linkUrl.hostname === hostname) {
            confidenceScore = 0.8;
            break;
          }
        } catch (e) {
          console.log('There was an error parsing an email link, skipping', e)
          // ignore invalid links
        }
      }
    }

    // if not, try them all and good luck. can prolly exclude the codes that we matched to a different mychart.
    if (!confidenceScore) {
      confidenceScore = 0.1;
    }

    const codeMatch = textBody.match(/(\d{6})/);
    if (codeMatch) {
      extractedCodes.push({ code: codeMatch[1], score: confidenceScore, subject: subject ?? undefined, emailTimestamp: parseInt(message.internalDate ?? '0', 10) });

      // Mark this message as read and archive it
      // (removing 'UNREAD' and 'INBOX' labels effectively does that)
      await gmail.users.messages.modify({
        userId: 'me',
        id: msg.id!,
        requestBody: {
          removeLabelIds: ['UNREAD', 'INBOX'],
        },
      });

    }
    else {
      console.log('no code match', subject)
    }
  }

  // De-duplicate the extracted codes by taking the highest confidence score of each duplicate
  const seenCodes = new Map<string, { code: string, score: number, subject?: string, emailTimestamp: number }>();
  for (const codeObj of extractedCodes) {
    const { code, score, subject, emailTimestamp } = codeObj;
    if (seenCodes.has(code)) {
      const previousScore = seenCodes.get(code)!.score;
      if (score > previousScore) {
        seenCodes.set(code, { code, score, subject, emailTimestamp });
      }
    } else {
      seenCodes.set(code, { code, score, subject, emailTimestamp });
    }
  }

  const deDupedCodes = Array.from(seenCodes.values());

  deDupedCodes.sort((a, b) => {
    if(a.score === b.score) {
      return b.emailTimestamp - a.emailTimestamp;
    }
    return b.score - a.score;
  });

  return deDupedCodes;
}

/**
 * Tries to fetch an email that arrived after minTime. If not found,
 * keeps checking every 1 second for up to 1 minute. Returns the 2FA code if found, otherwise null.
 */
export async function get2FaCodeFromEmail(minTime: number, hostname: string): Promise<CodeArray> {

  if (MOCK_DATA) {
    console.log('Returning mock data for get2FaCodeFromEmail')
    return [
      {
        code: '123456',
        score: 0.5,
        subject: '2FA Code',
        emailTimestamp: 0
      },
    ];
  }

  const auth = await getOauth2Client();

  // We will check up to 60 times (once per second for 1 minute)
  for (let i = 0; i < 60; i++) {
    const results = await fetchEmailAfterMinTime(auth, minTime - 2000, hostname);
    if (results.length > 0) {
      return results;
    }

    console.log('Email with code not found yet. Waiting 1 second...');

    // If we haven't found a matching email yet, wait 1 second and try again
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // If we exit the loop, it means no matching email was found within 1 minute
  return [];
}

if (module === require.main) {
  get2FaCodeFromEmail(Date.now() - 1000 * 60 * 1000, 'example.com').then((code) => {
    console.log('Verification code:', code);
  });
}
