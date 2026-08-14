/**
 * Fictional health record used by the OpenRecord public demo.
 *
 * Ported from `web/src/lib/mcp/demo-data.ts` (the demo MCP server) and extended
 * with the extra history the demo needs — multi-draw lab trends, a longer
 * billing ledger, and a couple more conversations — so the AI has something
 * real to reason over.
 *
 * Everything here is invented. Homer Simpson is not a patient.
 */

import type {
  AppointmentOffer,
  BillingCharge,
  Conversation,
  EmergencyContact,
  Insight,
  LabPanel,
  Medication,
  PatientRecord,
  ProxyTarget,
  SeedChat,
  Visit,
} from './types';

export const DEMO_HOSTNAME = 'mychart.springfieldmed.example.org';
export const DEMO_USERNAME = 'homersimpson742';
export const DEMO_ORG = 'Springfield General Hospital';

export const profile = {
  name: 'Homer J. Simpson',
  preferredName: 'Homer',
  dateOfBirth: '05/12/1956',
  sex: 'Male',
  mrn: 'MRN-7704201',
  primaryCareProvider: 'Dr. Julius Hibbert, MD',
  address: '742 Evergreen Terrace, Springfield, IL 62704',
  phone: '(555) 636-7663',
  email: 'homer.simpson@example.com',
};

export const healthSummary = {
  bloodType: 'O+',
  height: '6\'0" (182.9 cm)',
  weight: '260 lbs (117.9 kg)',
  bmi: '35.3',
  bloodPressure: '148/92 mmHg',
  heartRate: '88 bpm',
  lastUpdated: '2026-02-20',
};

export const medications: Medication[] = [
  {
    name: 'Atorvastatin 40mg',
    directions: 'Take 1 tablet by mouth daily at bedtime',
    prescriber: 'Dr. Julius Hibbert',
    pharmacy: 'Springfield Pharmacy',
    refillsRemaining: 3,
    lastFilled: '2026-01-15',
  },
  {
    name: 'Lisinopril 20mg',
    directions: 'Take 1 tablet by mouth daily',
    prescriber: 'Dr. Julius Hibbert',
    pharmacy: 'Springfield Pharmacy',
    refillsRemaining: 2,
    lastFilled: '2026-02-01',
  },
  {
    name: 'Omeprazole 20mg',
    directions: 'Take 1 capsule by mouth daily before breakfast',
    prescriber: 'Dr. Julius Hibbert',
    pharmacy: 'Springfield Pharmacy',
    refillsRemaining: 4,
    lastFilled: '2025-12-10',
  },
  {
    name: 'Metformin 500mg',
    directions: 'Take 1 tablet by mouth twice daily with meals',
    prescriber: 'Dr. Julius Hibbert',
    pharmacy: 'Springfield Pharmacy',
    refillsRemaining: 0,
    lastFilled: '2026-01-20',
  },
];

export const allergies = [
  { allergen: 'Penicillin', reaction: 'Hives, rash', severity: 'Moderate', type: 'Medication' },
  { allergen: 'Shrimp', reaction: 'Facial swelling', severity: 'Severe', type: 'Food' },
];

export const healthIssues = [
  { condition: 'Obesity', status: 'Active', onsetDate: '2000-01-15', provider: 'Dr. Julius Hibbert' },
  { condition: 'High blood pressure', status: 'Active', onsetDate: '2010-03-20', provider: 'Dr. Julius Hibbert' },
  { condition: 'High cholesterol', status: 'Active', onsetDate: '2010-03-20', provider: 'Dr. Julius Hibbert' },
  { condition: 'Type 2 diabetes mellitus', status: 'Active', onsetDate: '2023-11-15', provider: 'Dr. Julius Hibbert' },
  { condition: 'Chronic radiation exposure (nuclear plant, Sector 7-G)', status: 'Active', onsetDate: '1990-08-01', provider: 'Dr. Julius Hibbert' },
  { condition: 'Crayon lodged in brain (frontal lobe, since childhood)', status: 'Resolved', onsetDate: '1972-05-09', provider: 'Dr. Nick Riviera' },
];

export const upcomingVisits: Visit[] = [
  {
    type: 'Office Visit',
    provider: 'Dr. Julius Hibbert',
    department: 'Internal Medicine',
    location: 'Springfield General Hospital, Suite 200',
    date: '2026-03-25',
    time: '10:30 AM',
    status: 'Scheduled',
  },
  {
    type: 'Lab Work',
    provider: 'Lab Services',
    department: 'Laboratory',
    location: 'Springfield General Hospital, 1st Floor',
    date: '2026-03-24',
    time: '8:00 AM',
    status: 'Scheduled',
    instructions: 'Fasting required — nothing to eat or drink (except water) for 12 hours prior.',
  },
];

export const pastVisits = [
  {
    csn: 'WP-demo-csn-physical-2026-01-10',
    type: 'Office Visit',
    provider: 'Dr. Julius Hibbert',
    department: 'Internal Medicine',
    date: '2026-01-10',
    reason: 'Annual Physical',
    diagnoses: ['Obesity (Class II)', 'Hypertension', 'Hyperlipidemia', 'Type 2 Diabetes'],
  },
  {
    csn: 'WP-demo-csn-er-visit-2025-09-14',
    type: 'Emergency Room',
    provider: 'Dr. Nick Riviera',
    department: 'Emergency Medicine',
    date: '2025-09-14',
    reason: 'Chest pain — ruled out cardiac event',
    diagnoses: ['GERD exacerbation'],
  },
  {
    csn: 'WP-demo-csn-diabetes-2025-07-20',
    type: 'Office Visit',
    provider: 'Dr. Julius Hibbert',
    department: 'Internal Medicine',
    date: '2025-07-20',
    reason: 'Diabetes follow-up',
    diagnoses: ['Type 2 Diabetes Mellitus'],
  },
  {
    csn: 'WP-demo-csn-crayon-2024-04-03',
    type: 'Surgical Procedure',
    provider: 'Dr. Nick Riviera',
    department: 'Neurosurgery',
    date: '2024-04-03',
    reason: 'Crayon removal from frontal lobe',
    diagnoses: ['Foreign body, brain'],
  },
];

/**
 * Lab history spans four draws so trends are visible — the "analyze history"
 * skill leans on the repeat out-of-range values rather than a single result.
 */
