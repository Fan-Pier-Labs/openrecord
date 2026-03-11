

import { MockData } from "./types";


// This should be the full HTML page of the test results page.
export const test_results_html_page: MockData = {
  path: ['/MyChartPRD/app/test-results'],
  response: new Response(` 
    
    <input name="__RequestVerificationToken" type="hidden" value="qmpggc8W7pwFFxM57sZeLbbLg3yTWkWqZy8Z_LFY1WohPUvEksk6qdx3L1VNkPtBoM7qJzE7CdWl7jWXCdi74_bQs2Y1" /></div>

    `)
}

// This should be the full HTML page of the test results page.
export const getTestDetails: MockData = {
  path: ['/MyChartPRD/api/test-results/GetDetails'],
  response: new Response(` 
    
    {
  "orderName": "FAKE TEST NAME",
  "key": "FAKE_ORDER_KEY_1",
  "results": [
    {
      "name": "FAKE TEST NAME",
      "key": "FAKE_RESULT_KEY_1",
      "showName": false,
      "showDetails": true,
      "orderMetadata": {
        "orderProviderName": "Fake Provider X, MD, MPH, MS",
        "unreadCommentingProviderName": "",
        "readingProviderName": "",
        "resultTimestampDisplay": "FakeDateTime1",
        "collectionTimestampsDisplay": "FakeDateTime2",
        "specimensDisplay": "Blood",
        "resultStatus": "Final",
        "resultingLab": {
          "name": "FAKE LAB NAME",
          "address": [
            "Fake address line 1",
            "Fake address line 2"
          ],
          "phoneNumber": "",
          "labDirector": "Fake Lab Director, MD, PhD",
          "cliaNumber": ""
        },
        "resultType": 1,
        "read": 0
      },
      "resultComponents": [
        {
          "componentInfo": {
            "componentID": "FAKE_COMPONENT_ID_1",
            "name": "FAKE COMPONENT NAME",
            "commonName": "FAKE COMMON NAME",
            "units": ""
          },
          "componentResultInfo": {
            "value": "Negative",
            "isValueRtf": false,
            "referenceRange": {
              "displayLow": "",
              "displayHigh": "",
              "formattedReferenceRange": "Negative"
            },
            "abnormalFlagCategoryValue": 4
          },
          "componentComments": {
            "isRTF": false,
            "hasContent": false,
            "contentAsString": "",
            "contentAsHtml": ""
          }
        }
      ],
      "studyResult": {
        "narrative": {
          "isRTF": false,
          "hasContent": false,
          "contentAsString": "",
          "contentAsHtml": "",
          "signingInstantTimestamp": "FakeDateTime3"
        },
        "impression": {
          "isRTF": false,
          "hasContent": false,
          "contentAsString": "",
          "contentAsHtml": "",
          "signingInstantTimestamp": "FakeDateTime3"
        },
        "combinedRTFNarrativeImpression": {
          "isRTF": false,
          "hasContent": false,
          "contentAsString": "",
          "contentAsHtml": "",
          "signingInstantTimestamp": "FakeDateTime3"
        },
        "addenda": [],
        "isCupidAddendum": false,
        "transcriptions": [],
        "ecgDiagnosis": [],
        "hasStudyContent": false
      },
      "shouldHideHistoricalData": false,
      "resultNote": {
        "isRTF": false,
        "hasContent": false,
        "contentAsString": "",
        "contentAsHtml": "",
        "signingInstantTimestamp": "FakeDateTime3"
      },
      "reportDetails": {
        "isDownloadablePDFReport": false,
        "reportID": "",
        "openRemotely": false,
        "reportContext": "",
        "reportVars": {
          "ordId": "FAKE_ORDER_KEY_1",
          "ordDat": "FAKE_ORDER_DATA_KEY_1"
        }
      },
      "scans": [],
      "imageStudies": [],
      "indicators": [],
      "geneticProfileLink": "/app/fake-profile",
      "shareEverywhereLogin": false,
      "showProviderNotReviewed": false,
      "providerComments": [],
      "resultLetter": {
        "isRTF": false,
        "hasContent": false,
        "contentAsString": "",
        "contentAsHtml": "",
        "signingInstantTimestamp": "FakeDateTime3"
      },
      "warningType": "",
      "warningMessage": "",
      "variants": [],
      "tooManyVariants": false,
      "hasComment": false,
      "hasAllDetails": true,
      "isAbnormal": false
    }
  ],
  "orderLimitReached": false,
  "ordersDeduplicated": false,
  "hideEncInfo": false
}


    `)
}


