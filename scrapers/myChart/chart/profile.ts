import type { MyChartRequest } from "../core/myChartRequest";
import { makeAuthenticatedRequest, SessionExpiredError, type AuthenticatedRequestOptions } from "../core/makeAuthenticatedRequest";
import { getRequestVerificationTokenFromBody } from "../core/util";
import * as cheerio from 'cheerio';
import { logger } from '../../../shared/logger';

// This file scrapes a user's email from MyChart.

// Reusable interface for common location fields
interface CountyStateCountry {
  Value: string | number | null;
  Number: string;
  Title: string | null;
  Abbreviation: string | null;
  Comment: string | null;
  TitleUtf8: string | null;
  AbbreviationUtf8: string | null;
}

// Reusable interface for District
interface District {
  Value: string | number | null;
  Number: string;
  Title: string | null;
  Abbreviation: string;
  Comment: string | null;
  TitleUtf8: string | null;
  AbbreviationUtf8: string | null;
}

// Interface for an Address (used by PermanentAddress, TemporaryAddress, etc.)
interface Address {
  IsViewOnly: boolean;
  RequiredFieldNames: string[];
  Success: boolean;
  IsPending: boolean;
  Street: string;
  City: string;
  County: CountyStateCountry;
  State: CountyStateCountry;
  Zip: string;
  Country: CountyStateCountry;
  HouseNumber: string;
  District: District;
  Building: string;
  Floor: string;
  Unit: string;
  FormattedValues: string[];
  AllowArbitraryInput: boolean;
  AllowDefaults: boolean;
  PhoneNumber: string;
  StartDateDisplay: string | null;
  EndDateDisplay: string | null;
  StartDateISO: string;
  EndDateISO: string;
  CollapsedStatus: string | null;
}

// SecureCommunicationInfo interface
interface SecureCommunicationInfo {
  SecureEmail: string;
  EmailAddress: string;
  SecureMobile: string;
  MobilePhone: string;
  CanSupportEmail: boolean;
  CanSupportMobile: boolean;
  CanSupportOverwrite: boolean;
  DoesEmailNeedAttention: boolean;
  DoesMobileNeedAttention: boolean;
  IsEmailDeleted: boolean;
  IsMobileDeleted: boolean;
  AreBothDeleted: boolean;
  AreNeitherDeleted: boolean;
  DoBothNeedAttention: boolean;
  DoNeitherNeedAttention: boolean;
  ContactVerificationDisabled: boolean;
}

interface AddressDefault {
  fieldName: string;
  defaultValue: string;
}

interface ValidationError {
  fieldName: string;
  errorMessage: string;
}

// The top-level structure
interface AddressData {
  PermanentAddress: Address;
  TemporaryAddress: Address;
  PermanentDefaults: AddressDefault[];
  TemporaryDefaults: AddressDefault[];
  AllowArbitraryInput: boolean;
  AllowDefaults: boolean;
  SecureCommunicationInfo: SecureCommunicationInfo;
  HomePhone: string;
  WorkPhone: string;
  PreferredDevice: string;
  RequiredFieldNames: string[];
  IsNonPatientProxyRecord: boolean;
  IsTemporaryAddressDisabled: boolean;
  ValidationErrors: ValidationError[];
  IsPending: boolean;
  ReadOnlyFieldNames: string[];
  HasEditableField: boolean;
}


export type ProfileData = {
  name: string
  dob: string
  mrn: string
  pcp: string
  email?: string | null
}