export const labResults: LabPanel[] = [
  {
    testName: 'Comprehensive Metabolic Panel',
    orderedBy: 'Dr. Julius Hibbert',
    collectedDate: '2026-01-10',
    status: 'Final',
    results: [
      { component: 'Glucose', value: '128', units: 'mg/dL', referenceRange: '70-100', flag: 'High' },
      { component: 'BUN', value: '18', units: 'mg/dL', referenceRange: '7-20', flag: 'Normal' },
      { component: 'Creatinine', value: '1.1', units: 'mg/dL', referenceRange: '0.6-1.2', flag: 'Normal' },
      { component: 'Sodium', value: '141', units: 'mEq/L', referenceRange: '136-145', flag: 'Normal' },
      { component: 'Potassium', value: '4.5', units: 'mEq/L', referenceRange: '3.5-5.1', flag: 'Normal' },
      { component: 'AST', value: '52', units: 'U/L', referenceRange: '10-40', flag: 'High' },
      { component: 'ALT', value: '68', units: 'U/L', referenceRange: '7-56', flag: 'High' },
    ],
  },
  {
    testName: 'Lipid Panel',
    orderedBy: 'Dr. Julius Hibbert',
    collectedDate: '2026-01-10',
    status: 'Final',
    results: [
      { component: 'Total Cholesterol', value: '258', units: 'mg/dL', referenceRange: '<200', flag: 'High' },
      { component: 'LDL Cholesterol', value: '172', units: 'mg/dL', referenceRange: '<130', flag: 'High' },
      { component: 'HDL Cholesterol', value: '34', units: 'mg/dL', referenceRange: '>40', flag: 'Low' },
      { component: 'Triglycerides', value: '260', units: 'mg/dL', referenceRange: '<150', flag: 'High' },
    ],
  },
  {
    testName: 'Hemoglobin A1c',
    orderedBy: 'Dr. Julius Hibbert',
    collectedDate: '2026-01-10',
    status: 'Final',
    results: [{ component: 'HbA1c', value: '7.2', units: '%', referenceRange: '<5.7', flag: 'High' }],
  },
  {
    testName: 'CBC with Differential',
    orderedBy: 'Dr. Julius Hibbert',
    collectedDate: '2026-01-10',
    status: 'Final',
    results: [
      { component: 'WBC', value: '7.2', units: 'K/uL', referenceRange: '4.5-11.0', flag: 'Normal' },
      { component: 'RBC', value: '5.1', units: 'M/uL', referenceRange: '4.5-5.9', flag: 'Normal' },
      { component: 'Hemoglobin', value: '15.2', units: 'g/dL', referenceRange: '13.5-17.5', flag: 'Normal' },
      { component: 'Hematocrit', value: '44.8', units: '%', referenceRange: '38-50', flag: 'Normal' },
      { component: 'Platelets', value: '220', units: 'K/uL', referenceRange: '150-400', flag: 'Normal' },
      { component: 'Ferritin', value: '612', units: 'ng/mL', referenceRange: '24-336', flag: 'High' },
    ],
  },
  {
    testName: 'Iron Studies',
    orderedBy: 'Dr. Julius Hibbert',
    collectedDate: '2025-07-20',
    status: 'Final',
    results: [
      { component: 'Ferritin', value: '588', units: 'ng/mL', referenceRange: '24-336', flag: 'High' },
      { component: 'Serum Iron', value: '191', units: 'ug/dL', referenceRange: '65-175', flag: 'High' },
      { component: 'Transferrin Saturation', value: '58', units: '%', referenceRange: '20-50', flag: 'High' },
    ],
  },
  {
    testName: 'Hemoglobin A1c',
    orderedBy: 'Dr. Julius Hibbert',
    collectedDate: '2025-07-20',
    status: 'Final',
    results: [{ component: 'HbA1c', value: '6.8', units: '%', referenceRange: '<5.7', flag: 'High' }],
  },
  {
    testName: 'Lipid Panel',
    orderedBy: 'Dr. Julius Hibbert',
    collectedDate: '2025-07-20',
    status: 'Final',
    results: [
      { component: 'Total Cholesterol', value: '241', units: 'mg/dL', referenceRange: '<200', flag: 'High' },
      { component: 'LDL Cholesterol', value: '158', units: 'mg/dL', referenceRange: '<130', flag: 'High' },
      { component: 'HDL Cholesterol', value: '36', units: 'mg/dL', referenceRange: '>40', flag: 'Low' },
      { component: 'Triglycerides', value: '235', units: 'mg/dL', referenceRange: '<150', flag: 'High' },
    ],
  },
  {
    testName: 'Comprehensive Metabolic Panel',
    orderedBy: 'Dr. Nick Riviera',
    collectedDate: '2025-09-14',
    status: 'Final',
    results: [
      { component: 'Glucose', value: '141', units: 'mg/dL', referenceRange: '70-100', flag: 'High' },
      { component: 'AST', value: '48', units: 'U/L', referenceRange: '10-40', flag: 'High' },
      { component: 'ALT', value: '61', units: 'U/L', referenceRange: '7-56', flag: 'High' },
      { component: 'Troponin I', value: '<0.01', units: 'ng/mL', referenceRange: '<0.04', flag: 'Normal' },
    ],
  },
  {
    testName: 'Hemoglobin A1c',
    orderedBy: 'Dr. Julius Hibbert',
    collectedDate: '2024-12-02',
    status: 'Final',
    results: [{ component: 'HbA1c', value: '6.4', units: '%', referenceRange: '<5.7', flag: 'High' }],
  },
  {
    testName: 'Iron Studies',
    orderedBy: 'Dr. Julius Hibbert',
    collectedDate: '2024-12-02',
    status: 'Final',
    results: [
      { component: 'Ferritin', value: '549', units: 'ng/mL', referenceRange: '24-336', flag: 'High' },
      { component: 'Serum Iron', value: '184', units: 'ug/dL', referenceRange: '65-175', flag: 'High' },
    ],
  },
];

export const messages: Conversation[] = [
  {
    id: 'msg-001',
    subject: 'Lab Results Available',
    from: 'Dr. Julius Hibbert',
    date: '2026-01-12',
    preview: 'Your lab results from your annual physical are now available. We need to discuss a few things...',
    messages: [
      {
        from: 'Dr. Julius Hibbert',
        date: '2026-01-12',
        body: "Hi Homer, your lab results from your annual physical are in. Your A1c has crept up to 7.2% and your liver enzymes are elevated. Your cholesterol is also still above target despite the Atorvastatin. We really need to talk about diet — and I mean it this time. Please come in for a follow-up. Also, please continue all your current medications.",
      },
      {
        from: 'Homer Simpson',
        date: '2026-01-13',
        body: "Thanks Doc. I'll try to cut back on the donuts. Can I at least keep the ones with sprinkles?",
      },
    ],
  },
  {
    id: 'msg-002',
    subject: 'Prescription Renewal Request',
    from: 'Homer Simpson',
    date: '2025-12-05',
    preview: 'I need a refill on my Omeprazole...',
    messages: [
      {
        from: 'Homer Simpson',
        date: '2025-12-05',
        body: 'Hi Dr. Hibbert, I need a refill on my Omeprazole. The heartburn is really bad when I eat spicy food. My pharmacy is Springfield Pharmacy on Main St. Thanks!',
      },
      {
        from: 'Dr. Julius Hibbert',
        date: '2025-12-05',
        body: "Hi Homer, I've sent the renewal to your pharmacy. It should be ready for pickup tomorrow. Have you considered eating fewer chili dogs? Just a thought!",
      },
    ],
  },
  {
    id: 'msg-003',
    subject: 'Itemized statement request — ER visit',
    from: 'Homer Simpson',
    date: '2025-10-02',
    preview: 'Could I get an itemized statement for the September ER visit...',
    messages: [
      {
        from: 'Homer Simpson',
        date: '2025-10-02',
        body: 'Hi, could I please get an itemized statement for the emergency room visit on 09/14/2025? The $420 balance seems high for a visit where nothing was found. Thanks.',
      },
      {
        from: 'Patient Accounts',
        date: '2025-10-04',
        body: "Hello Mr. Simpson, we've mailed an itemized statement for the 09/14/2025 emergency department encounter. Please allow 7-10 business days for delivery.",
      },
    ],
  },
];

/**
 * Billing ledger. Note the ER visit already has an itemization request in
 * messages (msg-003) — the "find bills to itemize" skill should skip it.
 */
export const billing: BillingCharge[] = [
  {
    date: '2026-01-10',
    description: 'Office Visit — Annual Physical',
    provider: 'Dr. Julius Hibbert',
    totalCharge: '$450.00',
    insurancePaid: '$382.50',
    patientResponsibility: '$67.50',
    status: 'Paid',
  },
  {
    date: '2026-01-10',
    description: 'Laboratory Services',
    provider: 'Springfield General Hospital Lab',
    totalCharge: '$380.00',
    insurancePaid: '$323.00',
    patientResponsibility: '$57.00',
    status: 'Paid',
  },
  {
    date: '2025-09-14',
    description: 'Emergency Room Visit',
    provider: 'Dr. Nick Riviera',
    totalCharge: '$2,800.00',
    insurancePaid: '$2,380.00',
    patientResponsibility: '$420.00',
    status: 'Payment Plan',
  },
  {
    date: '2025-09-14',
    description: 'Radiology — Chest X-Ray, PA and Lateral',
    provider: 'Springfield General Hospital Radiology',
    totalCharge: '$610.00',
    insurancePaid: '$421.00',
    patientResponsibility: '$189.00',
    status: 'Outstanding',
  },
  {
    date: '2025-07-20',
    description: 'Office Visit — Diabetes Follow-Up',
    provider: 'Dr. Julius Hibbert',
    totalCharge: '$285.00',
    insurancePaid: '$243.00',
    patientResponsibility: '$42.00',
    status: 'Paid',
  },
  {
    date: '2024-04-03',
    description: 'Surgical Procedure — Neurosurgery',
    provider: 'Dr. Nick Riviera',
    totalCharge: '$18,400.00',
    insurancePaid: '$15,640.00',
    patientResponsibility: '$2,760.00',
    status: 'Payment Plan',
  },
];

