// All fake data for Homer Jay Simpson
// Shaped to exactly match the JSON structures MyChart scrapers expect

// ─── Profile ─────────────────────────────────────────────────────────
export const profile = {
  name: 'Homer Jay Simpson',
  dob: '05/12/1956',
  mrn: '742',
  pcp: 'Dr. Julius Hibbert, MD',
};

// ─── Credentials ─────────────────────────────────────────────────────
export const DEFAULT_USERNAME = 'homer';
export const DEFAULT_PASSWORD = 'donuts123';

// ─── Medications ─────────────────────────────────────────────────────
export const medications = {
  communityMembers: [
    {
      prescriptionList: {
        prescriptions: [
          {
            name: 'Duff Beer Extract 500mg',
            medicationKey: 'FAKE-MED-KEY-001',
            patientFriendlyName: { text: 'Duff Beer Extract' },
            sig: 'Take 1 tablet by mouth as needed for relaxation',
            dateToDisplay: '01/15/2026',
            startDate: '01/15/2026',
            authorizingProvider: { name: 'Julius Hibbert, MD' },
            orderingProvider: { name: 'Julius Hibbert, MD' },
            isPatientReported: false,
            refillDetails: {
              writtenDispenseQuantity: '30',
              daySupply: '30',
              isRefillable: true,
              owningPharmacy: {
                name: 'Kwik-E-Mart Pharmacy',
                phoneNumber: '(555) 636-2700',
                formattedAddress: ['742 Evergreen Terrace', 'Springfield, NT 49007'],
              },
            },
          },
          {
            name: 'Donut Supplement 100mg',
            medicationKey: 'FAKE-MED-KEY-002',
            patientFriendlyName: { text: 'Donut Supplement' },
            sig: 'Take 1 tablet by mouth daily with breakfast',
            dateToDisplay: '01/15/2026',
            startDate: '01/15/2026',
            authorizingProvider: { name: 'Julius Hibbert, MD' },
            orderingProvider: { name: 'Julius Hibbert, MD' },
            isPatientReported: false,
            refillDetails: {
              writtenDispenseQuantity: '90',
              daySupply: '90',
              isRefillable: true,
              owningPharmacy: {
                name: 'Kwik-E-Mart Pharmacy',
                phoneNumber: '(555) 636-2700',
                formattedAddress: ['742 Evergreen Terrace', 'Springfield, NT 49007'],
              },
            },
          },
          {
            name: 'Lisinopril 10mg',
            medicationKey: 'FAKE-MED-KEY-003',
            patientFriendlyName: { text: 'Lisinopril' },
            sig: 'Take 1 tablet by mouth daily for blood pressure',
            dateToDisplay: '06/01/2025',
            startDate: '06/01/2025',
            authorizingProvider: { name: 'Julius Hibbert, MD' },
            orderingProvider: { name: 'Julius Hibbert, MD' },
            isPatientReported: false,
            refillDetails: {
              writtenDispenseQuantity: '30',
              daySupply: '30',
              isRefillable: true,
              owningPharmacy: {
                name: 'Kwik-E-Mart Pharmacy',
                phoneNumber: '(555) 636-2700',
                formattedAddress: ['742 Evergreen Terrace', 'Springfield, NT 49007'],
              },
            },
          },
          {
            name: 'Atorvastatin 20mg',
            medicationKey: 'FAKE-MED-KEY-004',
            patientFriendlyName: { text: 'Atorvastatin' },
            sig: 'Take 1 tablet by mouth at bedtime for cholesterol',
            dateToDisplay: '06/01/2025',
            startDate: '06/01/2025',
            authorizingProvider: { name: 'Julius Hibbert, MD' },
            orderingProvider: { name: 'Julius Hibbert, MD' },
            isPatientReported: false,
            refillDetails: {
              writtenDispenseQuantity: '30',
              daySupply: '30',
              isRefillable: true,
              owningPharmacy: {
                name: 'Kwik-E-Mart Pharmacy',
                phoneNumber: '(555) 636-2700',
                formattedAddress: ['742 Evergreen Terrace', 'Springfield, NT 49007'],
              },
            },
          },
        ],
      },
    },
  ],
  getPatientFirstName: 'Homer',
};

// ─── Allergies ───────────────────────────────────────────────────────
export const allergies = {
  dataList: [
    {
      allergyItem: {
        name: 'Vegetables',
        id: 'ALLERGY-001',
        formattedDateNoted: '03/15/1990',
        type: 'Food',
        reaction: 'Hives',
        severity: 'Severe',
      },
    },
    {
      allergyItem: {
        name: 'Exercise',
        id: 'ALLERGY-002',
        formattedDateNoted: '01/01/1985',
        type: 'Other',
        reaction: 'Shortness of breath',
        severity: 'Moderate',
      },
    },
  ],
  allergiesStatus: 0,
};

// ─── Health Issues ───────────────────────────────────────────────────
export const healthIssues = {
  dataList: [
    { healthIssueItem: { name: 'Obesity', id: 'HI-001', formattedDateNoted: '01/15/2000', isReadOnly: false } },
    { healthIssueItem: { name: 'High blood pressure', id: 'HI-002', formattedDateNoted: '03/20/2010', isReadOnly: false } },
    { healthIssueItem: { name: 'High cholesterol', id: 'HI-003', formattedDateNoted: '03/20/2010', isReadOnly: false } },
    { healthIssueItem: { name: 'Chronic radiation exposure (nuclear plant, Sector 7-G)', id: 'HI-004', formattedDateNoted: '08/01/1990', isReadOnly: false } },
    { healthIssueItem: { name: 'Foreign body in brain (crayon, lodged since childhood)', id: 'HI-005', formattedDateNoted: '05/09/1972', isReadOnly: false } },
  ],
};

// ─── Health Summary ──────────────────────────────────────────────────
export const healthSummary = {
  header: {
    patientAge: '69',
    height: { value: "6' 0\"", dateRecorded: '01/10/2026' },
    weight: { value: '260 lbs', dateRecorded: '01/10/2026' },
    bloodType: 'O+',
  },
  patientFirstName: 'Homer',
};

export const healthSummaryHeader = {
  lastVisit: {
    date: '01/10/2026',
    visitType: 'Annual Physical',
  },
};

// ─── Vitals / Flowsheets (Track My Health) ──────────────────────────
// Real MyChart splits this across two endpoints: GetFlowsheets returns the
// flowsheet DEFINITION (rows, episodeId) with an always-empty `readings`,
// and GetFlowsheetReadings returns the actual values keyed by rowId.
const VITALS_ROWS = [
  { id: 'row-bp', name: 'Blood Pressure', rowType: '1', valueType: '4', unitsDisplayName: 'mmHg', decimalPlaces: 0 },
  { id: 'row-hr', name: 'Pulse', rowType: '1', valueType: '1', decimalPlaces: 0 },
  { id: 'row-wt', name: 'Weight', rowType: '1', valueType: '5', units: '6', unitsDisplayName: 'lbs', decimalPlaces: 0 },
];

// GetFlowsheets response — definition only, `readings` empty (matches real MyChart)
export const vitals = {
  flowsheets: [
    {
      episodeId: 'EP-VITALS',
      templateId: 'EP-VITALS',
      name: 'Vitals Trending',
      entryType: '1',
      entryMode: '1',
      status: '1',
      startDateIso: '2114-10-15',
      endDateIso: '',
      instructions: '',
      hasMoreData: false,
      hasEpisodeData: false,
      rowGroups: [{ id: '-1', name: '', rowIds: VITALS_ROWS.map((r) => r.id) }],
      rows: VITALS_ROWS,
      readings: [],
    },
  ],
  userSettings: {},
};

// GetFlowsheetReadings response — the actual values keyed by rowId
export const vitalsReadings = {
  flowsheet: {
    episodeId: 'EP-VITALS',
    templateId: 'EP-VITALS',
    name: 'Vitals Trending',
    startDateIso: '2114-10-15',
    endDateIso: '',
    hasMoreData: false,
    hasEpisodeData: false,
    rowGroups: [{ id: '-1', name: '', rowIds: VITALS_ROWS.map((r) => r.id) }],
    rows: VITALS_ROWS,
    readings: [
      { id: 'rd-bp-1', fsdId: 'fsd-1', rowId: 'row-bp', valueType: '4', entryType: 'clinical', instantTakenIso: '2026-01-10T09:00:00', isAbnormal: true, documentationSource: '34000', stringValue: '145/95', dataType: '32105', decimalPlaces: 0, timeZone: 'America/Los_Angeles', sourceRowId: '' },
      { id: 'rd-hr-1', fsdId: 'fsd-1', rowId: 'row-hr', valueType: '1', entryType: 'clinical', instantTakenIso: '2026-01-10T09:00:00', isAbnormal: false, documentationSource: '34000', numericValue: 88, dataType: '32005', decimalPlaces: 0, timeZone: 'America/Los_Angeles', sourceRowId: '' },
      { id: 'rd-wt-1', fsdId: 'fsd-1', rowId: 'row-wt', valueType: '5', entryType: 'clinical', instantTakenIso: '2026-01-10T09:00:00', isAbnormal: false, documentationSource: '34000', numericValue: 260, units: '6', dataType: '32001', decimalPlaces: 0, timeZone: 'America/Los_Angeles', sourceRowId: '' },
      { id: 'rd-bp-2', fsdId: 'fsd-2', rowId: 'row-bp', valueType: '4', entryType: 'clinical', instantTakenIso: '2025-07-15T10:30:00', isAbnormal: true, documentationSource: '34002', stringValue: '150/98', dataType: '32105', decimalPlaces: 0, timeZone: 'America/Los_Angeles', sourceRowId: '' },
      { id: 'rd-bp-3', fsdId: 'fsd-3', rowId: 'row-bp', valueType: '4', entryType: 'clinical', instantTakenIso: '2025-01-20T08:15:00', isAbnormal: false, documentationSource: '34002', stringValue: '142/92', dataType: '32105', decimalPlaces: 0, timeZone: 'America/Los_Angeles', sourceRowId: '' },
    ],
  },
  userSettings: {},
};

// ─── Care Team (HTML parsed) ────────────────────────────────────────
export const careTeam = [
  { name: 'Julius Hibbert, MD', role: 'Primary Care Provider', specialty: 'Internal Medicine' },
  { name: 'Nick Riviera, MD', role: 'Surgeon', specialty: 'General Surgery' },
];

// ─── Insurance (HTML parsed) ────────────────────────────────────────
export const insurance = [
  {
    planName: 'Springfield Nuclear Power Plant Employee Health Plan',
    subscriberName: 'Homer Jay Simpson',
    memberId: 'HSJ-12345',
    groupNumber: 'SNPP-742',
  },
];

// ─── Emergency Contacts ─────────────────────────────────────────────
// Real GetRelationships responses key the list as `contacts` — the flat
// `relationships` array the fake used to return exists on no captured
// instance — and each contact nests its name under `formattedName`, its
// relationship under `relationToPatient` and its phone numbers under
// `contactInformation.phoneNumbers`. (`isEmergencyContact` itself appears on
// only one captured instance and rides along as an extra field.)
export function makeEmergencyContact(id: string, name: string, relationship: string, phone: string, isEmergencyContact = true) {
  return {
    id,
    formattedName: name,
    relationToPatient: { name: relationship, labelText: relationship, isInactive: false },
    isPrimaryContact: false,
    isLinkedToOtherPatient: false,
    isHCA: false,
    isAddressLinkedToPatient: false,
    contactInformation: {
      address: {
        street: '742 Evergreen Terrace',
        city: 'Springfield',
        county: { number: '', title: '', isInactive: false },
        state: { number: '', title: 'NT', abbreviation: 'NT', isInactive: false },
        zip: '49007',
        country: { number: '1', title: 'United States of America', isInactive: false },
        houseNumber: '',
        district: { number: '', abbreviation: '', isInactive: false },
        formattedValues: ['742 Evergreen Terrace', 'Springfield, NT 49007'],
        allowArbitraryInput: true,
        allowDefaults: false,
      },
      emailAddress: '',
      phoneNumbers: [{ phoneNumber: phone, type: 'Home' }],
    },
    savedSuccessfully: false,
    isPending: false,
    isVRK: false,
    isEmergencyContact,
  };
}
export const emergencyContacts = {
  isViewOnly: false,
  hideEmergencyContacts: false,
  contacts: [
    makeEmergencyContact('EC-1', 'Marge Simpson', 'Spouse', '(555) 636-2701'),
    makeEmergencyContact('EC-2', 'Barney Gumble', 'Friend', '(555) 636-2800'),
  ],
  relationToPatientChoices: [
    { name: 'Spouse', labelText: 'Spouse', isInactive: false },
    { name: 'Friend', labelText: 'Friend', isInactive: false },
    { name: 'Parent', labelText: 'Parent', isInactive: false },
    { name: 'Child', labelText: 'Child', isInactive: false },
  ],
  requiredFields: [],
  vrkFields: [],
  hasEndOfLifePageMnemonic: false,
};

