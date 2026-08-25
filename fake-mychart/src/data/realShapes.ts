// GENERATED response-shape skeletons observed on real MyChart instances.
// Regenerate with the capture/diff harness described in the README (Fidelity
// section). Every leaf is a neutral default -- empty string, 0, false, null --
// so this file records STRUCTURE, never data. A dict with the single key "*"
// is a map keyed by opaque ids; conformToShape applies the "*" shape to every
// key the fixture provides. Arrays hold one element: the element shape.
//
// These drive conformToShape (see shape.ts): route handlers fill any field a
// fixture omits with the neutral default, so fake responses always carry the
// full set of fields a real instance returns, for every patient dataset.

// /api/allergies/loadallergies
export const loadAllergies = {
  "dataList": [],
  "dateOfBirth": "",
  "hasUpdateSecurity": false,
  "hasStandAloneUpdateSecurity": false,
  "showDxrRefreshBanner": false,
  "showDxrBannerAction": false,
  "preTextStringKey": "",
  "allergiesStatus": 0
} as const;

// /api/conversations/getconversationlist
export const getConversationList = {
  "legacyXUnreadCount": 0,
  "conversations": [
    {
      "contexts": [],
      "subject": "",
      "tags": {
        "Messages": false,
        "Unread": false
      },
      "previewText": "",
      "hasAttachments": false,
      "hasTasks": false,
      "hasUrgentMsgs": false,
      "legacyMessageDetailsUrl": "",
      "audience": [],
      "hasLoadAllUsers": false,
      "allowBulkActions": false,
      "hthId": "",
      "messages": [
        {
          "wmgId": "",
          "isUnread": false,
          "deliveryInstantISO": "",
          "body": "",
          "author": {
            "displayName": "",
            "empKey": ""
          },
          "attachments": [],
          "tasks": [],
          "suggestedActions": []
        }
      ],
      "hasMoreMessages": false,
      "messageType": "",
      "userKeys": [
        ""
      ],
      "userOverrideNames": {
        "*": ""
      },
      "maskedUserNames": [],
      "showOtherViewersOption": false,
      "viewerKeys": [
        ""
      ],
      "organizationId": ""
    }
  ],
  "localSummary": {
    "hasMoreConversations": false,
    "newestLoadedInstantISO": "",
    "numberLoaded": 0,
    "oldestLoadedInstantISO": "",
    "oldestSearchedInstantISO": "",
    "pagingInfo": 0
  },
  "users": {
    "*": {
      "empId": "",
      "name": "",
      "outOfContactEndDate": "",
      "outOfContactContext": 0,
      "outOfContactContextString": "",
      "photoUrl": "",
      "providerId": "",
      "organizationId": ""
    }
  },
  "viewers": {
    "*": {
      "wprId": "",
      "name": "",
      "isSelf": false,
      "isShown": false,
      "isSelected": false,
      "organizationId": ""
    }
  },
  "externalSummaries": {}
} as const;

// /api/education/getpateducationtitles
export const getPatEducationTitles = [
  {
    "elementId": "",
    "displayName": "",
    "assignedDate": "",
    "eduKey": "",
    "numTopics": 0,
    "numPoints": 0,
    "isAdmitted": false,
    "encounterContext": 0,
    "wasAssignedThisVisit": false,
    "canUserTrackUnderstanding": false,
    "numPagesReviewed": 0,
    "numPagesUnderstood": 0,
    "numPagesQuestions": 0,
    "thumbnailImage": "",
    "thumbnailImageBlobToken": "",
    "thumbnailIcon": 0,
    "tvSupported": false,
    "removeThumbnails": false
  }
] as const;

// /api/goals/loadcareteamgoals
export const loadCareTeamGoals = {
  "careTeamGoals": [],
  "hasChartGraphSecurity": false,
  "isSharingNotesEnabled": false,
  "quickLinkDictionary": {
    "HealthSummary": "",
    "HealthIssues": "",
    "Allergies": "",
    "Immunizations": "",
    "PreventiveCare": "",
    "Medications": "",
    "TrackMyHealth": ""
  }
} as const;

// /api/goals/loadpatientgoals
export const loadPatientGoals = {
  "patientGoals": [
    {
      "goalId": "",
      "goalType": 0,
      "readings": [],
      "complianceType": 0,
      "lastUpdatedDate": "",
      "creationDate": "",
      "isSharingNotesEnabled": false
    }
  ],
  "hasChartGraphSecurity": false,
  "isSharingNotesEnabled": false,
  "quickLinkDictionary": {
    "HealthSummary": "",
    "HealthIssues": "",
    "Allergies": "",
    "Immunizations": "",
    "PreventiveCare": "",
    "Medications": "",
    "TrackMyHealth": ""
  }
} as const;