export const careTeam = [
  { name: 'Dr. Julius Hibbert, MD', role: 'Primary Care Provider', specialty: 'Internal Medicine', phone: '(555) 234-5678' },
  { name: 'Dr. Nick Riviera, MD', role: 'Specialist', specialty: 'General Surgery', phone: '(555) 345-6789' },
  { name: 'Nurse Ruth Powers, RN', role: 'Care Coordinator', specialty: 'Nursing', phone: '(555) 234-5680' },
];

export const insurance = [
  {
    plan: 'Springfield Nuclear Power Plant — PPO',
    memberId: 'SNPP-7704201',
    groupNumber: 'GRP-SECTOR7G',
    subscriber: 'Homer J. Simpson',
    effectiveDate: '2025-01-01',
    copay: { office: '$30', specialist: '$50', urgentCare: '$75', er: '$200' },
    deductible: '$1,500 individual',
    outOfPocketMax: '$6,000 individual',
  },
];

export const immunizations = [
  { vaccine: 'Influenza (Flu)', date: '2025-10-15', site: 'Left arm', provider: 'Springfield General Hospital' },
  { vaccine: 'COVID-19 Booster (Pfizer)', date: '2025-09-20', site: 'Left arm', provider: 'Springfield General Hospital' },
  { vaccine: 'Tdap', date: '2022-06-10', site: 'Right arm', provider: 'Dr. Julius Hibbert' },
  { vaccine: 'Hepatitis B — Dose 3', date: '2015-03-01', site: 'Left arm', provider: 'Springfield General Hospital' },
];

export const preventiveCare = [
  { item: 'Annual Physical Exam', status: 'Completed', dueDate: '2027-01-10', lastCompleted: '2026-01-10' },
  { item: 'Flu Vaccine', status: 'Completed', dueDate: '2026-10-01', lastCompleted: '2025-10-15' },
  { item: 'Colonoscopy', status: 'Overdue', dueDate: '2025-05-12', lastCompleted: '2015-05-12' },
  { item: 'Dental Cleaning', status: 'Overdue', dueDate: '2024-06-01', lastCompleted: '2023-06-15' },
  { item: 'Diabetes Eye Exam', status: 'Due', dueDate: '2026-06-01', lastCompleted: '2024-11-20' },
];

export const referrals = [
  {
    referralTo: 'Dr. Nick Riviera, MD — Cardiology',
    reason: 'Cardiac risk assessment',
    referredBy: 'Dr. Julius Hibbert',
    date: '2025-09-14',
    status: 'Completed',
    expirationDate: '2026-03-14',
  },
];

export const medicalHistory = {
  pastConditions: [
    { condition: 'Crayon Lodged in Brain', year: '2024', status: 'Resolved' },
    { condition: 'Myocardial Infarction (mild)', year: '2020', status: 'Resolved' },
    { condition: 'Broken Thumb', year: '2016', status: 'Resolved' },
  ],
  surgicalHistory: [
    { procedure: 'Coronary Artery Bypass Graft (CABG)', year: '2020', provider: 'Springfield General Hospital' },
    { procedure: 'Craniotomy — Crayon Removal', year: '2024', provider: 'Dr. Nick Riviera' },
    { procedure: 'Appendectomy', year: '2010', provider: 'Springfield General Hospital' },
  ],
  familyHistory: [
    { relation: 'Father', conditions: ['Coronary Artery Disease', 'Hypertension'] },
    { relation: 'Mother', conditions: ['Osteoporosis'] },
    { relation: 'Paternal Grandfather', conditions: ['Type 2 Diabetes', 'Stroke'] },
  ],
};

export const visitNotes = {
  csn: 'WP-demo-csn-er-visit-2025-09-14',
  lrpId: 'WP-demo-lrp-er-visit-2025-09-14',
  depPhoneNumber: '555-555-0142',
  isAtLeastOneNoteSensitive: false,
  notes: [
    {
      hnoId: 'WP-demo-hno-ed-attending',
      hnoDat: 'WP-demo-hnodat-1',
      displayName: 'ED Attending Note',
      iso: '2025-09-14T22:18:00-04:00',
      isAddendum: false,
      isNoteSensitive: false,
      providerName: 'Nick Riviera, MD',
      providerMagicId: 'WP-demo-mid-riviera',
    },
    {
      hnoId: 'WP-demo-hno-triage',
      hnoDat: 'WP-demo-hnodat-2',
      displayName: 'ED Triage Note',
      iso: '2025-09-14T21:42:00-04:00',
      isAddendum: false,
      isNoteSensitive: false,
      providerName: 'Selma Bouvier, RN',
      providerMagicId: 'WP-demo-mid-bouvier',
    },
  ],
};

export const noteContentByHnoId: Record<string, { contentHtml: string; contentCss: string }> = {
  'WP-demo-hno-ed-attending': {
    contentHtml:
      '<div class="fmtConv1"><h3>ED Attending Note</h3><p><strong>Chief Complaint:</strong> Chest pain after dinner.</p><p><strong>HPI:</strong> Male presents with substernal chest discomfort beginning ~45 minutes after a large meal. Pain reproducible with palpation. No diaphoresis, no radiation, no shortness of breath.</p><p><strong>Workup:</strong> EKG sinus rhythm, no ST changes. Troponin x2 negative.</p><p><strong>Assessment:</strong> Musculoskeletal chest pain + GERD exacerbation.</p><p><strong>Plan:</strong> Discharge with omeprazole 20mg daily x14 days. Follow up with PCP. Counseled on portion sizes.</p></div>',
    contentCss: '.fmtConv1 { font-family: Arial, sans-serif; }',
  },
  'WP-demo-hno-triage': {
    contentHtml:
      '<div class="fmtConv1"><h3>ED Triage Note</h3><p><strong>Vitals on arrival:</strong> BP 152/94, HR 102, RR 18, SpO2 98% RA, Temp 98.4&deg;F.</p><p><strong>Triage:</strong> Patient arrived ambulatory at 21:42 complaining of mid-chest pain x 30 minutes. Pain 6/10, worse with deep breath. Denies SOB, nausea, diaphoresis.</p><p><strong>ESI Level:</strong> 2 (high acuity, possible cardiac).</p><p>&mdash; Selma Bouvier, RN</p></div>',
    contentCss: '.fmtConv1 { font-family: Arial, sans-serif; }',
  },
};

export const visitAVS = {
  contentHtml:
    '<div class="avs"><header><h2>After Visit Summary</h2><p>Springfield General Hospital &mdash; Emergency Department</p><p>Visit Date: September 14, 2025</p></header><section><h3>Reason for Visit</h3><p>Chest pain &mdash; ruled out cardiac event.</p></section><section><h3>Diagnoses</h3><ul><li>GERD exacerbation</li><li>Musculoskeletal chest pain</li></ul></section><section><h3>Discharge Instructions</h3><ul><li>Take omeprazole 20mg by mouth daily for 14 days.</li><li>Avoid lying down for 2 hours after eating.</li><li>Reduce portion sizes; consider smaller, more frequent meals.</li><li>Return to ER for: worsening chest pain, shortness of breath, sweating, pain radiating to arm or jaw.</li></ul></section><section><h3>Follow-up</h3><p>Schedule a visit with Dr. Julius Hibbert (Internal Medicine) within 1-2 weeks.</p></section></div>',
  contentCss: '.avs { font-family: Georgia, serif; max-width: 720px; }',
};