// ─── Medical History ────────────────────────────────────────────────
export const medicalHistory = {
  medicalHistory: {
    diagnoses: [
      { diagnosisName: 'Obesity', diagnosisDate: '01/15/2000' },
      { diagnosisName: 'Hypertension', diagnosisDate: '03/20/2010' },
    ],
    medicalHistoryNotes: 'Patient has a history of donut-related incidents.',
  },
  surgicalHistory: {
    surgeries: [
      { surgeryName: 'Triple Bypass', surgeryDate: '11/05/1995' },
      { surgeryName: 'Crayon Removal from Brain', surgeryDate: '03/12/2001' },
    ],
    surgicalHistoryNotes: '',
  },
  familyHistoryAndStatus: {
    familyMembers: [
      { relationshipToPatientName: 'Father', statusName: 'Abraham Simpson - Living', conditions: ['Heart disease', 'Dementia'] },
      { relationshipToPatientName: 'Mother', statusName: 'Mona Simpson - Deceased', conditions: [] },
    ],
  },
};

// ─── Lab Results ────────────────────────────────────────────────────
export const labResultsList = {
  areResultsFullyLoaded: true,
  isGroupingFullyLoaded: true,
  groupBy: 'ORDER',
  newResultGroups: [
    {
      key: 'GRP-CMP',
      contactType: '',
      resultList: ['RES-CMP'],
      isInpatient: false,
      isEDVisit: false,
      isCurrentAdmission: false,
      visitProviderID: 'PROV-HIBBERT',
      organizationID: 'ORG-SPRINGFIELD',
      sortDate: '2026-01-10T10:30:00',
      formattedDate: 'Jan 10, 2026',
      isLargeGroup: false,
    },
    {
      key: 'GRP-LIPID',
      contactType: '',
      resultList: ['RES-LIPID'],
      isInpatient: false,
      isEDVisit: false,
      isCurrentAdmission: false,
      visitProviderID: 'PROV-HIBBERT',
      organizationID: 'ORG-SPRINGFIELD',
      sortDate: '2026-01-10T10:30:00',
      formattedDate: 'Jan 10, 2026',
      isLargeGroup: false,
    },
    {
      key: 'GRP-CBC',
      contactType: '',
      resultList: ['RES-CBC'],
      isInpatient: false,
      isEDVisit: false,
      isCurrentAdmission: false,
      visitProviderID: 'PROV-HIBBERT',
      organizationID: 'ORG-SPRINGFIELD',
      sortDate: '2026-01-10T10:30:00',
      formattedDate: 'Jan 10, 2026',
      isLargeGroup: false,
    },
  ],
  organizationLoadMoreInfo: {},
  newResults: {
    'RES-CMP^': {
      name: 'Comprehensive Metabolic Panel',
      key: 'RES-CMP',
      showName: false,
      showDetails: true,
      orderMetadata: {
        orderProviderName: 'Julius Hibbert, MD',
        authorizingProviderName: 'Julius Hibbert, MD',
        authorizingProviderID: 'PROV-HIBBERT',
        prioritizedInstantISO: '2026-01-10T10:30:00',
        prioritizedInstantDisplay: 'Jan 10, 2026 10:30 AM',
        resultType: 'LAB',
        read: 'Read',
      },
      resultComponents: [],
      shouldHideHistoricalData: false,
      scans: [],
      shareEverywhereLogin: false,
      showProviderNotReviewed: false,
      providerComments: [],
      tooManyVariants: false,
      hasComment: false,
      hasAllDetails: false,
      isAbnormal: false,
    },
    'RES-LIPID^': {
      name: 'Lipid Panel',
      key: 'RES-LIPID',
      showName: false,
      showDetails: true,
      orderMetadata: {
        orderProviderName: 'Julius Hibbert, MD',
        authorizingProviderName: 'Julius Hibbert, MD',
        authorizingProviderID: 'PROV-HIBBERT',
        prioritizedInstantISO: '2026-01-10T10:30:00',
        prioritizedInstantDisplay: 'Jan 10, 2026 10:30 AM',
        resultType: 'LAB',
        read: 'Read',
      },
      resultComponents: [],
      shouldHideHistoricalData: false,
      scans: [],
      shareEverywhereLogin: false,
      showProviderNotReviewed: false,
      providerComments: [],
      tooManyVariants: false,
      hasComment: false,
      hasAllDetails: false,
      isAbnormal: true,
    },
    'RES-CBC^': {
      name: 'Complete Blood Count',
      key: 'RES-CBC',
      showName: false,
      showDetails: true,
      orderMetadata: {
        orderProviderName: 'Julius Hibbert, MD',
        authorizingProviderName: 'Julius Hibbert, MD',
        authorizingProviderID: 'PROV-HIBBERT',
        prioritizedInstantISO: '2026-01-10T10:30:00',
        prioritizedInstantDisplay: 'Jan 10, 2026 10:30 AM',
        resultType: 'LAB',
        read: 'Read',
      },
      resultComponents: [],
      shouldHideHistoricalData: false,
      scans: [],
      shareEverywhereLogin: false,
      showProviderNotReviewed: false,
      providerComments: [],
      tooManyVariants: false,
      hasComment: false,
      hasAllDetails: false,
      isAbnormal: false,
    },
  },
  newProviderPhotoInfo: {
    'PROV-HIBBERT^': {
      name: 'Julius Hibbert, MD',
      empId: '',
      remoteEncrypted: false,
      photoUrl: '',
      providerId: 'PROV-HIBBERT',
      organizationId: '',
    },
  },
};

export const labResultsDetails = {
  orderName: 'Lipid Panel',
  key: 'RES-LIPID',
  results: [
    {
      name: 'Lipid Panel',
      key: 'RES-LIPID',
      showName: false,
      showDetails: true,
      orderMetadata: {
        orderProviderName: 'Julius Hibbert, MD',
        readingProviderName: '',
        resultTimestampDisplay: 'Jan 10, 2026 10:30 AM',
        prioritizedInstantISO: '2026-01-10T10:30:00',
        prioritizedInstantDisplay: 'Jan 10, 2026 10:30 AM',
        latestUpdateInstantISO: '2026-01-10T10:30:00',
        collectionTimestampsDisplay: 'Jan 10, 2026 9:00 AM',
        specimensDisplay: 'Blood',
        resultStatus: 'Final',
        resultingLab: {
          name: 'Springfield General Hospital Lab',
          address: ['123 Main Street', 'Springfield, NT 49007'],
          phoneNumber: '(555) 636-3000',
          labDirector: 'Julius Hibbert, MD',
          cliaNumber: '',
        },
        resultType: 'LAB',
        read: 'Read',
      },
      resultComponents: [
        {
          componentInfo: { componentID: 'COMP-CHOL', name: 'Total Cholesterol', commonName: 'Total Cholesterol', units: 'mg/dL' },
          componentResultInfo: { value: '280', isValueRtf: false, numericValue: 280, referenceRange: { low: 125, high: 200, displayLow: '125', displayHigh: '200', lowerBoundExclusive: false, upperBoundExclusive: false, formattedReferenceRange: '125 - 200 mg/dL' }, abnormalFlagCategoryValue: 'Unknown' },
          componentComments: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '' },
        },
        {
          componentInfo: { componentID: 'COMP-LDL', name: 'LDL Cholesterol', commonName: 'LDL Cholesterol', units: 'mg/dL' },
          componentResultInfo: { value: '190', isValueRtf: false, numericValue: 190, referenceRange: { low: 0, high: 100, displayLow: '0', displayHigh: '100', lowerBoundExclusive: false, upperBoundExclusive: false, formattedReferenceRange: '0 - 100 mg/dL' }, abnormalFlagCategoryValue: 'Unknown' },
          componentComments: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '' },
        },
        {
          componentInfo: { componentID: 'COMP-HDL', name: 'HDL Cholesterol', commonName: 'HDL Cholesterol', units: 'mg/dL' },
          componentResultInfo: { value: '35', isValueRtf: false, numericValue: 35, referenceRange: { low: 40, high: 60, displayLow: '40', displayHigh: '60', lowerBoundExclusive: false, upperBoundExclusive: false, formattedReferenceRange: '40 - 60 mg/dL' }, abnormalFlagCategoryValue: 'Unknown' },
          componentComments: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '' },
        },
        {
          componentInfo: { componentID: 'COMP-TRIG', name: 'Triglycerides', commonName: 'Triglycerides', units: 'mg/dL' },
          componentResultInfo: { value: '350', isValueRtf: false, numericValue: 350, referenceRange: { low: 0, high: 150, displayLow: '0', displayHigh: '150', lowerBoundExclusive: false, upperBoundExclusive: false, formattedReferenceRange: '0 - 150 mg/dL' }, abnormalFlagCategoryValue: 'Unknown' },
          componentComments: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '' },
        },
      ],
      studyResult: {
        narrative: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '', signingInstantTimestamp: '' },
        impression: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '', signingInstantTimestamp: '' },
        combinedRTFNarrativeImpression: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '', signingInstantTimestamp: '' },
        addenda: [],
        transcriptions: [],
        ecgDiagnosis: [],
        hasStudyContent: false,
      },
      shouldHideHistoricalData: false,
      resultNote: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '', signingInstantTimestamp: '' },
      reportDetails: { isDownloadablePDFReport: false, reportID: '', openRemotely: false, reportContext: '', reportVars: { ordId: 'RES-LIPID', ordDat: 'RES-LIPID-DAT' } },
      scans: [],
      imageStudies: [],
      indicators: [],
      geneticProfileLink: '',
      shareEverywhereLogin: false,
      showProviderNotReviewed: false,
      providerComments: [],
      resultLetter: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '', signingInstantTimestamp: '' },
      warningType: '',
      warningMessage: '',
      variants: [],
      tooManyVariants: false,
      hasComment: false,
      hasAllDetails: true,
      isAbnormal: true,
    },
  ],
  orderLimitReached: false,
  ordersDeduplicated: false,
  hideEncInfo: false,
};

