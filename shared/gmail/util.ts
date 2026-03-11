import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { OAuth2Client } from 'google-auth-library';


const CREDS_PATH = path.join('creds.json');
const TOKEN_PATH = path.join('token.json');


/**
 * SCOPES:
 * - 'https://www.googleapis.com/auth/gmail.insert'
 *   Allows inserting messages into your Gmail mailbox.
 */
export const SCOPES = [

  // Needed to 1) read the 2FA email and 2) read which messages have already been inserted.
  'https://www.googleapis.com/auth/gmail.readonly',

  // Needed to insert messages into the user's inbox.
  // 'https://www.googleapis.com/auth/gmail.insert',

  // Needed to archive the 2FA email and mark it as read.
  'https://www.googleapis.com/auth/gmail.modify',

  // Needed to get the current user's email address.
  'https://www.googleapis.com/auth/userinfo.email'
];


export async function getOauth2Client(): Promise<OAuth2Client> {

  const credsRaw = await fs.promises.readFile(CREDS_PATH, 'utf8');
  const credsJson = JSON.parse(credsRaw)['gcreds'];
  const credentials = credsJson.installed || credsJson.web;

  const { client_secret, client_id, redirect_uris } = credentials;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  const tokenRaw = fs.readFileSync(TOKEN_PATH, 'utf8');
  const tokens = JSON.parse(tokenRaw);
  oAuth2Client.setCredentials(tokens);

  return oAuth2Client;
}
