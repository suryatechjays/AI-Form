// Pre-loaded realistic sample medical records for one-click testing

export const SAMPLE_DOCUMENTS = [
  {
    id: 'sample-discharge-rx',
    title: 'Hospital Discharge Summary & Prescription',
    badge: 'Discharge Summary',
    format: 'Clinical Note / PDF',
    doctor: 'Dr. Sarah Jenkins, MD',
    patientName: 'David Michael Miller',
    description: 'Contains complete demographics, blood group, penicillin allergy, chronic hypertension, medications list, and recorded vitals.',
    text: `===============================================================
MERCY GENERAL HOSPITAL - PATIENT DISCHARGE SUMMARY & PRESCRIPTION
Department of Internal Medicine | 100 Hospital Drive, Suite 400
===============================================================

PATIENT IDENTIFICATION:
Patient Name: David Michael Miller
Date of Birth: 1985-04-12
Age: 41 yrs
Gender: Male
Blood Group: A+
Marital Status: Married
National ID: 489-12-8821
Preferred Language: English

CONTACT & EMERGENCY:
Primary Phone: (415) 555-3819
Email: david.miller85@example.com
Address: 1420 Franklin Street, San Francisco, CA 94109
Emergency Contact: Jennifer Miller (Spouse)
Emergency Phone: (415) 555-9924

HEALTH INSURANCE INFORMATION:
Insurance Provider: Blue Cross Blue Shield
Policy #: BCBS-99418204
Group #: GRP-88310
Subscriber: David Michael Miller (Self)

CRITICAL MEDICAL ALERTS & ALLERGIES:
Allergies: Penicillin (Severe - Anaphylaxis and breathing difficulty), Shellfish (Moderate - Urticaria/Hives)

PAST MEDICAL HISTORY & CHRONIC CONDITIONS:
- Hypertension (High BP)
- Type 2 Diabetes Mellitus
- Hyperlipidemia (High Cholesterol)

ACTIVE MEDICATIONS PRESCRIBED:
Rx 1: Metformin 500mg - Take 1 tablet twice daily with meals
Rx 2: Lisinopril 10mg - Take 1 tablet once daily in the morning
Rx 3: Atorvastatin 20mg - Take 1 tablet at bedtime

PHYSICAL VITALS RECORDED AT ADMISSION:
Blood Pressure: 135/85 mmHg
Heart Rate: 74 bpm
Temperature: 98.6 °F
Oxygen Saturation: 99%
Height: 178 cm
Weight: 82 kg

VISIT CONSULTATION DETAILS:
Department: General Medicine
Attending Physician: Dr. Sarah Jenkins, MD
Chief Complaint: Post-discharge monitoring for blood glucose control and recurrent tension headaches for the past 4 days.

Physician Signature: Dr. Sarah Jenkins, MD (License #MD-88319)`
  },
  {
    id: 'sample-orthopedic-intake',
    title: 'Orthopedic Specialty Patient Intake Sheet',
    badge: 'Specialty Intake',
    format: 'Intake Form / PDF',
    doctor: 'Dr. Gregory Vance, MD',
    patientName: 'Robert Anthony Chen',
    description: 'Orthopedic clinic registration with emergency contact, Sulfa allergy, knee joint injury, and vitals.',
    text: `===============================================================
PINNACLE ORTHOPEDIC & SPORTS MEDICINE CLINIC
New Patient Registration & Health History Intake
===============================================================

DEMOGRAPHIC PROFILE:
Patient Name: Robert Anthony Chen
DOB: 08/14/1982
Age: 44
Sex: Male
Blood Type: O+
Civil Status: Married
Occupation: Software Architect
SSN: 334-01-9921

PATIENT CONTACT:
Phone: (206) 555-7182
Email: robert.chen.tech@example.com
Address: 820 Pinecrest Boulevard, Seattle, WA 98101
Emergency Contact Person: Lisa Chen (Wife)
Emergency Phone: (206) 555-9014

PAYER & INSURANCE:
Insurance Carrier: Aetna Health Insurance
Member ID: AET-84910294
Group Number: AET-GRP-502
Relationship to Subscriber: Self

ALLERGIES & ADVERSE REACTIONS:
Allergies: Sulfa Drugs (Moderate - Skin rash and facial swelling), Aspirin / NSAIDs (Mild - Stomach upset)

MEDICAL CONDITIONS & SURGERIES:
Conditions: Asthma, Hypertension
Past Surgeries: Right Knee Arthroscopy (2019)

CURRENT ROUTINE MEDICATIONS:
Rx: Albuterol Inhaler 90mcg - 2 puffs as needed for wheezing
Rx: Amlodipine 5mg - once daily

VISIT SUMMARY & PRE-TRIAGE VITALS:
Department: Orthopedics
Consulting Doctor: Dr. Gregory Vance, MD
Reason for Visit: Severe pain, swelling and limited mobility in the right knee joint following a basketball injury 2 days ago.
BP: 128/82 mmHg
HR: 68 bpm
Temp: 98.4 °F
SpO2: 98%
Height: 183 cm
Weight: 86 kg`
  },
  {
    id: 'sample-cardiology-lab',
    title: 'Diagnostic Lab & Cardiology Referral Slip',
    badge: 'Lab & Referral',
    format: 'Diagnostic Record',
    doctor: 'Dr. Maya Patel, MD',
    patientName: 'Maria Elena Rodriguez',
    description: 'Lab test results and patient card with NKDA (no allergies), cardiology referral, and vital signs.',
    text: `===============================================================
METRO HEALTH LABS & CARDIOLOGY REFERRAL CENTER
Diagnostic Intake & Patient Record
===============================================================

PATIENT DATA:
Name: Rodriguez, Maria Elena
Date of Birth: 1995-11-23
Age: 31
Gender: Female
Blood Group: B+
Marital Status: Single
Language: English

COMMUNICATION:
Contact Number: (312) 555-4921
Email Address: maria.e.rodriguez@example.com
Residential Address: 540 Michigan Avenue, Chicago, IL 60611
Next of Kin / ICE: Carlos Rodriguez (Father)
Next of Kin Phone: (312) 555-8834

INSURANCE VERIFICATION:
Payer: UnitedHealthcare
Policy Number: UHC-39019248
Group ID: UHC-7740

CLINICAL ALERTS:
Allergies: NKDA (No Known Drug Allergies Reported)
Chronic Conditions: Migraine, Mild Hypothyroidism
Medications: Levothyroxine 50mcg once daily on empty stomach

CLINICAL VITALS:
Blood Pressure: 120/78 mmHg
Pulse: 72 bpm
Temp: 98.7 °F
O2 Sat: 99%
Height: 165 cm
Weight: 60 kg

CONSULTATION DETAILS:
Department: Cardiology
Physician: Dr. Maya Patel, MD
Chief Complaint: Occasional heart palpitations, lightheadedness and mild fatigue especially after physical exertion for 3 weeks.`
  },
  {
    id: 'sample-pediatric-intake',
    title: 'Pediatric & Family Health Record',
    badge: 'Family Medicine',
    format: 'Clinical Slip',
    doctor: 'Dr. Emily Thornton, MD',
    patientName: 'Lucas Alexander Wright',
    description: 'Pediatric / Family medicine record with peanut and amoxicillin allergies, parent emergency contact, and vitals.',
    text: `===============================================================
VALLEY PEDIATRIC & ADOLESCENT HEALTHCARE
Patient Registration & Clinical Record
===============================================================

PATIENT DEMOGRAPHICS:
Full Name: Lucas Alexander Wright
DOB: 2018-06-19
Age: 8 yrs
Sex: Male
Blood Group: O-
Preferred Language: English

PARENT / GUARDIAN CONTACT:
Contact Phone: (512) 555-9201
Email: wright.family@example.com
Address: 302 Oakwood Terrace, Austin, TX 78704
Emergency Contact: Sarah Wright (Mother)
Emergency Phone: (512) 555-9201

HEALTH COVERAGE:
Insurance Carrier: Cigna Healthcare
Policy #: CIG-88401923
Group #: GRP-1049
Policy Holder: Sarah Wright (Parent)

CRITICAL ALLERGY ALERT:
Allergies: Peanuts (Severe - Anaphylaxis / Epipen carrier), Amoxicillin (Moderate - Full body hives)

CONDITIONS & MEDICATIONS:
Conditions: Childhood Asthma
Medications: Flovent 44mcg 1 puff twice daily, Epipen 0.15mg Auto-injector carry as needed

VITALS & VISIT:
Department: Pediatrics
Attending: Dr. Emily Thornton, MD
Chief Complaint: Annual school physical check-up and updating asthma management plan.
BP: 102/64 mmHg
HR: 84 bpm
Temp: 98.2 °F
SpO2: 100%
Height: 128 cm
Weight: 26 kg`
  }
];