export const cmpLabResultsDetails = {
  orderName: 'Comprehensive Metabolic Panel',
  key: 'RES-CMP',
  results: [
    {
      name: 'Comprehensive Metabolic Panel',
      key: 'RES-CMP',
      showName: false,
      showDetails: true,
      orderMetadata: {
        orderProviderName: 'Julius Hibbert, MD',
        readingProviderName: '',
        resultTimestampDisplay: 'Jan 10, 2026 10:30 AM',
        prioritizedInstantISO: '2026-01-10T10:30:00',
        prioritizedInstantDisplay: 'Jan 10, 2026 10:30 AM',
        latestUpdateInstantISO: '2026-01-10T10:30:00',
        collectionTimestampsDisplay: 'Jan 10, 2026 9:00 AM',
        specimensDisplay: 'Blood',
        resultStatus: 'Final',
        resultingLab: {
          name: 'Springfield General Hospital Lab',
          address: ['123 Main Street', 'Springfield, NT 49007'],
          phoneNumber: '(555) 636-3000',
          labDirector: 'Julius Hibbert, MD',
          cliaNumber: '',
        },
        resultType: 'LAB',
        read: 'Read',
      },
      resultComponents: [
        {
          componentInfo: { componentID: 'COMP-GLU', name: 'Glucose', commonName: 'Glucose', units: 'mg/dL' },
          componentResultInfo: { value: '92', isValueRtf: false, numericValue: 92, referenceRange: { low: 65, high: 99, displayLow: '65', displayHigh: '99', lowerBoundExclusive: false, upperBoundExclusive: false, formattedReferenceRange: '65 - 99 mg/dL' }, abnormalFlagCategoryValue: 'Unknown' },
          componentComments: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '' },
        },
        {
          componentInfo: { componentID: 'COMP-NA', name: 'Sodium', commonName: 'Sodium', units: 'mmol/L' },
          componentResultInfo: { value: '140', isValueRtf: false, numericValue: 140, referenceRange: { low: 135, high: 145, displayLow: '135', displayHigh: '145', lowerBoundExclusive: false, upperBoundExclusive: false, formattedReferenceRange: '135 - 145 mmol/L' }, abnormalFlagCategoryValue: 'Unknown' },
          componentComments: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '' },
        },
        {
          componentInfo: { componentID: 'COMP-K', name: 'Potassium', commonName: 'Potassium', units: 'mmol/L' },
          componentResultInfo: { value: '4.2', isValueRtf: false, numericValue: 4.2, referenceRange: { low: 3.5, high: 5.1, displayLow: '3.5', displayHigh: '5.1', lowerBoundExclusive: false, upperBoundExclusive: false, formattedReferenceRange: '3.5 - 5.1 mmol/L' }, abnormalFlagCategoryValue: 'Unknown' },
          componentComments: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '' },
        },
        {
          componentInfo: { componentID: 'COMP-CREAT', name: 'Creatinine', commonName: 'Creatinine', units: 'mg/dL' },
          componentResultInfo: { value: '0.9', isValueRtf: false, numericValue: 0.9, referenceRange: { low: 0.6, high: 1.3, displayLow: '0.6', displayHigh: '1.3', lowerBoundExclusive: false, upperBoundExclusive: false, formattedReferenceRange: '0.6 - 1.3 mg/dL' }, abnormalFlagCategoryValue: 'Unknown' },
          componentComments: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '' },
        },
        {
          componentInfo: { componentID: 'COMP-ALT', name: 'ALT', commonName: 'ALT', units: 'U/L' },
          componentResultInfo: { value: '30', isValueRtf: false, numericValue: 30, referenceRange: { low: 9, high: 46, displayLow: '9', displayHigh: '46', lowerBoundExclusive: false, upperBoundExclusive: false, formattedReferenceRange: '9 - 46 U/L' }, abnormalFlagCategoryValue: 'Unknown' },
          componentComments: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '' },
        },
      ],
      studyResult: {
        narrative: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '', signingInstantTimestamp: '' },
        impression: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '', signingInstantTimestamp: '' },
        combinedRTFNarrativeImpression: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '', signingInstantTimestamp: '' },
        addenda: [],
        transcriptions: [],
        ecgDiagnosis: [],
        hasStudyContent: false,
      },
      shouldHideHistoricalData: false,
      resultNote: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '', signingInstantTimestamp: '' },
      reportDetails: { isDownloadablePDFReport: false, reportID: '', openRemotely: false, reportContext: '', reportVars: { ordId: 'RES-CMP', ordDat: 'RES-CMP-DAT' } },
      scans: [],
      imageStudies: [],
      indicators: [],
      geneticProfileLink: '',
      shareEverywhereLogin: false,
      showProviderNotReviewed: false,
      providerComments: [],
      resultLetter: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '', signingInstantTimestamp: '' },
      warningType: '',
      warningMessage: '',
      variants: [],
      tooManyVariants: false,
      hasComment: false,
      hasAllDetails: true,
      isAbnormal: false,
    },
  ],
  orderLimitReached: false,
  ordersDeduplicated: false,
  hideEncInfo: false,
};

export const cbcLabResultsDetails = {
  orderName: 'Complete Blood Count',
  key: 'RES-CBC',
  results: [
    {
      name: 'Complete Blood Count',
      key: 'RES-CBC',
      showName: false,
      showDetails: true,
      orderMetadata: {
        orderProviderName: 'Julius Hibbert, MD',
        readingProviderName: '',
        resultTimestampDisplay: 'Jan 10, 2026 10:30 AM',
        prioritizedInstantISO: '2026-01-10T10:30:00',
        prioritizedInstantDisplay: 'Jan 10, 2026 10:30 AM',
        latestUpdateInstantISO: '2026-01-10T10:30:00',
        collectionTimestampsDisplay: 'Jan 10, 2026 9:00 AM',
        specimensDisplay: 'Blood',
        resultStatus: 'Final',
        resultingLab: {
          name: 'Springfield General Hospital Lab',
          address: ['123 Main Street', 'Springfield, NT 49007'],
          phoneNumber: '(555) 636-3000',
          labDirector: 'Julius Hibbert, MD',
          cliaNumber: '',
        },
        resultType: 'LAB',
        read: 'Read',
      },
      resultComponents: [
        {
          componentInfo: { componentID: 'COMP-WBC', name: 'White Blood Cell Count', commonName: 'WBC', units: 'K/uL' },
          componentResultInfo: { value: '6.8', isValueRtf: false, numericValue: 6.8, referenceRange: { low: 4, high: 11, displayLow: '4.0', displayHigh: '11.0', lowerBoundExclusive: false, upperBoundExclusive: false, formattedReferenceRange: '4.0 - 11.0 K/uL' }, abnormalFlagCategoryValue: 'Unknown' },
          componentComments: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '' },
        },
        {
          componentInfo: { componentID: 'COMP-RBC', name: 'Red Blood Cell Count', commonName: 'RBC', units: 'M/uL' },
          componentResultInfo: { value: '4.9', isValueRtf: false, numericValue: 4.9, referenceRange: { low: 4.2, high: 5.8, displayLow: '4.2', displayHigh: '5.8', lowerBoundExclusive: false, upperBoundExclusive: false, formattedReferenceRange: '4.2 - 5.8 M/uL' }, abnormalFlagCategoryValue: 'Unknown' },
          componentComments: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '' },
        },
        {
          componentInfo: { componentID: 'COMP-HGB', name: 'Hemoglobin', commonName: 'Hemoglobin', units: 'g/dL' },
          componentResultInfo: { value: '14.8', isValueRtf: false, numericValue: 14.8, referenceRange: { low: 13.2, high: 17.1, displayLow: '13.2', displayHigh: '17.1', lowerBoundExclusive: false, upperBoundExclusive: false, formattedReferenceRange: '13.2 - 17.1 g/dL' }, abnormalFlagCategoryValue: 'Unknown' },
          componentComments: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '' },
        },
        {
          componentInfo: { componentID: 'COMP-HCT', name: 'Hematocrit', commonName: 'Hematocrit', units: '%' },
          componentResultInfo: { value: '44.1', isValueRtf: false, numericValue: 44.1, referenceRange: { low: 38.5, high: 50, displayLow: '38.5', displayHigh: '50.0', lowerBoundExclusive: false, upperBoundExclusive: false, formattedReferenceRange: '38.5 - 50.0 %' }, abnormalFlagCategoryValue: 'Unknown' },
          componentComments: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '' },
        },
        {
          componentInfo: { componentID: 'COMP-PLT', name: 'Platelet Count', commonName: 'Platelets', units: 'K/uL' },
          componentResultInfo: { value: '245', isValueRtf: false, numericValue: 245, referenceRange: { low: 140, high: 400, displayLow: '140', displayHigh: '400', lowerBoundExclusive: false, upperBoundExclusive: false, formattedReferenceRange: '140 - 400 K/uL' }, abnormalFlagCategoryValue: 'Unknown' },
          componentComments: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '' },
        },
      ],
      studyResult: {
        narrative: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '', signingInstantTimestamp: '' },
        impression: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '', signingInstantTimestamp: '' },
        combinedRTFNarrativeImpression: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '', signingInstantTimestamp: '' },
        addenda: [],
        transcriptions: [],
        ecgDiagnosis: [],
        hasStudyContent: false,
      },
      shouldHideHistoricalData: false,
      resultNote: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '', signingInstantTimestamp: '' },
      reportDetails: { isDownloadablePDFReport: false, reportID: '', openRemotely: false, reportContext: '', reportVars: { ordId: 'RES-CBC', ordDat: 'RES-CBC-DAT' } },
      scans: [],
      imageStudies: [],
      indicators: [],
      geneticProfileLink: '',
      shareEverywhereLogin: false,
      showProviderNotReviewed: false,
      providerComments: [],
      resultLetter: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '', signingInstantTimestamp: '' },
      warningType: '',
      warningMessage: '',
      variants: [],
      tooManyVariants: false,
      hasComment: false,
      hasAllDetails: true,
      isAbnormal: false,
    },
  ],
  orderLimitReached: false,
  ordersDeduplicated: false,
  hideEncInfo: false,
};

// ─── Historical lab trends ──────────────────────────────────────────
// GetMultipleHistoricalResultComponents on real instances returns a MAP of
// component id → trend (never a list), plus the component ordering and report
// id. Keyed here by the orderID the scraper sends (the result-group key).
function trendPoint(value: number, low: number, high: number, range: string, dateISO: string) {
  return {
    value: String(value),
    isValueRtf: false,
    numericValue: value,
    referenceRange: { low, high, displayLow: String(low), displayHigh: String(high), lowerBoundExclusive: false, upperBoundExclusive: false, formattedReferenceRange: range },
    abnormalFlagCategoryValue: 'Unknown',
    dateISO,
  };
}
export const historicalResultsByOrder: Record<string, {
  historicalResults: Record<string, unknown>;
  orderedComponentIDs: string[];
  reportID: string;
  shouldShowBedsideActiveView: boolean;
}> = {
  'GRP-LIPID': {
    historicalResults: {
      'COMP-CHOL': {
        oldestResultISO: '2024-01-08T09:00:00',
        hideGraph: false,
        showAbnormalFlag: true,
        historicalResultData: [
          trendPoint(255, 125, 200, '125 - 200 mg/dL', '2024-01-08T09:00:00'),
          trendPoint(268, 125, 200, '125 - 200 mg/dL', '2025-01-06T09:00:00'),
          trendPoint(280, 125, 200, '125 - 200 mg/dL', '2026-01-10T09:00:00'),
        ],
        componentID: 'COMP-CHOL',
        name: 'Total Cholesterol',
        commonName: 'Total Cholesterol',
        units: 'mg/dL',
      },
      'COMP-LDL': {
        oldestResultISO: '2024-01-08T09:00:00',
        hideGraph: false,
        showAbnormalFlag: true,
        historicalResultData: [
          trendPoint(170, 0, 100, '0 - 100 mg/dL', '2024-01-08T09:00:00'),
          trendPoint(182, 0, 100, '0 - 100 mg/dL', '2025-01-06T09:00:00'),
          trendPoint(190, 0, 100, '0 - 100 mg/dL', '2026-01-10T09:00:00'),
        ],
        componentID: 'COMP-LDL',
        name: 'LDL Cholesterol',
        commonName: 'LDL Cholesterol',
        units: 'mg/dL',
      },
    },
    orderedComponentIDs: ['COMP-CHOL', 'COMP-LDL'],
    reportID: '',
    shouldShowBedsideActiveView: false,
  },
};

// ─── Immunizations ──────────────────────────────────────────────────
export const immunizations = {
  organizationImmunizationList: [
    {
      organization: { organizationName: 'Springfield General Hospital' },
      orgImmunizations: [
        { name: 'Influenza (Flu)', id: 'IMM-001', formattedAdministeredDates: ['10/01/2025', '10/15/2024'] },
        { name: 'Tdap', id: 'IMM-002', formattedAdministeredDates: ['05/12/2020'] },
        { name: 'COVID-19 Vaccine', id: 'IMM-003', formattedAdministeredDates: ['09/01/2025', '03/15/2024'] },
        { name: 'Hepatitis B', id: 'IMM-004', formattedAdministeredDates: ['01/20/1990', '02/20/1990', '07/20/1990'] },
      ],
    },
  ],
};

// ─── Visits ─────────────────────────────────────────────────────────

/**
 * Build one visit in real MyChart's field vocabulary.
 *
 * Every key emitted here exists on the captured `visitsLoadPast` /
 * `visitsLoadUpcoming` skeletons in `realShapes.ts`. That matters because
 * `conformToShape` passes fixture-only keys straight through: the fixture used
 * to carry invented ones (`VisitType`, `Location`, `LocationAddress`,
 * `Providers[].ID`), so the fake served fields no Epic instance returns while
 * the real ones — `VisitTypeName`, `Instant`, `PrimaryProviderName`,
 * `PrimaryDepartment` — came back blank. Anything reading a visit the way real
 * MyChart shapes it therefore saw an undated, untyped, providerless encounter.
 */