// /api/health-summary/fetchh2gheader
export const fetchH2GHeader = {
  "lastVisit": {
    "date": "",
    "visitType": "",
    "visitDetailsURL": "",
    "visitCategory": "",
    "openRemotely": false,
    "mode": ""
  },
  "nextVisit": {
    "date": "",
    "visitType": "",
    "visitDetailsURL": "",
    "visitCategory": "",
    "openRemotely": false,
    "mode": ""
  },
  "upcomingVisitsList": [
    {
      "hasPaymentFeature": false,
      "hasQuestionnaireFeature": false,
      "hasNewPvdFeature": false,
      "primaryDate": "",
      "csnForECheckIn": "",
      "isNoShow": false,
      "leftWithoutSeen": false,
      "hasDownloadSummaryLink": false,
      "hasTransmitSummaryLink": false,
      "canRedirectToApptDetails": false,
      "isClinicalInformationAvailable": false,
      "ownedBy": 0,
      "isApptDetailsEnabled": false,
      "isRequestCancelEnabled": false,
      "isDirectCancelEnabled": false,
      "isRescheduleEnabled": false,
      "isCopayEnabled": false,
      "isVisitSummaryEnabled": false,
      "isDownloadSummaryEnabled": false,
      "isTransmitCEEnabled": false,
      "isTransmitDirectEnabled": false,
      "isDischargeInstrEnabled": false,
      "isPatHandoutsEnabled": false,
      "isIPReviewEnabled": false,
      "isDischargeSummaryEnabled": false,
      "isProviderLinkEnabled": false,
      "isPreadmissionEnabled": false,
      "isEcheckInCompleted": false,
      "csn": "",
      "id": "",
      "referenceID": "",
      "organizationLinks": [],
      "organization": {
        "organizationId": "",
        "hasChildOrgs": false,
        "organizationName": "",
        "isLocal": false,
        "logoUrl": "",
        "address": [
          ""
        ],
        "isSSO": false,
        "incompleteH2GSetup": false,
        "isGeneric": false,
        "payerOrgDetails": {
          "isPayerOnly": false,
          "isPayvider": false,
          "isPayer": false,
          "isPayerLicensedForMyChart": false
        },
        "isMyChartCentral": false,
        "isSameOrganization": false
      },
      "month": 0,
      "dateOfMonth": "",
      "year": "",
      "isLocal": false,
      "isNonEpic": false,
      "isSingleProvider": false,
      "canShowTelemedicine": false,
      "dat": "",
      "date": "",
      "time": "",
      "isAM": false,
      "isClientTime": false,
      "clientTimeZoneMarker": "",
      "encounterType": 0,
      "visitTypeName": "",
      "instant": "",
      "canShowArrivalTime": false,
      "hasDuration": false,
      "canShowPayments": false,
      "shortDate": "",
      "isTimeToBeDetermined": false,
      "isHideVisitTime": false,
      "canShowAppointmentTime": false,
      "timeZone": "",
      "providers": [
        {
          "encryptedId": "",
          "name": "",
          "type": 0,
          "photoUrl": "",
          "photoLink": "",
          "webPageUrl": "",
          "hasPhotoOnBlob": false,
          "photoBlobToken": "",
          "isPerson": false,
          "department": {
            "id": "",
            "name": "",
            "address": [
              ""
            ],
            "hasAddress": false,
            "phoneNumber": "",
            "instructions": [],
            "shouldShowInstructions": false,
            "timeZone": "",
            "arrivalLocation": "",
            "specialty": {
              "value": "",
              "title": "",
              "abbreviation": ""
            },
            "canShowDrivingDirections": false,
            "isPreadmissionLocation": false
          },
          "photoClass": ""
        }
      ],
      "otherProviders": [],
      "numberOfOthers": 0,
      "primaryProvider": {
        "encryptedId": "",
        "name": "",
        "type": 0,
        "photoUrl": "",
        "photoLink": "",
        "webPageUrl": "",
        "hasPhotoOnBlob": false,
        "photoBlobToken": "",
        "isPerson": false,
        "department": {
          "id": "",
          "name": "",
          "address": [
            ""
          ],
          "hasAddress": false,
          "phoneNumber": "",
          "instructions": [],
          "shouldShowInstructions": false,
          "timeZone": "",
          "arrivalLocation": "",
          "specialty": {
            "value": "",
            "title": "",
            "abbreviation": ""
          },
          "canShowDrivingDirections": false,
          "isPreadmissionLocation": false
        },
        "photoClass": ""
      },
      "primaryProviderName": "",
      "primaryDepartment": {
        "id": "",
        "name": "",
        "address": [
          ""
        ],
        "hasAddress": false,
        "phoneNumber": "",
        "instructions": [],
        "shouldShowInstructions": false,
        "timeZone": "",
        "arrivalLocation": "",
        "specialty": {
          "value": "",
          "title": "",
          "abbreviation": ""
        },
        "canShowDrivingDirections": false,
        "isPreadmissionLocation": false
      },
      "canRequestCancel": false,
      "isCanceled": false,
      "canReschedule": false,
      "rescheduledDat": "",
      "isDetailsEnabled": false,
      "isInHomeVisit": false,
      "eCheckIn": {
        "status": {
          "value": "",
          "title": "",
          "abbreviation": ""
        },
        "isNotStarted": false,
        "isInProgress": false,
        "isComplete": false,
        "barcode": "",
        "hasBarcodeStep": false,
        "clinicSteps": [],
        "requiredECheckInSteps": [],
        "hasQuestionnaireLink": false,
        "isAdmission": false,
        "isSurgery": false,
        "isQnrAfterBarcode": false,
        "isConfirmationView": false,
        "hasSignUpLink": false,
        "isRequiredForTelemedicine": false,
        "canShow": false,
        "hasPaymentECheckInStep": false,
        "hasQuestionnaireStep": false,
        "isInHelloPatientWindow": false,
        "multiPhaseOn": false
      },
      "canShowECheckIn": false,
      "shouldDeprecateECheckInBrand": false,
      "canShowECheckInComplete": false,
      "isECheckInComplete": false,
      "isEcheckInEnabled": false,
      "isECheckInIncomplete": false,
      "canECheckIn": false,
      "shouldShowECheckInInGuideBanner": false,
      "canShowAddToCalendar": false,
      "isPastVisit": false,
      "highlightDate": "",
      "isDrivingDirectionsEnabled": false,
      "confirmationStatus": 0,
      "isConfirmed": false,
      "isCancelRequestSent": false,
      "canDirectlyCancel": false,
      "isUsingFallbackVisitTypeName": false,
      "chiefComplaint": "",
      "hasSentUpgradeRequest": false,
      "canSendUpgradeRequest": false,
      "isUserInitiatedArrivalAllowed": false,
      "selfArrivalMechanism": 0,
      "geolocationArrival": 0,
      "arrivalStatus": 0,
      "patientNextStepInstructions": "",
      "arrivalAdditionalActions": [],
      "isProxyRequestMinorFormOn": false,
      "proxyRequestMinorForm": "",
      "telehealthMode": 0,
      "isUnverifiedOnDemandVideoVisit": false,
      "inProgress": false,
      "isResidentialMed": false,
      "showPFIOLink": false,
      "isCEOptedIn": false,
      "userMyChartStatus": 0,
      "encounterIsSurgery": false,
      "encounterIsEDVisit": false,
      "isPreadmission": false,
      "isHovPreadmission": false,
      "hasProcedures": false,
      "numberOfProcedures": 0,
      "hasComponentVisits": false,
      "hasPaymentInfo": false,
      "isFullyPaid": false,
      "completeECheckInCount": 0,
      "totalECheckInCount": 0
    }
  ],
  "pastVisitsList": [
    {
      "hasPaymentFeature": false,
      "hasQuestionnaireFeature": false,
      "hasNewPvdFeature": false,
      "isNotViewed": false,
      "isViewStatusVisible": false,
      "isClinicalNoteAvailable": false,
      "isNotesOnly": false,
      "isVisitAmbulatory": false,
      "feedbackQnrIDs": [],
      "isAmbPastVisitDetailsEnabled": false,
      "isAllIPSecurityPointsDisabled": false,
      "isIPPastVisitDetailsEnabled": false,
      "isPastVisitDetailsEnabled": false,
      "showVisitDetails": false,
      "primaryDate": "",
      "csnForECheckIn": "",
      "isNoShow": false,
      "leftWithoutSeen": false,
      "hasDownloadSummaryLink": false,
      "hasTransmitSummaryLink": false,
      "canRedirectToApptDetails": false,
      "pastVisitBucket": "",
      "isClinicalInformationAvailable": false,
      "ownedBy": 0,
      "isApptDetailsEnabled": false,
      "isRequestCancelEnabled": false,
      "isDirectCancelEnabled": false,
      "isRescheduleEnabled": false,
      "isCopayEnabled": false,
      "isVisitSummaryEnabled": false,
      "isDownloadSummaryEnabled": false,
      "isTransmitCEEnabled": false,
      "isTransmitDirectEnabled": false,
      "isDischargeInstrEnabled": false,
      "isPatHandoutsEnabled": false,
      "isIPReviewEnabled": false,
      "isDischargeSummaryEnabled": false,
      "isProviderLinkEnabled": false,
      "isPreadmissionEnabled": false,
      "isEcheckInCompleted": false,
      "csn": "",
      "id": "",
      "referenceID": "",
      "organizationLinks": [],
      "organization": {
        "organizationId": "",
        "hasChildOrgs": false,
        "organizationName": "",
        "isLocal": false,
        "logoUrl": "",
        "address": [
          ""
        ],
        "isSSO": false,
        "incompleteH2GSetup": false,
        "isGeneric": false,
        "payerOrgDetails": {
          "isPayerOnly": false,
          "isPayvider": false,
          "isPayer": false,
          "isPayerLicensedForMyChart": false
        },
        "isMyChartCentral": false,
        "isSameOrganization": false
      },
      "month": 0,
      "dateOfMonth": "",
      "year": "",
      "isLocal": false,
      "isNonEpic": false,
      "isSingleProvider": false,
      "canShowTelemedicine": false,
      "dat": "",
      "date": "",
      "time": "",
      "isAM": false,
      "isClientTime": false,
      "clientTimeZoneMarker": "",
      "encounterType": 0,
      "visitTypeName": "",
      "instant": "",
      "canShowArrivalTime": false,
      "hasDuration": false,
      "canShowPayments": false,
      "shortDate": "",
      "isTimeToBeDetermined": false,
      "isHideVisitTime": false,
      "canShowAppointmentTime": false,
      "timeZone": "",
      "providers": [
        {
          "encryptedId": "",
          "name": "",
          "type": 0,
          "photoUrl": "",
          "photoLink": "",
          "webPageUrl": "",
          "hasPhotoOnBlob": false,
          "photoBlobToken": "",
          "isPerson": false,
          "department": {
            "id": "",
            "name": "",
            "address": [
              ""
            ],
            "hasAddress": false,
            "phoneNumber": "",
            "instructions": [],
            "shouldShowInstructions": false,
            "timeZone": "",
            "arrivalLocation": "",
            "specialty": {
              "value": "",
              "title": "",
              "abbreviation": ""
            },
            "canShowDrivingDirections": false,
            "isPreadmissionLocation": false
          },
          "photoClass": ""
        }
      ],
      "otherProviders": [],
      "numberOfOthers": 0,
      "primaryProvider": {
        "encryptedId": "",
        "name": "",
        "type": 0,
        "photoUrl": "",
        "photoLink": "",
        "webPageUrl": "",
        "hasPhotoOnBlob": false,
        "photoBlobToken": "",
        "isPerson": false,
        "department": {
          "id": "",
          "name": "",
          "address": [
            ""
          ],
          "hasAddress": false,
          "phoneNumber": "",
          "instructions": [],
          "shouldShowInstructions": false,
          "timeZone": "",
          "arrivalLocation": "",
          "specialty": {
            "value": "",
            "title": "",
            "abbreviation": ""
          },
          "canShowDrivingDirections": false,
          "isPreadmissionLocation": false
        },
        "photoClass": ""
      },
      "primaryProviderName": "",
      "primaryDepartment": {
        "id": "",
        "name": "",
        "address": [
          ""
        ],
        "hasAddress": false,
        "phoneNumber": "",
        "instructions": [],
        "shouldShowInstructions": false,
        "timeZone": "",
        "arrivalLocation": "",
        "specialty": {
          "value": "",
          "title": "",
          "abbreviation": ""
        },
        "canShowDrivingDirections": false,
        "isPreadmissionLocation": false
      },
      "canRequestCancel": false,
      "isCanceled": false,
      "canReschedule": false,
      "rescheduledDat": "",
      "isDetailsEnabled": false,
      "isInHomeVisit": false,
      "canShowECheckIn": false,
      "shouldDeprecateECheckInBrand": false,
      "canShowECheckInComplete": false,
      "isECheckInComplete": false,
      "isEcheckInEnabled": false,
      "isECheckInIncomplete": false,
      "canECheckIn": false,
      "shouldShowECheckInInGuideBanner": false,
      "canShowAddToCalendar": false,
      "isPastVisit": false,
      "highlightDate": "",
      "isDrivingDirectionsEnabled": false,
      "confirmationStatus": 0,
      "isConfirmed": false,
      "isCancelRequestSent": false,
      "canDirectlyCancel": false,
      "isUsingFallbackVisitTypeName": false,
      "chiefComplaint": "",
      "hasSentUpgradeRequest": false,
      "canSendUpgradeRequest": false,
      "isUserInitiatedArrivalAllowed": false,
      "selfArrivalMechanism": 0,
      "geolocationArrival": 0,
      "patientNextStepInstructions": "",
      "arrivalAdditionalActions": [],
      "isProxyRequestMinorFormOn": false,
      "proxyRequestMinorForm": "",
      "telehealthMode": 0,
      "isUnverifiedOnDemandVideoVisit": false,
      "inProgress": false,
      "isResidentialMed": false,
      "showPFIOLink": false,
      "isCEOptedIn": false,
      "userMyChartStatus": 0,
      "encounterIsSurgery": false,
      "encounterIsEDVisit": false,
      "isPreadmission": false,
      "isHovPreadmission": false,
      "hasProcedures": false,
      "numberOfProcedures": 0,
      "hasComponentVisits": false,
      "hasPaymentInfo": false,
      "isFullyPaid": false,
      "completeECheckInCount": 0,
      "totalECheckInCount": 0
    }
  ]
} as const;

// /api/health-summary/fetchhealthsummary
export const fetchHealthSummary = {
  "header": {
    "patientAge": "",
    "height": {
      "value": "",
      "dateRecorded": ""
    },
    "weight": {
      "value": "",
      "dateRecorded": ""
    },
    "bloodType": ""
  },
  "isPatientAdmitted": false,
  "isProxyContext": false,
  "patientFirstName": "",
  "schoolReportInfo": {
    "schoolReportTitle": "",
    "schoolReportID": ""
  },
  "actionPlans": [],
  "canAccessSharingHub": false,
  "quickLinkDictionary": {
    "HealthIssues": "",
    "Allergies": "",
    "Immunizations": "",
    "Visits": "",
    "PreventiveCare": "",
    "SchoolHealthSummary": "",
    "CareJourneyDetails": "",
    "SendAMessage": "",
    "CareTeam": "",
    "MyConditions": ""
  },
  "conditionList": [],
  "journeyList": []
} as const;

// /api/healthissues/loadhealthissuesdata
export const loadHealthIssuesData = {
  "dataList": [
    {
      "healthIssueItem": {
        "name": "",
        "id": "",
        "formattedDateNoted": "",
        "action": 0,
        "isReadOnly": false
      },
      "localItem": {
        "name": "",
        "id": "",
        "formattedDateNoted": "",
        "action": 0,
        "isReadOnly": false
      },
      "externalItems": [],
      "externalOrgs": [],
      "contentLinkURL": "",
      "contentLinkPath": "",
      "target": "",
      "hasLocalInstance": false
    }
  ],
  "hasUpdateSecurity": false,
  "hasStandAloneUpdateSecurity": false,
  "alwaysShowSearchMore": false,
  "showDxrRefreshBanner": false,
  "showDxrBannerAction": false,
  "preTextStringKey": "",
  "dateOfBirth": "",
  "healthIssuesUrl": ""
} as const;

// /api/histories/loadhistoriesviewmodel
export const loadHistoriesViewModel = {
  "surgicalHistory": {
    "surgeries": [
      {
        "surgeryName": "",
        "surgeryDate": ""
      }
    ],
    "surgicalHistoryNotes": ""
  },
  "medicalHistory": {
    "diagnoses": [
      {
        "diagnosisName": "",
        "diagnosisDate": ""
      }
    ],
    "medicalHistoryNotes": ""
  },
  "familyHistoryAndStatus": {
    "familyMembers": [
      {
        "nameOrAlias": "",
        "sexId": "",
        "sexName": "",
        "genderId": "",
        "relationshipToPatientId": "",
        "relationshipToPatientName": "",
        "statusId": "",
        "statusName": "",
        "relativeAge": "",
        "relativeAgeEnd": "",
        "familyMemberId": "",
        "removeFamilyMember": false,
        "createdOnClient": false,
        "conditions": [
          ""
        ],
        "changes": []
      }
    ],
    "familyHistoryNotes": "",
    "familyStatusNotes": ""
  },
  "socialHistory": {
    "smokingHistory": {
      "smokingTobaccoStatus": "",
      "smokingTobaccoTypes": [],
      "tobaccoUse": "",
      "smokingTobaccoQuitDate": "",
      "showSmokingTobaccoQuitDate": false
    },
    "smokelessHistory": {
      "smokelessTobaccoStatus": "",
      "smokelessTobaccoTypes": [],
      "smokelessQuitDate": "",
      "showSmokelessTobaccoQuitDate": false
    },
    "alcoholHistory": {
      "alcoholUse": "",
      "alcoholAmount": "",
      "alcoholUnit": ""
    },
    "socialHistoryNotes": "",
    "isProxy": false
  },
  "isShareEverywhere": false
} as const;

// /api/immunizations/loadimmunizations
export const loadImmunizations = {
  "organizationImmunizationList": [
    {
      "organization": {
        "organizationId": "",
        "organizationName": "",
        "logoUrl": "",
        "isLocal": false,
        "isSSO": false,
        "incompleteH2GSetup": false,
        "address": [
          ""
        ],
        "linkType": 0,
        "currentlyLoadingData": false,
        "errorLoadingData": false,
        "hasValidRefreshToken": false,
        "shouldRemindForUpdate": false,
        "showInRefreshBanner": false,
        "disclaimerOverride": false,
        "isMyChartCentral": false
      },
      "orgImmunizations": [
        {
          "id": "",
          "name": "",
          "formattedAdministeredDates": [
            ""
          ]
        }
      ],
      "showViewDetailsLink": false
    }
  ],
  "showPersonalNotes": false,
  "immunizationsUrl": ""
} as const;

