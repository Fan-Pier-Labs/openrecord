import * as cheerio from 'cheerio';


export function getRequestVerificationTokenFromBody(html: string): string | undefined {
  const $ = cheerio.load(html);

  const tokenEle = $('input[name="__RequestVerificationToken"]')

  const requestVerificationToken = tokenEle?.[0]?.attribs?.value

  if (!requestVerificationToken) {
    console.log('could not find request verification token', html)
    return undefined;
  }

  return requestVerificationToken;

}