function visitFixture(v: {
  csn: string;
  /** `MM/DD/YYYY hh:mm:ss AM` — the format real MyChart uses for PrimaryDate. */
  primaryDate: string;
  visitTypeName: string;
  provider: string;
  providerId: string;
  department: string;
  departmentAddress: string[];
  specialty?: string;
  /** Past visits carry the summary/notes flags; upcoming ones carry scheduling flags. */
  past?: boolean;
}): Record<string, unknown> {
  const ms = Date.parse(v.primaryDate);
  const at = new Date(ms);
  const past = v.past ?? true;
  const specialty = v.specialty ?? 'Family Medicine';
  const department = {
    Id: `DEP-${v.csn}`,
    Name: v.department,
    Address: v.departmentAddress,
    HasAddress: true,
    PhoneNumber: '555-0123',
    Instructions: [],
    ShouldShowInstructions: false,
    TimeZone: 'America/New_York',
    ArrivalLocation: '',
    Specialty: { Value: specialty, Title: specialty, TitleUtf8: null, Abbreviation: specialty.slice(0, 4) },
    CanShowDrivingDirections: true,
    IsPreadmissionLocation: false,
  };
  const provider = {
    EncryptedId: v.providerId,
    Name: v.provider,
    Type: 1,
    PhotoUrl: '',
    PhotoLink: null,
    WebPageUrl: '',
    HasPhotoOnBlob: false,
    PhotoBlobToken: '',
    IsPerson: true,
    Department: department,
    PhotoClass: '',
  };

  return {
    PrimaryDate: v.primaryDate,
    Instant: `/Date(${ms})/`,
    Dat: String(Math.floor(ms / 86_400_000) + 21_916),
    Date: at.toDateString(),
    ShortDate: `${at.getMonth() + 1}/${at.getDate()}/${at.getFullYear()}`,
    Time: at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    Month: at.getMonth() + 1,
    DateOfMonth: String(at.getDate()),
    Year: String(at.getFullYear()),
    TimeZone: 'America/New_York',
    Csn: v.csn,
    CsnForECheckIn: v.csn,
    Id: `VISIT-${v.csn}`,
    ReferenceID: '',
    VisitTypeName: v.visitTypeName,
    IsUsingFallbackVisitTypeName: false,
    Providers: [provider],
    OtherProviders: [],
    NumberOfOthers: 0,
    PrimaryProvider: provider,
    PrimaryProviderName: v.provider,
    IsSingleProvider: true,
    PrimaryDepartment: department,
    Organization: {
      OrganizationId: 'ORG-SPRINGFIELD',
      OrganizationName: 'Springfield General Hospital',
      OrganizationIdentifier: null,
      RelatedOrganizations: null,
      HasChildOrgs: false,
      IsLocal: true,
    },
    OrganizationLinks: [],
    PrimaryOrganizationLink: null,
    IsLocal: true,
    IsPastVisit: past,
    HasPaymentFeature: true,
    IsApptDetailsEnabled: true,
    CanRedirectToApptDetails: past,
    IsProviderLinkEnabled: true,
    IsDrivingDirectionsEnabled: true,
    // Past visits expose their summary/notes; upcoming ones expose scheduling.
    IsClinicalInformationAvailable: past,
    IsClinicalNoteAvailable: past,
    IsVisitSummaryEnabled: past,
    IsDownloadSummaryEnabled: past,
    HasDownloadSummaryLink: past,
    IsPastVisitDetailsEnabled: past,
    ShowVisitDetails: past,
    IsRequestCancelEnabled: !past,
    IsDirectCancelEnabled: !past,
    IsRescheduleEnabled: !past,
    IsCopayEnabled: !past,
    IsEcheckInEnabled: !past,
    IsNoShow: false,
    IsCanceled: false,
  };
}

export const upcomingVisits = {
  LaterVisitsList: [
    visitFixture({
      csn: 'CSN-HOMER-001',
      primaryDate: '04/15/2026 09:00:00 AM',
      visitTypeName: 'Annual Physical',
      provider: 'Julius Hibbert, MD',
      providerId: 'PROV-HIBBERT',
      department: 'Springfield General Hospital',
      departmentAddress: ['123 Main Street', 'Springfield, NT 49007'],
      past: false,
    }),
  ],
  // Real LoadUpcoming responses carry these alongside LaterVisitsList; none of
  // the invented keys the fake used to add (EarlierVisitsList, PastVisitsList,
  // ApptTypes, IsScrollToEnabled) appear on any captured instance.
  InProgressVisits: [],
  NextNDaysVisits: [],
  HighlightDays: [],
  HasPVG: false,
};

// Filler past visits (newest→oldest). Combined with the 3 visits that have
// notes/AVS content attached, this gives 22 total → 3 pages at the route's
// real-MyChart page size of 10 (10 + 10 + 2), so the scraper's pagination loop
// must follow the `serializedIndex` continuation through several requests, not
// just one extra. CSN-HOMER-023 (the oldest) is only reachable on the third page.
const EXTRA_PAST_VISITS = [
  ['CSN-HOMER-005', '06/15/2025 09:00:00 AM', 'Office Visit', 'Julius Hibbert, MD', 'PROV-HIBBERT'],
  ['CSN-HOMER-006', '04/02/2025 11:30:00 AM', 'Telephone', 'Julius Hibbert, MD', 'PROV-HIBBERT'],
  ['CSN-HOMER-007', '02/18/2025 02:00:00 PM', 'Office Visit', 'Nick Riviera, MD', 'PROV-NICK'],
  ['CSN-HOMER-008', '12/05/2024 10:15:00 AM', 'Lab Work', 'Julius Hibbert, MD', 'PROV-HIBBERT'],
  ['CSN-HOMER-009', '11/12/2024 03:45:00 PM', 'Office Visit', 'Julius Hibbert, MD', 'PROV-HIBBERT'],
  ['CSN-HOMER-010', '10/01/2024 08:30:00 AM', 'Procedure', 'Nick Riviera, MD', 'PROV-NICK'],
  ['CSN-HOMER-011', '09/15/2024 01:00:00 PM', 'Office Visit', 'Julius Hibbert, MD', 'PROV-HIBBERT'],
  ['CSN-HOMER-012', '08/20/2024 09:45:00 AM', 'Telephone', 'Julius Hibbert, MD', 'PROV-HIBBERT'],
  ['CSN-HOMER-013', '07/10/2024 12:00:00 PM', 'Office Visit', 'Julius Hibbert, MD', 'PROV-HIBBERT'],
  ['CSN-HOMER-014', '05/22/2024 10:30:00 AM', 'Office Visit', 'Julius Hibbert, MD', 'PROV-HIBBERT'],
  ['CSN-HOMER-015', '03/14/2024 09:15:00 AM', 'Procedure', 'Nick Riviera, MD', 'PROV-NICK'],
  ['CSN-HOMER-016', '01/30/2024 02:45:00 PM', 'Telephone', 'Julius Hibbert, MD', 'PROV-HIBBERT'],
  ['CSN-HOMER-017', '11/08/2023 11:00:00 AM', 'Office Visit', 'Julius Hibbert, MD', 'PROV-HIBBERT'],
  ['CSN-HOMER-018', '09/19/2023 08:45:00 AM', 'Lab Work', 'Julius Hibbert, MD', 'PROV-HIBBERT'],
  ['CSN-HOMER-019', '07/06/2023 01:30:00 PM', 'Office Visit', 'Nick Riviera, MD', 'PROV-NICK'],
  ['CSN-HOMER-020', '04/25/2023 10:00:00 AM', 'Office Visit', 'Julius Hibbert, MD', 'PROV-HIBBERT'],
  ['CSN-HOMER-021', '02/11/2023 03:15:00 PM', 'Telephone', 'Julius Hibbert, MD', 'PROV-HIBBERT'],
  ['CSN-HOMER-022', '12/02/2022 09:30:00 AM', 'Office Visit', 'Julius Hibbert, MD', 'PROV-HIBBERT'],
  ['CSN-HOMER-023', '08/15/2022 11:45:00 AM', 'Annual Physical', 'Julius Hibbert, MD', 'PROV-HIBBERT'],
].map(([csn, primaryDate, visitTypeName, provider, providerId]) =>
  visitFixture({
    csn: csn!,
    primaryDate: primaryDate!,
    visitTypeName: visitTypeName!,
    provider: provider!,
    providerId: providerId!,
    department: 'Springfield General Hospital',
    departmentAddress: ['123 Main Street', 'Springfield, NT 49007'],
  }),
);

export const pastVisits = {
  PastVisitsList: [
    visitFixture({
      csn: 'CSN-HOMER-002',
      primaryDate: '01/10/2026 09:00:00 AM',
      visitTypeName: 'Annual Physical',
      provider: 'Julius Hibbert, MD',
      providerId: 'PROV-HIBBERT',
      department: 'Springfield General Hospital',
      departmentAddress: ['123 Main Street', 'Springfield, NT 49007'],
    }),
    {
      ...visitFixture({
        csn: 'CSN-HOMER-003',
        primaryDate: '11/20/2025 02:30:00 PM',
        visitTypeName: 'ER Visit - Donut Incident',
        provider: 'Nick Riviera, MD',
        providerId: 'PROV-NICK',
        department: 'Springfield General Hospital ER',
        departmentAddress: ['123 Main Street', 'Springfield, NT 49007'],
        specialty: 'Emergency Medicine',
      }),
      EncounterIsEDVisit: true,
      ChiefComplaint: 'Abdominal pain',
      Diagnoses: [{ Code: 'R10.9', Description: 'Unspecified abdominal pain' }],
    },
    visitFixture({
      csn: 'CSN-HOMER-004',
      primaryDate: '08/05/2025 10:00:00 AM',
      visitTypeName: 'Radiation Screening',
      provider: 'Julius Hibbert, MD',
      providerId: 'PROV-HIBBERT',
      department: 'Springfield Nuclear Power Plant Health Center',
      departmentAddress: ['100 Industrial Way', 'Springfield, NT 49007'],
      specialty: 'Occupational Medicine',
    }),
    ...EXTRA_PAST_VISITS,
  ],
};

// ─── Messages / Conversations ───────────────────────────────────────
export const conversations = {
  conversations: [
    {
      hthId: 'CONV-001',
      subject: 'Weight Management Follow-up',
      previewText: 'Homer, we discussed your weight loss goals...',
      audience: [{ name: 'Julius Hibbert, MD' }],
      hasMoreMessages: false,
      userOverrideNames: {},
      messages: [
        {
          wmgId: 'MSG-001',
          author: { empKey: 'PROV-HIBBERT', wprKey: '', displayName: 'Julius Hibbert, MD' },
          deliveryInstantISO: '2026-01-10T14:30:00Z',
          body: 'Homer, as we discussed during your visit, I strongly recommend reducing your donut intake to no more than 3 per day. Your cholesterol levels are concerning.',
        },
        {
          wmgId: 'MSG-002',
          author: { empKey: '', wprKey: 'WPR-HOMER', displayName: 'Homer Simpson' },
          deliveryInstantISO: '2026-01-10T15:45:00Z',
          body: "But doc, donuts are a food group! Can't I just take more pills instead?",
        },
        {
          wmgId: 'MSG-003',
          author: { empKey: 'PROV-HIBBERT', wprKey: '', displayName: 'Julius Hibbert, MD' },
          deliveryInstantISO: '2026-01-11T09:00:00Z',
          body: "No Homer, that's not how it works. Let's schedule a nutritionist appointment. I'm also referring you to a weight management program.",
        },
      ],
    },
    {
      hthId: 'CONV-002',
      subject: 'Discount Surgery Consultation',
      previewText: 'Hi-Everybody! I have great news about...',
      audience: [{ name: 'Nick Riviera, MD' }],
      hasMoreMessages: false,
      userOverrideNames: {},
      messages: [
        {
          wmgId: 'MSG-004',
          author: { empKey: 'PROV-NICK', wprKey: '', displayName: 'Nick Riviera, MD' },
          deliveryInstantISO: '2025-12-15T10:00:00Z',
          body: "Hi-Everybody! I have great news about a new discount liposuction procedure. Only $29.95! Results may vary.",
        },
        {
          wmgId: 'MSG-005',
          author: { empKey: '', wprKey: 'WPR-HOMER', displayName: 'Homer Simpson' },
          deliveryInstantISO: '2025-12-15T11:30:00Z',
          body: "Woohoo! Sign me up, Dr. Nick! That's cheaper than a month of donuts!",
        },
      ],
    },
  ],
  users: {
    'PROV-HIBBERT': { name: 'Julius Hibbert, MD' },
    'PROV-NICK': { name: 'Nick Riviera, MD' },
  },
  viewers: {
    'WPR-HOMER': { name: 'Homer Simpson', isSelf: true },
  },
};

