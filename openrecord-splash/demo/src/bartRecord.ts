/**
 * The second chart the demo account can reach.
 *
 * Real MyChart accounts often have *proxy access* — a parent who can open a
 * child's record from their own login. Which record the portal is showing is
 * server-side state: every data tool reads whichever one is active, and only
 * `switch_proxy_target` changes it. The demo needs a genuinely different second
 * chart for that to mean anything, so this is one: a twelve-year-old with
 * asthma, a healed forearm fracture, and none of his father's problem list.
 *
 * Everything here is invented, same as `data.ts`.
 *
 * This module deliberately imports nothing from `data.ts` — the patient roster
 * in `patients.ts` pulls both charts together, which keeps the two records from
 * importing each other.
 */

import type { PatientRecord } from './types';

export const BART_PATIENT_ID = 'WP-demo-proxy-bart';

export const bartRecord: PatientRecord = {
  profile: {
    name: 'Bartholomew J. Simpson',
    preferredName: 'Bart',
    dateOfBirth: '04/01/2014',
    sex: 'Male',
    mrn: 'MRN-7704208',
    primaryCareProvider: 'Dr. Julius Hibbert, MD',
    address: '742 Evergreen Terrace, Springfield, IL 62704',
    phone: '(555) 636-7663',
    email: 'marge.simpson@example.com',
  },

  healthSummary: {
    bloodType: 'O+',
    height: '4\'11" (149.9 cm)',
    weight: '92 lbs (41.7 kg)',
    bmi: '18.6',
    bloodPressure: '104/64 mmHg',
    heartRate: '78 bpm',
    lastUpdated: '2026-02-06',
  },

  allergies: [
    { allergen: 'Grass pollen', reaction: 'Sneezing, itchy eyes', severity: 'Mild', type: 'Environmental' },
    { allergen: 'Amoxicillin', reaction: 'Rash', severity: 'Mild', type: 'Medication' },
  ],

  healthIssues: [
    { condition: 'Asthma, mild intermittent', status: 'Active', onsetDate: '2021-05-04', provider: 'Dr. Julius Hibbert' },
    { condition: 'Seasonal allergic rhinitis', status: 'Active', onsetDate: '2022-04-11', provider: 'Dr. Julius Hibbert' },
    { condition: 'Fracture, left forearm', status: 'Resolved', onsetDate: '2024-10-19', provider: 'Dr. Nick Riviera' },
  ],

  medicalHistory: {
    pastConditions: [
      { condition: 'Fracture, left forearm (skateboard)', year: '2024', status: 'Resolved' },
      { condition: 'Otitis media, recurrent', year: '2019', status: 'Resolved' },
    ],
    surgicalHistory: [{ procedure: 'Closed reduction, left forearm', year: '2024', provider: 'Springfield General Hospital' }],
    familyHistory: [
      { relation: 'Father', conditions: ['Type 2 Diabetes', 'Hypertension', 'Coronary Artery Disease'] },
      { relation: 'Mother', conditions: ['Migraine'] },
    ],
  },

  vitals: [
    {
      date: '2026-02-06',
      measurements: [
        { name: 'Blood Pressure', value: '104/64', units: 'mmHg' },
        { name: 'Heart Rate', value: '78', units: 'bpm' },
        { name: 'Temperature', value: '98.2', units: '°F' },
        { name: 'Weight', value: '92', units: 'lbs' },
        { name: 'Height', value: '59', units: 'in' },
        { name: 'BMI', value: '18.6', units: 'kg/m²' },
      ],
    },
    {
      date: '2025-02-11',
      measurements: [
        { name: 'Blood Pressure', value: '100/62', units: 'mmHg' },
        { name: 'Heart Rate', value: '82', units: 'bpm' },
        { name: 'Weight', value: '84', units: 'lbs' },
        { name: 'Height', value: '57', units: 'in' },
      ],
    },
  ],

  immunizations: [
    { vaccine: 'Influenza (Flu)', date: '2025-10-15', site: 'Left arm', provider: 'Springfield General Hospital' },
    { vaccine: 'Tdap', date: '2025-02-11', site: 'Left arm', provider: 'Dr. Julius Hibbert' },
    { vaccine: 'HPV — Dose 1', date: '2026-02-06', site: 'Right arm', provider: 'Dr. Julius Hibbert' },
    { vaccine: 'MMR — Dose 2', date: '2018-06-04', site: 'Left arm', provider: 'Dr. Julius Hibbert' },
  ],

  careTeam: [
    { name: 'Dr. Julius Hibbert, MD', role: 'Primary Care Provider', specialty: 'Pediatrics', phone: '(555) 234-5678' },
    { name: 'Nurse Ruth Powers, RN', role: 'Care Coordinator', specialty: 'Nursing', phone: '(555) 234-5680' },
  ],

  goals: [
    { goal: 'Carry the rescue inhaler to every practice', setBy: 'Dr. Julius Hibbert', status: 'In Progress', targetDate: 'Ongoing' },
    { goal: 'Complete the HPV series', setBy: 'Dr. Julius Hibbert', status: 'In Progress', targetDate: '2026-08-06' },
  ],

  preventiveCare: [
    { item: 'Well-Child Visit', status: 'Completed', dueDate: '2027-02-06', lastCompleted: '2026-02-06' },
    { item: 'Flu Vaccine', status: 'Completed', dueDate: '2026-10-01', lastCompleted: '2025-10-15' },
    { item: 'HPV — Dose 2', status: 'Due', dueDate: '2026-08-06', lastCompleted: '2026-02-06' },
    { item: 'Vision Screening', status: 'Overdue', dueDate: '2025-09-01', lastCompleted: '2023-09-12' },
    { item: 'Dental Cleaning', status: 'Completed', dueDate: '2026-08-20', lastCompleted: '2026-02-20' },
  ],

  labResults: [
    {
      testName: 'CBC with Differential',
      orderedBy: 'Dr. Julius Hibbert',
      collectedDate: '2026-02-06',
      status: 'Final',
      results: [
        { component: 'WBC', value: '6.4', units: 'K/uL', referenceRange: '4.5-13.5', flag: 'Normal' },
        { component: 'Hemoglobin', value: '13.1', units: 'g/dL', referenceRange: '11.5-15.5', flag: 'Normal' },
        { component: 'Hematocrit', value: '39.0', units: '%', referenceRange: '35-45', flag: 'Normal' },
        { component: 'Platelets', value: '288', units: 'K/uL', referenceRange: '150-450', flag: 'Normal' },
      ],
    },
    {
      testName: 'Lead, Blood',
      orderedBy: 'Dr. Julius Hibbert',
      collectedDate: '2026-02-06',
      status: 'Final',
      results: [{ component: 'Lead', value: '6', units: 'ug/dL', referenceRange: '<3.5', flag: 'High' }],
    },
    {
      testName: 'Basic Metabolic Panel',
      orderedBy: 'Dr. Julius Hibbert',
      collectedDate: '2025-02-11',
      status: 'Final',
      results: [
        { component: 'Glucose', value: '88', units: 'mg/dL', referenceRange: '70-100', flag: 'Normal' },
        { component: 'Sodium', value: '139', units: 'mEq/L', referenceRange: '136-145', flag: 'Normal' },
        { component: 'Potassium', value: '4.2', units: 'mEq/L', referenceRange: '3.5-5.1', flag: 'Normal' },
        { component: 'Creatinine', value: '0.6', units: 'mg/dL', referenceRange: '0.3-0.7', flag: 'Normal' },
      ],
    },
  ],

  imagingResults: [
    {
      study: 'X-Ray, Left Forearm, 2 Views',
      date: '2024-10-19',
      orderedBy: 'Dr. Nick Riviera',
      facility: 'Springfield General Hospital Radiology',
      status: 'Final',
      hasImages: true,
      seriesCount: 2,
      impression:
        'Non-displaced fracture of the distal radius. Growth plate intact. Alignment maintained after immobilization. Recommend follow-up films in four weeks.',
      imageId: 'ZmRpOmRlbW8tZm9yZWFybS14cmF5',
      series: [
        { seriesUID: '1.2.826.0.1.3680043.demo.2.1', seriesDescription: 'AP', imageCount: 1 },
        { seriesUID: '1.2.826.0.1.3680043.demo.2.2', seriesDescription: 'Lateral', imageCount: 1 },
      ],
    },
  ],

  upcomingOrders: [
    {
      orderType: 'Lab',
      testName: 'Lead, Blood — recheck',
      orderedBy: 'Dr. Julius Hibbert',
      orderDate: '2026-02-06',
      instructions: 'Recheck in 3 months. No fasting required.',
    },
  ],

  pastVisits: [
    {
      csn: 'WP-demo-csn-bart-wellchild-2026-02-06',
      type: 'Office Visit',
      provider: 'Dr. Julius Hibbert',
      department: 'Pediatrics',
      date: '2026-02-06',
      reason: 'Well-child visit and sports physical',
      diagnoses: ['Routine child health examination', 'Asthma, mild intermittent'],
    },
    {
      csn: 'WP-demo-csn-bart-forearm-2024-10-19',
      type: 'Urgent Care',
      provider: 'Dr. Nick Riviera',
      department: 'Orthopedics',
      date: '2024-10-19',
      reason: 'Left forearm injury after a skateboard fall',
      diagnoses: ['Closed fracture of distal radius'],
    },
  ],

  visitNotes: {
    csn: 'WP-demo-csn-bart-wellchild-2026-02-06',
    lrpId: 'WP-demo-lrp-bart-wellchild',
    depPhoneNumber: '555-555-0148',
    isAtLeastOneNoteSensitive: false,
    notes: [
      {
        hnoId: 'WP-demo-hno-bart-wellchild',
        hnoDat: 'WP-demo-hnodat-bart-1',
        displayName: 'Well-Child Visit Note',
        iso: '2026-02-06T09:20:00-05:00',
        isAddendum: false,
        isNoteSensitive: false,
        providerName: 'Julius Hibbert, MD',
        providerMagicId: 'WP-demo-mid-hibbert',
      },
    ],
  },

  noteContentByHnoId: {
    'WP-demo-hno-bart-wellchild': {
      contentHtml:
        '<div class="fmtConv1"><h3>Well-Child Visit &mdash; Age 11</h3><p><strong>Subjective:</strong> Doing well. Plays baseball in the spring. Uses albuterol before practice roughly twice a month; no night-time symptoms and no missed school for breathing.</p><p><strong>Objective:</strong> Growth tracking along the 60th percentile for height and the 45th for weight. Lungs clear, no wheeze. Healed left forearm fracture with full range of motion.</p><p><strong>Assessment:</strong> Healthy 11-year-old. Mild intermittent asthma, well controlled.</p><p><strong>Plan:</strong> Sports clearance granted. HPV dose 1 given today, dose 2 in six months. Blood lead 6 &micro;g/dL &mdash; repeat in three months and review water and paint exposure at home. Overdue vision screening; referred to school screening program.</p></div>',
      contentCss: '.fmtConv1 { font-family: Arial, sans-serif; }',
    },
  },

  visitAVS: {
    contentHtml:
      '<div class="avs"><header><h2>After Visit Summary</h2><p>Springfield General Hospital &mdash; Pediatrics</p><p>Visit Date: February 6, 2026</p></header><section><h3>Reason for Visit</h3><p>Well-child visit and sports physical.</p></section><section><h3>Today&rsquo;s Care</h3><ul><li>Sports participation form completed and signed.</li><li>HPV vaccine, dose 1, given in the right arm.</li><li>Blood drawn for a complete blood count and a lead level.</li></ul></section><section><h3>Instructions</h3><ul><li>Keep the albuterol inhaler in the sports bag, not the locker.</li><li>Return in three months for a repeat lead level.</li><li>Schedule a vision screening &mdash; it is overdue.</li></ul></section></div>',
    contentCss: '.avs { font-family: Georgia, serif; max-width: 720px; }',
  },

  careJourneys: [
    {
      name: 'Asthma Action Plan',
      status: 'Active',
      startDate: '2021-05-04',
      provider: 'Dr. Julius Hibbert',
      nextStep: 'Review inhaler technique at the next well-child visit',
    },
  ],

  referrals: [
    {
      referralTo: 'Springfield School Vision Screening Program',
      reason: 'Overdue vision screening',
      referredBy: 'Dr. Julius Hibbert',
      date: '2026-02-06',
      status: 'Open',
      expirationDate: '2026-08-06',
    },
  ],

  letters: [
    {
      title: 'Sports Participation Clearance',
      date: '2026-02-06',
      provider: 'Dr. Julius Hibbert',
      type: 'Letter',
      summary: 'Clearance to participate in school athletics for the 2026 season, with an asthma action plan attached.',
      hnoId: 'WP-demo-hno-bart-letter-sports',
      csn: 'WP-demo-csn-bart-wellchild-2026-02-06',
    },
    {
      title: 'After Visit Summary — Well-Child Visit',
      date: '2026-02-06',
      provider: 'Dr. Julius Hibbert',
      type: 'After Visit Summary',
      summary: 'Routine well-child visit with sports clearance, HPV dose 1, and a blood lead level drawn.',
      hnoId: 'WP-demo-hno-bart-letter-avs',
      csn: 'WP-demo-csn-bart-wellchild-2026-02-06',
    },
  ],

  letterDetailsByHnoId: {
    'WP-demo-hno-bart-letter-sports': {
      bodyHTML:
        '<div class="letter"><p>Springfield General Hospital &mdash; Pediatrics</p><p>February 6, 2026</p><p>To the Athletic Department:</p><p>Bart Simpson was examined on February 6, 2026 and is cleared for full participation in school athletics for the 2026 season.</p><p>He has mild intermittent asthma. He should keep a rescue inhaler with him at practices and games and may use it before activity as prescribed. No other restrictions apply.</p><p>Sincerely,<br />Julius Hibbert, MD</p></div>',
    },
    'WP-demo-hno-bart-letter-avs': {
      bodyHTML:
        '<div class="letter"><p>February 6, 2026</p><p>Dear Mrs. Simpson,</p><p>Bart had his well-child visit today and is growing along his usual curve. His asthma remains well controlled, and he was cleared for sports.</p><p>He received the first HPV vaccine dose today; the second is due in six months. His blood lead level came back at 6 &micro;g/dL, which is above the reference value, so we will repeat it in three months and talk about possible sources at home.</p><p>Please also arrange a vision screening &mdash; that one is overdue.</p><p>Sincerely,<br />Julius Hibbert, MD</p></div>',
    },
  },

  documents: [
    { title: 'Sports Physical Form 2026', date: '2026-02-06', type: 'Clinical Document', provider: 'Dr. Julius Hibbert' },
    { title: 'Asthma Action Plan', date: '2025-02-11', type: 'Care Plan', provider: 'Dr. Julius Hibbert' },
  ],

  questionnaires: [
    {
      name: 'Pediatric Asthma Control Test',
      assignedDate: '2026-02-06',
      dueDate: '2026-08-06',
      status: 'Not Started',
      appointment: 'Well-child follow-up — 08/2026',
    },
  ],

  educationMaterials: [
    { title: 'Using a Metered-Dose Inhaler with a Spacer', assignedBy: 'Dr. Julius Hibbert', date: '2021-05-04', category: 'Asthma' },
    { title: 'Lowering Lead Exposure at Home', assignedBy: 'Dr. Julius Hibbert', date: '2026-02-06', category: 'Environmental Health' },
  ],

  activityFeed: [
    { date: '2026-02-08', type: 'Lab Results', description: 'Lab results available: CBC, Blood Lead' },
    { date: '2026-02-06', type: 'Visit', description: 'After Visit Summary available for Well-Child Visit' },
    { date: '2026-02-06', type: 'Immunization', description: 'HPV vaccine dose 1 administered' },
    { date: '2025-10-15', type: 'Immunization', description: 'Flu vaccine administered at Springfield General Hospital' },
  ],

  ehiExport: {
    availableFormats: ['FHIR R4 (JSON)', 'C-CDA (XML)'],
    lastExport: 'Never',
    note: 'Electronic Health Information export available per 21st Century Cures Act. Proxy access covers this record.',
  },

  linkedAccounts: [],

  messageRecipients: [
    { displayName: 'Dr. Julius Hibbert', specialty: 'Pediatrics', department: 'Primary Care' },
    { displayName: 'Nurse Ruth Powers', specialty: 'Nursing', department: 'Care Coordination' },
    { displayName: 'Patient Accounts', specialty: 'Billing', department: 'Patient Financial Services' },
  ],

  messageTopics: [
    { displayName: 'Medical Question', value: 'TOPIC-001' },
    { displayName: 'Medication Refill', value: 'TOPIC-002' },
    { displayName: 'Appointment Request', value: 'TOPIC-003' },
    { displayName: 'School or Sports Form', value: 'TOPIC-007' },
    { displayName: 'Other', value: 'TOPIC-006' },
  ],

  billing: [
    {
      date: '2026-02-06',
      description: 'Office Visit — Well-Child',
      provider: 'Dr. Julius Hibbert',
      totalCharge: '$220.00',
      insurancePaid: '$220.00',
      patientResponsibility: '$0.00',
      status: 'Paid',
    },
    {
      date: '2024-10-19',
      description: 'Urgent Care — Forearm Fracture',
      provider: 'Dr. Nick Riviera',
      totalCharge: '$860.00',
      insurancePaid: '$688.00',
      patientResponsibility: '$172.00',
      status: 'Paid',
    },
  ],

  insurance: [
    {
      plan: 'Springfield Nuclear Power Plant — PPO',
      memberId: 'SNPP-7704208',
      groupNumber: 'GRP-SECTOR7G',
      subscriber: 'Homer J. Simpson',
      effectiveDate: '2025-01-01',
      copay: { office: '$0 (preventive)', specialist: '$50', urgentCare: '$75', er: '$200' },
      deductible: '$1,500 individual',
      outOfPocketMax: '$6,000 individual',
    },
  ],

  medications: [
    {
      name: 'Albuterol HFA 90mcg inhaler',
      directions: 'Inhale 2 puffs every 4-6 hours as needed for wheeze or before exercise',
      prescriber: 'Dr. Julius Hibbert',
      pharmacy: 'Springfield Pharmacy',
      refillsRemaining: 1,
      lastFilled: '2025-11-02',
    },
    {
      name: 'Cetirizine 10mg',
      directions: 'Take 1 tablet by mouth daily during pollen season',
      prescriber: 'Dr. Julius Hibbert',
      pharmacy: 'Springfield Pharmacy',
      refillsRemaining: 3,
      lastFilled: '2026-03-02',
    },
  ],

  messages: [
    {
      id: 'msg-bart-001',
      subject: 'Blood lead result',
      from: 'Dr. Julius Hibbert',
      date: '2026-02-08',
      preview: "Bart's lead level came back slightly above the reference value...",
      messages: [
        {
          from: 'Dr. Julius Hibbert',
          date: '2026-02-08',
          body: "Hi Marge, Bart's blood lead came back at 6 µg/dL, which is above the reference value of 3.5 but not in the range where we treat. The usual sources are old paint and old plumbing. I've ordered a recheck in three months. In the meantime, running the tap for a minute before drinking and washing hands before meals both help.",
        },
      ],
    },
    {
      id: 'msg-bart-002',
      subject: 'Sports form for the season',
      from: 'Marge Simpson',
      date: '2026-01-28',
      preview: 'The school needs the participation form before tryouts...',
      messages: [
        {
          from: 'Marge Simpson',
          date: '2026-01-28',
          body: 'Hello! The school needs the sports participation form signed before tryouts on the 14th. Can we get that done at his February visit?',
        },
        {
          from: 'Nurse Ruth Powers',
          date: '2026-01-29',
          body: "Of course — Dr. Hibbert will complete it at the 2/6 well-child visit and we'll post a copy to the letters section that same day.",
        },
      ],
    },
  ],

  emergencyContacts: [
    { id: 'ec-b01', name: 'Marge Simpson', relationship: 'Mother', phone: '(555) 636-7664' },
    { id: 'ec-b02', name: 'Homer J. Simpson', relationship: 'Father', phone: '(555) 636-7663' },
  ],

  upcomingVisits: [
    {
      type: 'Lab Work',
      provider: 'Lab Services',
      department: 'Laboratory',
      location: 'Springfield General Hospital, 1st Floor',
      date: '2026-05-08',
      time: '9:15 AM',
      status: 'Scheduled',
      instructions: 'Blood lead recheck. No fasting required.',
    },
  ],

  availableAppointments: [
    {
      provider: 'Dr. Julius Hibbert',
      department: 'Pediatrics',
      location: 'Springfield General Hospital, Suite 200',
      visitType: 'Office Visit',
      slots: [
        { date: '2026-04-06', time: '3:30 PM', slotId: 'slot-b01' },
        { date: '2026-04-10', time: '4:00 PM', slotId: 'slot-b02' },
      ],
    },
    {
      provider: 'Springfield Vision Center',
      department: 'Ophthalmology',
      location: 'Springfield General Hospital, Suite 120',
      visitType: 'Vision Screening',
      slots: [
        { date: '2026-04-08', time: '10:00 AM', slotId: 'slot-b03' },
        { date: '2026-04-15', time: '11:30 AM', slotId: 'slot-b04' },
      ],
    },
  ],
};