/**
 * `hnoId` and `csn` are the pair `get_letter_details` drills in on, matching
 * the real `get_letter_details` params. The summary is what `get_letters`
 * lists; the full text lives in {@link letterContentByHnoId}.
 */
export const letters = [
  {
    hnoId: 'WP-demo-hno-letter-physical',
    csn: 'WP-demo-csn-physical-2026-01-10',
    title: 'After Visit Summary — Annual Physical',
    date: '2026-01-10',
    provider: 'Dr. Julius Hibbert',
    type: 'After Visit Summary',
    summary:
      'Patient seen for annual physical. BP elevated at 148/92. A1c 7.2%, up from 6.8%. LDL 172, well above goal. Liver enzymes mildly elevated. Continue all medications, increase Atorvastatin to 40mg. Counseled on diet and exercise. Follow up in 3 months.',
  },
  {
    hnoId: 'WP-demo-hno-letter-er',
    csn: 'WP-demo-csn-er-visit-2025-09-14',
    title: 'After Visit Summary — ER Visit',
    date: '2025-09-14',
    provider: 'Dr. Nick Riviera',
    type: 'After Visit Summary',
    summary:
      'Patient presented with acute chest pain after eating. EKG normal, troponin negative x2. Chest pain reproduced with palpation — musculoskeletal and GERD exacerbation. Discharged with instructions to follow up with PCP.',
  },
];

export const letterContentByHnoId: Record<string, { contentHtml: string; contentCss: string }> = {
  'WP-demo-hno-letter-physical': {
    contentHtml:
      '<div class="ltr"><h3>Annual Physical &mdash; Visit Letter</h3><p>January 10, 2026</p><p>Dear Homer,</p><p>Thank you for coming in for your annual physical. Your blood pressure was 148/92, which is higher than we want it. Your A1c has risen to 7.2% from 6.8% last year, and your LDL cholesterol is 172 &mdash; both above goal. Your liver enzymes are mildly elevated.</p><p>I am increasing your Atorvastatin to 40mg nightly. Please continue Lisinopril, Metformin and Omeprazole as prescribed.</p><p>The single change that would help most is portion size. Please come back in three months so we can recheck the A1c and lipids.</p><p>&mdash; Julius Hibbert, MD</p></div>',
    contentCss: '.ltr { font-family: Georgia, serif; max-width: 680px; }',
  },
  'WP-demo-hno-letter-er': {
    contentHtml:
      '<div class="ltr"><h3>Emergency Department &mdash; Visit Letter</h3><p>September 14, 2025</p><p>Dear Homer,</p><p>You were seen in the Emergency Department for chest pain that began after dinner. Your EKG was normal and two troponin tests were negative, so this was not a heart attack.</p><p>The pain was reproducible when we pressed on your chest wall, which points to a musculoskeletal cause together with acid reflux.</p><p>Take omeprazole 20mg daily for 14 days, avoid lying down for two hours after eating, and follow up with Dr. Hibbert in one to two weeks. Return immediately for worsening pain, shortness of breath, sweating, or pain spreading to your arm or jaw.</p><p>&mdash; Nick Riviera, MD</p></div>',
    contentCss: '.ltr { font-family: Georgia, serif; max-width: 680px; }',
  },
};

export const vitals = [
  {
    date: '2026-01-10',
    measurements: [
      { name: 'Blood Pressure', value: '148/92', units: 'mmHg' },
      { name: 'Heart Rate', value: '88', units: 'bpm' },
      { name: 'Temperature', value: '98.6', units: '°F' },
      { name: 'Weight', value: '260', units: 'lbs' },
      { name: 'Height', value: '72', units: 'in' },
      { name: 'BMI', value: '35.3', units: 'kg/m²' },
      { name: 'SpO2', value: '97', units: '%' },
    ],
  },
  {
    date: '2025-09-14',
    measurements: [
      { name: 'Blood Pressure', value: '155/98', units: 'mmHg' },
      { name: 'Heart Rate', value: '102', units: 'bpm' },
      { name: 'Temperature', value: '98.8', units: '°F' },
      { name: 'Weight', value: '258', units: 'lbs' },
    ],
  },
  {
    date: '2025-07-20',
    measurements: [
      { name: 'Blood Pressure', value: '146/90', units: 'mmHg' },
      { name: 'Heart Rate', value: '84', units: 'bpm' },
      { name: 'Weight', value: '254', units: 'lbs' },
      { name: 'BMI', value: '34.5', units: 'kg/m²' },
    ],
  },
];

export const emergencyContacts: EmergencyContact[] = [
  { id: 'ec-001', name: 'Marge Simpson', relationship: 'Spouse', phone: '(555) 636-7664' },
  { id: 'ec-002', name: 'Bart Simpson', relationship: 'Son', phone: '(555) 636-7665' },
];

export const documents = [
  { title: 'Annual Physical Results 2026', date: '2026-01-10', type: 'Clinical Document', provider: 'Dr. Julius Hibbert' },
  { title: 'ER Visit — Chest Pain Workup', date: '2025-09-14', type: 'Clinical Document', provider: 'Dr. Nick Riviera' },
];

export const goals = [
  { goal: 'Lose 30 lbs — target weight 230 lbs', setBy: 'Dr. Julius Hibbert', status: 'Not Started', targetDate: '2026-07-01' },
  { goal: 'Lower A1c below 6.5%', setBy: 'Dr. Julius Hibbert', status: 'In Progress', targetDate: '2026-06-01' },
  { goal: 'Walk 20 minutes daily', setBy: 'Homer Simpson', status: 'Off Track', targetDate: 'Ongoing' },
];

export const upcomingOrders = [
  {
    orderType: 'Lab',
    testName: 'Hemoglobin A1c',
    orderedBy: 'Dr. Julius Hibbert',
    orderDate: '2026-01-10',
    instructions: 'Recheck A1c in 3 months. No fasting required.',
  },
  {
    orderType: 'Lab',
    testName: 'Comprehensive Metabolic Panel with Hepatic Function',
    orderedBy: 'Dr. Julius Hibbert',
    orderDate: '2026-01-10',
    instructions: 'Monitor liver enzymes and glucose. Fasting 12 hours prior.',
  },
];

export const questionnaires = [
  {
    name: 'Pre-Visit Questionnaire',
    assignedDate: '2026-03-18',
    dueDate: '2026-03-25',
    status: 'Not Started',
    appointment: 'Office Visit with Dr. Hibbert — 03/25/2026',
  },
];

export const careJourneys = [
  {
    name: 'Diabetes Management',
    status: 'Active',
    startDate: '2023-11-15',
    provider: 'Dr. Julius Hibbert',
    nextStep: 'Follow-up visit — March 25, 2026',
  },
  {
    name: 'Cardiac Risk Reduction',
    status: 'Active',
    startDate: '2020-06-01',
    provider: 'Dr. Julius Hibbert',
    nextStep: 'Lipid panel recheck — March 2026',
  },
];

export const activityFeed = [
  { date: '2026-03-18', type: 'Questionnaire', description: 'Pre-Visit Questionnaire assigned for upcoming appointment' },
  { date: '2026-01-12', type: 'Message', description: 'New message from Dr. Julius Hibbert regarding lab results' },
  { date: '2026-01-10', type: 'Lab Results', description: 'Lab results available: CMP, CBC, Lipid Panel, HbA1c' },
  { date: '2026-01-10', type: 'Visit', description: 'After Visit Summary available for Annual Physical' },
  { date: '2025-10-15', type: 'Immunization', description: 'Flu vaccine administered at Springfield General Hospital' },
];