// ─── Billing ────────────────────────────────────────────────────────
export const billingSummary = [
  {
    guarantorId: '742',
    guarantorName: 'Homer Simpson',
    amountDue: '$350.00',
    lastPaid: 'Last paid: $75.00 on 12/15/2025',
    detailsId: 'WP-BILLING-001',
    detailsContext: 'WP-BILLING-CTX-001',
  },
];

export const billingEncId = 'WP-BILLING-ENC-001';

export const billingVisits = {
  Success: true,
  Data: {
    VisitList: [],
    VisitListAmount: '',
    BadDebtVisitList: [],
    BadDebtVisitListAmount: '',
    PaymentPlanVisitList: [],
    PaymentPlanVisitListAmount: '',
    PaymentPlanVisitListPostResolutionAmount: '',
    NotPaymentPlanVisitList: [],
    NotPaymentPlanVisitListAmount: '',
    AdvanceBillVisitList: [],
    AdvanceBillVisitListAmount: '',
    InformationalVisitList: [
      {
        GroupType: 2,
        Index: 0,
        BillingSystem: 1,
        IsSBO: true,
        BillingSystemDisplay: 'Physician Services',
        AdjustmentsOnly: false,
        DateRangeDisplay: null,
        StartDate: 67300,
        StartDayOfMonth: 10,
        StartMonth: 1,
        StartYear: 2026,
        StartDateDisplay: 'Jan 10, 2026',
        StartDateAccessibleText: 'January 10, 2026',
        Description: 'Annual Physical at Springfield General Hospital',
        Patient: 'Patient: Homer Simpson',
        Provider: 'Provider: Julius Hibbert, MD',
        ProviderId: null,
        HospitalAccountDisplay: 'Account #HS-742-001',
        HospitalAccountId: 'HS-742-001',
        SupressDayFromDate: false,
        CanAddToPaymentPlan: false,
        PrimaryPayer: 'Primary Payer: Springfield Nuclear Employee Health Plan',
        IsLTCSeries: false,
        ChargeAmount: '$500.00',
        InsuranceAmountDue: '$150.00',
        InsuranceAmountDueRaw: 150,
        SelfAmountDue: '$350.00',
        SelfAmountDueRaw: 350,
        IsPatientNotResponsible: false,
        PatientNotResponsibleYet: false,
        InsurancePaymentAmount: '$0.00',
        InsuranceEstimatedPaymentAmount: null,
        SelfPaymentAmount: null,
        SelfAdjustmentAmount: null,
        SelfDiscountAmount: null,
        ContestedChargeAmount: null,
        ContestedPaymentAmount: null,
        ShowInsuranceHelp: true,
        SelfPaymentPlanAmountDue: null,
        SelfPaymentPlanAmountDueRaw: 0,
        IsExpanded: false,
        BlockExpanding: false,
        ProcedureList: [
          {
            BillingSystem: 1,
            Description: 'Office Visit, Established Patient - Annual Physical',
            Amount: '$350.00',
            PaymentList: null,
            InsuranceAmountDue: null,
            SelfAmountDue: '$350.00',
            HasAmountDue: true,
            SelfBadDebtAmount: null,
            HasBadDebtAmount: false,
            AdjustmentsOnly: false,
            IsContested: false,
          },
          {
            BillingSystem: 1,
            Description: 'Lab Work - Lipid Panel',
            Amount: '$150.00',
            PaymentList: null,
            InsuranceAmountDue: null,
            SelfAmountDue: '$0.00',
            HasAmountDue: false,
            SelfBadDebtAmount: null,
            HasBadDebtAmount: false,
            AdjustmentsOnly: false,
            IsContested: false,
          },
        ],
        ProcedureGroupList: null,
        CoverageInfoList: null,
        ShowCoverageHelp: true,
        VisitAutoPay: null,
        ShowVisitAutoPay: false,
        LevelOfDetailLoaded: 2,
        SelfBadDebtAmount: null,
        SelfBadDebtAmountRaw: 0,
        IsClosedHospitalAccount: false,
        IsBadDebtHAR: false,
        IsPaymentPlanEstimate: false,
        IsResolvedEstimatedPPAccount: false,
        NotOnPlanAmount: null,
        NotOnPlanAmountRaw: 0,
        EmptyVisitEstimateID: null,
        EstimateInfo: null,
        PatFriendlyAccountStatus: 3,
        VisitBadDebtScenario: 0,
        PatFriendlyAccountStatusAccessibleText: 'Account status: Outstanding',
        VisitStatusesEqualToClosed: [8, 9],
        IsOnPaymentPlan: false,
        IsNotOnPaymentPlan: false,
      },
    ],
    UnifiedVisitList: [],
    NoBalanceVisitList: [],
    AdjustmentVisitList: [],
    AdjustmentVisitListAmount: '',
    VisitAutoPayVisitList: [],
    VisitAutoPayVisitListAmount: '',
    HasVisits: true,
    ShowingAll: false,
    HasUnconvertedPBVisits: false,
    CanMakePayment: true,
    CanEditPaymentPlan: false,
    URLMakePayment: null,
    URLEditPaymentPlan: null,
    Filters: {
      FilterClass: 'col-9',
      Options: [
        { OptionClass: 'col-3', OptionLabel: 'Active accounts' },
        { OptionClass: 'col-3', OptionLabel: 'Year to date' },
        { OptionClass: 'col-3', OptionLabel: 'Last year' },
        { OptionClass: 'col-3', OptionLabel: 'Date range' },
      ],
    },
    PartialPaymentPlanAlert: { Code: 0, Banner: { HeaderText: '', DetailText: '', BannerType: 'informationalType', BannerTypeReact: 'informational' } },
    BillingSystem: 3,
  },
};

export const billingStatements = {
  Success: true,
  DataDetailBill: { StatementList: [] },
  DataStatement: {
    StatementList: [
      {
        Show: true,
        Date: 0,
        DayOfMonth: 15,
        Month: 1,
        Year: 2026,
        DateDisplay: '20260115',
        FormattedDateDisplay: 'Jan 15, 2026',
        Description: 'Sent via postal mail',
        LinkText: 'View (PDF)',
        LinkDescription: 'View the statement sent on January 15, 2026 (PDF).',
        IsRead: false,
        ImagePath: 'HOMER-STMT-001',
        Token: 'HOMER-TOKEN-001',
        IsPaperless: false,
        PrintID: 'HOMER-PRINT-001',
        StatementAmountDisplay: '$350.00',
        IsEB: false,
        Format: 1,
        IsDetailBill: false,
        BillingSystem: 3,
        EncBillingSystem: 'HOMER-ENC-BS-001',
        RecordID: 'HOMER-REC-001',
      },
    ],
    HasUnread: true,
    HasRead: false,
    ShowAll: false,
    IsPaperless: false,
    PaperlessStatus: 0,
    ShowPaperlessSignup: false,
    ShowPaperlessCancel: false,
    URLPaperlessBilling: null,
    IsPaperlessAllowedForSA: false,
    IsDetailBillModel: true,
    noStatementsString: 'No itemized bills are available for viewing.',
    allReadString: 'All itemized bills were previously read.',
    loadMoreString: 'Show all itemized bills',
  },
};

export const billingPayments = {
  Success: true,
  Data: {
    PaymentList: [
      {
        ID: 'HOMER-PMT-001',
        ElementID: 'past_HOMER-PMT-001',
        Index: '0',
        DayOfMonth: 20,
        Month: 1,
        Year: 2026,
        FormattedDateDisplay: 'Jan 20, 2026',
        Description: 'MyChart Payment',
        SubText: null,
        HtmlSubText: '<img alt="Visa" class="brandImage" src="/MyChartPRD/en-US/images/3rdparty/Visa.png"></img> x4242',
        PaymentAmountDisplay: '$350.00',
        UndistributedAmountDisplay: null,
        CoverageInfo: null,
        Receipt: null,
        IsBadDebtAdj: false,
        IsWriteOffAdj: false,
        IsSurchargeAdj: false,
        CanEdit: false,
        EditPaymentOptions: null,
        CanCancel: false,
        CancelCommandOptions: null,
        ConsentDocument: null,
        ViewConsentOptions: null,
        IsCardExpiringSoon: false,
        HasCardExpired: false,
      },
      {
        ID: 'HOMER-PMT-002',
        ElementID: 'past_HOMER-PMT-002',
        Index: '1',
        DayOfMonth: 5,
        Month: 12,
        Year: 2025,
        FormattedDateDisplay: 'Dec 5, 2025',
        Description: 'MyChart Payment',
        SubText: null,
        HtmlSubText: '<img alt="Visa" class="brandImage" src="/MyChartPRD/en-US/images/3rdparty/Visa.png"></img> x4242',
        PaymentAmountDisplay: '$150.00',
        UndistributedAmountDisplay: null,
        CoverageInfo: null,
        Receipt: null,
        IsBadDebtAdj: false,
        IsWriteOffAdj: false,
        IsSurchargeAdj: false,
        CanEdit: false,
        EditPaymentOptions: null,
        CanCancel: false,
        CancelCommandOptions: null,
        ConsentDocument: null,
        ViewConsentOptions: null,
        IsCardExpiringSoon: false,
        HasCardExpired: false,
      },
    ],
    Filters: null,
  },
};

// ─── Letters ────────────────────────────────────────────────────────
// Intentionally NOT in date order so getLetters can prove its newest-first
// sort actually fires. The empty-dateISO entry exercises the
// MISSING_DATE-sorts-last contract in scrapers/myChart/util.ts.
export const letters = {
  letters: [
    { dateISO: '2025-11-20T16:00:00Z', reason: 'After Visit Summary - ER Visit', viewed: true, empId: 'PROV-NICK', hnoId: 'LTR-002', csn: 'CSN-HOMER-003' },
    { dateISO: '', reason: 'Sector 7G Safety Notice', viewed: false, empId: 'PROV-HIBBERT', hnoId: 'LTR-003', csn: 'CSN-HOMER-004' },
    { dateISO: '2026-01-10T16:00:00Z', reason: 'After Visit Summary - Annual Physical', viewed: false, empId: 'PROV-HIBBERT', hnoId: 'LTR-001', csn: 'CSN-HOMER-002' },
  ],
  users: {
    'PROV-HIBBERT': { name: 'Julius Hibbert, MD', photoUrl: '', empId: 'PROV-HIBBERT' },
    'PROV-NICK': { name: 'Nick Riviera, MD', photoUrl: '', empId: 'PROV-NICK' },
  },
};

export const letterDetails: Record<string, { bodyHTML: string }> = {
  'LTR-001': {
    bodyHTML: '<h2>After Visit Summary</h2><p>Patient: Homer Simpson</p><p>Date: January 10, 2026</p><p>Provider: Dr. Julius Hibbert</p><p>Reason: Annual Physical</p><p>Assessment: Patient is obese (BMI 35.3). Hypertension not well controlled. Hypercholesterolemia - lipid panel shows elevated LDL and triglycerides.</p><p>Plan: Continue current medications. Referred to weight management program. Follow up in 3 months. Dietary counseling recommended - reduce donut consumption.</p>',
  },
  'LTR-002': {
    bodyHTML: '<h2>After Visit Summary</h2><p>Patient: Homer Simpson</p><p>Date: November 20, 2025</p><p>Provider: Dr. Nick Riviera</p><p>Reason: ER Visit - Donut Incident</p><p>Assessment: Patient presented with abdominal distress after consuming 48 donuts in a single sitting.</p><p>Plan: Gastric lavage performed. Patient discharged with instructions to limit donut intake. Follow up with PCP.</p>',
  },
  'LTR-003': {
    bodyHTML: '<h2>Sector 7G Safety Notice</h2><p>Reminder: do not consume donuts found near the reactor core. Report any glowing pastries to the safety inspector immediately.</p>',
  },
};

// ─── Goals ───────────────────────────────────────────────────────────
// Real envelopes are `careTeamGoals` / `patientGoals` (observed on all three
// captured instances), not the `goals` the fake used to invent. The element
// shape is unverifiable from those accounts (every real list was empty), so
// the entries keep the fields modelled here.
export const careTeamGoals = {
  careTeamGoals: [
    { name: 'Lose 50 lbs', description: 'Reduce body weight from 260 lbs to 210 lbs through diet and exercise', status: 'In Progress', startDate: '01/10/2026', targetDate: '07/10/2026' },
    { name: 'Lower cholesterol', description: 'Reduce total cholesterol below 200 mg/dL', status: 'In Progress', startDate: '01/10/2026', targetDate: '04/10/2026' },
  ],
};