export function parseProfileHtml(body: string): ProfileData | null {
  const $ = cheerio.load(body)
  const printheaderDiv = $('.printheader').text()

  // Full format: Name | DOB | MRN | PCP (most MyChart instances)
  const fullRegex = /Name: (.+) \| DOB: (\d{1,2}\/\d{1,2}\/\d{4}) \| MRN: (\d+) \| PCP: (.*)/;
  const fullMatch = fullRegex.exec(printheaderDiv)
  if (fullMatch) {
    return {
      // All four capture groups are non-optional, so they exist on any match.
      name: fullMatch[1]!.trim(),
      dob: fullMatch[2]!,
      mrn: fullMatch[3]!,
      pcp: fullMatch[4]!.trim(),
    }
  }

  // Partial format: Name | DOB only (e.g. MyChart Central at central.mychart.org)
  const partialRegex = /Name: (.+?) \| DOB: (\d{1,2}\/\d{1,2}\/\d{4})/;
  const partialMatch = partialRegex.exec(printheaderDiv)
  if (partialMatch) {
    // Try to pick up MRN and PCP if present after DOB with different formats
    const afterDob = printheaderDiv.slice(partialMatch.index + partialMatch[0].length)
    const mrnMatch = /MRN:\s*(\d+)/.exec(afterDob)
    const pcpMatch = /PCP:\s*(.*)/.exec(afterDob)
    return {
      // Both capture groups are non-optional, so they exist on any match.
      name: partialMatch[1]!.trim(),
      dob: partialMatch[2]!,
      mrn: mrnMatch?.[1] || '',
      pcp: pcpMatch?.[1]?.trim() || '',
    }
  }

  logger.debug('Could not parse profile from /Home page, no regex match', printheaderDiv.trim())
  return null;
}

export async function getMyChartProfile(
  mychartRequest: MyChartRequest,
  options?: AuthenticatedRequestOptions,
): Promise<ProfileData | null> {
  // followRedirects: false so a redirect to somewhere other than the login
  // page (some instances bounce /Home through a landing route) can be followed
  // and parsed explicitly. A login redirect is handled by the wrapper — renewed
  // when possible, otherwise surfaced here as the historical `null`.
  let resp: Response;
  try {
    resp = await makeAuthenticatedRequest(mychartRequest, {path: '/Home', followRedirects: false}, options)
  } catch (error) {
    if (error instanceof SessionExpiredError) {
      logger.debug('[profile] Session expired and could not be renewed');
      return null;
    }
    throw error;
  }

  if ([301, 302].includes(resp.status)) {
    const location = resp.headers.get('Location') || '';
    logger.debug(`[profile] /Home returned ${resp.status} → ${location}`);
    // The wrapper only recognizes /Authentication/Login as a session bounce.
    // Keep the historical looser check here too: an instance sending /Home to
    // any login-ish URL means "not signed in", and following it would parse a
    // login page into a bogus profile.
    if (location.toLowerCase().includes('login')) {
      logger.debug('[profile] Session expired — redirected to login page');
      return null;
    }
    // Non-login redirect: follow it and parse
    const followResp = await makeAuthenticatedRequest(mychartRequest, {url: new URL(location, mychartRequest.protocol + '://' + mychartRequest.hostname).href}, options);
    const body = await followResp.text();
    logger.debug(`[profile] Followed redirect to ${location}, response URL: ${followResp.url}, status: ${followResp.status}`);
    return parseProfileHtml(body);
  }

  logger.debug(`[profile] /Home returned ${resp.status}, URL: ${resp.url}`);
  const body = await resp.text()
  return parseProfileHtml(body)
}


export async function getEmail(mychartRequest: MyChartRequest): Promise<string | null> {

  let resp = await makeAuthenticatedRequest(mychartRequest, {path: '/PersonalInformation'})

  const body = await resp.text()

  const requestVerificationToken = getRequestVerificationTokenFromBody(body)

  if (!requestVerificationToken) {
    logger.debug('could not find request verification token')
    return null;
  }


  resp = await makeAuthenticatedRequest(mychartRequest, {
    path: '/PersonalInformation/GetContactInformation?noCache=' + Math.random(),
    "headers": { 
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      '__RequestVerificationToken': requestVerificationToken,
    },
    "method": "POST",
    body: 'useLoginUserEpt=false'
  });

  const json = await resp.json() as AddressData;

  return json.SecureCommunicationInfo.EmailAddress;

}