export const educationMaterials = [
  { title: 'Managing Type 2 Diabetes', assignedBy: 'Dr. Julius Hibbert', date: '2023-11-15', category: 'Diabetes' },
  { title: 'Heart-Healthy Diet Guidelines', assignedBy: 'Dr. Julius Hibbert', date: '2020-06-01', category: 'Heart Health' },
  { title: 'Understanding Your Cholesterol Numbers', assignedBy: 'Dr. Julius Hibbert', date: '2019-01-22', category: 'Heart Health' },
];

export const ehiExport = {
  availableFormats: ['FHIR R4 (JSON)', 'C-CDA (XML)'],
  lastExport: '2025-11-01',
  note: 'Electronic Health Information export available per 21st Century Cures Act.',
};

export const imagingResults = [
  {
    study: 'Chest X-Ray, PA and Lateral',
    date: '2025-09-14',
    orderedBy: 'Dr. Nick Riviera',
    facility: 'Springfield General Hospital Radiology',
    status: 'Final',
    hasImages: true,
    seriesCount: 2,
    impression:
      'Heart mildly enlarged. Lungs are clear. No acute cardiopulmonary disease. Recommend echocardiogram for further evaluation of cardiomegaly.',
  },
];

export const linkedAccounts = [
  { organization: 'Springfield General Hospital', hostname: DEMO_HOSTNAME, status: 'Active' },
];

export const messageRecipients = {
  recipients: [
    { displayName: 'Dr. Julius Hibbert', specialty: 'Internal Medicine', department: 'Primary Care' },
    { displayName: 'Dr. Nick Riviera', specialty: 'General Surgery', department: 'Surgery' },
    { displayName: 'Nurse Ruth Powers', specialty: 'Nursing', department: 'Care Coordination' },
    { displayName: 'Patient Accounts', specialty: 'Billing', department: 'Patient Financial Services' },
  ],
  topics: [
    { displayName: 'Medical Question', value: 'TOPIC-001' },
    { displayName: 'Medication Refill', value: 'TOPIC-002' },
    { displayName: 'Appointment Request', value: 'TOPIC-003' },
    { displayName: 'Test Results Question', value: 'TOPIC-004' },
    { displayName: 'Billing Question', value: 'TOPIC-005' },
    { displayName: 'Other', value: 'TOPIC-006' },
  ],
};

export const availableAppointments: AppointmentOffer[] = [
  {
    provider: 'Dr. Julius Hibbert',
    department: 'Internal Medicine',
    location: 'Springfield General Hospital, Suite 200',
    visitType: 'Office Visit',
    slots: [
      { date: '2026-04-02', time: '9:00 AM', slotId: 'slot-001' },
      { date: '2026-04-02', time: '10:30 AM', slotId: 'slot-002' },
      { date: '2026-04-03', time: '2:00 PM', slotId: 'slot-003' },
      { date: '2026-04-07', time: '11:00 AM', slotId: 'slot-004' },
    ],
  },
  {
    provider: 'Dr. Nick Riviera',
    department: 'General Surgery',
    location: 'Springfield General Hospital, Suite 105',
    visitType: 'Follow-Up',
    slots: [
      { date: '2026-04-04', time: '1:00 PM', slotId: 'slot-005' },
      { date: '2026-04-08', time: '3:30 PM', slotId: 'slot-006' },
    ],
  },
  {
    provider: 'Lab Services',
    department: 'Laboratory',
    location: 'Springfield General Hospital, 1st Floor',
    visitType: 'Lab Work',
    slots: [
      { date: '2026-04-01', time: '7:30 AM', slotId: 'slot-007' },
      { date: '2026-04-01', time: '8:00 AM', slotId: 'slot-008' },
      { date: '2026-04-02', time: '7:30 AM', slotId: 'slot-009' },
      { date: '2026-04-03', time: '8:30 AM', slotId: 'slot-010' },
    ],
  },
  // The home-screen "Colonoscopy overdue" card promises open slots — without a
  // Colonoscopy visit type in the pool, that flow dead-ends every time.
  {
    provider: 'Springfield Endoscopy Center',
    department: 'Gastroenterology',
    location: 'Springfield General Hospital, Suite 310',
    visitType: 'Colonoscopy',
    slots: [
      { date: '2026-04-09', time: '8:00 AM', slotId: 'slot-011' },
      { date: '2026-04-16', time: '9:30 AM', slotId: 'slot-012' },
      { date: '2026-04-23', time: '8:00 AM', slotId: 'slot-013' },
    ],
  },
];

/* ── Patient records ────────────────────────────────────────────────── */

/**
 * The account holder's chart, assembled from everything above.
 *
 * Every collection a data tool can read is in here rather than reached as a
 * module-level export, because MyChart scopes all of them to whichever patient
 * the session is currently pointed at. See {@link PatientRecord}.
 */
export const accountHolderRecord: PatientRecord = {
  profile,
  healthSummary,
  medications,
  allergies,
  healthIssues,
  medicalHistory,
  vitals,
  immunizations,
  careTeam,
  emergencyContacts,
  goals,
  preventiveCare,
  labResults,
  imagingResults,
  upcomingOrders,
  upcomingVisits,
  pastVisits,
  visitNotes,
  noteContentByHnoId,
  visitAVS,
  careJourneys,
  referrals,
  letters,
  letterContentByHnoId,
  documents,
  questionnaires,
  educationMaterials,
  activityFeed,
  ehiExport,
  billing,
  insurance,
  messages,
  messageRecipients,
  availableAppointments,
};

/**
 * The child record the account reaches by proxy.
 *
 * Deliberately a different *shape* of chart, not a copy with the names swapped:
 * a dense immunization schedule, one fracture, an asthma plan, no chronic
 * disease and a two-line billing ledger. Switching to it and asking the same
 * questions has to give visibly different answers, or the proxy tools would be
 * demonstrating something that isn't happening.
 *
 * The forearm film carries `hasImages: false`. The demo's radiograph is drawn,
 * not decoded (see docs/demo.md), and what it draws is a chest with the
 * enlarged cardiac silhouette from the account holder's report — so handing it
 * back for a child's forearm would be a picture of the wrong body part on the
 * wrong patient. `get_xray_image` refuses instead.
 */