export const patientGoals = {
  patientGoals: [
    { name: 'Eat one vegetable per week', description: 'Incorporate at least one serving of vegetables into weekly diet', status: 'Not Started', startDate: '01/15/2026', targetDate: '12/31/2026' },
  ],
};

// ─── Referrals ──────────────────────────────────────────────────────
export const referrals = {
  referralList: [
    {
      internalId: 'REF-001',
      externalId: 'REF-EXT-001',
      status: 'Approved',
      statusString: 'Approved',
      creationDate: '01/10/2026',
      start: '01/10/2026',
      end: '04/10/2026',
      referredByProviderName: 'Julius Hibbert, MD',
      referredToProviderName: 'Nick Riviera, MD',
      referredToFacility: 'Springfield Cardiology Associates',
    },
  ],
};

// ─── Preventive Care ────────────────────────────────────────────────
export const preventiveCare = [
  { name: 'Colonoscopy', status: 'overdue', date: '01/01/2024' },
  { name: 'Influenza Vaccine', status: 'due', date: '10/01/2026' },
  { name: 'Lipid Panel', status: 'completed', date: '01/10/2026' },
];

// ─── Documents ──────────────────────────────────────────────────────
export const documents = {
  documents: [
    { id: 'DOC-001', title: 'After Visit Summary', documentType: 'Clinical', date: '01/10/2026', providerName: 'Julius Hibbert, MD', organizationName: 'Springfield General Hospital' },
    { id: 'DOC-002', title: 'Lab Results Report', documentType: 'Lab', date: '01/10/2026', providerName: 'Julius Hibbert, MD', organizationName: 'Springfield General Hospital' },
  ],
};

// ─── Questionnaires ─────────────────────────────────────────────────
export const questionnaires = {
  questionnaires: [
    { id: 'QUEST-001', name: 'PHQ-9 Depression Screening', status: 'Completed', dueDate: '01/10/2026', completedDate: '01/10/2026' },
    { id: 'QUEST-002', name: 'Health Risk Assessment', status: 'Pending', dueDate: '04/15/2026', completedDate: '' },
  ],
};

// ─── Care Journeys ──────────────────────────────────────────────────
export const careJourneys = {
  careJourneys: [
    { id: 'CJ-001', name: 'Weight Management Program', description: 'Comprehensive program including dietary counseling, exercise plan, and regular check-ins', status: 'Active', providerName: 'Julius Hibbert, MD' },
  ],
};

// ─── Activity Feed ──────────────────────────────────────────────────
// Real FetchItemFeed responses group items per patient tab under
// `singleItemFeedViewModels` (one entry per record the account can see), each
// carrying `feedItems` whose text lives in `displayText` and whose links live
// in `primaryAction.uri`. The flat `{items: [...]}` the fake used to return
// exists on no captured instance.
function feedItem(identifier: string, displayText: string, type: string, priorityInstant: number, uri: string) {
  const action = { uriId: '', uri, uriType: 0, uriDisplayText: '', uriAccessibleText: '', uriIconKey: '', isHidden: false };
  return {
    phone: '', smsActive: false, allTextEnabled: false, email: '', allEmailEnabled: false, canEditInfo: false,
    displayText, type, defaultType: type, groupCount: 0, priority: 0, priorityInstant,
    iconKey: '', subiconKey: '', shouldShowWatermark: false,
    primaryAction: action,
    secondaryAction: { ...action, uri: '' },
    tertiaryAction: { uriId: '', uriType: 0, uriDisplayText: '', uriAccessibleText: '', uriIconKey: '', isHidden: false },
    defaultAction: action,
    identifier, topicId: 0, isH2GEnabled: false,
  };
}
export const activityFeed = {
  singleItemFeedViewModels: [
    {
      eptId: 'EPT-HOMER',
      displayName: 'Homer',
      photoUrl: '',
      tabColor: 0,
      zeroStateIconKey: '',
      isSelected: true,
      feedItems: [
        feedItem('FEED-001', 'New Lab Results Available', 'TestResult', Date.parse('2026-01-10T10:30:00Z'), '/app/test-results'),
        feedItem('FEED-002', 'Annual Physical with Dr. Hibbert on April 15, 2026 at 9:00 AM', 'Appointment', Date.parse('2026-04-08T09:00:00Z'), '/Visits'),
        feedItem('FEED-003', 'New Message from Dr. Hibbert', 'Message', Date.parse('2026-01-11T08:00:00Z'), '/app/communication-center'),
      ],
    },
  ],
};

// ─── Education Materials ────────────────────────────────────────────
// Real GetPatEducationTitles responses are a bare ARRAY of titles — there is
// no `educationTitles` wrapper on any captured instance — and the title text
// lives in `displayName`.
export const educationMaterials = [
  { elementId: 'EDU-001', displayName: 'Heart Health: What You Need to Know', assignedDate: '01/10/2026', eduKey: 'EDU-KEY-001', numTopics: 3, numPoints: 12, isAdmitted: false, encounterContext: 0, wasAssignedThisVisit: false, canUserTrackUnderstanding: true, numPagesReviewed: 0, numPagesUnderstood: 0, numPagesQuestions: 0, thumbnailImage: '', thumbnailImageBlobToken: '', thumbnailIcon: 0, tvSupported: false, removeThumbnails: false },
  { elementId: 'EDU-002', displayName: 'Managing Your Cholesterol', assignedDate: '01/10/2026', eduKey: 'EDU-KEY-002', numTopics: 2, numPoints: 8, isAdmitted: false, encounterContext: 0, wasAssignedThisVisit: false, canUserTrackUnderstanding: true, numPagesReviewed: 0, numPagesUnderstood: 0, numPagesQuestions: 0, thumbnailImage: '', thumbnailImageBlobToken: '', thumbnailIcon: 0, tvSupported: false, removeThumbnails: false },
];

// ─── EHI Export ─────────────────────────────────────────────────────
// Real envelope is `ehieTemplates` (with the EHIE availability flags), not the
// `templates` key the fake used to invent.
export const ehiExport = {
  isNoBuildEhie: false,
  existingEHIE: false,
  ehieTemplates: [
    { description: 'Complete export of all health information', hideAdditionalComments: false, name: 'Full Health Record', id: 'EHI-001' },
  ],
};

// ─── Upcoming Orders ────────────────────────────────────────────────
// Real GetUpcomingOrders responses are keyed MAPS (orderList, orderGroupList,
// providerList) plus a settings object — never a bare `orders` array. Every
// captured account had the maps empty, so the order VALUE shape here is
// modelled, not verified; the envelope is.
export const upcomingOrders = {
  orderGroupList: {},
  orderList: {
    'ORD-001': { orderName: 'Lipid Panel', orderType: 'Lab', status: 'Ordered', orderedDate: '01/10/2026', orderedByProvider: 'Julius Hibbert, MD', facilityName: 'Springfield General Hospital' },
    'ORD-002': { orderName: 'HbA1c', orderType: 'Lab', status: 'Ordered', orderedDate: '01/10/2026', orderedByProvider: 'Julius Hibbert, MD', facilityName: 'Springfield General Hospital' },
  },
  providerList: {
    'PROV-HIBBERT': { name: 'Julius Hibbert, MD', providerId: 'PROV-HIBBERT' },
  },
  upcomingOrdersSettings: { canHideOrUnhideReminders: false },
};

// ─── Linked Accounts ────────────────────────────────────────────────
export const linkedAccounts = {
  OrgList: {
    'ORG-SHELBYVILLE': {
      OrganizationName: 'Shelbyville Medical Center',
      LogoUrl: '',
      LastEncounterDetail: 'Sep 15, 2025',
    },
  },
};

// ─── Contact Information ────────────────────────────────────────────
export const contactInfo = {
  SecureCommunicationInfo: {
    EmailAddress: 'homer.simpson@springfieldnuclear.example.com',
  },
};

// ─── TOTP Setup ─────────────────────────────────────────────────────
export const totpInfo = {
  IsTotpEnabled: false,
};

// Shape of the TotpQrCode response. `encodedSecretKey` is a placeholder — the
// route replaces it with a freshly minted secret per call, the way a real
// instance does, and remembers it so VerifyCode can check the submitted code
// against it.
export const totpQrCode = {
  encodedSecretKey: 'JBSWY3DPEHPK3PXP', // standard base32 test secret
};

// ─── Message Compose ────────────────────────────────────────────────
export const subtopics = {
  topicList: [
    { displayName: 'Medical Question', value: 'TOPIC-001' },
    { displayName: 'Medication Refill', value: 'TOPIC-002' },
    { displayName: 'Appointment Request', value: 'TOPIC-003' },
    { displayName: 'Billing Question', value: 'TOPIC-004' },
  ],
};

// recipientType: 1 = individual provider, 6 = department/pool (billing, customer service, etc.)
export const messageRecipients = [
  {
    recipientType: 1,
    displayName: 'Julius Hibbert, MD',
    specialty: 'Internal Medicine',
    userId: 'PROV-HIBBERT',
    departmentId: 'DEP-001',
    poolId: 'POOL-001',
    providerId: 'PROV-HIBBERT',
    organizationId: '',
  },
  {
    recipientType: 1,
    displayName: 'Nick Riviera, MD',
    specialty: 'General Surgery',
    userId: 'PROV-NICK',
    departmentId: 'DEP-002',
    poolId: 'POOL-002',
    providerId: 'PROV-NICK',
    organizationId: '',
  },
  {
    recipientType: 6,
    displayName: 'Billing Department',
    specialty: 'Billing',
    userId: 'POOL-BILLING',
    departmentId: 'DEP-BILLING',
    poolId: 'POOL-BILLING',
    providerId: '',
    organizationId: '',
  },
  {
    recipientType: 6,
    displayName: 'Customer Service',
    specialty: 'Customer Service',
    userId: 'POOL-CS',
    departmentId: 'DEP-CS',
    poolId: 'POOL-CS',
    providerId: '',
    organizationId: '',
  },
];

export const messageViewers = {
  viewers: [
    { wprId: 'WPR-HOMER', isSelf: true },
  ],
};

// ─── Imaging / eUnity ──────────────────────────────────────────────

// DICOM UIDs for Homer's skull X-ray study (crayons stuck in brain!)
export const imaging = {
  studyUID: '1.2.840.114350.2.362.2.742742.2.1234567890.1',
  accessionNumber: 'E12345742',
  serviceInstance: 'SPRINGFIELDstudystrategy',
  patientId: '742$$$SPRINGFIELD',
  series: [
    {
      seriesUID: '1.3.51.0.7.748833181.4805.29255.36386.22408.54239.53943',
      instanceUID: '1.3.51.0.7.1272019023.37494.53573.32951.58539.52999.27202',
      seriesDescription: 'SKULL AP',
      cloPrefix: 'skull_ap',
    },
    {
      seriesUID: '1.3.51.0.7.3271007396.35359.25929.40621.44249.10393.55955',
      instanceUID: '1.3.51.0.7.1476580709.39260.10317.37364.41212.20646.62903',
      seriesDescription: 'SKULL LATERAL',
      cloPrefix: 'skull_lateral',
    },
  ],
};

