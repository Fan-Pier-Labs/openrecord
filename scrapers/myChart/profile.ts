import { login_TEST } from "./login";
import { MyChartRequest } from "./myChartRequest";
import { getRequestVerificationTokenFromBody } from "./util";
import * as cheerio from 'cheerio';

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
  const regex = /Name: (.+) \| DOB: (\d{1,2}\/\d{1,2}\/\d{4}) \| MRN: (\d+) \| PCP: (.*)/;
  const matches = printheaderDiv.match(regex)
  if (!matches) {
    console.log('Could not find MRN on /Home page, no regex match', printheaderDiv)
    return null;
  }
  return {
    name: matches[1],
    dob: matches[2],
    mrn: matches[3],
    pcp: matches[4],
  }
}

export async function getMyChartProfile(mychartRequest: MyChartRequest): Promise<ProfileData | null> {
  const resp = await mychartRequest.makeRequest({path: '/Home'})
  const body = await resp.text()
  return parseProfileHtml(body)
}


export async function getEmail(mychartRequest: MyChartRequest): Promise<string | null> {

  let resp = await mychartRequest.makeRequest({path: '/PersonalInformation'})

  const body = await resp.text()

  const requestVerificationToken = getRequestVerificationTokenFromBody(body)

  if (!requestVerificationToken) {
    console.log('could not find request verification token')
    return null;
  }


  resp = await mychartRequest.makeRequest({
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


async function test() {
  const mychartRequest = await login_TEST('mychart.example.org');
  
  const profile = await getMyChartProfile(mychartRequest)

  console.log('getMedicalRecordNumber is', profile)
}


if (require.main === module) {
  test();
}