// /api/item-feed/fetchitemfeed
export const fetchItemFeed = {
  "singleItemFeedViewModels": [
    {
      "eptId": "",
      "displayName": "",
      "photoUrl": "",
      "tabColor": 0,
      "zeroStateIconKey": "",
      "isSelected": false,
      "feedItems": [
        {
          "phone": "",
          "smsActive": false,
          "allTextEnabled": false,
          "email": "",
          "allEmailEnabled": false,
          "canEditInfo": false,
          "displayText": "",
          "type": "",
          "defaultType": "",
          "groupCount": 0,
          "priority": 0,
          "priorityInstant": 0,
          "iconKey": "",
          "subiconKey": "",
          "shouldShowWatermark": false,
          "primaryAction": {
            "uriId": "",
            "uri": "",
            "uriType": 0,
            "uriDisplayText": "",
            "uriAccessibleText": "",
            "uriIconKey": "",
            "isHidden": false
          },
          "secondaryAction": {
            "uriId": "",
            "uri": "",
            "uriType": 0,
            "uriDisplayText": "",
            "uriAccessibleText": "",
            "uriIconKey": "",
            "isHidden": false
          },
          "tertiaryAction": {
            "uriId": "",
            "uriType": 0,
            "uriDisplayText": "",
            "uriAccessibleText": "",
            "uriIconKey": "",
            "isHidden": false
          },
          "defaultAction": {
            "uriId": "",
            "uri": "",
            "uriType": 0,
            "uriDisplayText": "",
            "uriAccessibleText": "",
            "uriIconKey": "",
            "isHidden": false
          },
          "identifier": "",
          "topicId": 0,
          "isH2GEnabled": false
        }
      ]
    }
  ],
  "linkedAccountsViewModel": {
    "externalAlertWidget": {
      "hasAlerts": false,
      "isLoadingFailed": false,
      "patientIndex": 0,
      "linkType": 0,
      "canAccessManageMyAccounts": false,
      "skipSignup": false,
      "isWaitingForResponse": false
    },
    "externalAlertsList": [],
    "noActionCommunityList": [],
    "inActiveCommunityList": [
      {
        "organization": {
          "organizationId": "",
          "hasChildOrgs": false,
          "organizationName": "",
          "isLocal": false,
          "logoUrl": "",
          "address": [
            ""
          ],
          "isSSO": false,
          "incompleteH2GSetup": false,
          "isGeneric": false,
          "payerOrgDetails": {
            "isPayerOnly": false,
            "isPayvider": false,
            "isPayer": false,
            "isPayerLicensedForMyChart": false,
            "payerChildWebsiteName": "",
            "payerDXO": "",
            "payerCvgLogo": "",
            "payerCvgToken": "",
            "payerCvgName": ""
          },
          "isMyChartCentral": false,
          "isSameOrganization": false
        },
        "payerOrgDetails": {
          "isPayerOnly": false,
          "isPayvider": false,
          "isPayer": false,
          "isPayerLicensedForMyChart": false,
          "payerChildWebsiteName": "",
          "payerCvgLogo": "",
          "payerCvgToken": "",
          "payerCvgName": "",
          "payerCvgLogoMagicId": ""
        },
        "userMyChartStatus": 0,
        "isSignupAllowed": false,
        "hasCrossOrgVideoVisit": false
      }
    ],
    "subjectName": "",
    "isNonPatient": false
  }
} as const;

// /api/letters/getletterslist
export const getLettersList = {
  "letters": [
    {
      "dateISO": "",
      "viewed": false,
      "hnoId": "",
      "csn": "",
      "reason": "",
      "empId": ""
    }
  ],
  "users": {
    "*": {
      "empId": "",
      "name": "",
      "photoUrl": ""
    }
  },
  "departments": {}
} as const;

// /api/medicaladvicerequests/getmedicaladvicerequestrecipients
export const getMedicalAdviceRequestRecipients = [
  {
    "recipientType": 0,
    "pcpTypeDisplayName": "",
    "displayName": "",
    "specialty": "",
    "userId": "",
    "departmentId": "",
    "poolId": "",
    "oocContext": 0,
    "photoUrl": "",
    "providerId": "",
    "organizationId": ""
  }
] as const;

// /api/medicaladvicerequests/getsubtopics
export const getSubTopics = {
  "topicList": [
    {
      "displayName": "",
      "value": ""
    }
  ],
  "organizationId": ""
} as const;

// /api/medications/loadmedicationspage
export const loadMedicationsPage = {
  "communityMembers": [
    {
      "context": 0,
      "isPossiblyFiltered": false,
      "medicationsVerified": false,
      "showPreviousTakingValues": false,
      "isExternal": false,
      "organization": {
        "organizationId": "",
        "organizationName": "",
        "logoUrl": "",
        "isLocal": false,
        "isSSO": false,
        "incompleteH2GSetup": false,
        "address": [
          ""
        ],
        "linkType": 0,
        "currentlyLoadingData": false,
        "errorLoadingData": false,
        "hasValidRefreshToken": false,
        "shouldRemindForUpdate": false,
        "showInRefreshBanner": false,
        "disclaimerOverride": false,
        "isMyChartCentral": false
      },
      "prescriptionList": {
        "prescriptions": [
          {
            "target": "",
            "isSigRTL": false,
            "isTranslationFromOrderRTL": false,
            "dateDisplayKey": "",
            "dateToDisplay": "",
            "prescriptionNumber": "",
            "hasFutureStartDate": false,
            "authorizingProvider": {
              "type": 0,
              "hasPhotoOnBlob": false,
              "id": "",
              "name": ""
            },
            "orderingProvider": {
              "type": 0,
              "hasPhotoOnBlob": false,
              "id": "",
              "name": ""
            },
            "providerDisplayKey": "",
            "showProviderInMedsCard": false,
            "drawProviderDetailsLink": false,
            "isSelected": false,
            "classList": [
              ""
            ],
            "isPatientReported": false,
            "showPrescriptionCardBottomDetails": false,
            "showPrescriptionCardBottom": false,
            "showDeleteButton": false,
            "showRefillButton": false,
            "showRefillStatus": false,
            "showWaitingForInsuranceAuth": false,
            "showOrderLevelStatus": false,
            "showBannerMessage": false,
            "showDuplicateWarning": false,
            "showHomeHealthPendingUpdateWarning": false,
            "isAnticoagulationMed": false,
            "isFrequencyPRN": false,
            "criticalMedMessage": "",
            "showSig": false,
            "showPendingUndoDeleteButton": false,
            "showPendingUndoAddButton": false,
            "disableValidation": false,
            "prescriptionListType": 0,
            "organization": {
              "organizationId": "",
              "organizationName": "",
              "logoUrl": "",
              "isLocal": false,
              "isSSO": false,
              "incompleteH2GSetup": false,
              "address": [
                ""
              ],
              "linkType": 0,
              "currentlyLoadingData": false,
              "errorLoadingData": false,
              "hasValidRefreshToken": false,
              "shouldRemindForUpdate": false,
              "showInRefreshBanner": false,
              "disclaimerOverride": false,
              "isMyChartCentral": false
            },
            "hasPrescriptionColDetail": false,
            "hasRefillColDetail": false,
            "hasPharmacyColDetail": false,
            "showDrivingDirections": false,
            "showMessagePharmacyAction": false,
            "showCostDetails": false,
            "showPayButton": false,
            "highlightMedIsHidden": false,
            "proxiesWhoCantAccessConfMeds": [],
            "showProxiesWhoCantAccessList": false,
            "showOutpatientPauseWarning": false,
            "outpatientPauseSummary": "",
            "outpatientPauseExtraText": "",
            "outpatientPauseDupMismatchType": 0,
            "refillDetails": {
              "writtenDispenseQuantity": "",
              "writtenDispenseUnit": "",
              "writtenDispenseAmount": "",
              "daySupply": "",
              "nextDispenseDate": "",
              "owningPharmacy": {
                "id": "",
                "name": "",
                "isIntegrated": false,
                "phoneNumber": "",
                "formattedAddress": [
                  ""
                ],
                "hours": [],
                "supportedDeliveryMethods": [
                  {
                    "name": "",
                    "type": 0,
                    "isDeliveryAddressRequired": false,
                    "behavesLikeType": 0,
                    "paymentMethods": [
                      0
                    ],
                    "deliveryFee": {
                      "price": 0,
                      "tax": 0,
                      "totalDue": 0
                    }
                  }
                ],
                "departmentID": "",
                "hasCreditCardPayments": false,
                "showDrivingDirections": false,
                "isPreferred": false,
                "isPatientMessagingEnabled": false
              },
              "lastDispense": {
                "dispenseQuantity": "",
                "dispenseUnit": "",
                "dispenseAmount": "",
                "dispenseDate": "",
                "amountDue": 0,
                "workRequestFee": 0,
                "workRequestFeeDue": 0,
                "isPaymentValidForDeliveryMethod": false,
                "isRxReady": false,
                "costDetails": {
                  "copay": 0,
                  "formattedCopay": "",
                  "isCopayPending": false,
                  "isBilledToAccount": false,
                  "paymentCards": [],
                  "hasPaymentCard": false
                },
                "dispenseType": 0,
                "delivery": {
                  "shipmentTrackingInfo": [],
                  "formattedAddress": [],
                  "formattedShipDate": ""
                }
              },
              "refillButtonHoverCode": "",
              "refillButtonStatus": 0,
              "refillsRemainingKey": "",
              "refillExpirationDate": "",
              "hasRefillsRemaining": false,
              "refillsRemaining": "",
              "isRefillable": false,
              "refillWarningCode": "",
              "arePharmaciesAvailableForRefill": false,
              "refillStatus": 0,
              "scheduledFillDate": "",
              "externalFillRequestDate": "",
              "showLastDispenseQuantity": false,
              "rxFlags": [],
              "costDetails": {
                "copay": 0,
                "formattedCopay": "",
                "isCopayPending": false,
                "isBilledToAccount": false,
                "paymentCards": [],
                "hasPaymentCard": false
              },
              "currentFillDat": "",
              "doesWorkRequestContainHiddenMed": false
            },
            "formattedDateNoted": "",
            "startDate": "",
            "sig": "",
            "sigTranslationFromOrder": "",
            "lastUpdateInstant": "",
            "id": "",
            "name": "",
            "patientFriendlyName": {
              "text": "",
              "caption": "",
              "captionType": ""
            },
            "iconPath": "",
            "contentLinkURL": "",
            "pendingUpdateType": 0,
            "isPendingUpdate": false,
            "varianceReason": {
              "comment": "",
              "epic.Core.Data.ICommentable.CommentClientEditable": false
            },
            "varianceComment": "",
            "previousTakingDiffSig": "",
            "isPreviousTakingDiffSigRTL": false,
            "previousTakingDiffSigCSN": "",
            "previousTakingDiffSigInstant": "",
            "isClinicReported": false
          }
        ],
        "isPossiblyFiltered": false,
        "medicationsVerified": false,
        "showPreviousTakingValues": false,
        "previousTakingValuesDate": "",
        "pickups": [],
        "deliveries": [],
        "inProgressWorkRequests": [],
        "showNotificationBanners": false,
        "organization": {
          "organizationId": "",
          "organizationName": "",
          "logoUrl": "",
          "isLocal": false,
          "isSSO": false,
          "incompleteH2GSetup": false,
          "address": [
            ""
          ],
          "linkType": 0,
          "currentlyLoadingData": false,
          "errorLoadingData": false,
          "hasValidRefreshToken": false,
          "shouldRemindForUpdate": false,
          "showInRefreshBanner": false,
          "disclaimerOverride": false,
          "isMyChartCentral": false
        },
        "showFilteredWarning": false,
        "showRefillButton": false,
        "showRefillDisclaimer": false,
        "onHealthSummaryPage": false,
        "loadingOrgNames": "",
        "hasOrgsLoading": false,
        "errorOrgNames": "",
        "hasOrgsWithErrors": false,
        "manualOrgNames": "",
        "hasOrgsManual": false,
        "showPrescriptionListWithTwoColumns": false,
        "showFreeTextPrescriptionInput": false,
        "showPrescriptionList": false,
        "enableDummyValidationCheckbox": false,
        "showDxrRefreshBanner": false,
        "showDxrBannerAction": false,
        "pretextStringKey": "",
        "showManagePharmacyLink": false,
        "numRefillsDueSoon": 0
      },
      "showLoadingIndicator": false,
      "showAddMedicationBox": false,
      "showCommunityMemberOnInitialLoad": false,
      "showPersonalNotes": false,
      "requiresLoading": false,
      "showPrescriptionListWithTwoColumns": false,
      "enableSelectionMode": false,
      "useRxNormForSearch": false,
      "alwaysShowSearchMore": false,
      "showRespondByPreferences": false,
      "showMessageViewerOptions": false,
      "allowFreeTextPharmacy": false,
      "allowPickUpDateTimeInput": false,
      "allowMedsRefill": false,
      "areMedsPaidByPatient": false,
      "showEstimatedRxCost": false
    }
  ],
  "showPatientAdmittedBanner": false,
  "isProxyView": false,
  "getPatientFirstName": "",
  "enableSelectionMode": false,
  "hostedInIFrame": false,
  "backToContextSet": false,
  "medSettings": {
    "useRxNormForSearch": false,
    "alwaysShowSearchMore": false,
    "defaults": [],
    "dateOfBirth": "",
    "searchMethod": 0,
    "isMedAdherenceFeatureEnabled": false,
    "medicationTakingSettings": {
      "reasonsForTakingDifferently": [],
      "reasonsForNotTaking": []
    }
  },
  "medicationsUrl": ""
} as const;