export const childRecord: PatientRecord = {
  profile: {
    name: 'Bart Simpson',
    preferredName: 'Bart',
    dateOfBirth: '04/01/2016',
    sex: 'Male',
    mrn: 'MRN-7704318',
    primaryCareProvider: 'Dr. Julius Hibbert, MD',
    address: '742 Evergreen Terrace, Springfield, IL 62704',
    phone: '(555) 636-7665',
    // A child's chart lists the parent who manages it.
    email: 'marge.simpson@example.com',
  },
  healthSummary: {
    bloodType: 'O+',
    height: '4\'6" (137.2 cm)',
    weight: '82 lbs (37.2 kg)',
    bmi: '19.8',
    bloodPressure: '104/64 mmHg',
    heartRate: '92 bpm',
    lastUpdated: '2026-02-05',
  },
  medications: [
    {
      name: 'Albuterol HFA 90mcg inhaler',
      directions: 'Inhale 2 puffs every 4-6 hours as needed for wheeze or cough',
      prescriber: 'Dr. Julius Hibbert',
      pharmacy: 'Springfield Pharmacy',
      refillsRemaining: 2,
      lastFilled: '2026-01-08',
    },
    {
      name: 'Fluticasone 44mcg inhaler',
      directions: 'Inhale 1 puff twice daily, rinse mouth after use',
      prescriber: 'Dr. Julius Hibbert',
      pharmacy: 'Springfield Pharmacy',
      refillsRemaining: 0,
      lastFilled: '2025-12-02',
    },
  ],
  allergies: [{ allergen: 'Amoxicillin', reaction: 'Rash', severity: 'Mild', type: 'Medication' }],
  healthIssues: [
    { condition: 'Asthma, mild intermittent', status: 'Active', onsetDate: '2021-09-08', provider: 'Dr. Julius Hibbert' },
    { condition: 'Attention-deficit/hyperactivity disorder', status: 'Active', onsetDate: '2023-02-14', provider: 'Dr. Julius Hibbert' },
  ],
  medicalHistory: {
    pastConditions: [
      { condition: 'Fracture, left radius', year: '2025', status: 'Resolved' },
      { condition: 'Recurrent otitis media', year: '2020', status: 'Resolved' },
    ],
    surgicalHistory: [{ procedure: 'Tympanostomy tube placement', year: '2020', provider: 'Springfield General Hospital' }],
    familyHistory: [
      { relation: 'Father', conditions: ['Type 2 Diabetes', 'Hypertension', 'High cholesterol'] },
      { relation: 'Paternal Grandfather', conditions: ['Type 2 Diabetes', 'Stroke'] },
    ],
  },
  vitals: [
    {
      date: '2026-02-05',
      measurements: [
        { name: 'Blood Pressure', value: '104/64', units: 'mmHg' },
        { name: 'Heart Rate', value: '92', units: 'bpm' },
        { name: 'Temperature', value: '98.2', units: '°F' },
        { name: 'Weight', value: '82', units: 'lbs' },
        { name: 'Height', value: '54', units: 'in' },
        { name: 'SpO2', value: '99', units: '%' },
      ],
    },
  ],
  immunizations: [
    { vaccine: 'Influenza (Flu)', date: '2025-10-18', site: 'Left arm', provider: 'Springfield General Hospital' },
    { vaccine: 'DTaP — Dose 5', date: '2021-05-12', site: 'Left arm', provider: 'Dr. Julius Hibbert' },
    { vaccine: 'MMR — Dose 2', date: '2021-05-12', site: 'Right arm', provider: 'Dr. Julius Hibbert' },
    { vaccine: 'Varicella — Dose 2', date: '2021-05-12', site: 'Right arm', provider: 'Dr. Julius Hibbert' },
    { vaccine: 'Polio (IPV) — Dose 4', date: '2021-05-12', site: 'Left arm', provider: 'Dr. Julius Hibbert' },
    { vaccine: 'Hepatitis B — Dose 3', date: '2016-10-04', site: 'Left thigh', provider: 'Springfield General Hospital' },
  ],
  careTeam: [
    { name: 'Dr. Julius Hibbert, MD', role: 'Primary Care Provider', specialty: 'Pediatrics', phone: '(555) 234-5678' },
    { name: 'Dr. Corinne Yu, MD', role: 'Specialist', specialty: 'Pediatric Pulmonology', phone: '(555) 234-5691' },
    { name: 'Nurse Ruth Powers, RN', role: 'Care Coordinator', specialty: 'Nursing', phone: '(555) 234-5680' },
  ],
  emergencyContacts: [
    { id: 'ec-101', name: 'Marge Simpson', relationship: 'Mother', phone: '(555) 636-7664' },
    { id: 'ec-102', name: 'Homer J. Simpson', relationship: 'Father', phone: '(555) 636-7663' },
  ],
  goals: [
    { goal: 'Use the controller inhaler every morning', setBy: 'Dr. Julius Hibbert', status: 'In Progress', targetDate: 'Ongoing' },
    { goal: 'No missed school days from asthma this term', setBy: 'Dr. Corinne Yu', status: 'On Track', targetDate: '2026-06-12' },
  ],
  preventiveCare: [
    { item: 'Well-Child Visit', status: 'Due', dueDate: '2026-04-14', lastCompleted: '2025-04-02' },
    { item: 'Flu Vaccine', status: 'Completed', dueDate: '2026-10-01', lastCompleted: '2025-10-18' },
    { item: 'Vision Screening', status: 'Completed', dueDate: '2027-04-02', lastCompleted: '2025-04-02' },
    { item: 'Dental Cleaning', status: 'Overdue', dueDate: '2025-11-01', lastCompleted: '2025-03-18' },
  ],
  labResults: [
    {
      testName: 'CBC with Differential',
      orderedBy: 'Dr. Julius Hibbert',
      collectedDate: '2025-04-02',
      status: 'Final',
      results: [
        { component: 'WBC', value: '6.8', units: 'K/uL', referenceRange: '4.5-13.5', flag: 'Normal' },
        { component: 'Hemoglobin', value: '13.1', units: 'g/dL', referenceRange: '11.5-15.5', flag: 'Normal' },
        { component: 'Hematocrit', value: '39.0', units: '%', referenceRange: '35-45', flag: 'Normal' },
        { component: 'Platelets', value: '295', units: 'K/uL', referenceRange: '150-450', flag: 'Normal' },
      ],
    },
  ],
  imagingResults: [
    {
      study: 'Left Forearm X-Ray, 2 Views',
      date: '2025-08-16',
      orderedBy: 'Dr. Nick Riviera',
      facility: 'Springfield General Hospital Radiology',
      status: 'Final',
      hasImages: false,
      seriesCount: 2,
      impression:
        'Non-displaced buckle fracture of the distal left radius. No involvement of the growth plate. Alignment maintained. Recommend immobilization and follow-up films in three weeks.',
    },
  ],
  upcomingOrders: [
    {
      orderType: 'Procedure',
      testName: 'Spirometry with bronchodilator response',
      orderedBy: 'Dr. Corinne Yu',
      orderDate: '2026-02-05',
      instructions: 'Hold albuterol for 6 hours before the test. Allow 45 minutes.',
    },
  ],
  upcomingVisits: [
    {
      type: 'Well-Child Check',
      provider: 'Dr. Julius Hibbert',
      department: 'Pediatrics',
      location: 'Springfield General Hospital, Suite 210',
      date: '2026-04-14',
      time: '3:15 PM',
      status: 'Scheduled',
      instructions: 'Bring the school physical form. Vision and hearing screening will be done at this visit.',
    },
  ],
  pastVisits: [
    {
      csn: 'WP-demo-csn-child-asthma-2026-02-05',
      type: 'Office Visit',
      provider: 'Dr. Corinne Yu',
      department: 'Pediatric Pulmonology',
      date: '2026-02-05',
      reason: 'Asthma follow-up — nighttime cough',
      diagnoses: ['Asthma, mild intermittent'],
    },
    {
      csn: 'WP-demo-csn-child-fracture-2025-08-16',
      type: 'Emergency Room',
      provider: 'Dr. Nick Riviera',
      department: 'Emergency Medicine',
      date: '2025-08-16',
      reason: 'Fall from skateboard — left wrist pain',
      diagnoses: ['Buckle fracture, distal left radius'],
    },
    {
      csn: 'WP-demo-csn-child-wellchild-2025-04-02',
      type: 'Office Visit',
      provider: 'Dr. Julius Hibbert',
      department: 'Pediatrics',
      date: '2025-04-02',
      reason: 'Well-child visit, age 9',
      diagnoses: ['Routine child health examination'],
    },
  ],
  visitNotes: {
    csn: 'WP-demo-csn-child-fracture-2025-08-16',
    lrpId: 'WP-demo-lrp-child-fracture-2025-08-16',
    depPhoneNumber: '555-555-0142',
    isAtLeastOneNoteSensitive: false,
    notes: [
      {
        hnoId: 'WP-demo-hno-child-ed',
        hnoDat: 'WP-demo-hnodat-c1',
        displayName: 'ED Attending Note',
        iso: '2025-08-16T17:05:00-04:00',
        isAddendum: false,
        isNoteSensitive: false,
        providerName: 'Nick Riviera, MD',
        providerMagicId: 'WP-demo-mid-riviera',
      },
    ],
  },
  noteContentByHnoId: {
    'WP-demo-hno-child-ed': {
      contentHtml:
        '<div class="fmtConv1"><h3>ED Attending Note</h3><p><strong>Chief Complaint:</strong> Left wrist pain after falling from a skateboard.</p><p><strong>HPI:</strong> Nine-year-old male, landed on an outstretched left hand approximately one hour before arrival. Point tenderness over the distal radius. Neurovascularly intact, no open wound.</p><p><strong>Imaging:</strong> Left forearm radiographs show a non-displaced buckle fracture of the distal radius. Growth plate not involved.</p><p><strong>Plan:</strong> Short arm splint applied. Ibuprofen as needed. Orthopedic follow-up in one week; repeat films at three weeks. No gym class or skateboarding until cleared.</p></div>',
      contentCss: '.fmtConv1 { font-family: Arial, sans-serif; }',
    },
  },
  visitAVS: {
    contentHtml:
      '<div class="avs"><header><h2>After Visit Summary</h2><p>Springfield General Hospital &mdash; Emergency Department</p><p>Visit Date: August 16, 2025</p></header><section><h3>Reason for Visit</h3><p>Fall from skateboard with left wrist pain.</p></section><section><h3>Diagnoses</h3><ul><li>Buckle fracture, distal left radius</li></ul></section><section><h3>Discharge Instructions</h3><ul><li>Keep the splint dry and in place until the orthopedic visit.</li><li>Ibuprofen as directed for pain.</li><li>No skateboarding, gym class or contact sports until cleared.</li><li>Return for numbness, blue or cold fingers, or pain not helped by medication.</li></ul></section><section><h3>Follow-up</h3><p>Orthopedics within one week. Repeat films at three weeks.</p></section></div>',
    contentCss: '.avs { font-family: Georgia, serif; max-width: 720px; }',
  },
  careJourneys: [
    {
      name: 'Asthma Action Plan',
      status: 'Active',
      startDate: '2021-09-08',
      provider: 'Dr. Corinne Yu',
      nextStep: 'Spirometry, then review the plan at the well-child visit — April 14, 2026',
    },
  ],
  referrals: [
    {
      referralTo: 'Dr. Corinne Yu, MD — Pediatric Pulmonology',
      reason: 'Nighttime cough despite controller inhaler',
      referredBy: 'Dr. Julius Hibbert',
      date: '2025-12-02',
      status: 'Completed',
      expirationDate: '2026-06-02',
    },
  ],
  letters: [
    {
      hnoId: 'WP-demo-hno-letter-child-fracture',
      csn: 'WP-demo-csn-child-fracture-2025-08-16',
      title: 'After Visit Summary — ER Visit',
      date: '2025-08-16',
      provider: 'Dr. Nick Riviera',
      type: 'After Visit Summary',
      summary:
        'Buckle fracture of the distal left radius after a skateboard fall. Splinted in the Emergency Department. Orthopedic follow-up in one week, repeat films at three weeks, no sports until cleared.',
    },
  ],
  letterContentByHnoId: {
    'WP-demo-hno-letter-child-fracture': {
      contentHtml:
        '<div class="ltr"><h3>Emergency Department &mdash; Visit Letter</h3><p>August 16, 2025</p><p>Dear Mr. and Mrs. Simpson,</p><p>Bart was seen today after falling from his skateboard onto his left hand. X-rays show a buckle fracture of the wrist &mdash; a common childhood break that heals well and does not involve the growth plate.</p><p>He is in a short arm splint. Please keep it dry and in place, give ibuprofen as needed, and keep him off skateboards, gym class and contact sports until the orthopedist clears him.</p><p>Please book orthopedic follow-up within a week; repeat films will be taken at three weeks.</p><p>&mdash; Nick Riviera, MD</p></div>',
      contentCss: '.ltr { font-family: Georgia, serif; max-width: 680px; }',
    },
  },
  documents: [
    { title: 'ER Visit — Left Wrist Fracture', date: '2025-08-16', type: 'Clinical Document', provider: 'Dr. Nick Riviera' },
    { title: 'Asthma Action Plan', date: '2025-12-02', type: 'Care Plan', provider: 'Dr. Corinne Yu' },
  ],
  questionnaires: [
    {
      name: 'School Physical Form',
      assignedDate: '2026-03-20',
      dueDate: '2026-04-14',
      status: 'Not Started',
      appointment: 'Well-Child Check with Dr. Hibbert — 04/14/2026',
    },
  ],
  educationMaterials: [
    { title: 'Using a Metered-Dose Inhaler with a Spacer', assignedBy: 'Dr. Corinne Yu', date: '2025-12-02', category: 'Asthma' },
    { title: 'Caring for a Splint at Home', assignedBy: 'Dr. Nick Riviera', date: '2025-08-16', category: 'Injury Care' },
  ],
  activityFeed: [
    { date: '2026-03-20', type: 'Questionnaire', description: 'School Physical Form assigned for the upcoming well-child visit' },
    { date: '2026-02-05', type: 'Visit', description: 'After Visit Summary available for Asthma follow-up' },
    { date: '2025-10-18', type: 'Immunization', description: 'Flu vaccine administered at Springfield General Hospital' },
    { date: '2025-08-16', type: 'Imaging', description: 'Imaging report available: Left Forearm X-Ray, 2 Views' },
  ],
  ehiExport: {
    availableFormats: ['FHIR R4 (JSON)', 'C-CDA (XML)'],
    lastExport: 'Never',
    note: 'Electronic Health Information export available per 21st Century Cures Act.',
  },
  billing: [
    {
      date: '2025-08-16',
      description: 'Emergency Room Visit — Pediatric',
      provider: 'Dr. Nick Riviera',
      totalCharge: '$1,240.00',
      insurancePaid: '$1,054.00',
      patientResponsibility: '$186.00',
      status: 'Paid',
    },
    {
      date: '2025-08-16',
      description: 'Radiology — Left Forearm X-Ray, 2 Views',
      provider: 'Springfield General Hospital Radiology',
      totalCharge: '$310.00',
      insurancePaid: '$248.00',
      patientResponsibility: '$62.00',
      status: 'Outstanding',
    },
  ],
  insurance: [
    {
      plan: 'Springfield Nuclear Power Plant — PPO',
      memberId: 'SNPP-7704318',
      groupNumber: 'GRP-SECTOR7G',
      subscriber: 'Homer J. Simpson',
      effectiveDate: '2025-01-01',
      copay: { office: '$30', specialist: '$50', urgentCare: '$75', er: '$200' },
      deductible: '$1,500 individual',
      outOfPocketMax: '$6,000 individual',
    },
  ],
  messages: [
    {
      id: 'msg-c01',
      subject: 'School physical form',
      from: 'Nurse Ruth Powers',
      date: '2026-03-20',
      preview: "We've added the school physical form to Bart's chart ahead of the April visit...",
      messages: [
        {
          from: 'Nurse Ruth Powers',
          date: '2026-03-20',
          body: "Hi Marge — we've added the school physical form to Bart's chart ahead of the April 14 visit. If you fill in the parent section beforehand, Dr. Hibbert can sign it at the appointment and you won't need a second trip.",
        },
      ],
    },
    {
      id: 'msg-c02',
      subject: 'Nighttime cough',
      from: 'Marge Simpson',
      date: '2026-02-03',
      preview: "Bart's been coughing at night again, mostly after gym days...",
      messages: [
        {
          from: 'Marge Simpson',
          date: '2026-02-03',
          body: "Bart's been coughing at night again, mostly after gym days. He's using the blue inhaler two or three times a week. Is that too much?",
        },
        {
          from: 'Dr. Corinne Yu',
          date: '2026-02-04',
          body: 'Thanks for flagging it. Needing the rescue inhaler more than twice a week is our signal to look at the controller. Please book a follow-up and hold the albuterol for six hours before it so we can get a clean spirometry.',
        },
      ],
    },
  ],
  messageRecipients: {
    recipients: [
      { displayName: 'Dr. Julius Hibbert', specialty: 'Pediatrics', department: 'Primary Care' },
      { displayName: 'Dr. Corinne Yu', specialty: 'Pediatric Pulmonology', department: 'Pulmonology' },
      { displayName: 'Nurse Ruth Powers', specialty: 'Nursing', department: 'Care Coordination' },
      { displayName: 'Patient Accounts', specialty: 'Billing', department: 'Patient Financial Services' },
    ],
    topics: [
      { displayName: 'Medical Question', value: 'TOPIC-001' },
      { displayName: 'Medication Refill', value: 'TOPIC-002' },
      { displayName: 'Appointment Request', value: 'TOPIC-003' },
      { displayName: 'Test Results Question', value: 'TOPIC-004' },
      { displayName: 'Billing Question', value: 'TOPIC-005' },
      { displayName: 'Other', value: 'TOPIC-006' },
    ],
  },
  availableAppointments: [
    {
      provider: 'Dr. Julius Hibbert',
      department: 'Pediatrics',
      location: 'Springfield General Hospital, Suite 210',
      visitType: 'Well-Child Check',
      slots: [
        { date: '2026-04-14', time: '3:15 PM', slotId: 'slot-c01' },
        { date: '2026-04-15', time: '9:45 AM', slotId: 'slot-c02' },
      ],
    },
    {
      provider: 'Dr. Corinne Yu',
      department: 'Pediatric Pulmonology',
      location: 'Springfield General Hospital, Suite 118',
      visitType: 'Follow-Up',
      slots: [
        { date: '2026-04-09', time: '11:30 AM', slotId: 'slot-c03' },
        { date: '2026-04-16', time: '2:15 PM', slotId: 'slot-c04' },
      ],
    },
  ],
};