export const getTestResultsList: MockData = {
  path: ['/MyChartPRD/api/test-results/GetList'],
  response: new Response(` 
    
{
    "areResultsFullyLoaded": true,
    "isGroupingFullyLoaded": true,
    "groupBy": 1,
    "newResultGroups": [
      {
        "key": "FAKE_GROUP_KEY_1",
        "contactType": "",
        "resultList": [
          "FAKE_RESULT_KEY_1"
        ],
        "isInpatient": true,
        "isEDVisit": false,
        "isCurrentAdmission": false,
        "formattedAdmitDate": "FakeDate1",
        "formattedDischargeDate": "FakeDate1",
        "visitProviderID": "",
        "organizationID": "FAKE_ORG_ID_1",
        "sortDate": "FakeDateTime1",
        "formattedDate": "FakeDate1",
        "isLargeGroup": false
      },
      {
        "key": "FAKE_GROUP_KEY_2",
        "contactType": "",
        "resultList": [
          "FAKE_RESULT_KEY_2"
        ],
        "isInpatient": true,
        "isEDVisit": false,
        "isCurrentAdmission": false,
        "formattedAdmitDate": "FakeDate2",
        "formattedDischargeDate": "FakeDate2",
        "visitProviderID": "",
        "organizationID": "FAKE_ORG_ID_1",
        "sortDate": "FakeDateTime2",
        "formattedDate": "FakeDate2",
        "isLargeGroup": false
      },
      {
        "key": "FAKE_GROUP_KEY_3",
        "contactType": "",
        "resultList": [
          "FAKE_RESULT_KEY_3"
        ],
        "isInpatient": false,
        "isEDVisit": false,
        "isCurrentAdmission": false,
        "visitProviderID": "FAKE_PROVIDER_ID_2",
        "organizationID": "FAKE_ORG_ID_1",
        "sortDate": "FakeDateTime3",
        "formattedDate": "FakeDate3",
        "isLargeGroup": false
      },
      {
        "key": "FAKE_GROUP_KEY_4",
        "contactType": "",
        "resultList": [
          "FAKE_RESULT_KEY_4"
        ],
        "isInpatient": false,
        "isEDVisit": false,
        "isCurrentAdmission": false,
        "visitProviderID": "FAKE_PROVIDER_ID_2",
        "organizationID": "FAKE_ORG_ID_1",
        "sortDate": "FakeDateTime4",
        "formattedDate": "FakeDate4",
        "isLargeGroup": false
      },
      {
        "key": "FAKE_GROUP_KEY_5",
        "contactType": "",
        "resultList": [
          "FAKE_RESULT_KEY_5"
        ],
        "isInpatient": false,
        "isEDVisit": false,
        "isCurrentAdmission": false,
        "visitProviderID": "FAKE_PROVIDER_ID_2",
        "organizationID": "FAKE_ORG_ID_1",
        "sortDate": "FakeDateTime5",
        "formattedDate": "FakeDate5",
        "isLargeGroup": false
      },
      {
        "key": "FAKE_GROUP_KEY_6",
        "contactType": "",
        "resultList": [
          "FAKE_RESULT_KEY_6"
        ],
        "isInpatient": false,
        "isEDVisit": false,
        "isCurrentAdmission": false,
        "visitProviderID": "FAKE_PROVIDER_ID_2",
        "organizationID": "FAKE_ORG_ID_1",
        "sortDate": "FakeDateTime6",
        "formattedDate": "FakeDate6",
        "isLargeGroup": false
      },
      {
        "key": "FAKE_GROUP_KEY_7",
        "contactType": "",
        "resultList": [
          "FAKE_RESULT_KEY_7"
        ],
        "isInpatient": false,
        "isEDVisit": false,
        "isCurrentAdmission": false,
        "visitProviderID": "FAKE_PROVIDER_ID_2",
        "organizationID": "FAKE_ORG_ID_1",
        "sortDate": "FakeDateTime7",
        "formattedDate": "FakeDate7",
        "isLargeGroup": false
      },
      {
        "key": "FAKE_GROUP_KEY_8",
        "contactType": "",
        "resultList": [
          "FAKE_RESULT_KEY_8"
        ],
        "isInpatient": false,
        "isEDVisit": false,
        "isCurrentAdmission": false,
        "formattedAdmitDate": "FakeDate8",
        "formattedDischargeDate": "FakeDate8",
        "visitProviderID": "",
        "organizationID": "FAKE_ORG_ID_1",
        "sortDate": "FakeDateTime8",
        "formattedDate": "FakeDate8",
        "isLargeGroup": false
      },
      {
        "key": "FAKE_GROUP_KEY_9",
        "contactType": "",
        "resultList": [
          "FAKE_RESULT_KEY_9"
        ],
        "isInpatient": false,
        "isEDVisit": false,
        "isCurrentAdmission": false,
        "formattedAdmitDate": "FakeDate9",
        "formattedDischargeDate": "FakeDate9",
        "visitProviderID": "",
        "organizationID": "FAKE_ORG_ID_1",
        "sortDate": "FakeDateTime9",
        "formattedDate": "FakeDate9",
        "isLargeGroup": false
      },
      {
        "key": "FAKE_GROUP_KEY_10",
        "contactType": "",
        "resultList": [
          "FAKE_RESULT_KEY_10"
        ],
        "isInpatient": true,
        "isEDVisit": true,
        "isCurrentAdmission": false,
        "formattedAdmitDate": "FakeDate10",
        "formattedDischargeDate": "FakeDate10",
        "visitProviderID": "",
        "organizationID": "FAKE_ORG_ID_1",
        "sortDate": "FakeDateTime10",
        "formattedDate": "FakeDate10",
        "isLargeGroup": false
      },
      {
        "key": "FAKE_GROUP_KEY_11",
        "contactType": "",
        "resultList": [
          "FAKE_RESULT_KEY_11"
        ],
        "isInpatient": false,
        "isEDVisit": false,
        "isCurrentAdmission": false,
        "formattedAdmitDate": "FakeDate11",
        "formattedDischargeDate": "FakeDate11",
        "visitProviderID": "",
        "organizationID": "FAKE_ORG_ID_1",
        "sortDate": "FakeDateTime11",
        "formattedDate": "FakeDate11",
        "isLargeGroup": false
      },
      {
        "key": "FAKE_GROUP_KEY_12",
        "contactType": "",
        "resultList": [
          "FAKE_RESULT_KEY_12"
        ],
        "isInpatient": false,
        "isEDVisit": false,
        "isCurrentAdmission": false,
        "formattedAdmitDate": "FakeDate12",
        "formattedDischargeDate": "FakeDate12",
        "visitProviderID": "",
        "organizationID": "FAKE_ORG_ID_1",
        "sortDate": "FakeDateTime12",
        "formattedDate": "FakeDate12",
        "isLargeGroup": false
      },
      {
        "key": "FAKE_GROUP_KEY_13",
        "contactType": "",
        "resultList": [
          "FAKE_RESULT_KEY_13"
        ],
        "isInpatient": false,
        "isEDVisit": false,
        "isCurrentAdmission": false,
        "formattedAdmitDate": "FakeDate13",
        "formattedDischargeDate": "FakeDate13",
        "visitProviderID": "",
        "organizationID": "FAKE_ORG_ID_1",
        "sortDate": "FakeDateTime13",
        "formattedDate": "FakeDate13",
        "isLargeGroup": false
      },
      {
        "key": "FAKE_GROUP_KEY_14",
        "contactType": "",
        "resultList": [
          "FAKE_RESULT_KEY_14"
        ],
        "isInpatient": false,
        "isEDVisit": false,
        "isCurrentAdmission": false,
        "formattedAdmitDate": "FakeDate14",
        "formattedDischargeDate": "FakeDate14",
        "visitProviderID": "",
        "organizationID": "FAKE_ORG_ID_1",
        "sortDate": "FakeDateTime14",
        "formattedDate": "FakeDate14",
        "isLargeGroup": false
      },
      {
        "key": "FAKE_GROUP_KEY_15",
        "contactType": "",
        "resultList": [
          "FAKE_RESULT_KEY_15"
        ],
        "isInpatient": false,
        "isEDVisit": false,
        "isCurrentAdmission": false,
        "formattedAdmitDate": "FakeDate15",
        "formattedDischargeDate": "FakeDate15",
        "visitProviderID": "",
        "organizationID": "FAKE_ORG_ID_1",
        "sortDate": "FakeDateTime15",
        "formattedDate": "FakeDate15",
        "isLargeGroup": false
      },
      {
        "key": "FAKE_GROUP_KEY_16",
        "contactType": "",
        "resultList": [
          "FAKE_RESULT_KEY_16"
        ],
        "isInpatient": false,
        "isEDVisit": false,
        "isCurrentAdmission": false,
        "formattedAdmitDate": "FakeDate16",
        "formattedDischargeDate": "FakeDate16",
        "visitProviderID": "",
        "organizationID": "FAKE_ORG_ID_1",
        "sortDate": "FakeDateTime16",
        "formattedDate": "FakeDate16",
        "isLargeGroup": false
      },
      {
        "key": "FAKE_GROUP_KEY_17",
        "contactType": "",
        "resultList": [
          "FAKE_RESULT_KEY_17"
        ],
        "isInpatient": false,
        "isEDVisit": false,
        "isCurrentAdmission": false,
        "formattedAdmitDate": "FakeDate17",
        "formattedDischargeDate": "FakeDate17",
        "visitProviderID": "",
        "organizationID": "FAKE_ORG_ID_1",
        "sortDate": "FakeDateTime17",
        "formattedDate": "FakeDate17",
        "isLargeGroup": false
      },
      {
        "key": "FAKE_GROUP_KEY_18",
        "contactType": "",
        "resultList": [
          "FAKE_RESULT_KEY_18"
        ],
        "isInpatient": false,
        "isEDVisit": false,
        "isCurrentAdmission": false,
        "formattedAdmitDate": "FakeDate18",
        "formattedDischargeDate": "FakeDate18",
        "visitProviderID": "",
        "organizationID": "FAKE_ORG_ID_1",
        "sortDate": "FakeDateTime18",
        "formattedDate": "FakeDate18",
        "isLargeGroup": false
      },
      {
        "key": "FAKE_GROUP_KEY_19",
        "contactType": "",
        "resultList": [
          "FAKE_RESULT_KEY_19"
        ],
        "isInpatient": false,
        "isEDVisit": false,
        "isCurrentAdmission": false,
        "formattedAdmitDate": "FakeDate19",
        "formattedDischargeDate": "FakeDate19",
        "visitProviderID": "",
        "organizationID": "FAKE_ORG_ID_1",
        "sortDate": "FakeDateTime19",
        "formattedDate": "FakeDate19",
        "isLargeGroup": false
      },
      {
        "key": "FAKE_GROUP_KEY_20",
        "contactType": "",
        "resultList": [
          "FAKE_RESULT_KEY_20"
        ],
        "isInpatient": false,
        "isEDVisit": false,
        "isCurrentAdmission": false,
        "formattedAdmitDate": "FakeDate20",
        "formattedDischargeDate": "FakeDate20",
        "visitProviderID": "",
        "organizationID": "FAKE_ORG_ID_1",
        "sortDate": "FakeDateTime20",
        "formattedDate": "FakeDate20",
        "isLargeGroup": false
      }
    ],
    "organizationLoadMoreInfo": {},
    "newResults": {
      "FAKE_RESULT_KEY_1^": {
        "name": "FAKE TEST NAME 1",
        "key": "FAKE_RESULT_KEY_1",
        "showName": false,
        "showDetails": true,
        "orderMetadata": {
          "orderProviderName": "",
          "authorizingProviderName": "Fake Provider A, MD",
          "authorizingProviderID": "FAKE_PROVIDER_ID_A",
          "unreadCommentingProviderName": "",
          "resultTimestampDisplay": "FakeResultDate1",
          "resultType": 3,
          "read": 0
        },
        "resultComponents": [],
        "shouldHideHistoricalData": false,
        "scans": [],
        "shareEverywhereLogin": false,
        "showProviderNotReviewed": false,
        "providerComments": [],
        "tooManyVariants": false,
        "hasComment": false,
        "hasAllDetails": false,
        "isAbnormal": false
      },
      "FAKE_RESULT_KEY_2^": {
        "name": "FAKE TEST NAME 2",
        "key": "FAKE_RESULT_KEY_2",
        "showName": false,
        "showDetails": true,
        "orderMetadata": {
          "orderProviderName": "",
          "authorizingProviderName": "Fake Provider B, MD",
          "authorizingProviderID": "FAKE_PROVIDER_ID_B",
          "unreadCommentingProviderName": "",
          "resultTimestampDisplay": "FakeResultDate2",
          "resultType": 1,
          "read": 0
        },
        "resultComponents": [],
        "shouldHideHistoricalData": false,
        "scans": [],
        "shareEverywhereLogin": false,
        "showProviderNotReviewed": false,
        "providerComments": [],
        "tooManyVariants": false,
        "hasComment": false,
        "hasAllDetails": false,
        "isAbnormal": false
      },
      "FAKE_RESULT_KEY_3^": {
        "name": "FAKE TEST NAME 3",
        "key": "FAKE_RESULT_KEY_3",
        "showName": false,
        "showDetails": true,
        "orderMetadata": {
          "orderProviderName": "",
          "authorizingProviderName": "Fake Provider B, MD",
          "authorizingProviderID": "FAKE_PROVIDER_ID_B",
          "unreadCommentingProviderName": "",
          "resultTimestampDisplay": "FakeResultDate3",
          "resultType": 1,
          "read": 0
        },
        "resultComponents": [],
        "shouldHideHistoricalData": false,
        "scans": [],
        "shareEverywhereLogin": false,
        "showProviderNotReviewed": false,
        "providerComments": [],
        "tooManyVariants": false,
        "hasComment": false,
        "hasAllDetails": false,
        "isAbnormal": false
      },
      "FAKE_RESULT_KEY_4^": {
        "name": "FAKE TEST NAME 4",
        "key": "FAKE_RESULT_KEY_4",
        "showName": false,
        "showDetails": true,
        "orderMetadata": {
          "orderProviderName": "",
          "authorizingProviderName": "Fake Provider B, MD",
          "authorizingProviderID": "FAKE_PROVIDER_ID_B",
          "unreadCommentingProviderName": "",
          "resultTimestampDisplay": "FakeResultDate4",
          "resultType": 1,
          "read": 0
        },
        "resultComponents": [],
        "shouldHideHistoricalData": false,
        "scans": [],
        "shareEverywhereLogin": false,
        "showProviderNotReviewed": false,
        "providerComments": [],
        "tooManyVariants": false,
        "hasComment": false,
        "hasAllDetails": false,
        "isAbnormal": false
      },
      "FAKE_RESULT_KEY_5^": {
        "name": "FAKE TEST NAME 5",
        "key": "FAKE_RESULT_KEY_5",
        "showName": false,
        "showDetails": true,
        "orderMetadata": {
          "orderProviderName": "",
          "authorizingProviderName": "Fake Provider B, MD",
          "authorizingProviderID": "FAKE_PROVIDER_ID_B",
          "unreadCommentingProviderName": "",
          "resultTimestampDisplay": "FakeResultDate5",
          "resultType": 1,
          "read": 0
        },
        "resultComponents": [],
        "shouldHideHistoricalData": false,
        "scans": [],
        "shareEverywhereLogin": false,
        "showProviderNotReviewed": false,
        "providerComments": [],
        "tooManyVariants": false,
        "hasComment": false,
        "hasAllDetails": false,
        "isAbnormal": false
      },
      "FAKE_RESULT_KEY_6^": {
        "name": "FAKE TEST NAME 6",
        "key": "FAKE_RESULT_KEY_6",
        "showName": false,
        "showDetails": true,
        "orderMetadata": {
          "orderProviderName": "",
          "authorizingProviderName": "Fake Provider B, MD",
          "authorizingProviderID": "FAKE_PROVIDER_ID_B",
          "unreadCommentingProviderName": "",
          "resultTimestampDisplay": "FakeResultDate6",
          "resultType": 1,
          "read": 0
        },
        "resultComponents": [],
        "shouldHideHistoricalData": false,
        "scans": [],
        "shareEverywhereLogin": false,
        "showProviderNotReviewed": false,
        "providerComments": [],
        "tooManyVariants": false,
        "hasComment": false,
        "hasAllDetails": false,
        "isAbnormal": false
      },
      "FAKE_RESULT_KEY_7^": {
        "name": "FAKE TEST NAME 7",
        "key": "FAKE_RESULT_KEY_7",
        "showName": false,
        "showDetails": true,
        "orderMetadata": {
          "orderProviderName": "",
          "authorizingProviderName": "Fake Provider B, MD",
          "authorizingProviderID": "FAKE_PROVIDER_ID_B",
          "unreadCommentingProviderName": "",
          "resultTimestampDisplay": "FakeResultDate7",
          "resultType": 1,
          "read": 0
        },
        "resultComponents": [],
        "shouldHideHistoricalData": false,
        "scans": [],
        "shareEverywhereLogin": false,
        "showProviderNotReviewed": false,
        "providerComments": [],
        "tooManyVariants": false,
        "hasComment": false,
        "hasAllDetails": false,
        "isAbnormal": false
      },
      "FAKE_RESULT_KEY_8^": {
        "name": "FAKE TEST NAME 8",
        "key": "FAKE_RESULT_KEY_8",
        "showName": false,
        "showDetails": true,
        "orderMetadata": {
          "orderProviderName": "",
          "authorizingProviderName": "Fake Provider C, MD",
          "authorizingProviderID": "FAKE_PROVIDER_ID_C",
          "unreadCommentingProviderName": "",
          "resultTimestampDisplay": "FakeResultDate8",
          "resultType": 2,
          "read": 0
        },
        "resultComponents": [],
        "shouldHideHistoricalData": false,
        "scans": [],
        "shareEverywhereLogin": false,
        "showProviderNotReviewed": false,
        "providerComments": [],
        "tooManyVariants": false,
        "hasComment": false,
        "hasAllDetails": false,
        "isAbnormal": false
      },
      "FAKE_RESULT_KEY_9^": {
        "name": "FAKE TEST NAME 9",
        "key": "FAKE_RESULT_KEY_9",
        "showName": false,
        "showDetails": true,
        "orderMetadata": {
          "orderProviderName": "",
          "authorizingProviderName": "Fake Provider C, MD",
          "authorizingProviderID": "FAKE_PROVIDER_ID_C",
          "unreadCommentingProviderName": "",
          "resultTimestampDisplay": "FakeResultDate9",
          "resultType": 2,
          "read": 0
        },
        "resultComponents": [],
        "shouldHideHistoricalData": false,
        "scans": [],
        "shareEverywhereLogin": false,
        "showProviderNotReviewed": false,
        "providerComments": [],
        "tooManyVariants": false,
        "hasComment": false,
        "hasAllDetails": false,
        "isAbnormal": false
      },
      "FAKE_RESULT_KEY_10^": {
        "name": "FAKE TEST NAME 10",
        "key": "FAKE_RESULT_KEY_10",
        "showName": false,
        "showDetails": true,
        "orderMetadata": {
          "orderProviderName": "",
          "authorizingProviderName": "Fake Provider D, MD",
          "authorizingProviderID": "FAKE_PROVIDER_ID_D",
          "unreadCommentingProviderName": "",
          "resultTimestampDisplay": "FakeResultDate10",
          "resultType": 2,
          "read": 0
        },
        "resultComponents": [],
        "shouldHideHistoricalData": false,
        "scans": [],
        "shareEverywhereLogin": false,
        "showProviderNotReviewed": false,
        "providerComments": [],
        "tooManyVariants": false,
        "hasComment": false,
        "hasAllDetails": false,
        "isAbnormal": false
      },
      "FAKE_RESULT_KEY_11^": {
        "name": "FAKE TEST NAME 11",
        "key": "FAKE_RESULT_KEY_11",
        "showName": false,
        "showDetails": true,
        "orderMetadata": {
          "orderProviderName": "",
          "authorizingProviderName": "Fake Provider E, MD",
          "authorizingProviderID": "FAKE_PROVIDER_ID_E",
          "unreadCommentingProviderName": "",
          "resultTimestampDisplay": "FakeResultDate11",
          "resultType": 2,
          "read": 0
        },
        "resultComponents": [],
        "shouldHideHistoricalData": false,
        "scans": [],
        "shareEverywhereLogin": false,
        "showProviderNotReviewed": false,
        "providerComments": [],
        "tooManyVariants": false,
        "hasComment": false,
        "hasAllDetails": false,
        "isAbnormal": false
      },
      "FAKE_RESULT_KEY_12^": {
        "name": "FAKE TEST NAME 12",
        "key": "FAKE_RESULT_KEY_12",
        "showName": false,
        "showDetails": true,
        "orderMetadata": {
          "orderProviderName": "",
          "authorizingProviderName": "Fake Provider E, MD",
          "authorizingProviderID": "FAKE_PROVIDER_ID_E",
          "unreadCommentingProviderName": "",
          "resultTimestampDisplay": "FakeResultDate12",
          "resultType": 1,
          "read": 0
        },
        "resultComponents": [],
        "shouldHideHistoricalData": false,
        "scans": [],
        "shareEverywhereLogin": false,
        "showProviderNotReviewed": false,
        "providerComments": [],
        "tooManyVariants": false,
        "hasComment": false,
        "hasAllDetails": false,
        "isAbnormal": false
      },
      "FAKE_RESULT_KEY_13^": {
        "name": "FAKE TEST NAME 13",
        "key": "FAKE_RESULT_KEY_13",
        "showName": false,
        "showDetails": true,
        "orderMetadata": {
          "orderProviderName": "",
          "authorizingProviderName": "Fake Provider E, MD",
          "authorizingProviderID": "FAKE_PROVIDER_ID_E",
          "unreadCommentingProviderName": "",
          "resultTimestampDisplay": "FakeResultDate13",
          "resultType": 1,
          "read": 0
        },
        "resultComponents": [],
        "shouldHideHistoricalData": false,
        "scans": [],
        "shareEverywhereLogin": false,
        "showProviderNotReviewed": false,
        "providerComments": [],
        "tooManyVariants": false,
        "hasComment": false,
        "hasAllDetails": false,
        "isAbnormal": false
      },
      "FAKE_RESULT_KEY_14^": {
        "name": "FAKE TEST NAME 14",
        "key": "FAKE_RESULT_KEY_14",
        "showName": false,
        "showDetails": true,
        "orderMetadata": {
          "orderProviderName": "",
          "authorizingProviderName": "Fake Provider E, MD",
          "authorizingProviderID": "FAKE_PROVIDER_ID_E",
          "unreadCommentingProviderName": "",
          "resultTimestampDisplay": "FakeResultDate14",
          "resultType": 1,
          "read": 0
        },
        "resultComponents": [],
        "shouldHideHistoricalData": false,
        "scans": [],
        "shareEverywhereLogin": false,
        "showProviderNotReviewed": false,
        "providerComments": [],
        "tooManyVariants": false,
        "hasComment": false,
        "hasAllDetails": false,
        "isAbnormal": false
      },
      "FAKE_RESULT_KEY_15^": {
        "name": "FAKE TEST NAME 15",
        "key": "FAKE_RESULT_KEY_15",
        "showName": false,
        "showDetails": true,
        "orderMetadata": {
          "orderProviderName": "",
          "authorizingProviderName": "Fake Provider E, MD",
          "authorizingProviderID": "FAKE_PROVIDER_ID_E",
          "unreadCommentingProviderName": "",
          "resultTimestampDisplay": "FakeResultDate15",
          "resultType": 1,
          "read": 0
        },
        "resultComponents": [],
        "shouldHideHistoricalData": false,
        "scans": [],
        "shareEverywhereLogin": false,
        "showProviderNotReviewed": false,
        "providerComments": [],
        "tooManyVariants": false,
        "hasComment": false,
        "hasAllDetails": false,
        "isAbnormal": false
      },
      "FAKE_RESULT_KEY_16^": {
        "name": "FAKE TEST NAME 16",
        "key": "FAKE_RESULT_KEY_16",
        "showName": false,
        "showDetails": true,
        "orderMetadata": {
          "orderProviderName": "",
          "authorizingProviderName": "Fake Provider E, MD",
          "authorizingProviderID": "FAKE_PROVIDER_ID_E",
          "unreadCommentingProviderName": "",
          "resultTimestampDisplay": "FakeResultDate16",
          "resultType": 1,
          "read": 0
        },
        "resultComponents": [],
        "shouldHideHistoricalData": false,
        "scans": [],
        "shareEverywhereLogin": false,
        "showProviderNotReviewed": false,
        "providerComments": [],
        "tooManyVariants": false,
        "hasComment": false,
        "hasAllDetails": false,
        "isAbnormal": false
      },
      "FAKE_RESULT_KEY_17^": {
        "name": "FAKE TEST NAME 17",
        "key": "FAKE_RESULT_KEY_17",
        "showName": false,
        "showDetails": true,
        "orderMetadata": {
          "orderProviderName": "",
          "authorizingProviderName": "Fake Provider E, MD",
          "authorizingProviderID": "FAKE_PROVIDER_ID_E",
          "unreadCommentingProviderName": "",
          "resultTimestampDisplay": "FakeResultDate17",
          "resultType": 1,
          "read": 0
        },
        "resultComponents": [],
        "shouldHideHistoricalData": false,
        "scans": [],
        "shareEverywhereLogin": false,
        "showProviderNotReviewed": false,
        "providerComments": [],
        "tooManyVariants": false,
        "hasComment": false,
        "hasAllDetails": false,
        "isAbnormal": false
      },
      "FAKE_RESULT_KEY_18^": {
        "name": "FAKE TEST NAME 18",
        "key": "FAKE_RESULT_KEY_18",
        "showName": false,
        "showDetails": true,
        "orderMetadata": {
          "orderProviderName": "",
          "authorizingProviderName": "Fake Provider E, MD",
          "authorizingProviderID": "FAKE_PROVIDER_ID_E",
          "unreadCommentingProviderName": "",
          "resultTimestampDisplay": "FakeResultDate18",
          "resultType": 1,
          "read": 0
        },
        "resultComponents": [],
        "shouldHideHistoricalData": false,
        "scans": [],
        "shareEverywhereLogin": false,
        "showProviderNotReviewed": false,
        "providerComments": [],
        "tooManyVariants": false,
        "hasComment": false,
        "hasAllDetails": false,
        "isAbnormal": false
      },
      "FAKE_RESULT_KEY_19^": {
        "name": "FAKE TEST NAME 19",
        "key": "FAKE_RESULT_KEY_19",
        "showName": false,
        "showDetails": true,
        "orderMetadata": {
          "orderProviderName": "",
          "authorizingProviderName": "Fake Provider E, MD",
          "authorizingProviderID": "FAKE_PROVIDER_ID_E",
          "unreadCommentingProviderName": "",
          "resultTimestampDisplay": "FakeResultDate19",
          "resultType": 1,
          "read": 0
        },
        "resultComponents": [],
        "shouldHideHistoricalData": false,
        "scans": [],
        "shareEverywhereLogin": false,
        "showProviderNotReviewed": false,
        "providerComments": [],
        "tooManyVariants": false,
        "hasComment": false,
        "hasAllDetails": false,
        "isAbnormal": false
      },
      "FAKE_RESULT_KEY_20^": {
        "name": "FAKE TEST NAME 20",
        "key": "FAKE_RESULT_KEY_20",
        "showName": false,
        "showDetails": true,
        "orderMetadata": {
          "orderProviderName": "",
          "authorizingProviderName": "Fake Provider E, MD",
          "authorizingProviderID": "FAKE_PROVIDER_ID_E",
          "unreadCommentingProviderName": "",
          "resultTimestampDisplay": "FakeResultDate20",
          "resultType": 1,
          "read": 0
        },
        "resultComponents": [],
        "shouldHideHistoricalData": false,
        "scans": [],
        "shareEverywhereLogin": false,
        "showProviderNotReviewed": false,
        "providerComments": [],
        "tooManyVariants": false,
        "hasComment": false,
        "hasAllDetails": false,
        "isAbnormal": false
      }
    },
    "newProviderPhotoInfo": {
      "FAKE_PROVIDER_ID_B^": {
        "name": "Fake Provider B, MD",
        "empId": "",
        "remoteEncrypted": true,
        "photoUrl": "https://www.fakeurl.com/photoB",
        "providerId": "FAKE_PROVIDER_ID_B",
        "organizationId": ""
      },
      "FAKE_PROVIDER_ID_C^": {
        "name": "Fake Provider C, MD",
        "empId": "",
        "remoteEncrypted": true,
        "photoUrl": "https://www.fakeurl.com/photoC",
        "providerId": "FAKE_PROVIDER_ID_C",
        "organizationId": ""
      },
      "FAKE_PROVIDER_ID_A^": {
        "name": "Fake Provider A, MD",
        "empId": "",
        "remoteEncrypted": true,
        "photoUrl": "https://www.fakeurl.com/photoA",
        "providerId": "FAKE_PROVIDER_ID_A",
        "organizationId": ""
      },
      "FAKE_PROVIDER_ID_D^": {
        "name": "Fake Provider D, MD",
        "empId": "",
        "remoteEncrypted": true,
        "photoUrl": "https://www.fakeurl.com/photoD",
        "providerId": "FAKE_PROVIDER_ID_D",
        "organizationId": ""
      },
      "FAKE_PROVIDER_ID_E^": {
        "name": "Fake Provider E, MD",
        "empId": "",
        "remoteEncrypted": true,
        "photoUrl": "https://www.fakeurl.com/photoE",
        "providerId": "FAKE_PROVIDER_ID_E",
        "organizationId": ""
      },
      "FAKE_PROVIDER_ID_2^": {
        "name": "Fake Provider 2, MD",
        "empId": "",
        "remoteEncrypted": true,
        "photoUrl": "https://www.fakeurl.com/photo2",
        "providerId": "FAKE_PROVIDER_ID_2",
        "organizationId": ""
      }
    }
  }
  

    `)
}