// /api/past-results/getmultiplehistoricalresultcomponents
export const getMultipleHistoricalResultComponents = {
  "historicalResults": {
    "*": {
      "oldestResultISO": "",
      "hideGraph": false,
      "showAbnormalFlag": false,
      "historicalResultData": [
        {
          "value": "",
          "isValueRtf": false,
          "numericValue": 0,
          "referenceRange": {
            "low": 0,
            "high": 0,
            "displayLow": "",
            "displayHigh": "",
            "lowerBoundExclusive": false,
            "upperBoundExclusive": false,
            "formattedReferenceRange": ""
          },
          "abnormalFlagCategoryValue": "",
          "dateISO": ""
        }
      ],
      "componentID": "",
      "name": "",
      "commonName": "",
      "units": ""
    }
  },
  "orderedComponentIDs": [
    ""
  ],
  "reportID": "",
  "shouldShowBedsideActiveView": false
} as const;

// /api/personalinformation/getrelationships
export const getRelationships = {
  "isViewOnly": false,
  "hideEmergencyContacts": false,
  "contacts": [
    {
      "id": "",
      "formattedName": "",
      "relationToPatient": {
        "name": "",
        "labelText": "",
        "isInactive": false
      },
      "isPrimaryContact": false,
      "isLinkedToOtherPatient": false,
      "isHCA": false,
      "isAddressLinkedToPatient": false,
      "contactInformation": {
        "address": {
          "street": "",
          "city": "",
          "county": {
            "number": "",
            "title": "",
            "isInactive": false
          },
          "state": {
            "number": "",
            "title": "",
            "abbreviation": "",
            "isInactive": false
          },
          "zip": "",
          "country": {
            "number": "",
            "title": "",
            "isInactive": false
          },
          "houseNumber": "",
          "district": {
            "number": "",
            "abbreviation": "",
            "isInactive": false
          },
          "formattedValues": [
            ""
          ],
          "allowArbitraryInput": false,
          "allowDefaults": false
        },
        "emailAddress": "",
        "phoneNumbers": [
          {
            "phoneNumber": "",
            "type": ""
          }
        ]
      },
      "savedSuccessfully": false,
      "isPending": false,
      "isVRK": false
    }
  ],
  "relationToPatientChoices": [
    {
      "name": "",
      "labelText": "",
      "isInactive": false
    }
  ],
  "requiredFields": [],
  "vrkFields": [],
  "hasEndOfLifePageMnemonic": false
} as const;

// /api/referrals/listreferrals
export const listReferrals = {
  "referralList": [
    {
      "internalId": "",
      "externalId": "",
      "status": "",
      "statusString": "",
      "creationDate": "",
      "dte": 0,
      "referredToProviderName": "",
      "referredByProviderName": "",
      "referredToFacility": "",
      "start": "",
      "end": ""
    }
  ],
  "canSendMessage": false,
  "canSeeAuthorizations": false,
  "shouldRedirect": false
} as const;

// /api/release-of-information/getehietemplates
export const getEhiETemplates = {
  "isNoBuildEhie": false,
  "existingEHIE": false,
  "ehieTemplates": [
    {
      "description": "",
      "hideAdditionalComments": false,
      "name": "",
      "id": ""
    }
  ],
  "__Status": "",
  "__UpdateableSettings": {
    "maxThrottleConnections": 0,
    "connectionReleaseDelay": 0,
    "virtualQueueLoadThreshold": 0,
    "virtualQueuePopDelay": 0,
    "virtualQueueSize": 0,
    "isVirtualQueueEnabled": false,
    "lastDynamicSettingsUpdate": {
      "CredentialSettings": "",
      "LicenseSettings": "",
      "MyChartCentralSettings": "",
      "ServerStatusSettings": ""
    }
  }
} as const;

// /api/report-content/loadreportcontent
export const loadReportContent = {
  "reportContent": "",
  "reportCss": "",
  "baseFontSize": 0,
  "stylesheets": [
    ""
  ]
} as const;