// Imaging lab results — returned when groupType=2 or when querying imaging results
export const imagingLabResultsList = {
  areResultsFullyLoaded: true,
  isGroupingFullyLoaded: true,
  groupBy: 'ORDER',
  newResultGroups: [
    {
      key: 'GRP-XRAY',
      contactType: '',
      resultList: ['RES-XRAY'],
      isInpatient: false,
      isEDVisit: false,
      isCurrentAdmission: false,
      visitProviderID: 'PROV-HIBBERT',
      organizationID: 'ORG-SPRINGFIELD',
      sortDate: '2025-08-05T10:00:00',
      formattedDate: 'Aug 5, 2025',
      isLargeGroup: false,
    },
    {
      key: 'GRP-CT',
      contactType: '',
      resultList: ['RES-CT'],
      isInpatient: false,
      isEDVisit: false,
      isCurrentAdmission: false,
      visitProviderID: 'PROV-HIBBERT',
      organizationID: 'ORG-SPRINGFIELD',
      sortDate: '2025-09-15T14:30:00',
      formattedDate: 'Sep 15, 2025',
      isLargeGroup: false,
    },
  ],
  organizationLoadMoreInfo: {},
  // Real lists carry a newResults entry for every result the groups reference;
  // the empty map here previously existed on no captured instance.
  newResults: {
    'RES-XRAY^': {
      name: 'XR Skull 2 Views',
      key: 'RES-XRAY',
      showName: false,
      showDetails: true,
      orderMetadata: {
        orderProviderName: 'Julius Hibbert, MD',
        authorizingProviderName: 'Julius Hibbert, MD',
        authorizingProviderID: 'PROV-HIBBERT',
        prioritizedInstantISO: '2025-08-05T11:00:00',
        prioritizedInstantDisplay: 'Aug 5, 2025 11:00 AM',
        resultType: 'IMAGING',
        read: 'Read',
      },
      resultComponents: [],
      shouldHideHistoricalData: false,
      scans: [],
      shareEverywhereLogin: false,
      showProviderNotReviewed: false,
      providerComments: [],
      tooManyVariants: false,
      hasComment: false,
      hasAllDetails: false,
      isAbnormal: false,
    },
    'RES-CT^': {
      name: 'CT Head without Contrast',
      key: 'RES-CT',
      showName: false,
      showDetails: true,
      orderMetadata: {
        orderProviderName: 'Julius Hibbert, MD',
        authorizingProviderName: 'Julius Hibbert, MD',
        authorizingProviderID: 'PROV-HIBBERT',
        prioritizedInstantISO: '2025-09-15T15:00:00',
        prioritizedInstantDisplay: 'Sep 15, 2025 3:00 PM',
        resultType: 'IMAGING',
        read: 'Read',
      },
      resultComponents: [],
      shouldHideHistoricalData: false,
      scans: [],
      shareEverywhereLogin: false,
      showProviderNotReviewed: false,
      providerComments: [],
      tooManyVariants: false,
      hasComment: false,
      hasAllDetails: false,
      isAbnormal: false,
    },
  },
  newProviderPhotoInfo: {},
};

export const imagingLabResultDetails = {
  orderName: 'XR Skull 2 Views',
  key: 'RES-XRAY',
  results: [
    {
      name: 'XR Skull 2 Views',
      key: 'RES-XRAY',
      showName: false,
      showDetails: true,
      orderMetadata: {
        orderProviderName: 'Julius Hibbert, MD',
        readingProviderName: 'Julius Hibbert, MD',
        resultTimestampDisplay: 'Aug 5, 2025 11:00 AM',
        prioritizedInstantISO: '2025-08-05T11:00:00',
        prioritizedInstantDisplay: 'Aug 5, 2025 11:00 AM',
        latestUpdateInstantISO: '2025-08-05T11:00:00',
        collectionTimestampsDisplay: 'Aug 5, 2025 10:00 AM',
        specimensDisplay: '',
        resultStatus: 'Final',
        resultingLab: {
          name: 'Springfield General Hospital Radiology',
          address: ['123 Main Street', 'Springfield, NT 49007'],
          phoneNumber: '(555) 636-3000',
          labDirector: 'Julius Hibbert, MD',
          cliaNumber: '',
        },
        resultType: 'IMAGING',
        read: 'Read',
      },
      resultComponents: [],
      studyResult: {
        narrative: {
          isRTF: false,
          hasContent: true,
          contentAsString: 'FINDINGS: Calvarium is intact. Multiple radiopaque foreign bodies identified within the cranial vault consistent with crayon-shaped objects (at least 5). No acute fracture. No intracranial hemorrhage. Sella turcica is normal.',
          contentAsHtml: '<p>FINDINGS: Calvarium is intact. Multiple radiopaque foreign bodies identified within the cranial vault consistent with crayon-shaped objects (at least 5). No acute fracture. No intracranial hemorrhage. Sella turcica is normal.</p>',
          signingInstantTimestamp: '2025-08-05T11:00:00Z',
        },
        impression: {
          isRTF: false,
          hasContent: true,
          contentAsString: 'IMPRESSION: Multiple crayon-shaped foreign bodies within the cranial vault. Clinical correlation recommended. Consider neurosurgical consultation for foreign body removal. Patient states he has had crayons in his brain since childhood.',
          contentAsHtml: '<p>IMPRESSION: Multiple crayon-shaped foreign bodies within the cranial vault. Clinical correlation recommended. Consider neurosurgical consultation for foreign body removal. Patient states he has had crayons in his brain since childhood.</p>',
          signingInstantTimestamp: '2025-08-05T11:00:00Z',
        },
        combinedRTFNarrativeImpression: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '', signingInstantTimestamp: '' },
        addenda: [],
        transcriptions: [],
        ecgDiagnosis: [],
        hasStudyContent: true,
      },
      shouldHideHistoricalData: false,
      resultNote: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '', signingInstantTimestamp: '' },
      reportDetails: {
        isDownloadablePDFReport: false,
        reportID: 'RPT-XRAY-001',
        openRemotely: false,
        reportContext: '',
        reportVars: { ordId: 'ORD-XRAY-001', ordDat: 'ORD-XRAY-001-DAT' },
      },
      scans: [],
      imageStudies: [
        {
          studyId: imaging.studyUID,
          studyDescription: 'XR Skull 2 Views',
          studyDate: '2025-08-05',
          modality: 'CR',
          viewerUrl: '',
          numberOfImages: 2,
        },
      ],
      indicators: [],
      geneticProfileLink: '',
      shareEverywhereLogin: false,
      showProviderNotReviewed: false,
      providerComments: [],
      resultLetter: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '', signingInstantTimestamp: '' },
      warningType: '',
      warningMessage: '',
      variants: [],
      tooManyVariants: false,
      hasComment: false,
      hasAllDetails: true,
      isAbnormal: false,
    },
  ],
  orderLimitReached: false,
  ordersDeduplicated: false,
  hideEncInfo: false,
};

// ─── Passkey Management ─────────────────────────────────────────────
export const passkeyCreationOptions = {
  rp: { id: '', name: 'Springfield General MyChart' },
  attestation: 'none' as const,
  authenticatorSelection: {
    requireResidentKey: true,
    residentKey: 'required',
    userVerification: 'preferred',
  },
  // Challenge is generated dynamically per request
  pubKeyCredParams: [
    { type: 'public-key', alg: -7 },
    { type: 'public-key', alg: -257 },
  ],
  timeout: 60000,
  user: {
    id: Buffer.from('homer-simpson-user-id').toString('base64'),
    name: 'homer',
    displayName: 'Homer Jay Simpson',
  },
};

// ─── Available Appointments ─────────────────────────────────────────
export const availableAppointments = [
  {
    provider: 'Dr. Julius Hibbert',
    department: 'Internal Medicine',
    location: 'Springfield General Hospital, Suite 200',
    visitType: 'Office Visit',
    slots: [
      { date: '2026-04-10', time: '9:00 AM', slotId: 'slot-001' },
      { date: '2026-04-10', time: '10:30 AM', slotId: 'slot-002' },
      { date: '2026-04-11', time: '2:00 PM', slotId: 'slot-003' },
    ],
  },
  {
    provider: 'Dr. Nick Riviera',
    department: 'General Surgery',
    location: 'Dr. Nick\'s Walk-In Clinic, 123 Main St',
    visitType: 'Follow-Up',
    slots: [
      { date: '2026-04-09', time: '8:00 AM', slotId: 'slot-004' },
      { date: '2026-04-12', time: '11:00 AM', slotId: 'slot-005' },
    ],
  },
  {
    provider: 'Dr. Julius Hibbert',
    department: 'Lab Services',
    location: 'Springfield General Hospital, Lab Wing',
    visitType: 'Lab Work',
    slots: [
      { date: '2026-04-08', time: '7:30 AM', slotId: 'slot-006' },
      { date: '2026-04-09', time: '8:30 AM', slotId: 'slot-007' },
      { date: '2026-04-10', time: '7:00 AM', slotId: 'slot-008' },
    ],
  },
];

// ─── CT Imaging (multi-slice) ──────────────────────────────────────
// Homer had a CT of his head to see how many crayons are in there.
// 3 series: Axial (5 slices), Bone Recon (3 slices), Scout (1 slice)
function generateInstanceUIDs(seriesBase: string, count: number): string[] {
  const uids: string[] = [];
  for (let i = 1; i <= count; i++) {
    uids.push(`${seriesBase}.${i}`);
  }
  return uids;
}

export const ctImaging = {
  studyUID: '1.2.840.114350.2.362.2.742742.2.9876543210.1',
  accessionNumber: 'CT98765742',
  serviceInstance: 'SPRINGFIELDstudystrategy',
  patientId: '742$$$SPRINGFIELD',
  series: [
    {
      // Real eUnity servers emit a "SeriesSelector" pseudo-series at the head
      // of a CT study's instance list — a viewer UI construct, not images.
      // Its seriesUID is derived from the studyUID (unlike real series, whose
      // UIDs come from the modality), and every CustomImageServlet request
      // for it answers HTTP 200 with a small `application/cloerror` payload.
      // Faked here so clients are forced to handle a study whose first
      // instances are junk: a download budget spent on attempts rather than
      // successes returns zero images on exactly this shape.
      seriesUID: '1.2.840.114350.2.362.2.742742.2.9876543210.1.9999',
      instanceUIDs: generateInstanceUIDs('1.2.840.114350.2.362.2.742742.2.9876543210.1.9999', 3),
      seriesDescription: 'SeriesSelector',
      cloError: true,
    },
    {
      seriesUID: '1.3.51.0.7.100000001.11111.22222.33333.44444.55555.66666',
      instanceUIDs: generateInstanceUIDs('1.3.51.0.7.100000001.11111.22222.33333.44444.55555.66666', 5),
      seriesDescription: 'AXIAL',
      cloPrefix: 'checkerboard_512x512',
      // Per-slice DICOM Image Position (Patient), in mm, one entry per
      // instance — each instance's CLOWRAPPER carries its own position, like
      // a real eUnity server. z runs DESCENDING against instance number
      // (superior-first acquisition), so instance order ≠ anatomical order
      // and a client that skips position sorting is observably wrong.
      slicePositions: [
        { x: -125, y: -125, z: 200 },
        { x: -125, y: -125, z: 160 },
        { x: -125, y: -125, z: 120 },
        { x: -125, y: -125, z: 80 },
        { x: -125, y: -125, z: 40 },
      ],
      // These wrappers additionally carry the constructs a flat scalar object
      // never reaches, each a distinct AMF3 decode path: a VOI LUT whose table
      // is a byte array, annotation overlays inside externalizable
      // ArrayCollection nodes, and ImagePhaseInfo -1 sentinels (negative
      // integers, which only a sign-extending reader gets right).
      richWrapperMetadata: true,
    },
    {
      seriesUID: '1.3.51.0.7.200000002.77777.88888.99999.11111.22222.33333',
      instanceUIDs: generateInstanceUIDs('1.3.51.0.7.200000002.77777.88888.99999.11111.22222.33333', 3),
      seriesDescription: 'BONE RECON',
      cloPrefix: 'gradient_h_512x512',
      // z ASCENDING with instance number — the common case, so both
      // directions are covered.
      slicePositions: [
        { x: -125, y: -125, z: 40 },
        { x: -125, y: -125, z: 80 },
        { x: -125, y: -125, z: 120 },
      ],
    },
    {
      seriesUID: '1.3.51.0.7.300000003.44444.55555.66666.77777.88888.99999',
      instanceUIDs: ['1.3.51.0.7.300000003.44444.55555.66666.77777.88888.99999.1'],
      seriesDescription: 'SCOUT',
      cloPrefix: 'diagonal_510x510',
    },
  ],
};