/**
 * What `list_proxy_targets` reports, in portal order: the account holder first,
 * then the records reachable by proxy. `name` is the key into `Session.patients`.
 */
export const proxyTargets: ProxyTarget[] = [
  { id: 'WP-demo-proxy-self', name: profile.name, relationship: 'Self', isSelf: true },
  { id: 'WP-demo-proxy-child', name: childRecord.profile.name, relationship: 'Child', isSelf: false },
];

/** Every chart the demo account can reach, keyed the way the session stores them. */
export const patientRecords: Record<string, PatientRecord> = {
  [profile.name]: accountHolderRecord,
  [childRecord.profile.name]: childRecord,
};

/**
 * Health-system directory used by the provider picker during onboarding.
 * A handful of invented systems plus the demo instance.
 */
export const directory = [
  { name: 'Springfield General Hospital', hostname: DEMO_HOSTNAME, city: 'Springfield, IL' },
  { name: 'Shelbyville Regional Medical', hostname: 'mychart.shelbyvillemed.example.org', city: 'Shelbyville, IL' },
  { name: 'Capital City Health Network', hostname: 'mychart.capitalcityhealth.example.org', city: 'Capital City, IL' },
  { name: 'Ogdenville Community Care', hostname: 'mychart.ogdenville.example.org', city: 'Ogdenville, IL' },
  { name: 'North Haverbrook Medical Group', hostname: 'mychart.northhaverbrook.example.org', city: 'North Haverbrook, IL' },
];

