// Patient Registration Data Model and Defaults

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];

export const DEPARTMENTS = [
  'General Medicine',
  'Cardiology',
  'Orthopedics',
  'Pediatrics',
  'Neurology',
  'Dermatology',
  'Pulmonology',
  'Gastroenterology',
  'ENT (Ear, Nose, Throat)',
  'Ophthalmology',
  'Emergency Care',
  'Oncology'
];

export const COMMON_ALLERGIES = [
  'Penicillin',
  'Amoxicillin',
  'Sulfa Drugs',
  'Aspirin / NSAIDs',
  'Cephalosporins',
  'Codeine / Opioids',
  'Latex',
  'Peanuts',
  'Shellfish',
  'Eggs',
  'Contrast Dye',
  'Iodine'
];

export const COMMON_CONDITIONS = [
  'Hypertension (High BP)',
  'Type 2 Diabetes',
  'Type 1 Diabetes',
  'Asthma',
  'Hyperlipidemia (High Cholesterol)',
  'Coronary Artery Disease',
  'Hypothyroidism',
  'GERD / Acid Reflux',
  'Chronic Kidney Disease',
  'Migraine',
  'Arthritis'
];

export const INITIAL_PATIENT_STATE = {
  // Identification
  registrationId: '',
  mrn: '', // Medical Record Number
  registrationDate: new Date().toISOString().split('T')[0],
  registrationTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),

  // Demographics
  firstName: '',
  middleName: '',
  lastName: '',
  dateOfBirth: '',
  age: '',
  gender: '',
  bloodGroup: 'Unknown',
  maritalStatus: '',
  nationalId: '', // SSN / National ID
  occupation: '',
  preferredLanguage: 'English',

  // Contact Info
  phone: '',
  email: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  
  // Emergency Contact
  emergencyContactName: '',
  emergencyContactRelation: '',
  emergencyContactPhone: '',
  emergencyContactAltPhone: '',

  // Insurance
  hasInsurance: true,
  insuranceProvider: '',
  policyNumber: '',
  groupNumber: '',
  policyHolderName: '',
  relationshipToPolicyHolder: 'Self',

  // Clinical & History
  hasAllergies: false,
  allergies: [], // Array of { allergen: string, reaction: string, severity: 'Mild'|'Moderate'|'Severe' }
  allergyNotes: '',
  chronicConditions: [], // Array of string
  pastSurgeries: '',
  familyMedicalHistory: '',
  currentMedications: [], // Array of { name: string, dosage: string, frequency: string }

  // Visit & Vitals
  department: 'General Medicine',
  consultingDoctor: '',
  chiefComplaint: '',
  symptomDuration: '',
  vitals: {
    bloodPressureSystolic: '',
    bloodPressureDiastolic: '',
    heartRate: '', // bpm
    temperature: '', // °F
    respiratoryRate: '', // bpm
    oxygenSaturation: '', // % SpO2
    heightCm: '',
    weightKg: '',
    bmi: ''
  },

  // Consent & Signature
  patientConsent: false,
  hipaaAcknowledged: false,
  signatureDataUrl: '',
  signatureType: 'draw', // 'draw' or 'type'
  typedSignature: '',
  notes: ''
};

export function generateRegistrationId() {
  const randomPart = Math.floor(10000 + Math.random() * 90000);
  const year = new Date().getFullYear();
  return `AEGIS-${year}-${randomPart}`;
}

export function generateMRN() {
  const random = Math.floor(100000 + Math.random() * 900000);
  return `MRN-${random}`;
}

export function calculateAge(dobString) {
  if (!dobString) return '';
  const dob = new Date(dobString);
  if (isNaN(dob.getTime())) return '';
  const diffMs = Date.now() - dob.getTime();
  const ageDate = new Date(diffMs);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

export function calculateBMI(heightCm, weightKg) {
  const h = parseFloat(heightCm);
  const w = parseFloat(weightKg);
  if (!h || !w || h <= 0 || w <= 0) return '';
  const heightM = h / 100;
  const bmi = w / (heightM * heightM);
  return bmi.toFixed(1);
}