export const ctLabResultDetails = {
  orderName: 'CT Head without Contrast',
  key: 'RES-CT',
  results: [
    {
      name: 'CT Head without Contrast',
      key: 'RES-CT',
      showName: false,
      showDetails: true,
      orderMetadata: {
        orderProviderName: 'Julius Hibbert, MD',
        readingProviderName: 'Julius Hibbert, MD',
        resultTimestampDisplay: 'Sep 15, 2025 3:00 PM',
        prioritizedInstantISO: '2025-09-15T15:00:00',
        prioritizedInstantDisplay: 'Sep 15, 2025 3:00 PM',
        latestUpdateInstantISO: '2025-09-15T15:00:00',
        collectionTimestampsDisplay: 'Sep 15, 2025 2:30 PM',
        specimensDisplay: '',
        resultStatus: 'Final',
        resultingLab: {
          name: 'Springfield General Hospital Radiology',
          address: ['123 Main Street', 'Springfield, NT 49007'],
          phoneNumber: '(555) 636-3000',
          labDirector: 'Julius Hibbert, MD',
          cliaNumber: '',
        },
        resultType: 'IMAGING',
        read: 'Read',
      },
      resultComponents: [],
      studyResult: {
        narrative: {
          isRTF: false,
          hasContent: true,
          contentAsString: 'FINDINGS: CT of the head without contrast. Multiple radiopaque foreign bodies identified within the cranial vault, consistent with crayon-shaped objects (at least 16 individual crayons). No acute intracranial hemorrhage. No midline shift. Ventricles are normal in size and configuration. Gray-white matter differentiation is preserved. No acute fracture identified.',
          contentAsHtml: '<p>FINDINGS: CT of the head without contrast. Multiple radiopaque foreign bodies identified within the cranial vault, consistent with crayon-shaped objects (at least 16 individual crayons). No acute intracranial hemorrhage. No midline shift. Ventricles are normal in size and configuration. Gray-white matter differentiation is preserved. No acute fracture identified.</p>',
          signingInstantTimestamp: '2025-09-15T15:00:00Z',
        },
        impression: {
          isRTF: false,
          hasContent: true,
          contentAsString: 'IMPRESSION: 1. Multiple crayon-shaped foreign bodies within the cranial vault, unchanged from prior X-ray. 2. No acute intracranial abnormality. 3. Recommend continued monitoring. Patient declines surgical removal stating "the crayons keep me creative."',
          contentAsHtml: '<p>IMPRESSION: 1. Multiple crayon-shaped foreign bodies within the cranial vault, unchanged from prior X-ray. 2. No acute intracranial abnormality. 3. Recommend continued monitoring. Patient declines surgical removal stating "the crayons keep me creative."</p>',
          signingInstantTimestamp: '2025-09-15T15:00:00Z',
        },
        combinedRTFNarrativeImpression: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '', signingInstantTimestamp: '' },
        addenda: [],
        transcriptions: [],
        ecgDiagnosis: [],
        hasStudyContent: true,
      },
      shouldHideHistoricalData: false,
      resultNote: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '', signingInstantTimestamp: '' },
      reportDetails: {
        isDownloadablePDFReport: false,
        reportID: 'RPT-CT-001',
        openRemotely: false,
        reportContext: '',
        reportVars: { ordId: 'ORD-CT-001', ordDat: 'ORD-CT-001-DAT' },
      },
      // Mass General Brigham shape: the viewer link is a structured fdiLink on
      // the result — the report HTML carries no data-fdi-context at all. The
      // X-ray result below keeps the data-fdi-context shape, so both viewer
      // discovery paths stay covered.
      fdiLink: { redirectUrl: '/Extensibility/Redirection/FdiRedirection?fdi=FDI-CT-001&ord=ORD-CT-001' },
      scans: [],
      imageStudies: [
        {
          studyId: ctImaging.studyUID,
          studyDescription: 'CT Head without Contrast',
          studyDate: '2025-09-15',
          modality: 'CT',
          viewerUrl: '',
          numberOfImages: 9,
        },
      ],
      indicators: [],
      geneticProfileLink: '',
      shareEverywhereLogin: false,
      showProviderNotReviewed: false,
      providerComments: [],
      resultLetter: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '', signingInstantTimestamp: '' },
      warningType: '',
      warningMessage: '',
      variants: [],
      tooManyVariants: false,
      hasComment: false,
      hasAllDetails: true,
      isAbnormal: false,
    },
  ],
  orderLimitReached: false,
  ordersDeduplicated: false,
  hideEncInfo: false,
};

// No data-fdi-context here on purpose: the CT result advertises its viewer
// via the structured fdiLink above (the Mass General Brigham shape).
export const ctReportContent = {
  reportContent: `<div class="report-content"><h3>CT Head without Contrast</h3><p>FINDINGS: Multiple radiopaque foreign bodies within cranial vault consistent with crayons (at least 16).</p></div>`,
  reportCss: '',
};

// Report content HTML with data-fdi-context for image viewer access
export const imagingReportContent = {
  reportContent: `<div class="report-content"><h3>XR Skull 2 Views</h3><p>FINDINGS: Multiple radiopaque foreign bodies within cranial vault consistent with crayons.</p><div data-fdi-context='${JSON.stringify({ fdi: 'FDI-XRAY-001', ord: 'ORD-XRAY-001' })}'><a href="#">View Images</a></div></div>`,
  reportCss: '',
};

// ─── Clinical Notes (Shared Notes tab) ──────────────────────────────
//
// Each past visit can have multiple clinical notes (operative, anesthesia,
// progress, etc.). The scraper at scrapers/myChart/notes/notes.ts hits
// /api/visit-notes/GetVisitNotes with a CSN and gets back a list of notes,
// then fetches each note body via /api/report-content/LoadReportContent
// with reportMnemonic=OPEN_NOTES.

export const visitNotesByCsn: Record<string, {
  lrpID: string;
  depPhoneNumber: string;
  isAtLeastOneNoteSensitive: boolean;
  noteList: Array<{
    hnoID: string;
    hnoDAT: string;
    displayName: string;
    iso: string;
    isAddendum: boolean;
    isNoteSensitive: boolean;
    provider: { name: string; magicID: string };
  }>;
}> = {
  // ER Visit - Donut Incident (3 notes: triage, attending, discharge summary)
  'CSN-HOMER-003': {
    lrpID: 'LRP-HOMER-003',
    depPhoneNumber: '555-0123',
    isAtLeastOneNoteSensitive: false,
    noteList: [
      {
        hnoID: 'HNO-HOMER-003-A',
        hnoDAT: '67890',
        displayName: 'ED Triage Note',
        iso: '2025-11-20T14:15:00Z',
        isAddendum: false,
        isNoteSensitive: false,
        provider: { name: 'Nick Riviera, MD', magicID: 'PROV-NICK' },
      },
      {
        hnoID: 'HNO-HOMER-003-B',
        hnoDAT: '67891',
        displayName: 'ED Provider Note',
        iso: '2025-11-20T15:00:00Z',
        isAddendum: false,
        isNoteSensitive: false,
        provider: { name: 'Nick Riviera, MD', magicID: 'PROV-NICK' },
      },
      {
        hnoID: 'HNO-HOMER-003-C',
        hnoDAT: '67892',
        displayName: 'Discharge Summary',
        iso: '2025-11-20T18:30:00Z',
        isAddendum: false,
        isNoteSensitive: false,
        provider: { name: 'Nick Riviera, MD', magicID: 'PROV-NICK' },
      },
    ],
  },
  // Annual Physical (1 note)
  'CSN-HOMER-002': {
    lrpID: 'LRP-HOMER-002',
    depPhoneNumber: '555-0100',
    isAtLeastOneNoteSensitive: false,
    noteList: [
      {
        hnoID: 'HNO-HOMER-002-A',
        hnoDAT: '67800',
        displayName: 'Progress Note',
        iso: '2026-01-10T09:30:00Z',
        isAddendum: false,
        isNoteSensitive: false,
        provider: { name: 'Julius Hibbert, MD', magicID: 'PROV-HIBBERT' },
      },
    ],
  },
  // Radiation Screening (no notes - empty list to verify 'no notes' path)
  'CSN-HOMER-004': {
    lrpID: 'LRP-HOMER-004',
    depPhoneNumber: '555-0100',
    isAtLeastOneNoteSensitive: false,
    noteList: [],
  },
};

// Keyed on hnoID. Returned by /api/report-content/LoadReportContent with
// reportMnemonic=OPEN_NOTES.
export const noteContent: Record<string, { reportContent: string; reportCss: string }> = {
  'HNO-HOMER-003-A': {
    reportContent: '<div class="note-body"><h3>ED Triage Note</h3><p><strong>Patient:</strong> Homer J. Simpson</p><p><strong>Chief Complaint:</strong> Severe abdominal pain.</p><p><strong>Triage Vitals:</strong> BP 158/95, HR 110, Temp 98.4F, SpO2 99%.</p><p><strong>HPI:</strong> 69yo male presents with acute abdominal distress after reported ingestion of 48 donuts in a single sitting at Lard Lad Donuts. Pain onset 30 min prior to arrival.</p><p><strong>Triage:</strong> ESI Level 3.</p></div>',
    reportCss: '',
  },
  'HNO-HOMER-003-B': {
    reportContent: '<div class="note-body"><h3>ED Provider Note</h3><p><strong>Patient:</strong> Homer J. Simpson</p><p><strong>Provider:</strong> Nick Riviera, MD</p><p><strong>Assessment:</strong> Acute gastric distention secondary to massive caloric overload. No signs of perforation on imaging. No peritoneal signs.</p><p><strong>Plan:</strong> NPO. IV fluids. Antiemetic. Observation. Surgical consult not indicated at this time. If symptoms worsen, repeat imaging.</p></div>',
    reportCss: '',
  },
  'HNO-HOMER-003-C': {
    reportContent: '<div class="note-body"><h3>Discharge Summary</h3><p><strong>Patient:</strong> Homer J. Simpson</p><p><strong>Disposition:</strong> Discharged home in stable condition.</p><p><strong>Discharge Instructions:</strong> Clear liquid diet for 24 hours, advance as tolerated. Avoid donuts. Follow up with PCP within one week.</p><p><strong>Discharge Medications:</strong> Ondansetron 4mg PRN nausea.</p></div>',
    reportCss: '',
  },
  'HNO-HOMER-002-A': {
    reportContent: '<div class="note-body"><h3>Progress Note - Annual Physical</h3><p><strong>Patient:</strong> Homer J. Simpson, age 69</p><p><strong>Provider:</strong> Julius Hibbert, MD</p><p><strong>Subjective:</strong> Patient reports overall feeling well. No acute complaints. Continues to work at Springfield Nuclear Power Plant.</p><p><strong>Objective:</strong> BP 145/95, HR 88, BMI 35.3 (obese).</p><p><strong>Assessment:</strong> Obesity. Hypertension, not at goal. Hypercholesterolemia.</p><p><strong>Plan:</strong> Reinforce dietary counseling. Continue current medications. Return in 3 months for re-evaluation.</p></div>',
    reportCss: '',
  },
};

// Keyed on CSN. Returned by /api/report-content/LoadReportContent with
// reportMnemonic=AMB_AVS (After Visit Summary).
export const avsByCsn: Record<string, { reportContent: string; reportCss: string }> = {
  'CSN-HOMER-002': {
    reportContent: '<div class="avs-body"><h2>After Visit Summary</h2><p><strong>Patient:</strong> Homer J. Simpson</p><p><strong>Visit Date:</strong> January 10, 2026</p><p><strong>Provider:</strong> Julius Hibbert, MD</p><p><strong>Reason for Visit:</strong> Annual Physical</p><h3>What we discussed today</h3><ul><li>Weight management - referred to dietitian</li><li>Blood pressure not at goal - continue current medications</li><li>Lipid panel results - reviewed</li></ul><h3>Medications</h3><ul><li>Lisinopril 10mg daily</li><li>Atorvastatin 20mg daily</li></ul><h3>Next Steps</h3><p>Follow up in 3 months. Schedule lipid panel before next visit.</p></div>',
    reportCss: '',
  },
  'CSN-HOMER-003': {
    reportContent: '<div class="avs-body"><h2>After Visit Summary</h2><p><strong>Patient:</strong> Homer J. Simpson</p><p><strong>Visit Date:</strong> November 20, 2025</p><p><strong>Provider:</strong> Nick Riviera, MD</p><p><strong>Reason for Visit:</strong> ER - Acute abdominal distress</p><h3>Discharge Instructions</h3><ul><li>Clear liquid diet for 24 hours</li><li>Avoid donuts and other large-volume meals</li><li>Return to ER if pain worsens, vomiting blood, or fever develops</li></ul><h3>Medications Prescribed</h3><ul><li>Ondansetron 4mg PRN nausea (10 tablets)</li></ul><h3>Follow Up</h3><p>Schedule appointment with PCP (Dr. Hibbert) within one week.</p></div>',
    reportCss: '',
  },
  'CSN-HOMER-004': {
    reportContent: '<div class="avs-body"><h2>After Visit Summary</h2><p><strong>Patient:</strong> Homer J. Simpson</p><p><strong>Visit Date:</strong> August 5, 2025</p><p><strong>Provider:</strong> Julius Hibbert, MD</p><p><strong>Reason for Visit:</strong> Radiation Exposure Screening (occupational)</p><h3>Findings</h3><p>Routine screening for Springfield Nuclear Power Plant Sector 7G employee. No acute findings. CBC within normal limits.</p><h3>Follow Up</h3><p>Next annual screening due August 2026.</p></div>',
    reportCss: '',
  },
};
