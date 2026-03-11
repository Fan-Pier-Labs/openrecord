// Realistic fake data for demo mode — matches all scraper return types

export const demoData = {
  profile: {
    name: 'Sarah M. Johnson',
    dob: '04/15/1988',
    mrn: 'MRN-7834521',
    pcp: 'Dr. Emily Chen, MD',
  },
  email: 'sarah.johnson@email.com',

  healthSummary: {
    patientAge: '37',
    height: { value: '5\' 6"', dateRecorded: '01/10/2026' },
    weight: { value: '142 lbs', dateRecorded: '01/10/2026' },
    bloodType: 'O+',
    patientFirstName: 'Sarah',
    lastVisit: { date: '01/10/2026', visitType: 'Office Visit' },
  },

  medications: {
    medications: [
      {
        name: 'Lisinopril 10mg tablet',
        commonName: 'Lisinopril',
        sig: 'Take 1 tablet by mouth once daily',
        dateToDisplay: '03/15/2025',
        startDate: '03/15/2025',
        authorizingProviderName: 'Dr. Emily Chen',
        orderingProviderName: 'Dr. Emily Chen',
        isRefillable: true,
        isPatientReported: false,
        pharmacy: { name: 'CVS Pharmacy #4821', phoneNumber: '(617) 555-0142', formattedAddress: ['123 Main St', 'Boston, MA 02101'] },
        refillDetails: { writtenDispenseQuantity: '90', daySupply: '90' },
      },
      {
        name: 'Atorvastatin 20mg tablet',
        commonName: 'Lipitor',
        sig: 'Take 1 tablet by mouth at bedtime',
        dateToDisplay: '06/01/2025',
        startDate: '06/01/2025',
        authorizingProviderName: 'Dr. Emily Chen',
        orderingProviderName: 'Dr. Emily Chen',
        isRefillable: true,
        isPatientReported: false,
        pharmacy: { name: 'CVS Pharmacy #4821', phoneNumber: '(617) 555-0142', formattedAddress: ['123 Main St', 'Boston, MA 02101'] },
        refillDetails: { writtenDispenseQuantity: '90', daySupply: '90' },
      },
      {
        name: 'Cetirizine 10mg tablet',
        commonName: 'Zyrtec',
        sig: 'Take 1 tablet by mouth once daily as needed',
        dateToDisplay: '09/20/2025',
        startDate: '09/20/2025',
        authorizingProviderName: 'Dr. Emily Chen',
        orderingProviderName: 'Dr. Emily Chen',
        isRefillable: false,
        isPatientReported: true,
        pharmacy: null,
        refillDetails: null,
      },
    ],
    patientFirstName: 'Sarah',
  },

  allergies: {
    allergies: [
      { name: 'Penicillin', id: 'ALG-001', formattedDateNoted: '05/12/2010', type: 'Medication', reaction: 'Hives, Rash', severity: 'Moderate' },
      { name: 'Sulfa drugs', id: 'ALG-002', formattedDateNoted: '08/03/2015', type: 'Medication', reaction: 'Nausea', severity: 'Mild' },
      { name: 'Shellfish', id: 'ALG-003', formattedDateNoted: '01/20/2018', type: 'Food', reaction: 'Anaphylaxis', severity: 'Severe' },
    ],
    allergiesStatus: 1,
  },

  immunizations: [
    { name: 'COVID-19 Vaccine (Pfizer)', id: 'IMM-001', administeredDates: ['01/15/2021', '02/12/2021', '11/05/2021', '10/15/2023'], organizationName: 'Example Health Group' },
    { name: 'Influenza Vaccine', id: 'IMM-002', administeredDates: ['10/01/2025', '09/28/2024', '10/05/2023'], organizationName: 'Example Health Group' },
    { name: 'Tdap (Tetanus, Diphtheria, Pertussis)', id: 'IMM-003', administeredDates: ['03/10/2020'], organizationName: 'Example Health Group' },
    { name: 'Hepatitis B Vaccine', id: 'IMM-004', administeredDates: ['06/01/1988', '07/01/1988', '12/01/1988'], organizationName: 'Children\'s Hospital' },
  ],

  insurance: {
    coverages: [
      { planName: 'Blue Cross Blue Shield PPO', subscriberName: 'Sarah M. Johnson', memberId: 'XYZ123456789', groupNumber: 'GRP-88421', details: ['Effective: 01/01/2025', 'Copay: $25 PCP / $50 Specialist'] },
      { planName: 'Delta Dental Premier', subscriberName: 'Sarah M. Johnson', memberId: 'DDT987654', groupNumber: 'GRP-55102', details: ['Effective: 01/01/2025', 'Annual Maximum: $2,000'] },
    ],
    hasCoverages: true,
  },

  careTeam: [
    { name: 'Emily Chen, MD', role: 'Primary Care Provider', specialty: 'Internal Medicine' },
    { name: 'James Park, MD', role: 'Specialist', specialty: 'Cardiology' },
    { name: 'Maria Santos, NP', role: 'Nurse Practitioner', specialty: 'Women\'s Health' },
    { name: 'Robert Kim, MD', role: 'Specialist', specialty: 'Ophthalmology' },
  ],

  referrals: [
    {
      internalId: 'REF-101', externalId: 'EXT-2025-001', status: 'active', statusString: 'Active',
      creationDate: '12/01/2025', startDate: '12/15/2025', endDate: '06/15/2026',
      referredByProviderName: 'Dr. Emily Chen', referredToProviderName: 'Dr. James Park', referredToFacility: 'Boston Heart Center',
    },
    {
      internalId: 'REF-102', externalId: 'EXT-2025-002', status: 'completed', statusString: 'Completed',
      creationDate: '08/15/2025', startDate: '09/01/2025', endDate: '12/01/2025',
      referredByProviderName: 'Dr. Emily Chen', referredToProviderName: 'Dr. Robert Kim', referredToFacility: 'New England Eye Center',
    },
  ],

  letters: [
    { dateISO: '2026-01-15', reason: 'Annual Physical Results', viewed: true, providerName: 'Dr. Emily Chen', providerPhotoUrl: '', hnoId: 'HNO-001', csn: 'CSN-001' },
    { dateISO: '2025-11-20', reason: 'Cardiology Follow-up', viewed: true, providerName: 'Dr. James Park', providerPhotoUrl: '', hnoId: 'HNO-002', csn: 'CSN-002' },
    { dateISO: '2026-02-10', reason: 'Lab Results Discussion', viewed: false, providerName: 'Dr. Emily Chen', providerPhotoUrl: '', hnoId: 'HNO-003', csn: 'CSN-003' },
  ],

  healthIssues: [
    { name: 'Essential Hypertension', id: 'HI-001', formattedDateNoted: '03/15/2025', isReadOnly: true },
    { name: 'Hyperlipidemia', id: 'HI-002', formattedDateNoted: '06/01/2025', isReadOnly: true },
    { name: 'Seasonal Allergies', id: 'HI-003', formattedDateNoted: '04/10/2020', isReadOnly: false },
  ],

  preventiveCare: [
    { name: 'Mammogram', status: 'not_due' as const, overdueSince: '', notDueUntil: '04/15/2027', previouslyDone: ['04/15/2025'], completedDate: '' },
    { name: 'Colonoscopy', status: 'not_due' as const, overdueSince: '', notDueUntil: '04/15/2028', previouslyDone: [], completedDate: '' },
    { name: 'Flu Shot', status: 'overdue' as const, overdueSince: '10/01/2026', notDueUntil: '', previouslyDone: ['10/01/2025', '09/28/2024'], completedDate: '' },
    { name: 'Dental Cleaning', status: 'completed' as const, overdueSince: '', notDueUntil: '', previouslyDone: [], completedDate: '01/05/2026' },
  ],

  medicalHistory: {
    medicalHistory: {
      diagnoses: [
        { diagnosisName: 'Essential Hypertension', diagnosisDate: '03/15/2025' },
        { diagnosisName: 'Hyperlipidemia', diagnosisDate: '06/01/2025' },
        { diagnosisName: 'Mild Intermittent Asthma', diagnosisDate: '09/10/2015' },
      ],
      notes: 'Patient manages conditions with medication and lifestyle modifications.',
    },
    surgicalHistory: {
      surgeries: [
        { surgeryName: 'Appendectomy', surgeryDate: '07/22/2012' },
        { surgeryName: 'Wisdom Teeth Extraction', surgeryDate: '03/15/2008' },
      ],
      notes: '',
    },
    familyHistory: {
      familyMembers: [
        { relationshipToPatientName: 'Father', statusName: 'Living', conditions: ['Type 2 Diabetes', 'Hypertension'] },
        { relationshipToPatientName: 'Mother', statusName: 'Living', conditions: ['Breast Cancer (age 62, treated)'] },
        { relationshipToPatientName: 'Maternal Grandmother', statusName: 'Deceased', conditions: ['Heart Disease', 'Stroke'] },
      ],
    },
  },

  vitals: [
    {
      name: 'Blood Pressure', flowsheetId: 'FS-BP',
      readings: [
        { date: '01/10/2026', value: '128/82', units: 'mmHg' },
        { date: '10/15/2025', value: '132/85', units: 'mmHg' },
        { date: '07/20/2025', value: '135/88', units: 'mmHg' },
        { date: '04/10/2025', value: '140/90', units: 'mmHg' },
      ],
    },
    {
      name: 'Heart Rate', flowsheetId: 'FS-HR',
      readings: [
        { date: '01/10/2026', value: '72', units: 'bpm' },
        { date: '10/15/2025', value: '75', units: 'bpm' },
        { date: '07/20/2025', value: '78', units: 'bpm' },
      ],
    },
    {
      name: 'Weight', flowsheetId: 'FS-WT',
      readings: [
        { date: '01/10/2026', value: '142', units: 'lbs' },
        { date: '10/15/2025', value: '145', units: 'lbs' },
        { date: '07/20/2025', value: '148', units: 'lbs' },
      ],
    },
    {
      name: 'BMI', flowsheetId: 'FS-BMI',
      readings: [
        { date: '01/10/2026', value: '22.9', units: 'kg/m²' },
        { date: '10/15/2025', value: '23.4', units: 'kg/m²' },
      ],
    },
  ],

  emergencyContacts: [
    { name: 'Michael Johnson', relationshipType: 'Spouse', phoneNumber: '(617) 555-0198', isEmergencyContact: true },
    { name: 'Linda Thompson', relationshipType: 'Mother', phoneNumber: '(508) 555-0234', isEmergencyContact: true },
  ],

  documents: [
    { id: 'DOC-001', title: 'After Visit Summary - Annual Physical', documentType: 'AVS', date: '01/10/2026', providerName: 'Dr. Emily Chen', organizationName: 'Example Health Group' },
    { id: 'DOC-002', title: 'Cardiology Consultation Note', documentType: 'Clinical Note', date: '12/20/2025', providerName: 'Dr. James Park', organizationName: 'Boston Heart Center' },
    { id: 'DOC-003', title: 'Discharge Instructions', documentType: 'Discharge', date: '07/22/2025', providerName: 'Dr. Emily Chen', organizationName: 'Example Health Group' },
  ],

  goals: {
    careTeamGoals: [
      { name: 'Lower Blood Pressure', description: 'Target: below 130/80 mmHg through medication and diet changes', status: 'In Progress', startDate: '03/15/2025', targetDate: '09/15/2026', source: 'care_team' as const },
      { name: 'Reduce LDL Cholesterol', description: 'Target: LDL below 100 mg/dL with statin therapy', status: 'In Progress', startDate: '06/01/2025', targetDate: '06/01/2026', source: 'care_team' as const },
    ],
    patientGoals: [
      { name: 'Walk 10,000 steps daily', description: 'Gradually increase daily activity to 10K steps', status: 'In Progress', startDate: '01/01/2026', targetDate: '06/01/2026', source: 'patient' as const },
      { name: 'Reduce sodium intake', description: 'Limit sodium to less than 2,300mg per day', status: 'In Progress', startDate: '03/15/2025', targetDate: '03/15/2026', source: 'patient' as const },
    ],
  },

  upcomingOrders: [
    { orderName: 'Comprehensive Metabolic Panel', orderType: 'Lab', status: 'Ordered', orderedDate: '01/10/2026', orderedByProvider: 'Dr. Emily Chen', facilityName: 'Example Health Group Lab' },
    { orderName: 'Lipid Panel', orderType: 'Lab', status: 'Ordered', orderedDate: '01/10/2026', orderedByProvider: 'Dr. Emily Chen', facilityName: 'Example Health Group Lab' },
    { orderName: 'Chest X-Ray', orderType: 'Imaging', status: 'Scheduled', orderedDate: '02/01/2026', orderedByProvider: 'Dr. James Park', facilityName: 'Boston Imaging Center' },
  ],

  questionnaires: [
    { id: 'Q-001', name: 'Pre-Visit Health Screening', status: 'Pending', dueDate: '03/15/2026', completedDate: '' },
    { id: 'Q-002', name: 'PHQ-9 Depression Screening', status: 'Completed', dueDate: '01/10/2026', completedDate: '01/10/2026' },
    { id: 'Q-003', name: 'Annual Wellness Questionnaire', status: 'Completed', dueDate: '01/10/2026', completedDate: '01/08/2026' },
  ],

  careJourneys: [
    { id: 'CJ-001', name: 'Heart Health Management', description: 'Ongoing cardiovascular risk management program with regular monitoring', status: 'Active', providerName: 'Dr. James Park' },
  ],

  activityFeed: [
    { id: 'AF-001', title: 'New Lab Results Available', description: 'Your Comprehensive Metabolic Panel results are ready to view', date: '02/28/2026', type: 'lab_result', isRead: false },
    { id: 'AF-002', title: 'Message from Dr. Chen', description: 'Re: Follow-up on blood pressure readings', date: '02/25/2026', type: 'message', isRead: true },
    { id: 'AF-003', title: 'Upcoming Appointment Reminder', description: 'Annual Physical with Dr. Chen on 03/15/2026', date: '02/20/2026', type: 'appointment', isRead: true },
    { id: 'AF-004', title: 'Prescription Refill Ready', description: 'Your Lisinopril refill is ready for pickup at CVS Pharmacy', date: '02/15/2026', type: 'medication', isRead: true },
    { id: 'AF-005', title: 'New Letter Available', description: 'Letter from Dr. Park regarding cardiology follow-up', date: '02/10/2026', type: 'letter', isRead: false },
  ],

  educationMaterials: [
    { id: 'ED-001', title: 'Managing High Blood Pressure', category: 'Cardiovascular', assignedDate: '03/15/2025', providerName: 'Dr. Emily Chen' },
    { id: 'ED-002', title: 'Understanding Your Cholesterol Numbers', category: 'Cardiovascular', assignedDate: '06/01/2025', providerName: 'Dr. Emily Chen' },
    { id: 'ED-003', title: 'Heart-Healthy Diet Guide', category: 'Nutrition', assignedDate: '01/10/2026', providerName: 'Dr. James Park' },
  ],

  ehiExport: [
    { id: 'EHI-001', name: 'Full Health Record Export', description: 'Complete patient health record in standard format', format: 'C-CDA' },
    { id: 'EHI-002', name: 'Lab Results Export', description: 'Laboratory results in structured format', format: 'FHIR' },
  ],

  imagingResults: [
    {
      orderName: 'Chest X-Ray (PA and Lateral)', key: 'IMG-001',
      narrative: 'FINDINGS: The lungs are clear bilaterally. No pleural effusion or pneumothorax. The cardiac silhouette is normal in size. The mediastinal contours are within normal limits. No acute osseous abnormalities.',
      impression: 'Normal chest radiograph. No acute cardiopulmonary disease.',
      imageStudyCount: 2, scanCount: 0, resultDate: '11/15/2025', orderProvider: 'Dr. James Park',
    },
    {
      orderName: 'MRI Brain without Contrast', key: 'IMG-002',
      narrative: 'FINDINGS: No evidence of acute intracranial hemorrhage, mass effect, or midline shift. The ventricles and sulci are normal in size and configuration. The gray-white matter differentiation is preserved. No abnormal enhancement is seen.',
      impression: 'Normal MRI of the brain. No acute intracranial abnormality.',
      imageStudyCount: 4, scanCount: 1, resultDate: '08/20/2025', orderProvider: 'Dr. Emily Chen',
    },
  ],

  billing: [
    {
      guarantorNumber: '1001',
      patientName: 'Sarah M. Johnson',
      amountDue: 125.50,
      billingDetails: {
        Data: {
          UnifiedVisitList: [
            {
              StartDateDisplay: '01/10/2026',
              Description: 'Office Visit - Annual Physical',
              Provider: 'Dr. Emily Chen',
              ChargeAmount: '$350.00',
              SelfAmountDue: '$25.00',
              PrimaryPayer: 'Blue Cross Blue Shield',
              ProcedureList: [
                { Description: 'Preventive Visit, Est Patient', Amount: '$250.00', SelfAmountDue: '$0.00' },
                { Description: 'Venipuncture', Amount: '$35.00', SelfAmountDue: '$0.00' },
                { Description: 'Comprehensive Metabolic Panel', Amount: '$65.00', SelfAmountDue: '$25.00' },
              ],
            },
            {
              StartDateDisplay: '12/20/2025',
              Description: 'Cardiology Consultation',
              Provider: 'Dr. James Park',
              ChargeAmount: '$425.00',
              SelfAmountDue: '$50.00',
              PrimaryPayer: 'Blue Cross Blue Shield',
              ProcedureList: [
                { Description: 'Office Visit, Level 4', Amount: '$325.00', SelfAmountDue: '$50.00' },
                { Description: 'ECG, 12-Lead', Amount: '$100.00', SelfAmountDue: '$0.00' },
              ],
            },
          ],
          InformationalVisitList: [
            {
              StartDateDisplay: '11/15/2025',
              Description: 'Chest X-Ray',
              Provider: 'Dr. James Park',
              ChargeAmount: '$175.00',
              SelfAmountDue: '$50.50',
              PrimaryPayer: 'Blue Cross Blue Shield',
              ProcedureList: [],
            },
          ],
        },
      },
    },
  ],

  upcomingVisits: {
    LaterVisitsList: [
      {
        Date: '04/15/2026',
        Time: '2:30 PM',
        VisitTypeName: 'Follow-up Visit',
        PrimaryProviderName: 'Dr. James Park',
        PrimaryDepartment: { Name: 'Boston Heart Center' },
      },
    ],
    NextNDaysVisits: [
      {
        Date: '03/15/2026',
        Time: '9:00 AM',
        VisitTypeName: 'Annual Physical',
        PrimaryProviderName: 'Dr. Emily Chen',
        PrimaryDepartment: { Name: 'Example Health Group - Primary Care' },
      },
    ],
    InProgressVisits: [],
  },

  pastVisits: {
    List: {
      org1: {
        List: [
          { Date: '01/10/2026', Time: '10:00 AM', VisitTypeName: 'Office Visit', PrimaryProviderName: 'Dr. Emily Chen', PrimaryDepartment: { Name: 'Example Health Group' } },
          { Date: '12/20/2025', Time: '1:30 PM', VisitTypeName: 'Cardiology Consultation', PrimaryProviderName: 'Dr. James Park', PrimaryDepartment: { Name: 'Boston Heart Center' } },
          { Date: '11/15/2025', Time: '11:00 AM', VisitTypeName: 'Imaging', PrimaryProviderName: 'Dr. James Park', PrimaryDepartment: { Name: 'Boston Imaging Center' } },
          { Date: '10/15/2025', Time: '9:30 AM', VisitTypeName: 'Office Visit', PrimaryProviderName: 'Dr. Emily Chen', PrimaryDepartment: { Name: 'Example Health Group' } },
          { Date: '07/20/2025', Time: '2:00 PM', VisitTypeName: 'Office Visit', PrimaryProviderName: 'Dr. Emily Chen', PrimaryDepartment: { Name: 'Example Health Group' } },
        ],
      },
    },
  },

  labResults: [
    {
      orderName: 'Comprehensive Metabolic Panel',
      results: [
        {
          orderMetadata: { resultTimestampDisplay: '02/28/2026 8:30 AM', orderProviderName: 'Dr. Emily Chen' },
          resultComponents: [
            { componentInfo: { name: 'Glucose', units: 'mg/dL' }, componentResultInfo: { value: '95', referenceRange: { formattedReferenceRange: '70-100' }, abnormalFlagCategoryValue: 0 } },
            { componentInfo: { name: 'BUN', units: 'mg/dL' }, componentResultInfo: { value: '18', referenceRange: { formattedReferenceRange: '7-20' }, abnormalFlagCategoryValue: 0 } },
            { componentInfo: { name: 'Creatinine', units: 'mg/dL' }, componentResultInfo: { value: '0.9', referenceRange: { formattedReferenceRange: '0.6-1.2' }, abnormalFlagCategoryValue: 0 } },
            { componentInfo: { name: 'Sodium', units: 'mEq/L' }, componentResultInfo: { value: '140', referenceRange: { formattedReferenceRange: '136-145' }, abnormalFlagCategoryValue: 0 } },
            { componentInfo: { name: 'Potassium', units: 'mEq/L' }, componentResultInfo: { value: '4.2', referenceRange: { formattedReferenceRange: '3.5-5.0' }, abnormalFlagCategoryValue: 0 } },
          ],
        },
      ],
    },
    {
      orderName: 'Lipid Panel',
      results: [
        {
          orderMetadata: { resultTimestampDisplay: '02/28/2026 8:30 AM', orderProviderName: 'Dr. Emily Chen' },
          resultComponents: [
            { componentInfo: { name: 'Total Cholesterol', units: 'mg/dL' }, componentResultInfo: { value: '215', referenceRange: { formattedReferenceRange: '<200' }, abnormalFlagCategoryValue: 1 } },
            { componentInfo: { name: 'LDL Cholesterol', units: 'mg/dL' }, componentResultInfo: { value: '132', referenceRange: { formattedReferenceRange: '<100' }, abnormalFlagCategoryValue: 1 } },
            { componentInfo: { name: 'HDL Cholesterol', units: 'mg/dL' }, componentResultInfo: { value: '58', referenceRange: { formattedReferenceRange: '>40' }, abnormalFlagCategoryValue: 0 } },
            { componentInfo: { name: 'Triglycerides', units: 'mg/dL' }, componentResultInfo: { value: '125', referenceRange: { formattedReferenceRange: '<150' }, abnormalFlagCategoryValue: 0 } },
          ],
        },
      ],
    },
    {
      orderName: 'Complete Blood Count (CBC)',
      results: [
        {
          orderMetadata: { resultTimestampDisplay: '01/10/2026 9:15 AM', orderProviderName: 'Dr. Emily Chen' },
          resultComponents: [
            { componentInfo: { name: 'WBC', units: 'K/uL' }, componentResultInfo: { value: '6.8', referenceRange: { formattedReferenceRange: '4.5-11.0' }, abnormalFlagCategoryValue: 0 } },
            { componentInfo: { name: 'RBC', units: 'M/uL' }, componentResultInfo: { value: '4.5', referenceRange: { formattedReferenceRange: '3.8-5.1' }, abnormalFlagCategoryValue: 0 } },
            { componentInfo: { name: 'Hemoglobin', units: 'g/dL' }, componentResultInfo: { value: '13.8', referenceRange: { formattedReferenceRange: '11.5-15.5' }, abnormalFlagCategoryValue: 0 } },
            { componentInfo: { name: 'Hematocrit', units: '%' }, componentResultInfo: { value: '41.2', referenceRange: { formattedReferenceRange: '34-46' }, abnormalFlagCategoryValue: 0 } },
            { componentInfo: { name: 'Platelets', units: 'K/uL' }, componentResultInfo: { value: '245', referenceRange: { formattedReferenceRange: '150-400' }, abnormalFlagCategoryValue: 0 } },
          ],
        },
      ],
    },
  ],

  messages: {
    conversations: [
      {
        conversationId: 'MSG-001',
        subject: 'Question about blood pressure medication',
        senderName: 'Dr. Emily Chen',
        lastMessageDate: '02/25/2026',
        preview: 'Your recent readings look improved. Let\'s continue...',
        messages: [
          { messageId: 'M001-1', senderName: 'Sarah Johnson', sentDate: '02/20/2026 10:30 AM', messageBody: 'Hi Dr. Chen, I\'ve been monitoring my blood pressure at home and getting readings around 135/85. Is this okay on my current dose of Lisinopril?', isFromPatient: true },
          { messageId: 'M001-2', senderName: 'Dr. Emily Chen', sentDate: '02/22/2026 2:15 PM', messageBody: 'Hi Sarah, those readings are slightly above our target of 130/80. Let\'s give it another 2 weeks of monitoring before considering a dose adjustment. Please continue taking your medication as prescribed and try to limit sodium intake.', isFromPatient: false },
          { messageId: 'M001-3', senderName: 'Sarah Johnson', sentDate: '02/23/2026 9:00 AM', messageBody: 'Thank you, Dr. Chen. I\'ll keep tracking and follow up in two weeks. Should I be concerned about occasional dizziness when standing up quickly?', isFromPatient: true },
          { messageId: 'M001-4', senderName: 'Dr. Emily Chen', sentDate: '02/25/2026 11:45 AM', messageBody: 'Your recent readings look improved. The occasional dizziness can be a side effect of Lisinopril — try standing up slowly. If it becomes frequent or severe, please call the office. Let\'s continue monitoring and I\'ll check in with you at your next appointment.', isFromPatient: false },
        ],
      },
      {
        conversationId: 'MSG-002',
        subject: 'Cardiology referral follow-up',
        senderName: 'Dr. James Park',
        lastMessageDate: '01/20/2026',
        preview: 'Thank you for completing the stress test. Results...',
        messages: [
          { messageId: 'M002-1', senderName: 'Dr. James Park', sentDate: '01/15/2026 3:00 PM', messageBody: 'Hi Sarah, I\'ve reviewed the referral from Dr. Chen regarding your elevated cholesterol levels. I\'d like to schedule a cardiac stress test to get a baseline assessment. Our scheduling team will reach out to you.', isFromPatient: false },
          { messageId: 'M002-2', senderName: 'Sarah Johnson', sentDate: '01/16/2026 8:30 AM', messageBody: 'Thank you, Dr. Park. I completed the stress test yesterday. When should I expect the results?', isFromPatient: true },
          { messageId: 'M002-3', senderName: 'Dr. James Park', sentDate: '01/20/2026 10:00 AM', messageBody: 'Thank you for completing the stress test. Results look normal — no signs of ischemia or abnormal rhythms. Your exercise tolerance was appropriate for your age. I\'ll send a full report to Dr. Chen. Continue with your current medications and lifestyle modifications.', isFromPatient: false },
        ],
      },
      {
        conversationId: 'MSG-003',
        subject: 'Prescription renewal request',
        senderName: 'Nurse Sarah',
        lastMessageDate: '02/15/2026',
        preview: 'Your Lisinopril refill has been sent to CVS...',
        messages: [
          { messageId: 'M003-1', senderName: 'Sarah Johnson', sentDate: '02/13/2026 4:00 PM', messageBody: 'Hi, I\'m running low on my Lisinopril 10mg. Could I get a refill sent to the CVS on Main Street?', isFromPatient: true },
          { messageId: 'M003-2', senderName: 'Nurse Sarah', sentDate: '02/15/2026 9:30 AM', messageBody: 'Your Lisinopril refill has been sent to CVS Pharmacy on Main Street. It should be ready for pickup within 24 hours. If you have any issues, please call us at (555) 123-4567.', isFromPatient: false },
        ],
      },
    ],
  },
};