/**
 * The health digest and insight cards shown on the app's Insights screen.
 * In the real app these are model-generated from the record on first sync;
 * here they are pre-baked so the screen has content without burning a call.
 */
export const memoryDigest: {
  generatedAt: string;
  summaryMd: string;
  insights: Insight[];
} = {
  generatedAt: '2026-03-20',
  summaryMd: [
    '**Homer J. Simpson** · 69 · O+ · MRN-7704201 · PCP Dr. Julius Hibbert',
    '',
    'Four active chronic conditions: obesity (BMI 35.3), hypertension, hyperlipidemia, and type 2 diabetes diagnosed Nov 2023. Prior CABG in 2020.',
    '',
    'On four daily medications — atorvastatin 40mg, lisinopril 20mg, omeprazole 20mg, and metformin 500mg twice daily. Metformin has **no refills left**.',
    '',
    'A1c is trending the wrong way: 6.4% (Dec 2024) → 6.8% (Jul 2025) → 7.2% (Jan 2026). LDL 172 and HDL 34 remain off target despite statin therapy. Liver enzymes mildly elevated across three draws.',
    '',
    'Next up: fasting labs 3/24, follow-up with Dr. Hibbert 3/25. Colonoscopy is overdue by 10 months.',
  ].join('\n'),
  insights: [
    {
      id: 'ins-ferritin',
      title: 'Ferritin and iron saturation high across three draws',
      severity: 'discuss',
      bodyMd:
        'Ferritin has been above range on every draw since Dec 2024 (549 → 588 → 612 ng/mL), with serum iron 191 µg/dL and transferrin saturation 58%. A persistent pattern like this is different from a single high value.\n\nElevated ferritin has many causes, including inflammation and fatty liver — but iron saturation above 45% alongside it is the combination clinicians typically screen further.',
      suggestedQuestion:
        'My ferritin and transferrin saturation have been high on three separate draws — is genetic iron-overload screening (like HFE testing) worth considering?',
    },
    {
      id: 'ins-a1c',
      title: 'A1c has risen at every check for two years',
      severity: 'discuss_soon',
      bodyMd:
        'A1c went 6.4% → 6.8% → 7.2% across Dec 2024, Jul 2025, and Jan 2026. Metformin has been at 500mg twice daily the whole time and there are no refills remaining on it.\n\nThe next A1c is already ordered for the 3/24 lab visit, so the 3/25 follow-up is a natural moment to talk about whether the current regimen is still doing its job.',
      suggestedQuestion:
        'My A1c has gone up at every check for two years on the same metformin dose — should we revisit the plan at my March follow-up?',
    },
    {
      id: 'ins-colonoscopy',
      title: 'Colonoscopy overdue since May 2025',
      severity: 'info',
      bodyMd:
        'The last colonoscopy was in May 2015 and the follow-up was due May 2025 — about ten months ago. Dental cleaning is also overdue, and the diabetes eye exam comes due in June.\n\nThese are easy to bundle into the March visit rather than scheduling three separate times.',
      suggestedQuestion:
        'Can we get the overdue colonoscopy and my diabetes eye exam scheduled while I am in on 3/25?',
    },
    {
      id: 'ins-liver',
      title: 'Liver enzymes mildly elevated on repeat testing',
      severity: 'discuss',
      bodyMd:
        'AST and ALT have both been modestly above range on the last three metabolic panels (AST 48-52, ALT 61-68). A hepatic-function panel is already ordered for the March draw.\n\nWorth flagging because atorvastatin is on the medication list and liver monitoring is routine with statins.',
      suggestedQuestion:
        'My AST and ALT have been mildly elevated on three panels while I am on atorvastatin — is that something to monitor differently?',
    },
  ],
};

/** Pre-seeded chat history so the drawer looks lived-in. */
export const seedChats: SeedChat[] = [
  { id: 'chat-seed-1', title: 'What do my cholesterol numbers mean?', updatedAt: '2026-03-19' },
  { id: 'chat-seed-2', title: 'Prep for the March 25 follow-up', updatedAt: '2026-03-17' },
  { id: 'chat-seed-3', title: 'Is the ER bill correct?', updatedAt: '2026-03-11' },
  { id: 'chat-seed-4', title: 'Explain my chest X-ray report', updatedAt: '2026-02-28' },
  { id: 'chat-seed-5', title: 'Which vaccines am I due for?', updatedAt: '2026-02-14' },
];