// /api/test-results/getdetails
export const testResultDetails = {
  "orderName": "",
  "key": "",
  "results": [
    {
      "name": "",
      "key": "",
      "showName": false,
      "showDetails": false,
      "orderMetadata": {
        "orderProviderName": "",
        "readingProviderName": "",
        "resultTimestampDisplay": "",
        "prioritizedInstantISO": "",
        "prioritizedInstantDisplay": "",
        "latestUpdateInstantISO": "",
        "collectionTimestampsDisplay": "",
        "specimensDisplay": "",
        "resultStatus": "",
        "resultingLab": {
          "name": "",
          "address": [
            ""
          ],
          "phoneNumber": "",
          "labDirector": "",
          "cliaNumber": "",
          "accreditationType": ""
        },
        "resultType": "",
        "read": "",
        "associatedDiagnoses": [
          ""
        ]
      },
      "resultComponents": [
        {
          "componentInfo": {
            "componentID": "",
            "name": "",
            "commonName": "",
            "units": ""
          },
          "componentResultInfo": {
            "value": "",
            "isValueRtf": false,
            "numericValue": 0,
            "referenceRange": {
              "low": 0,
              "high": 0,
              "displayLow": "",
              "displayHigh": "",
              "lowerBoundExclusive": false,
              "upperBoundExclusive": false,
              "formattedReferenceRange": ""
            },
            "abnormalFlagCategoryValue": ""
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
          "signingInstantTimestamp": ""
        },
        "impression": {
          "isRTF": false,
          "hasContent": false,
          "contentAsString": "",
          "contentAsHtml": "",
          "signingInstantTimestamp": ""
        },
        "combinedRTFNarrativeImpression": {
          "isRTF": false,
          "hasContent": false,
          "contentAsString": "",
          "contentAsHtml": "",
          "signingInstantTimestamp": ""
        },
        "addenda": [],
        "isFullResultText": false,
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
        "signingInstantTimestamp": ""
      },
      "hiddenProxies": "",
      "reportDetails": {
        "isDownloadablePDFReport": false,
        "reportID": "",
        "openRemotely": false,
        "reportContext": "",
        "reportVars": {
          "ordId": "",
          "ordDat": ""
        }
      },
      "scans": [],
      "imageStudies": [],
      "indicators": [],
      "geneticProfileLink": "",
      "shareEverywhereLogin": false,
      "showProviderNotReviewed": false,
      "providerComments": [],
      "resultLetter": {
        "isRTF": false,
        "hasContent": false,
        "contentAsString": "",
        "contentAsHtml": "",
        "signingInstantTimestamp": ""
      },
      "warningType": "",
      "warningMessage": "",
      "variants": [],
      "tooManyVariants": false,
      "hasComment": false,
      "hasAllDetails": false,
      "isAbnormal": false,
      "baseSingleMessageUrl": "",
      "fullMultipleMessagesUrl": "",
      "relatedConversationIds": []
    }
  ],
  "orderLimitReached": false,
  "ordersDeduplicated": false,
  "isEnhancedAskAQuestionActive": false,
  "hideEncInfo": false
} as const;

// /api/test-results/getlist
export const testResultList = {
  "areResultsFullyLoaded": false,
  "isGroupingFullyLoaded": false,
  "groupBy": "",
  "newResultGroups": [
    {
      "key": "",
      "contactType": "",
      "resultList": [
        ""
      ],
      "isInpatient": false,
      "isEDVisit": false,
      "isCurrentAdmission": false,
      "formattedAdmitDate": "",
      "formattedDischargeDate": "",
      "visitProviderID": "",
      "organizationID": "",
      "sortDate": "",
      "admitInstant": {
        "instantISO": "",
        "includesTime": false
      },
      "dischargeInstant": {
        "instantISO": "",
        "includesTime": false
      },
      "formattedDate": "",
      "isLargeGroup": false
    }
  ],
  "organizationLoadMoreInfo": {},
  "newResults": {
    "*": {
      "name": "",
      "key": "",
      "showName": false,
      "showDetails": false,
      "orderMetadata": {
        "orderProviderName": "",
        "authorizingProviderName": "",
        "authorizingProviderID": "",
        "prioritizedInstantISO": "",
        "prioritizedInstantDisplay": "",
        "resultType": "",
        "read": ""
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
    "*": {
      "name": "",
      "empId": "",
      "remoteEncrypted": false,
      "photoUrl": "",
      "providerId": "",
      "organizationId": ""
    }
  },
  "newComments": {}
} as const;

// /api/track-my-health/getflowsheetreadings
export const getFlowsheetReadings = {
  "flowsheet": {
    "episodeId": "",
    "templateId": "",
    "name": "",
    "entryType": "",
    "entryMode": "",
    "status": "",
    "startDateIso": "",
    "endDateIso": "",
    "instructions": "",
    "hasMoreData": false,
    "hasEpisodeData": false,
    "rowGroups": [
      {
        "id": "",
        "name": "",
        "rowIds": [
          ""
        ]
      }
    ],
    "rows": [
      {
        "id": "",
        "name": "",
        "rowType": "",
        "valueType": "",
        "decimalPlaces": 0
      }
    ],
    "readings": [
      {
        "id": "",
        "fsdId": "",
        "rowId": "",
        "valueType": "",
        "entryType": "",
        "instantTakenIso": "",
        "isAbnormal": false,
        "documentationSource": "",
        "stringValue": "",
        "dataType": "",
        "line": 0,
        "decimalPlaces": 0,
        "timeZone": "",
        "sourceRowId": ""
      }
    ]
  },
  "userSettings": {
    "isAdmitted": false,
    "isH2GSession": false,
    "isMOContext": false,
    "isDataTileContext": false,
    "isProxyContext": false,
    "myChartPatientId": "",
    "myChartPatientName": "",
    "myChartUserId": "",
    "myChartUserName": "",
    "devicePlatform": "",
    "healthConnectAvailable": "",
    "moVersionSupportsBluetooth": false
  }
} as const;

// /api/track-my-health/getflowsheets
export const getFlowsheets = {
  "flowsheets": [
    {
      "episodeId": "",
      "templateId": "",
      "name": "",
      "entryType": "",
      "entryMode": "",
      "status": "",
      "startDateIso": "",
      "endDateIso": "",
      "instructions": "",
      "hasMoreData": false,
      "hasEpisodeData": false,
      "rowGroups": [
        {
          "id": "",
          "name": "",
          "rowIds": [
            ""
          ]
        }
      ],
      "rows": [
        {
          "id": "",
          "name": "",
          "rowType": "",
          "valueType": "",
          "decimalPlaces": 0
        }
      ],
      "readings": []
    }
  ],
  "userSettings": {
    "isAdmitted": false,
    "isH2GSession": false,
    "isMOContext": false,
    "isDataTileContext": false,
    "isProxyContext": false,
    "myChartPatientId": "",
    "myChartPatientName": "",
    "myChartUserId": "",
    "myChartUserName": "",
    "devicePlatform": "",
    "healthConnectAvailable": "",
    "moVersionSupportsBluetooth": false
  }
} as const;

// /api/upcoming-orders/getupcomingorders
export const getUpcomingOrders = {
  "orderGroupList": {},
  "orderList": {},
  "providerList": {},
  "upcomingOrdersSettings": {
    "canHideOrUnhideReminders": false
  }
} as const;

// /api/visit-notes/getvisitnotes
export const getVisitNotes = {
  "lrpID": "",
  "depPhoneNumber": "",
  "isAtLeastOneNoteSensitive": false,
  "noteList": [
    {
      "hnoID": "",
      "hnoDAT": "",
      "displayName": "",
      "iso": "",
      "isAddendum": false,
      "provider": {
        "name": "",
        "hasPhotoOnBlob": false,
        "magicID": ""
      },
      "isNoteSensitive": false,
      "attachments": []
    }
  ]
} as const;

// /billing/details/getstatementlist
export const getStatementList = {
  "Success": false,
  "DataStatement": {
    "StatementList": [
      {
        "Show": false,
        "Date": 0,
        "DayOfMonth": 0,
        "Month": 0,
        "Year": 0,
        "DateDisplay": "",
        "Description": "",
        "SubText": "",
        "LinkText": "",
        "LinkDescription": "",
        "IsRead": false,
        "ImagePath": "",
        "Token": "",
        "IsPaperless": false,
        "PrintID": "",
        "StatementAmountDisplay": "",
        "IsEB": false,
        "Format": 0,
        "IsDetailBill": false,
        "BillingSystem": 0,
        "EncBillingSystem": "",
        "RecordID": "",
        "ServiceDateStart": null,
        "ServiceDateEnd": null,
        "URLStatement": null
      }
    ],
    "HasUnread": false,
    "HasRead": false,
    "ShowAll": false,
    "IsPaperless": false,
    "PaperlessStatus": 0,
    "ShowPaperlessSignup": false,
    "ShowPaperlessCancel": false,
    "URLPaperlessBilling": "",
    "IsPaperlessAllowedForSA": false,
    "IsDetailBillModel": false,
    "noStatementsString": "",
    "allReadString": "",
    "loadMoreString": ""
  },
  "DataDetailBill": {
    "StatementList": [
      {
        "Show": false,
        "Date": 0,
        "DayOfMonth": 0,
        "Month": 0,
        "Year": 0,
        "DateDisplay": "",
        "Description": "",
        "SubText": "",
        "LinkText": "",
        "LinkDescription": "",
        "IsRead": false,
        "ImagePath": "",
        "Token": "",
        "IsPaperless": false,
        "PrintID": "",
        "StatementAmountDisplay": "",
        "IsEB": false,
        "Format": 0,
        "IsDetailBill": false,
        "BillingSystem": 0,
        "EncBillingSystem": "",
        "RecordID": "",
        "ServiceDateStart": null,
        "ServiceDateEnd": null,
        "URLStatement": null
      }
    ],
    "HasUnread": false,
    "HasRead": false,
    "ShowAll": false,
    "IsPaperless": false,
    "PaperlessStatus": 0,
    "ShowPaperlessSignup": false,
    "ShowPaperlessCancel": false,
    "URLPaperlessBilling": null,
    "IsPaperlessAllowedForSA": false,
    "IsDetailBillModel": false,
    "noStatementsString": "",
    "allReadString": "",
    "loadMoreString": ""
  }
} as const;

// /billing/details/getvisits
export const billingGetVisits = {
  "Success": false,
  "Data": {
    "VisitList": [],
    "VisitListAmount": "",
    "BadDebtVisitList": [],
    "BadDebtVisitListAmount": "",
    "PaymentPlanVisitList": [],
    "PaymentPlanVisitListAmount": "",
    "PaymentPlanVisitListAutoPayAmount": null,
    "PaymentPlanVisitListScheduledDate": null,
    "EstimatedPaymentPlanBalance": null,
    "PaymentPlanVisitListPostResolutionAmount": "",
    "NotPaymentPlanVisitList": [],
    "NotPaymentPlanVisitListAmount": "",
    "AdvanceBillVisitList": [],
    "AdvanceBillVisitListAmount": "",
    "InformationalVisitList": [],
    "NoBalanceVisitList": [],
    "AdjustmentVisitList": [],
    "AdjustmentVisitListAmount": "",
    "VisitAutoPayVisitList": [],
    "VisitAutoPayVisitListAmount": "",
    "UnifiedVisitList": [
      {
        "GroupType": 0,
        "Index": 0,
        "BillingSystem": 0,
        "IsSBO": false,
        "BillingSystemDisplay": "",
        "AdjustmentsOnly": false,
        "DateRangeDisplay": null,
        "StartDate": 0,
        "StartDayOfMonth": 0,
        "StartMonth": 0,
        "StartYear": 0,
        "StartDateDisplay": "",
        "StartDateAccessibleText": "",
        "Description": "",
        "Patient": "",
        "Provider": "",
        "ProviderId": null,
        "HospitalAccountDisplay": "",
        "HospitalAccountId": "",
        "SuppressDayFromDate": false,
        "CanAddToPaymentPlan": false,
        "PrimaryPayer": "",
        "IsLTCSeries": false,
        "ChargeAmount": "",
        "SurchargeAmount": null,
        "TaxOrSurcharge": 0,
        "InsuranceAmountDue": "",
        "InsuranceAmountDueRaw": 0,
        "SelfAmountDue": "",
        "SelfAmountDueRaw": 0,
        "IsPatientNotResponsible": false,
        "PatientNotResponsibleYet": false,
        "InsurancePaymentAmount": "",
        "InsuranceEstimatedPaymentAmount": null,
        "SelfPaymentAmount": "",
        "SelfAdjustmentAmount": null,
        "SelfDiscountAmount": null,
        "ContestedChargeAmount": null,
        "ContestedPaymentAmount": null,
        "ShowInsurancePendingHelp": false,
        "ShowInsuranceCoveredHelp": false,
        "SelfPaymentPlanAmountDue": null,
        "SelfPaymentPlanAmountDueRaw": 0,
        "SuppressProcedureAmount": false,
        "AdjustmentSuppressionSetting": 0,
        "IsExpanded": false,
        "AlwaysShowDetails": false,
        "BlockExpanding": false,
        "ProcedureList": [
          {
            "BillingSystem": 0,
            "Description": "",
            "Amount": "",
            "PaymentList": null,
            "InsuranceAmountDue": null,
            "SelfAmountDue": "",
            "HasAmountDue": false,
            "SelfBadDebtAmount": null,
            "HasBadDebtAmount": false,
            "AdjustmentsOnly": false,
            "IsContested": false
          }
        ],
        "ProcedureGroupList": [
          {
            "VisitIndex": 0,
            "VisitGroupType": 0,
            "Description": null,
            "Amount": "",
            "ProcedureList": null,
            "PaymentList": [
              {
                "ID": null,
                "ElementID": null,
                "Index": null,
                "DayOfMonth": 0,
                "Month": 0,
                "Year": 0,
                "FormattedDateDisplay": null,
                "Description": "",
                "SubText": null,
                "HtmlSubText": null,
                "PaymentAmountDisplay": "",
                "UndistributedAmountDisplay": null,
                "CoverageInfo": null,
                "Receipt": null,
                "IsBadDebtAdj": false,
                "IsWriteOffAdj": false,
                "IsSurchargeAdj": false,
                "CanEdit": false,
                "EditPaymentOptions": null,
                "CanCancel": false,
                "CancelCommandOptions": null,
                "ConsentDocument": null,
                "ViewConsentOptions": null,
                "IsCardExpiringSoon": false,
                "HasCardExpired": false
              }
            ],
            "EstPlanPaymentList": [],
            "HasEstPlanList": false,
            "IsPaymentsOnly": false,
            "HasPaymentsTowardsEstimates": false,
            "HasContestedProcedures": false,
            "IsExpanded": false,
            "AlwaysShowDetails": false
          }
        ],
        "CoverageInfoList": [
          {
            "CoverageName": "",
            "Billed": "",
            "Covered": "",
            "PendingInsurance": null,
            "RemainingResponsibility": "",
            "Copay": "",
            "Deductible": null,
            "Coinsurance": null,
            "NotCovered": null,
            "Benefits": [
              {
                "Name": "",
                "Amount": ""
              }
            ],
            "ShowInsuranceCoveredHelp": false,
            "ShowInsurancePendingHelp": false
          }
        ],
        "ShowCoverageHelp": false,
        "VisitAutoPay": null,
        "ShowVisitAutoPay": false,
        "LevelOfDetailLoaded": 0,
        "SelfBadDebtAmount": null,
        "SelfBadDebtAmountRaw": 0,
        "IsClosedHospitalAccount": false,
        "IsBadDebtVisit": false,
        "IsContestedHAR": false,
        "IsPaymentPlanEstimate": false,
        "IsResolvedEstimatedPPAccount": false,
        "NotOnPlanAmount": null,
        "NotOnPlanAmountRaw": 0,
        "EmptyVisitEstimateID": null,
        "EstimateInfo": null,
        "PatFriendlyAccountStatus": 0,
        "VisitBadDebtScenario": 0,
        "IsUnpayableHAR": false,
        "PatFriendlyAccountStatusAccessibleText": "",
        "VisitStatusesEqualToClosed": [
          0
        ],
        "IsOnPaymentPlan": false,
        "IsNotOnPaymentPlan": false,
        "AgencyInformation": {
          "Name": "",
          "PhoneNumber": "",
          "AgencyID": 0
        },
        "AgencyInformationDescription": null
      }
    ],
    "ContestedVisitList": [],
    "ContestedVisitListAmount": "",
    "HasVisits": false,
    "ShowingAll": false,
    "HasUnconvertedPBVisits": false,
    "CanMakePayment": false,
    "CanEditPaymentPlan": false,
    "URLMakePayment": null,
    "URLEditPaymentPlan": null,
    "Filters": {
      "FilterClass": "",
      "Options": [
        {
          "OptionClass": "",
          "OptionLabel": ""
        }
      ]
    },
    "PartialPaymentPlanAlert": {
      "Code": 0,
      "Banner": {
        "HeaderText": "",
        "DetailText": "",
        "AssistiveText": "",
        "ButtonLabel": "",
        "ButtonAssistiveText": "",
        "ButtonUrl": "",
        "ButtonID": null,
        "ButtonClass": null,
        "ButtonData": null,
        "TelephoneLink": null,
        "ButtonLabelSecondary": null,
        "ButtonUrlSecondary": null,
        "ButtonIDSecondary": null,
        "ButtonClassSecondary": null,
        "ButtonAriaDescribedByContentSecondary": null,
        "ButtonAriaDescribedByIdSecondary": null,
        "ButtonDataSecondary": null,
        "DisableDetailTextHtmlEncoding": false,
        "BannerType": "",
        "BannerTypeReact": "",
        "IconOverride": "",
        "IconAltTextOverride": null,
        "FontSize": 0,
        "UseH3Header": false
      }
    },
    "BillingSystem": 0,
    "billType": 0,
    "IsStatement": false,
    "StatementDisplayDate": null,
    "UndistributedPayments": [],
    "ShouldShowADACopyright": false,
    "SharedAgencyInformation": {
      "Name": "",
      "PhoneNumber": "",
      "AgencyID": 0
    }
  }
} as const;

// /billing/details/loadpaymentlist
export const loadPaymentList = {
  "Success": false,
  "Data": {
    "PaymentList": [
      {
        "ID": "",
        "ElementID": "",
        "Index": "",
        "DayOfMonth": 0,
        "Month": 0,
        "Year": 0,
        "FormattedDateDisplay": "",
        "Description": "",
        "SubText": null,
        "HtmlSubText": "",
        "PaymentAmountDisplay": "",
        "UndistributedAmountDisplay": null,
        "CoverageInfo": null,
        "Receipt": {
          "SerialNumber": "",
          "FileName": "",
          "BlobToken": "",
          "IsValidReceipt": false,
          "DisplayNumber": "",
          "PrintStatus": 0,
          "ReceiptStatus": null,
          "ViewReceiptOptions": {
            "AriaDescribedBy": null,
            "AriaLabel": "",
            "Callback": null,
            "CssClasses": "",
            "DataAttrs": {
              "serial-number": "",
              "blob-token": "",
              "file-path": "",
              "display-number": ""
            },
            "IconCssClasses": "",
            "IconPath": "",
            "Id": null,
            "IsDisabled": false,
            "IsSubmit": false,
            "LinkTarget": null,
            "MiscContent": null,
            "Path": null,
            "Title": null,
            "UsesJqShowHide": false,
            "IsSvgSprite": false,
            "CommandType": 0
          },
          "MobileDocViewerSupported": false,
          "Url": null
        },
        "IsBadDebtAdj": false,
        "IsWriteOffAdj": false,
        "IsSurchargeAdj": false,
        "CanEdit": false,
        "EditPaymentOptions": null,
        "CanCancel": false,
        "CancelCommandOptions": null,
        "ConsentDocument": null,
        "ViewConsentOptions": null,
        "IsCardExpiringSoon": false,
        "HasCardExpired": false
      }
    ],
    "Filters": null
  }
} as const;

// /community/shared/loadcommunitylinks
export const loadCommunityLinks = {
  "IsConsentNeeded": false,
  "HideAskLater": false,
  "HasSearchableOrgs": false,
  "OrgList": {
    "*": {
      "OrganizationName": "",
      "OrganizationId": "",
      "CELocationId": "",
      "RelatedOrganizations": null,
      "HasChildOrgs": false,
      "LinkType": 0,
      "LogoUrl": "",
      "TermsAndConditionsUrl": "",
      "ProxyTermsAndConditionsUrl": "",
      "UserActionStatus": 0,
      "IsDisabled": false,
      "ShowSignup": false,
      "ShowSignUpUnavailableMessage": false,
      "Accept": false,
      "UserMyChartStatus": 0,
      "CanScheduleCrossOrgVideoVisit": false,
      "IsSSO": false,
      "IncompleteH2GSetup": false,
      "LastEncounterDetail": {
        "Patient": "",
        "Physician": "",
        "Department": "",
        "Date": "",
        "Time": ""
      },
      "LastAccessTokenDateTime": null,
      "DisplayAutoRefresh": false,
      "DisplayAddress": [
        ""
      ],
      "ShowUnavailableMsg": false,
      "CurrentlyLoadingDxrData": false,
      "ErrorLoadingDxrData": false,
      "CanJump": false,
      "HiddenFromMyChart": 0,
      "CanCreateCELink": false,
      "InProgressOrgNotSeen": false,
      "LinkErrorCode": "",
      "HasValidRefreshToken": false,
      "IsWithinThrottlingTime": false,
      "ShouldRemindForUpdate": false,
      "ShowInRefreshBanner": false,
      "IsInvalidCeLink": false,
      "InvalidLinkReason": 0,
      "InvalidLinkRetryDate": "",
      "IsMyChartCentral": false,
      "IdentityRelationship": 0,
      "H2GRemoteAuthLinkWorkflow": 0,
      "ShouldDisableLink": false,
      "ErrorMessage": null,
      "DisclaimerOverride": false,
      "NeedCeAuth": false,
      "IsPPOC": false,
      "PayerOrgDetails": {
        "IsPayerOnly": false,
        "IsPayvider": false,
        "IsPayer": false,
        "IsPayerLicensedForMyChart": false,
        "PayerChildWebsiteName": "",
        "PayerCvgLogo": "",
        "PayerCvgToken": "",
        "PayerCvgName": "",
        "PayerCvgLogoMagicId": ""
      },
      "NewSubjectList": null
    }
  },
  "AutoQueryList": {},
  "Spotlight": [
    {
      "OrganizationName": "",
      "ChildOrganizationName": "",
      "OrganizationId": "",
      "ChildId": "",
      "LogoUrl": "",
      "DisplayAddress": [
        ""
      ],
      "ShowUnavailableMsg": false,
      "UnavailableMsg": 0,
      "ShowAssociations": false,
      "EpicStatus": false,
      "PayerOrgDetails": {
        "IsPayerOnly": false,
        "IsPayvider": false,
        "IsPayer": false,
        "IsPayerLicensedForMyChart": false,
        "PayerChildWebsiteName": "",
        "PayerCvgLogo": "",
        "PayerCvgToken": "",
        "PayerCvgName": "",
        "PayerCvgLogoMagicId": ""
      },
      "ShouldDisableLink": false,
      "DisclaimerOverride": false
    }
  ],
  "H2GHasBeenViewed": false,
  "CEOptOut": false,
  "IsNPP": false,
  "InProgressList": {},
  "FhirUpdateFrequency": 0,
  "FhirSessionThrottlingTime": 0,
  "IsSelfVerified": false,
  "ForwardedLinks": [],
  "HomeOrgName": ""
} as const;

// /personalinformation/getcontactinformation
export const getContactInformation = {
  "PermanentAddress": {
    "IsViewOnly": false,
    "RequiredFieldNames": [],
    "Success": false,
    "IsPending": false,
    "Street": "",
    "City": "",
    "County": {
      "Value": null,
      "Number": "",
      "Title": "",
      "Abbreviation": null,
      "Abbr": null,
      "Comment": null,
      "IsInactive": false,
      "TitleUtf8": null,
      "AbbreviationUtf8": null,
      "IsFallbackUsed": false
    },
    "State": {
      "Value": null,
      "Number": "",
      "Title": "",
      "Abbreviation": "",
      "Abbr": null,
      "Comment": null,
      "IsInactive": false,
      "TitleUtf8": null,
      "AbbreviationUtf8": null,
      "IsFallbackUsed": false
    },
    "Zip": "",
    "Country": {
      "Value": null,
      "Number": "",
      "Title": "",
      "Abbreviation": null,
      "Abbr": null,
      "Comment": null,
      "IsInactive": false,
      "TitleUtf8": null,
      "AbbreviationUtf8": null,
      "IsFallbackUsed": false
    },
    "HouseNumber": "",
    "District": {
      "Value": null,
      "Number": "",
      "Title": null,
      "Abbreviation": "",
      "Abbr": null,
      "Comment": null,
      "IsInactive": false,
      "TitleUtf8": null,
      "AbbreviationUtf8": null,
      "IsFallbackUsed": false
    },
    "Building": "",
    "Floor": "",
    "Unit": "",
    "FormattedValues": [
      ""
    ],
    "AllowArbitraryInput": false,
    "AllowDefaults": false,
    "GeocodeScore": null,
    "GeocodeLatitude": null,
    "GeocodeLongitude": null,
    "GeocodeGranularity": null
  },
  "TemporaryAddress": {
    "PhoneNumber": "",
    "StartDateDisplay": null,
    "EndDateDisplay": null,
    "StartDateISO": "",
    "EndDateISO": "",
    "RequiredFieldNames": [],
    "Success": false,
    "IsPending": false,
    "CollapsedStatus": null,
    "Street": "",
    "City": "",
    "County": {
      "Value": null,
      "Number": "",
      "Title": "",
      "Abbreviation": null,
      "Abbr": null,
      "Comment": null,
      "IsInactive": false,
      "TitleUtf8": null,
      "AbbreviationUtf8": null,
      "IsFallbackUsed": false
    },
    "State": {
      "Value": null,
      "Number": "",
      "Title": "",
      "Abbreviation": "",
      "Abbr": null,
      "Comment": null,
      "IsInactive": false,
      "TitleUtf8": null,
      "AbbreviationUtf8": null,
      "IsFallbackUsed": false
    },
    "Zip": "",
    "Country": {
      "Value": null,
      "Number": "",
      "Title": "",
      "Abbreviation": null,
      "Abbr": null,
      "Comment": null,
      "IsInactive": false,
      "TitleUtf8": null,
      "AbbreviationUtf8": null,
      "IsFallbackUsed": false
    },
    "HouseNumber": "",
    "District": {
      "Value": null,
      "Number": "",
      "Title": null,
      "Abbreviation": "",
      "Abbr": null,
      "Comment": null,
      "IsInactive": false,
      "TitleUtf8": null,
      "AbbreviationUtf8": null,
      "IsFallbackUsed": false
    },
    "Building": "",
    "Floor": "",
    "Unit": "",
    "FormattedValues": [],
    "AllowArbitraryInput": false,
    "AllowDefaults": false,
    "GeocodeScore": null,
    "GeocodeLatitude": null,
    "GeocodeLongitude": null,
    "GeocodeGranularity": null
  },
  "PermanentDefaults": [],
  "TemporaryDefaults": [],
  "AllowArbitraryInput": false,
  "AllowDefaults": false,
  "SecureCommunicationInfo": {
    "SecureEmail": "",
    "EmailAddress": "",
    "SecureMobile": "",
    "MobilePhone": "",
    "CanSupportEmail": false,
    "CanSupportMobile": false,
    "CanSupportOverwrite": false,
    "DoesEmailNeedAttention": false,
    "DoesMobileNeedAttention": false,
    "IsEmailDeleted": false,
    "IsMobileDeleted": false,
    "AreBothDeleted": false,
    "AreNeitherDeleted": false,
    "DoBothNeedAttention": false,
    "DoNeitherNeedAttention": false,
    "ContactVerificationDisabled": false
  },
  "HomePhone": "",
  "WorkPhone": "",
  "PreferredDevice": "",
  "RequiredFieldNames": [],
  "IsNonPatientProxyRecord": false,
  "IsTemporaryAddressDisabled": false,
  "ValidationErrors": [],
  "IsPending": false,
  "ReadOnlyFieldNames": [],
  "HasEditableField": false
} as const;

// /proxyswitch
export const proxySwitch = {
  "ProxySubjectList": [
    {
      "Id": "",
      "Ids": [],
      "DisplayName": "",
      "DisplayText": null,
      "PhotoUrl": "",
      "PhotoMagicId": null,
      "BlobToken": "",
      "TabColor": 0,
      "LinkUrl": "",
      "IsSelected": false,
      "IsSelf": false,
      "Loading": false,
      "Disabled": false,
      "ServiceAreaAbbreviationList": ""
    }
  ],
  "ShowFriendsAndFamily": false,
  "ShouldTryAgain": false,
  "ShowPersonalInformation": false,
  "ShowAccountSettings": false,
  "AvailableLanguageList": [
    {
      "Name": "",
      "DisplayText": "",
      "IsSelected": false
    }
  ],
  "CurrentlySelectedTabColor": 0
} as const;

// /visits/visitslist/loadpast
export const visitsLoadPast = {
  "ViewBagProperties": {
    "LoadingOrgNames": "",
    "ErrorOrgNames": "",
    "ManualOrgNames": ""
  },
  "SerializedIndex": "",
  "List": {
    "*": {
      "ViewbagProperties": {},
      "Organization": {
        "OrganizationId": "",
        "OrganizationIdentifier": null,
        "RelatedOrganizations": null,
        "HasChildOrgs": false,
        "CELocationId": null,
        "CELocationHSI": null,
        "WebsiteName": null,
        "OrganizationName": "",
        "MyChartAppName": null,
        "SsnLabel": null,
        "IsLocal": false,
        "LogoUrl": "",
        "TermsAndConditionsUrl": null,
        "ProxyTermsAndConditionsUrl": null,
        "Address": [
          ""
        ],
        "DisplayAddress": null,
        "DiscreteAddress": {
          "StreetAddress": [
            ""
          ],
          "City": "",
          "State": "",
          "StateName": "",
          "Zip": "",
          "Country": ""
        },
        "ContactInformation": null,
        "UrlList": null,
        "IsSSO": false,
        "IncompleteH2GSetup": false,
        "LastEncounterInfo": null,
        "IsGeneric": false,
        "PayerOrgDetails": {
          "OrganizationId": null,
          "IsPayerOnly": false,
          "IsPayvider": false,
          "IsPayer": false,
          "IsPayerLicensedForMyChart": false,
          "PayerChildWebsiteName": null,
          "PayerDXO": null,
          "PayerCvgLogo": null,
          "PayerCvgLogoMagicId": null,
          "PayerCvgToken": null,
          "PayerCvgName": null
        },
        "IsMyChartCentral": false,
        "IsSameOrganization": false
      },
      "List": [
        {
          "HasPaymentFeature": false,
          "HasQuestionnaireFeature": false,
          "HasNewPvdFeature": false,
          "IsNotViewed": false,
          "IsViewStatusVisible": false,
          "IsClinicalNoteAvailable": false,
          "IsNotesOnly": false,
          "IsVisitAmbulatory": false,
          "FeedbackQnrIDs": [],
          "IsAmbPastVisitDetailsEnabled": false,
          "IsAllIPSecurityPointsDisabled": false,
          "IsIPPastVisitDetailsEnabled": false,
          "IsPastVisitDetailsEnabled": false,
          "ShowVisitDetails": false,
          "PrimaryDate": "",
          "CsnForECheckIn": "",
          "UnverifiedProxyJumpUrl": null,
          "RescheduledDatString": null,
          "IsNoShow": false,
          "LeftWithoutSeen": false,
          "DischargeDate": null,
          "HasDownloadSummaryLink": false,
          "HasTransmitSummaryLink": false,
          "CanRedirectToApptDetails": false,
          "PastVisitBucket": "",
          "IsClinicalInformationAvailable": false,
          "OwnedBy": 0,
          "AdmissionDateRange": null,
          "IsApptDetailsEnabled": false,
          "IsRequestCancelEnabled": false,
          "IsDirectCancelEnabled": false,
          "IsRescheduleEnabled": false,
          "IsCopayEnabled": false,
          "IsVisitSummaryEnabled": false,
          "IsDownloadSummaryEnabled": false,
          "IsTransmitCEEnabled": false,
          "IsTransmitDirectEnabled": false,
          "IsDischargeInstrEnabled": false,
          "IsPatHandoutsEnabled": false,
          "IsIPReviewEnabled": false,
          "IsDischargeSummaryEnabled": false,
          "IsProviderLinkEnabled": false,
          "IsPreadmissionEnabled": false,
          "IsEcheckInCompleted": false,
          "Csn": "",
          "Id": "",
          "ReferenceID": "",
          "OrganizationLinks": [],
          "PrimaryOrganizationLink": null,
          "Organization": {
            "OrganizationId": "",
            "OrganizationIdentifier": null,
            "RelatedOrganizations": null,
            "HasChildOrgs": false,
            "CELocationId": null,
            "CELocationHSI": null,
            "WebsiteName": null,
            "OrganizationName": "",
            "MyChartAppName": null,
            "SsnLabel": null,
            "IsLocal": false,
            "LogoUrl": "",
            "TermsAndConditionsUrl": null,
            "ProxyTermsAndConditionsUrl": null,
            "Address": [
              ""
            ],
            "DisplayAddress": null,
            "DiscreteAddress": {
              "StreetAddress": [
                ""
              ],
              "City": "",
              "State": "",
              "StateName": "",
              "Zip": "",
              "Country": ""
            },
            "ContactInformation": null,
            "UrlList": null,
            "IsSSO": false,
            "IncompleteH2GSetup": false,
            "LastEncounterInfo": null,
            "IsGeneric": false,
            "PayerOrgDetails": {
              "OrganizationId": null,
              "IsPayerOnly": false,
              "IsPayvider": false,
              "IsPayer": false,
              "IsPayerLicensedForMyChart": false,
              "PayerChildWebsiteName": null,
              "PayerDXO": null,
              "PayerCvgLogo": null,
              "PayerCvgLogoMagicId": null,
              "PayerCvgToken": null,
              "PayerCvgName": null
            },
            "IsMyChartCentral": false,
            "IsSameOrganization": false
          },
          "EncodedOrgID": null,
          "Month": 0,
          "DateOfMonth": "",
          "Year": "",
          "IsLocal": false,
          "IsNonEpic": false,
          "IsSingleProvider": false,
          "Telemedicine": null,
          "EVisit": null,
          "CanShowTelemedicine": false,
          "Dat": "",
          "Date": "",
          "Time": "",
          "IsClientTime": false,
          "ClientTimeZoneMarker": "",
          "EncounterType": 0,
          "VisitTypeName": "",
          "Instant": "",
          "ArrivalTime": null,
          "CanShowArrivalTime": false,
          "EarlyArrivalReason": null,
          "DurationInMinutes": null,
          "HasDuration": false,
          "Copay": null,
          "CanShowPayments": false,
          "ShortDate": "",
          "IsTimeToBeDetermined": false,
          "IsHideVisitTime": false,
          "CanShowAppointmentTime": false,
          "TimeZone": "",
          "Providers": [
            {
              "EncryptedId": "",
              "Name": "",
              "Type": 0,
              "PhotoUrl": "",
              "PhotoLink": null,
              "WebPageUrl": "",
              "HasPhotoOnBlob": false,
              "PhotoBlobToken": "",
              "IsPerson": false,
              "Department": {
                "Id": "",
                "Name": "",
                "Address": [
                  ""
                ],
                "HasAddress": false,
                "PhoneNumber": "",
                "Instructions": [],
                "ShouldShowInstructions": false,
                "TimeZone": "",
                "ArrivalLocation": "",
                "Specialty": {
                  "Value": "",
                  "Title": "",
                  "TitleUtf8": null,
                  "Abbreviation": ""
                },
                "CanShowDrivingDirections": false,
                "IsPreadmissionLocation": false
              },
              "PhotoClass": ""
            }
          ],
          "OtherProviders": [],
          "NumberOfOthers": 0,
          "PrimaryProvider": {
            "EncryptedId": "",
            "Name": "",
            "Type": 0,
            "PhotoUrl": "",
            "PhotoLink": null,
            "WebPageUrl": "",
            "HasPhotoOnBlob": false,
            "PhotoBlobToken": "",
            "IsPerson": false,
            "Department": {
              "Id": "",
              "Name": "",
              "Address": [
                ""
              ],
              "HasAddress": false,
              "PhoneNumber": "",
              "Instructions": [],
              "ShouldShowInstructions": false,
              "TimeZone": "",
              "ArrivalLocation": "",
              "Specialty": {
                "Value": "",
                "Title": "",
                "TitleUtf8": null,
                "Abbreviation": ""
              },
              "CanShowDrivingDirections": false,
              "IsPreadmissionLocation": false
            },
            "PhotoClass": ""
          },
          "PrimaryProviderName": "",
          "PrimaryDepartment": {
            "Id": "",
            "Name": "",
            "Address": [
              ""
            ],
            "HasAddress": false,
            "PhoneNumber": "",
            "Instructions": [],
            "ShouldShowInstructions": false,
            "TimeZone": "",
            "ArrivalLocation": "",
            "Specialty": {
              "Value": "",
              "Title": "",
              "TitleUtf8": null,
              "Abbreviation": ""
            },
            "CanShowDrivingDirections": false,
            "IsPreadmissionLocation": false
          },
          "CanRequestCancel": false,
          "IsCanceled": false,
          "CanReschedule": false,
          "RescheduledDat": "",
          "IsDetailsEnabled": false,
          "IsInHomeVisit": false,
          "ECheckIn": null,
          "CanShowECheckIn": false,
          "ShouldDeprecateECheckInBrand": false,
          "IsMultiPhaseOn": false,
          "CanShowECheckInComplete": false,
          "IsECheckInComplete": false,
          "HasChildrenNeedingECheckIn": false,
          "NextIncompleteVisitECheckInCsn": null,
          "IsEcheckInEnabled": false,
          "IsECheckInIncomplete": false,
          "CanECheckIn": false,
          "ShouldShowECheckInInGuideBanner": false,
          "CanShowAddToCalendar": false,
          "IsPastVisit": false,
          "HighlightDate": "",
          "IsDrivingDirectionsEnabled": false,
          "ConfirmationStatus": 0,
          "IsConfirmed": false,
          "IsCancelRequestSent": false,
          "CanDirectlyCancel": false,
          "IsUsingFallbackVisitTypeName": false,
          "ChiefComplaint": "",
          "Diagnoses": null,
          "HasSentUpgradeRequest": false,
          "CanSendUpgradeRequest": false,
          "IsUserInitiatedArrivalAllowed": false,
          "SelfArrivalMechanism": 0,
          "SelfArrivalBannerViewModel": null,
          "GeolocationArrival": 0,
          "ArrivalStatus": null,
          "PatientNextStepInstructions": "",
          "ArrivalAdditionalActions": [],
          "IsArrived": false,
          "IsProxyRequestMinorFormOn": false,
          "ProxyRequestMinorForm": "",
          "GuestPatientFirstName": null,
          "TelehealthMode": 0,
          "IsUnverifiedOnDemandVideoVisit": false,
          "EncryptedLvvId": null,
          "InProgress": false,
          "IsResidentialMed": false,
          "ShowPFIOLink": false,
          "IsCEOptedIn": false,
          "UserMyChartStatus": 0,
          "EncounterIsSurgery": false,
          "EncounterIsEDVisit": false,
          "IsPreadmission": false,
          "SurgeryTimeOfDay": 0,
          "PreadmissionLocation": null,
          "Cases": null,
          "IsHovPreadmission": false,
          "HasProcedures": false,
          "NumberOfProcedures": 0,
          "SurgicalProcedures": null,
          "ComponentVisits": null,
          "HasComponentVisits": false,
          "HasPaymentInfo": false,
          "IsFullyPaid": false,
          "CompleteECheckInCount": 0,
          "TotalECheckInCount": 0,
          "EpisodeDetails": {
            "GestationalAge": ""
          }
        }
      ],
      "ListSize": 0,
      "HasMoreData": false,
      "CanSearch": false,
      "SkippedSomeResults": false,
      "SerializedIndex": ""
    }
  },
  "CanSearch": false,
  "CanAllSearch": false,
  "CanSort": false,
  "AutoRenderThisSet": false,
  "SkippedSomeResults": false,
  "Organizations": {
    "*": {
      "OrganizationId": "",
      "OrganizationIdentifier": null,
      "RelatedOrganizations": null,
      "HasChildOrgs": false,
      "CELocationId": null,
      "CELocationHSI": null,
      "WebsiteName": null,
      "OrganizationName": "",
      "MyChartAppName": null,
      "SsnLabel": null,
      "IsLocal": false,
      "LogoUrl": "",
      "TermsAndConditionsUrl": null,
      "ProxyTermsAndConditionsUrl": null,
      "Address": [
        ""
      ],
      "DisplayAddress": null,
      "DiscreteAddress": {
        "StreetAddress": [
          ""
        ],
        "City": "",
        "State": "",
        "StateName": "",
        "Zip": "",
        "Country": ""
      },
      "ContactInformation": null,
      "UrlList": null,
      "IsSSO": false,
      "IncompleteH2GSetup": false,
      "LastEncounterInfo": null,
      "IsGeneric": false,
      "PayerOrgDetails": {
        "OrganizationId": null,
        "IsPayerOnly": false,
        "IsPayvider": false,
        "IsPayer": false,
        "IsPayerLicensedForMyChart": false,
        "PayerChildWebsiteName": null,
        "PayerDXO": null,
        "PayerCvgLogo": null,
        "PayerCvgLogoMagicId": null,
        "PayerCvgToken": null,
        "PayerCvgName": null
      },
      "IsMyChartCentral": false,
      "IsSameOrganization": false
    }
  }
} as const;

// /visits/visitslist/loadupcoming
export const visitsLoadUpcoming = {
  "LaterVisitsList": [
    {
      "HasPaymentFeature": false,
      "HasQuestionnaireFeature": false,
      "HasNewPvdFeature": false,
      "PrimaryDate": "",
      "CsnForECheckIn": "",
      "UnverifiedProxyJumpUrl": null,
      "RescheduledDatString": null,
      "IsNoShow": false,
      "LeftWithoutSeen": false,
      "DischargeDate": null,
      "HasDownloadSummaryLink": false,
      "HasTransmitSummaryLink": false,
      "CanRedirectToApptDetails": false,
      "PastVisitBucket": null,
      "IsClinicalInformationAvailable": false,
      "OwnedBy": 0,
      "AdmissionDateRange": null,
      "IsApptDetailsEnabled": false,
      "IsRequestCancelEnabled": false,
      "IsDirectCancelEnabled": false,
      "IsRescheduleEnabled": false,
      "IsCopayEnabled": false,
      "IsVisitSummaryEnabled": false,
      "IsDownloadSummaryEnabled": false,
      "IsTransmitCEEnabled": false,
      "IsTransmitDirectEnabled": false,
      "IsDischargeInstrEnabled": false,
      "IsPatHandoutsEnabled": false,
      "IsIPReviewEnabled": false,
      "IsDischargeSummaryEnabled": false,
      "IsProviderLinkEnabled": false,
      "IsPreadmissionEnabled": false,
      "IsEcheckInCompleted": false,
      "Csn": "",
      "Id": "",
      "ReferenceID": "",
      "OrganizationLinks": [],
      "PrimaryOrganizationLink": null,
      "Organization": {
        "OrganizationId": "",
        "OrganizationIdentifier": null,
        "RelatedOrganizations": null,
        "HasChildOrgs": false,
        "CELocationId": null,
        "WebsiteName": null,
        "OrganizationName": "",
        "MyChartAppName": null,
        "SsnLabel": null,
        "IsLocal": false,
        "LogoUrl": "",
        "TermsAndConditionsUrl": null,
        "ProxyTermsAndConditionsUrl": null,
        "Address": [
          ""
        ],
        "DisplayAddress": null,
        "ContactInformation": null,
        "UrlList": null,
        "IsSSO": false,
        "IncompleteH2GSetup": false,
        "LastEncounterInfo": null,
        "IsGeneric": false,
        "PayerOrgDetails": {
          "OrganizationId": null,
          "IsPayerOnly": false,
          "IsPayvider": false,
          "IsPayer": false,
          "IsPayerLicensedForMyChart": false,
          "PayerChildWebsiteName": null,
          "PayerDXO": null,
          "PayerCvgLogo": null,
          "PayerCvgLogoMagicId": null,
          "PayerCvgToken": null,
          "PayerCvgName": null
        },
        "IsMyChartCentral": false,
        "IsSameOrganization": false
      },
      "EncodedOrgID": null,
      "Month": 0,
      "DateOfMonth": "",
      "Year": "",
      "IsLocal": false,
      "IsNonEpic": false,
      "IsSingleProvider": false,
      "Telemedicine": null,
      "EVisit": null,
      "CanShowTelemedicine": false,
      "Dat": "",
      "Date": "",
      "Time": "",
      "IsAM": false,
      "IsClientTime": false,
      "ClientTimeZoneMarker": "",
      "EncounterType": 0,
      "VisitTypeName": "",
      "Instant": "",
      "ArrivalTime": null,
      "CanShowArrivalTime": false,
      "EarlyArrivalReason": null,
      "DurationInMinutes": null,
      "HasDuration": false,
      "Copay": null,
      "CanShowPayments": false,
      "ShortDate": "",
      "IsTimeToBeDetermined": false,
      "IsHideVisitTime": false,
      "CanShowAppointmentTime": false,
      "TimeZone": "",
      "Providers": [
        {
          "EncryptedId": "",
          "Name": "",
          "Type": 0,
          "PhotoUrl": "",
          "PhotoLink": "",
          "WebPageUrl": "",
          "HasPhotoOnBlob": false,
          "PhotoBlobToken": "",
          "IsPerson": false,
          "Department": {
            "Id": "",
            "Name": "",
            "Address": [
              ""
            ],
            "HasAddress": false,
            "PhoneNumber": "",
            "Instructions": [],
            "ShouldShowInstructions": false,
            "TimeZone": "",
            "ArrivalLocation": "",
            "Specialty": {
              "Value": "",
              "Title": "",
              "TitleUtf8": null,
              "Abbreviation": ""
            },
            "CanShowDrivingDirections": false,
            "IsPreadmissionLocation": false
          },
          "PhotoClass": ""
        }
      ],
      "OtherProviders": [],
      "NumberOfOthers": 0,
      "PrimaryProvider": {
        "EncryptedId": "",
        "Name": "",
        "Type": 0,
        "PhotoUrl": "",
        "PhotoLink": "",
        "WebPageUrl": "",
        "HasPhotoOnBlob": false,
        "PhotoBlobToken": "",
        "IsPerson": false,
        "Department": {
          "Id": "",
          "Name": "",
          "Address": [
            ""
          ],
          "HasAddress": false,
          "PhoneNumber": "",
          "Instructions": [],
          "ShouldShowInstructions": false,
          "TimeZone": "",
          "ArrivalLocation": "",
          "Specialty": {
            "Value": "",
            "Title": "",
            "TitleUtf8": null,
            "Abbreviation": ""
          },
          "CanShowDrivingDirections": false,
          "IsPreadmissionLocation": false
        },
        "PhotoClass": ""
      },
      "PrimaryProviderName": "",
      "PrimaryDepartment": {
        "Id": "",
        "Name": "",
        "Address": [
          ""
        ],
        "HasAddress": false,
        "PhoneNumber": "",
        "Instructions": [],
        "ShouldShowInstructions": false,
        "TimeZone": "",
        "ArrivalLocation": "",
        "Specialty": {
          "Value": "",
          "Title": "",
          "TitleUtf8": null,
          "Abbreviation": ""
        },
        "CanShowDrivingDirections": false,
        "IsPreadmissionLocation": false
      },
      "CanRequestCancel": false,
      "IsCanceled": false,
      "CanReschedule": false,
      "RescheduledDat": "",
      "IsDetailsEnabled": false,
      "IsInHomeVisit": false,
      "ECheckIn": {
        "Status": {
          "Value": "",
          "Title": "",
          "Abbreviation": ""
        },
        "IsNotStarted": false,
        "IsInProgress": false,
        "IsComplete": false,
        "Barcode": "",
        "HasBarcodeStep": false,
        "ClinicSteps": [],
        "RequiredECheckInSteps": [],
        "OptionalECheckInSteps": null,
        "UnavailableECheckInSteps": null,
        "HasQuestionnaireLink": false,
        "IsAdmission": false,
        "IsSurgery": false,
        "IsQnrAfterBarcode": false,
        "IsConfirmationView": false,
        "SignUpLink": null,
        "HasSignUpLink": false,
        "IsRequiredForTelemedicine": false,
        "CanShow": false,
        "HasPaymentECheckInStep": false,
        "HasQuestionnaireStep": false,
        "IsInHelloPatientWindow": false,
        "MultiPhaseOn": false
      },
      "CanShowECheckIn": false,
      "ShouldDeprecateECheckInBrand": false,
      "CanShowECheckInComplete": false,
      "IsECheckInComplete": false,
      "NextIncompleteVisitECheckInCsn": null,
      "IsEcheckInEnabled": false,
      "IsECheckInIncomplete": false,
      "CanECheckIn": false,
      "ShouldShowECheckInInGuideBanner": false,
      "CanShowAddToCalendar": false,
      "IsPastVisit": false,
      "HighlightDate": "",
      "IsDrivingDirectionsEnabled": false,
      "ConfirmationStatus": 0,
      "IsConfirmed": false,
      "IsCancelRequestSent": false,
      "CanDirectlyCancel": false,
      "IsUsingFallbackVisitTypeName": false,
      "ChiefComplaint": "",
      "Diagnoses": null,
      "HasSentUpgradeRequest": false,
      "CanSendUpgradeRequest": false,
      "IsUserInitiatedArrivalAllowed": false,
      "SelfArrivalMechanism": 0,
      "SelfArrivalBannerViewModel": null,
      "GeolocationArrival": 0,
      "ArrivalStatus": 0,
      "PatientNextStepInstructions": "",
      "ArrivalAdditionalActions": [],
      "IsProxyRequestMinorFormOn": false,
      "ProxyRequestMinorForm": "",
      "GuestPatientFirstName": null,
      "TelehealthMode": 0,
      "IsUnverifiedOnDemandVideoVisit": false,
      "EncryptedLvvId": null,
      "InProgress": false,
      "IsResidentialMed": false,
      "ShowPFIOLink": false,
      "IsCEOptedIn": false,
      "UserMyChartStatus": 0,
      "EncounterIsSurgery": false,
      "EncounterIsEDVisit": false,
      "IsPreadmission": false,
      "SurgeryTimeOfDay": null,
      "PreadmissionLocation": null,
      "Cases": null,
      "IsHovPreadmission": false,
      "HasProcedures": false,
      "NumberOfProcedures": 0,
      "SurgicalProcedures": null,
      "ComponentVisits": null,
      "HasComponentVisits": false,
      "HasPaymentInfo": false,
      "IsFullyPaid": false,
      "CompleteECheckInCount": 0,
      "TotalECheckInCount": 0
    }
  ],
  "NextNDaysVisits": [],
  "InProgressVisits": [],
  "HighlightDays": [
    ""
  ],
  "HasPVG": false
} as const;

// https://www.mychart.org/cached-api/help/organizations/ (the org directory on
// mychart.org, not an instance endpoint). countryData/stateData are name and
// ZIP dictionaries the scraper never reads, so only their outer keys are held.
// `organizations` is deliberately NOT a key here: the endpoint omits it
// entirely unless the request asks for it with includeOrganizations=1.
export const helpOrganizations = {
  "organizationOptionsByScreenId": {},
  "countryData": {
    "alpha_2_index": {}
  },
  "stateData": {
    "abbreviation_index": {}
  }
} as const;

// One entry of that endpoint's `organizations` array. `logo` is absent on the
// eight organizations that have no image of their own, so it is not part of
// the skeleton either — conformToShape would otherwise invent an empty one and
// hide the two logo fallbacks every client implements.
export const helpOrganization = {
  "slgId": "",
  "name": "",
  "states": [],
  "countries": [],
  "brandName": "",
  "loginUrl": "",
  "liveOnCentral": false,
  "email": "",
  "phone": "",
  "faq": "",
  "aliases": []
} as const;
