import {
  calculateAge,
  calculateBMI,
  BLOOD_GROUPS,
  COMMON_ALLERGIES,
  COMMON_CONDITIONS,
  DEPARTMENTS
} from '../types/patient.js';
import { extractPatientInformation } from './aiExtractor.js';

/**
 * Complete Registration Field Schema Classification
 * Every single field from INITIAL_PATIENT_STATE and the 7 registration sections
 * is categorized into exactly one of four clinical intake classifications:
 * - REQUIRED: Mandatory user-provided field
 * - OPTIONAL: Discretionary user-provided field that may be skipped
 * - CONDITIONAL: Asked only when its prerequisite condition is satisfied
 * - SYSTEM_GENERATED: Automatically created or finalized by the hospital EHR system (never asked)
 */
export const REGISTRATION_FIELDS_CLASSIFICATION = {
  // Section 1: Demographics
  firstName: { section: 1, type: 'REQUIRED', description: 'Legal first name' },
  middleName: { section: 1, type: 'OPTIONAL', description: 'Middle name or initial' },
  lastName: { section: 1, type: 'REQUIRED', description: 'Legal family/last name' },
  dateOfBirth: { section: 1, type: 'REQUIRED', description: 'Date of birth (YYYY-MM-DD)' },
  age: { section: 1, type: 'OPTIONAL', description: 'Age in years (derived from DOB)' },
  gender: { section: 1, type: 'REQUIRED', description: 'Biological gender marker' },
  bloodGroup: { section: 1, type: 'OPTIONAL', description: 'ABO Rh blood group' },
  maritalStatus: { section: 1, type: 'OPTIONAL', description: 'Marital/civil status' },
  nationalId: { section: 1, type: 'OPTIONAL', description: 'SSN or National ID' },
  occupation: { section: 1, type: 'OPTIONAL', description: 'Patient profession or employment' },
  preferredLanguage: { section: 1, type: 'OPTIONAL', description: 'Primary spoken language' },

  // Section 2: Contact Information
  phone: { section: 2, type: 'REQUIRED', description: 'Primary contact mobile/telephone' },
  email: { section: 2, type: 'OPTIONAL', description: 'Email address' },
  addressLine1: { section: 2, type: 'REQUIRED', description: 'House number & street address' },
  addressLine2: { section: 2, type: 'OPTIONAL', description: 'Apartment, suite, unit' },
  city: { section: 2, type: 'REQUIRED', description: 'Residential city' },
  state: { section: 2, type: 'REQUIRED', description: 'State or region' },
  postalCode: { section: 2, type: 'REQUIRED', description: 'Postal/ZIP code' },

  // Section 3: Emergency Contact
  emergencyContactName: { section: 3, type: 'REQUIRED', description: 'Emergency contact full name' },
  emergencyContactRelation: { section: 3, type: 'REQUIRED', description: 'Relationship to patient' },
  emergencyContactPhone: { section: 3, type: 'REQUIRED', description: 'Emergency contact phone number' },
  emergencyContactAltPhone: { section: 3, type: 'OPTIONAL', description: 'Alternate emergency telephone' },

  // Section 4: Clinical History, Allergies & Medications
  hasAllergies: { section: 4, type: 'REQUIRED', description: 'Allergy status (active allergies vs NKDA)' },
  allergies: { section: 4, type: 'CONDITIONAL', description: 'Allergen, reaction, severity (when hasAllergies is true)' },
  allergyNotes: { section: 4, type: 'CONDITIONAL', description: 'Additional allergy narrative notes' },
  chronicConditions: { section: 4, type: 'OPTIONAL', description: 'Diagnosed chronic conditions' },
  pastSurgeries: { section: 4, type: 'OPTIONAL', description: 'Surgical history and procedures' },
  familyMedicalHistory: { section: 4, type: 'OPTIONAL', description: 'Family medical history' },
  currentMedications: { section: 4, type: 'OPTIONAL', description: 'Active prescription medications with dosage/frequency' },

  // Section 5: Health Insurance & Billing
  hasInsurance: { section: 5, type: 'REQUIRED', description: 'Coverage status (insured vs self-pay)' },
  insuranceProvider: { section: 5, type: 'CONDITIONAL', description: 'Payer/insurance company name (when hasInsurance is true)' },
  policyNumber: { section: 5, type: 'CONDITIONAL', description: 'Policy/member ID (when hasInsurance is true)' },
  groupNumber: { section: 5, type: 'CONDITIONAL', description: 'Group plan number (when hasInsurance is true)' },
  policyHolderName: { section: 5, type: 'CONDITIONAL', description: 'Subscriber name (when hasInsurance is true)' },
  relationshipToPolicyHolder: { section: 5, type: 'CONDITIONAL', description: 'Relationship to subscriber (when hasInsurance is true)' },

  // Section 6: Visit Reason & Vitals
  department: { section: 6, type: 'REQUIRED', description: 'Admitting hospital department' },
  consultingDoctor: { section: 6, type: 'OPTIONAL', description: 'Attending physician/doctor' },
  chiefComplaint: { section: 6, type: 'REQUIRED', description: 'Presenting symptoms/chief complaint' },
  symptomDuration: { section: 6, type: 'OPTIONAL', description: 'Symptom onset/duration' },
  'vitals.bloodPressureSystolic': { section: 6, type: 'OPTIONAL', description: 'Systolic blood pressure (mmHg)' },
  'vitals.bloodPressureDiastolic': { section: 6, type: 'OPTIONAL', description: 'Diastolic blood pressure (mmHg)' },
  'vitals.heartRate': { section: 6, type: 'OPTIONAL', description: 'Resting pulse/heart rate (bpm)' },
  'vitals.temperature': { section: 6, type: 'OPTIONAL', description: 'Body temperature (°F)' },
  'vitals.respiratoryRate': { section: 6, type: 'OPTIONAL', description: 'Respiratory rate (bpm)' },
  'vitals.oxygenSaturation': { section: 6, type: 'OPTIONAL', description: 'Blood oxygen saturation SpO2 (%)' },
  'vitals.heightCm': { section: 6, type: 'OPTIONAL', description: 'Standing height (cm)' },
  'vitals.weightKg': { section: 6, type: 'OPTIONAL', description: 'Body weight (kg)' },
  'vitals.bmi': { section: 6, type: 'OPTIONAL', description: 'Body mass index (derived)' },

  // Section 7: System-Generated Information (Never Asked)
  registrationId: { section: 7, type: 'SYSTEM_GENERATED', description: 'System registration encounter ID' },
  mrn: { section: 7, type: 'SYSTEM_GENERATED', description: 'Master Medical Record Number' },
  registrationDate: { section: 7, type: 'SYSTEM_GENERATED', description: 'Encounter intake date' },
  registrationTime: { section: 7, type: 'SYSTEM_GENERATED', description: 'Encounter intake timestamp' },
  patientConsent: { section: 7, type: 'SYSTEM_GENERATED', description: 'Authorization consent flag (signed at review)' },
  hipaaAcknowledged: { section: 7, type: 'SYSTEM_GENERATED', description: 'HIPAA privacy notice acknowledgement' },
  signatureDataUrl: { section: 7, type: 'SYSTEM_GENERATED', description: 'Signature canvas image data URL' },
  signatureType: { section: 7, type: 'SYSTEM_GENERATED', description: 'Signature mechanism flag (draw/type)' },
  typedSignature: { section: 7, type: 'SYSTEM_GENERATED', description: 'Typed legal signature text' },
  notes: { section: 7, type: 'SYSTEM_GENERATED', description: 'Internal registrar audit notes' }
};

/**
 * Standardize various date formats into YYYY-MM-DD
 */
export function normalizeDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const clean = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;

  const monthMap = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };

  // e.g. "April 12 1985" or "April 12th, 1985"
  const m1 = clean.match(/([A-Za-z]{3,9})\s+([0-9]{1,2})(?:st|nd|rd|th)?,?\s+([0-9]{4})/i);
  if (m1) {
    const mon = m1[1].slice(0, 3).toLowerCase();
    if (monthMap[mon]) {
      return `${m1[3]}-${monthMap[mon]}-${String(m1[2]).padStart(2, '0')}`;
    }
  }

  // e.g. "12 April 1985"
  const m2 = clean.match(/([0-9]{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9}),?\s+([0-9]{4})/i);
  if (m2) {
    const mon = m2[2].slice(0, 3).toLowerCase();
    if (monthMap[mon]) {
      return `${m2[3]}-${monthMap[mon]}-${String(m2[1]).padStart(2, '0')}`;
    }
  }

  // e.g. "04/12/1985" or "12-04-1985"
  const parts = clean.split(/[\/\-\.]/);
  if (parts.length === 3) {
    const p1 = parseInt(parts[0], 10);
    const p2 = parseInt(parts[1], 10);
    const p3 = parseInt(parts[2], 10);

    if (p1 > 1000) {
      return `${p1}-${String(p2).padStart(2, '0')}-${String(p3).padStart(2, '0')}`;
    }
    if (p3 > 1000) {
      if (p1 > 12) {
        return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
      }
      return `${p3}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
    }
  }

  const d = new Date(clean);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return '';
}

/**
 * Normalizes spoken phone numbers (digits, spoken words, dashes)
 */
export function normalizePhone(phoneStr) {
  if (!phoneStr) return '';
  const wordDigits = {
    zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4',
    five: '5', six: '6', seven: '7', eight: '8', nine: '9'
  };

  let str = phoneStr.toLowerCase();
  for (const [w, d] of Object.entries(wordDigits)) {
    str = str.replace(new RegExp(`\\b${w}\\b`, 'g'), d);
  }

  const digits = str.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length >= 7) {
    return digits;
  }
  return phoneStr.trim();
}

/**
 * Normalizes and extracts oxygen saturation percentage from spoken or typed responses.
 * Examples:
 * - "99% oxygen" -> "99"
 * - "Oxygen level is 98 percent" -> "98"
 * - "SpO2 is 97" -> "97"
 * - "98 percent" -> "98"
 * - "oxygen is 99" -> "99"
 */
export function extractOxygenSaturation(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim();

  // Pattern 1: Number preceding oxygen/spo2/o2 ("99% oxygen", "99 percent oxygen", "99 % o2", "99 oxygen")
  const mBefore = t.match(/\b([789][0-9]|100)\s*(?:%|\s*percent)?\s*(?:oxygen|o2|spo2|pulse\s*ox)\b/i);
  if (mBefore) return parseInt(mBefore[1], 10);

  // Pattern 2: Oxygen/spo2/pulse ox preceding number ("oxygen level is 98 percent", "spo2 is 97", "pulse ox 96%", "oxygen: 99%")
  const mAfter = t.match(/\b(?:spo2|o2(?:\s*sat(?:uration)?)?|pulse\s*ox(?:ymetry)?|oxygen(?:\s*(?:level|saturation|reading))?)\s*(?:is|at|of|[:\-])?\s*([789][0-9]|100)\b/i);
  if (mAfter) return parseInt(mAfter[1], 10);

  // Pattern 3: Number with % sign or 'percent' when oxygen/sat/o2/spo2/pulse ox is present anywhere
  if (/\b(?:oxygen|spo2|o2|saturation|pulse\s*ox|ox)\b/i.test(t)) {
    const mPct = t.match(/\b([789][0-9]|100)\s*(?:%|percent)\b/i);
    if (mPct) return parseInt(mPct[1], 10);
  }

  // Pattern 4: Standalone number or percentage (e.g. "98%", "99 percent", "98")
  const mStandalone = t.match(/^\s*(?:it\s*(?:is|'s)\s*)?([789][0-9]|100)\s*(?:%|\s*percent)?\s*$/i);
  if (mStandalone) return parseInt(mStandalone[1], 10);

  return null;
}

/**
 * Normalizes and extracts heart rate from spoken or typed responses.
 * Examples:
 * - "Heart rate is 80" -> 80
 * - "Pulse 72" -> 72
 * - "75 bpm" -> 75
 */
export function extractHeartRate(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim();

  const mAfter = t.match(/\b(?:heart\s*rate|pulse|pulse\s*rate|pr|hr)\s*(?:is|at|of|[:\-])?\s*([3-9][0-9]|1[0-9]{2}|2[0-5][0-9])\b/i);
  if (mAfter) return parseInt(mAfter[1], 10);

  const mBefore = t.match(/\b([3-9][0-9]|1[0-9]{2}|2[0-5][0-9])\s*(?:bpm|beats\s*per\s*minute)\b/i);
  if (mBefore) return parseInt(mBefore[1], 10);

  const mStandalone = t.match(/^\s*(?:it\s*(?:is|'s)\s*)?([3-9][0-9]|1[0-9]{2}|2[0-5][0-9])\s*(?:bpm)?\s*$/i);
  if (mStandalone) return parseInt(mStandalone[1], 10);

  return null;
}

/**
 * Normalizes and extracts body temperature from spoken or typed responses.
 * Examples:
 * - "Temperature is 98.6 Fahrenheit" -> 98.6
 * - "Temp 98.4" -> 98.4
 * - "98.6 degrees" -> 98.6
 * - "37 Celsius" -> 98.6 (converted)
 */
export function extractTemperature(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim();

  // Celsius conversion (34.0 - 42.0 C)
  const mC = t.match(/(?:temp(?:erature)?\s*(?:is|at|of|[:\-])?\s*)?(3[4-9](?:\.[0-9])?|4[0-2](?:\.[0-9])?)\s*(?:degrees?\s*)?(?:°?\s*c(?:elsius)?)\b/i);
  if (mC) {
    const cVal = parseFloat(mC[1]);
    return parseFloat(((cVal * 9) / 5 + 32).toFixed(1));
  }

  // Fahrenheit (94.0 - 108.0 F)
  const mF = t.match(/(?:temp(?:erature)?\s*(?:is|at|of|[:\-])?\s*)?([9][4-9](?:\.[0-9])?|10[0-8](?:\.[0-9])?)\s*(?:°?\s*f(?:ahrenheit)?|degrees?(?:\s*(?:f|fahrenheit))?)?/i);
  if (mF && (/\b(?:temp|temperature|degrees?|f|fahrenheit)\b/i.test(t) || /^\s*[0-9]{2,3}(?:\.[0-9])?\s*$/i.test(t))) {
    return parseFloat(mF[1]);
  }

  return null;
}

/**
 * Normalizes and extracts blood pressure from spoken or typed responses.
 * Examples:
 * - "Blood pressure is 120 over 80" -> { systolic: "120", diastolic: "80", bloodPressureSystolic: "120", bloodPressureDiastolic: "80" }
 * - "120/80" -> { systolic: "120", diastolic: "80", bloodPressureSystolic: "120", bloodPressureDiastolic: "80" }
 */
export function extractBloodPressure(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim();

  const m = t.match(/(?:(?:bp|blood\s*pressure)\s*(?:is|at|of|[:\-])?\s*)?([789][0-9]|1[0-9]{2}|2[0-5][0-9])\s*(?:[\/|\\]|\s*over\s*)\s*([4-9][0-9]|1[0-5][0-9])\b/i);
  if (m) {
    const sys = parseInt(m[1], 10);
    const dia = parseInt(m[2], 10);
    if (sys > dia) {
      return {
        systolic: String(sys),
        diastolic: String(dia),
        bloodPressureSystolic: String(sys),
        bloodPressureDiastolic: String(dia)
      };
    }
  }
  return null;
}

/**
 * Normalizes and extracts respiratory rate from spoken or typed responses.
 * Examples:
 * - "Respiratory rate is 16" -> "16"
 * - "16 breaths per minute" -> "16"
 */
export function extractRespiratoryRate(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim();

  const mAfter = t.match(/\b(?:resp(?:iratory)?(?:\s*rate)?|respiration|breaths?(?:\s*per\s*minute)?)\s*(?:is|at|of|[:\-])?\s*([8-9]|[1-5][0-9]|60)\b/i);
  if (mAfter) return mAfter[1];

  const mBefore = t.match(/\b([8-9]|[1-5][0-9]|60)\s*(?:breaths?(?:\s*per\s*minute)?|bpm)\b/i);
  if (mBefore && /breath|resp/i.test(t)) return mBefore[1];

  return null;
}

/**
 * Normalizes and extracts height, weight, and calculates BMI.
 * Examples:
 * - "Height 175 cm, weight 70 kg"
 * - "5 feet 10 inches, 154 lbs"
 */
export function extractHeightWeight(text) {
  if (!text || typeof text !== 'string') return {};
  const t = text.trim();
  const res = {};

  // Feet & inches (e.g. "5 feet 10 inches", "5 ft 10 in", "5'10")
  const mFt = t.match(/\b([4-7])\s*(?:feet|ft|')\s*(?:and\s*)?([0-9]|1[01])?\s*(?:inches|in|")?\b/i);
  if (mFt) {
    const ft = parseInt(mFt[1], 10);
    const inch = parseInt(mFt[2] || '0', 10);
    res.heightCm = String(Math.round((ft * 12 + inch) * 2.54));
  } else {
    const mCm = t.match(/\b(?:height|ht)?\s*(?:is|at|[:\-])?\s*([5-9][0-9]|1[0-9]{2}|2[0-4][0-9])\s*(?:cm|centimeters?)?\b/i);
    if (mCm && (/\b(?:height|ht|cm|centimeters?)\b/i.test(t) || /^\s*[0-9]{2,3}\s*$/i.test(t))) {
      res.heightCm = mCm[1];
    }
  }

  // Pounds (lbs) to kg
  const mLbs = t.match(/\b([4-9][0-9]|[1-4][0-9]{2}|500)\s*(?:lbs|pounds?)\b/i);
  if (mLbs) {
    const lbs = parseFloat(mLbs[1]);
    res.weightKg = String(Math.round(lbs * 0.45359237 * 10) / 10);
  } else {
    const mKg = t.match(/\b(?:weight|wt)?\s*(?:is|at|[:\-])?\s*([2-9]|[1-9][0-9]|[1-2][0-9]{2}|3[0-5][0-9])(?:\.[0-9])?\s*(?:kg|kilos?|kilograms?)?\b/i);
    if (mKg && (/\b(?:weight|wt|kg|kilos?|kilograms?)\b/i.test(t) || /^\s*[0-9]{2,3}(?:\.[0-9])?\s*$/i.test(t))) {
      res.weightKg = mKg[1];
    }
  }

  if (res.heightCm && res.weightKg) {
    res.bmi = calculateBMI(res.heightCm, res.weightKg);
  }

  return res;
}

/**
 * Clinical and format validator for patient registration fields.
 * Validates reasonable clinical ranges and standards.
 * Returns: { isValid: boolean, error?: string, example?: string, normalizedValue?: any }
 */
export function validateFieldValue(fieldKey, value) {
  if (value === undefined || value === null || value === '') {
    return { isValid: false, error: 'Field is empty', example: '' };
  }

  switch (fieldKey) {
    case 'firstName':
    case 'lastName': {
      const str = String(value).trim();
      if (str.length < 2) {
        return { isValid: false, error: 'Name must be at least 2 characters', example: 'e.g. "John Smith"' };
      }
      if (/^(?:Dr\.?|Doctor)\b/i.test(str)) {
        return { isValid: false, error: 'Doctor prefix cannot be used for patient legal name', example: 'e.g. "John Smith"' };
      }
      if (/[0-9]/.test(str)) {
        return { isValid: false, error: 'Name cannot contain numbers', example: 'e.g. "Sarah Connor"' };
      }
      return { isValid: true, normalizedValue: str };
    }

    case 'dateOfBirth': {
      const normalized = normalizeDate(String(value));
      if (!normalized) {
        return { isValid: false, error: 'Invalid date format', example: 'e.g. "April 12, 1985" or "1985-04-12"' };
      }
      const dobDate = new Date(normalized);
      const now = new Date();
      if (dobDate > now) {
        return { isValid: false, error: 'Date of birth cannot be in the future', example: 'e.g. "April 12, 1985"' };
      }
      const ageYears = (now - dobDate) / (1000 * 60 * 60 * 24 * 365.25);
      if (ageYears > 125) {
        return { isValid: false, error: 'Date of birth exceeds realistic human lifespan (over 125 years)', example: 'e.g. "April 12, 1985"' };
      }
      return { isValid: true, normalizedValue: normalized };
    }

    case 'phone':
    case 'emergencyContactPhone':
    case 'emergencyContactAltPhone': {
      const normalized = normalizePhone(String(value));
      const digits = String(normalized).replace(/\D/g, '');
      if (digits.length < 10) {
        return { isValid: false, error: 'Phone number must have at least 10 digits', example: 'e.g. "(415) 555-0199"' };
      }
      return { isValid: true, normalizedValue: normalized };
    }

    case 'email': {
      const str = String(value).trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
      if (!emailRegex.test(str)) {
        return { isValid: false, error: 'Invalid email address format', example: 'e.g. "patient@example.com"' };
      }
      return { isValid: true, normalizedValue: str.toLowerCase() };
    }

    case 'bloodGroup': {
      const cleanStr = String(value).trim().toUpperCase();
      const bgMap = {
        'A+': 'A+', 'A POSITIVE': 'A+', 'A POS': 'A+',
        'A-': 'A-', 'A NEGATIVE': 'A-', 'A NEG': 'A-',
        'B+': 'B+', 'B POSITIVE': 'B+', 'B POS': 'B+',
        'B-': 'B-', 'B NEGATIVE': 'B-', 'B NEG': 'B-',
        'AB+': 'AB+', 'AB POSITIVE': 'AB+', 'AB POS': 'AB+',
        'AB-': 'AB-', 'AB NEGATIVE': 'AB-', 'AB NEG': 'AB-',
        'O+': 'O+', 'O POSITIVE': 'O+', 'O POS': 'O+',
        'O-': 'O-', 'O NEGATIVE': 'O-', 'O NEG': 'O-',
        'UNKNOWN': 'Unknown'
      };

      if (!bgMap[cleanStr]) {
        return { isValid: false, error: 'Invalid Blood Group', example: 'e.g. "O positive (O+)" or "A negative (A-)"' };
      }
      return { isValid: true, normalizedValue: bgMap[cleanStr] };
    }

    case 'gender': {
      const str = String(value).trim();
      const validGenders = new Set(['Male', 'Female', 'Non-Binary', 'Other']);
      if (!validGenders.has(str)) {
        return { isValid: false, error: 'Gender must be Male, Female, Non-Binary, or Other', example: 'e.g. "Male" or "Female"' };
      }
      return { isValid: true, normalizedValue: str };
    }

    case 'postalCode': {
      const str = String(value).trim();
      if (!/^\d{5}(-\d{4})?$|^[A-Za-z0-9\s\-]{3,10}$/.test(str)) {
        return { isValid: false, error: 'Invalid postal code format', example: 'e.g. "94107"' };
      }
      return { isValid: true, normalizedValue: str };
    }

    case 'bloodPressureSystolic':
    case 'vitals.bloodPressureSystolic': {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 70 || num > 250) {
        return { isValid: false, error: 'Systolic blood pressure out of range (70-250 mmHg)', example: 'e.g. "120"' };
      }
      return { isValid: true, normalizedValue: String(num) };
    }

    case 'bloodPressureDiastolic':
    case 'vitals.bloodPressureDiastolic': {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 40 || num > 150) {
        return { isValid: false, error: 'Diastolic blood pressure out of range (40-150 mmHg)', example: 'e.g. "80"' };
      }
      return { isValid: true, normalizedValue: String(num) };
    }

    case 'heartRate':
    case 'vitals.heartRate': {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 30 || num > 250) {
        return { isValid: false, error: 'Heart rate out of range (30-250 bpm)', example: 'e.g. "72 bpm"' };
      }
      return { isValid: true, normalizedValue: String(num) };
    }

    case 'temperature':
    case 'vitals.temperature': {
      const num = parseFloat(value);
      if (isNaN(num) || num < 94.0 || num > 108.0) {
        return { isValid: false, error: 'Body temperature out of range (94.0°F - 108.0°F)', example: 'e.g. "98.6"' };
      }
      return { isValid: true, normalizedValue: String(num) };
    }

    case 'respiratoryRate':
    case 'vitals.respiratoryRate': {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 8 || num > 60) {
        return { isValid: false, error: 'Respiratory rate out of range (8-60 breaths/min)', example: 'e.g. "16"' };
      }
      return { isValid: true, normalizedValue: String(num) };
    }

    case 'oxygenSaturation':
    case 'vitals.oxygenSaturation': {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 70 || num > 100) {
        return { isValid: false, error: 'Oxygen saturation out of range (70% - 100%)', example: 'e.g. "98%"' };
      }
      return { isValid: true, normalizedValue: String(num) };
    }

    case 'heightCm':
    case 'vitals.heightCm': {
      const num = parseFloat(value);
      if (isNaN(num) || num < 30 || num > 250) {
        return { isValid: false, error: 'Height out of range (30-250 cm)', example: 'e.g. "175 cm"' };
      }
      return { isValid: true, normalizedValue: String(Math.round(num)) };
    }

    case 'weightKg':
    case 'vitals.weightKg': {
      const num = parseFloat(value);
      if (isNaN(num) || num < 2 || num > 350) {
        return { isValid: false, error: 'Weight out of range (2-350 kg)', example: 'e.g. "70 kg"' };
      }
      return { isValid: true, normalizedValue: String(num) };
    }

    default:
      return { isValid: true, normalizedValue: value };
  }
}

/**
 * Detects if a medical statement is confirmed positive, confirmed negative, or unknown/uncertain.
 */
export function detectMedicalAnswerType(text) {
  if (!text || typeof text !== 'string') return 'UNKNOWN';
  const t = text.trim();

  // Unknown / uncertain patterns anywhere in the statement
  if (/\b(?:not\s*sure|don'?t\s*know|do\s*not\s*know|unknown|unsure|cannot\s*recall|can'?t\s*recall|not\s*tested|no\s*idea|idk)\b/i.test(t)) {
    return 'UNKNOWN';
  }

  // Explicit negative patterns
  if (/\b(?:no\s*known|nkda|no\s*allergies|no\s*conditions?|no\s*medications?|none\s*reported|never\s*had|free\s*of)\b/i.test(t)) {
    return 'NEGATIVE';
  }
  if (/^(?:no|none|nothing|negative|healthy|nah|nope|nil)$/i.test(t)) {
    return 'NEGATIVE';
  }
  if (/\b(?:don'?t\s*have|do\s*not\s*have|have\s*no)\b/i.test(t) && !/\b(?:yes|have\s+(?:hypertension|diabetes|asthma|penicillin))\b/i.test(t)) {
    return 'NEGATIVE';
  }

  return 'POSITIVE';
}

/**
 * Detects if the patient's utterance indicates a correction or repeat request.
 */
export function detectCorrectionIntent(text, currentQuestionId = null, previousQuestionId = null) {
  if (!text || typeof text !== 'string') {
    return { isRepeat: false, isCorrection: false };
  }
  const clean = text.trim();

  // Repeat request
  if (/\b(?:repeat(?:\s*(?:the)?\s*question)?|say\s*(?:that\s*)?again|what\s*was\s*the\s*question|pardon(?:\s*me)?)\b/i.test(clean)) {
    return { isRepeat: true, isCorrection: false };
  }

  // Correction pattern
  const m = clean.match(/^(?:actually|correction|wait|no\s*wait|i\s*want\s*to\s*correct(?:\s*my)?(?:\s*previous)?(?:\s*answer)?|that\s*(?:number|answer)?\s*(?:is|was)?\s*wrong|change\s*my)\s*[:,\-]?\s*(.*)$/i);
  if (m) {
    const remainder = m[1] || clean;
    let targetQuestionId = previousQuestionId || currentQuestionId || 'name';

    if (/\b(?:name|first\s*name|last\s*name)\b/i.test(clean)) targetQuestionId = 'name';
    else if (/\b(?:dob|date\s*of\s*birth|birth\s*date|born|birthday)\b/i.test(clean)) targetQuestionId = 'dob';
    else if (/\b(?:gender|sex)\b/i.test(clean)) targetQuestionId = 'gender';
    else if (/\b(?:blood\s*group|blood\s*type)\b/i.test(clean)) targetQuestionId = 'bloodGroup';
    else if (/\b(?:phone|telephone|mobile|number|cell)\b/i.test(clean) && !/emergency/i.test(clean)) targetQuestionId = 'phone';
    else if (/\b(?:email|mail)\b/i.test(clean)) targetQuestionId = 'email';
    else if (/\b(?:address|street|live|apartment|unit|suite)\b/i.test(clean)) targetQuestionId = 'addressStreet';
    else if (/\b(?:city|state|zip|postal)\b/i.test(clean)) targetQuestionId = 'addressCityStateZip';
    else if (/\b(?:emergency|contact)\b/i.test(clean)) targetQuestionId = 'emergencyContact';
    else if (/\b(?:allergy|allergies|allergic)\b/i.test(clean)) targetQuestionId = 'allergies';
    else if (/\b(?:condition|conditions|disease|illness)\b/i.test(clean)) targetQuestionId = 'chronicConditions';
    else if (/\b(?:medication|medications|meds|drugs|prescriptions?)\b/i.test(clean)) targetQuestionId = 'currentMedications';
    else if (/\b(?:insurance|policy|provider)\b/i.test(clean)) targetQuestionId = 'hasInsurance';
    else if (/\b(?:doctor|physician|consultant|dr)\b/i.test(clean)) targetQuestionId = 'consultingDoctor';
    else if (/\b(?:department)\b/i.test(clean)) targetQuestionId = 'department';
    else if (/\b(?:blood\s*pressure|pulse|heart\s*rate|bp)\b/i.test(clean)) targetQuestionId = 'vitalsCardio';
    else if (/\b(?:oxygen|spo2|temperature|temp|respiration)\b/i.test(clean)) targetQuestionId = 'vitalsPhysio';
    else if (/\b(?:height|weight|bmi)\b/i.test(clean)) targetQuestionId = 'vitalsBody';

    return {
      isRepeat: false,
      isCorrection: true,
      targetQuestionId,
      correctedValueText: remainder || clean
    };
  }

  return { isRepeat: false, isCorrection: false };
}

/**
 * Privacy-conscious session-scoped storage helpers for in-progress voice QA sessions.
 * Strictly uses sessionStorage (cleared when browser tab/window closes). Never persistent localStorage.
 */
export function saveVoiceSession(arg1, arg2, arg3) {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    let collectedFields = {};
    let currentQuestionId = 'name';
    let questionAnswers = {};

    if (arg1 && typeof arg1 === 'object' && (arg2 === undefined || typeof arg2 === 'string')) {
      collectedFields = arg1;
      currentQuestionId = arg2 || 'name';
      questionAnswers = arg3 || {};
    } else if (typeof arg1 === 'string' && typeof arg2 === 'object') {
      collectedFields = arg2?.collectedFields || arg2;
      currentQuestionId = arg2?.currentQuestionId || 'name';
      questionAnswers = arg2?.questionAnswers || {};
    }

    const payload = {
      timestamp: Date.now(),
      collectedFields,
      currentQuestionId,
      questionAnswers
    };
    window.sessionStorage.setItem('aegis_qa_session_active', JSON.stringify(payload));
  } catch (e) {
    console.warn('Voice session save failed:', e);
  }
}

export function loadVoiceSession(maxAgeMs = 1800000) { // 30 minutes
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem('aegis_qa_session_active');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.timestamp || Date.now() - parsed.timestamp > maxAgeMs) {
      window.sessionStorage.removeItem('aegis_qa_session_active');
      return null;
    }
    return parsed;
  } catch (e) {
    return null;
  }
}

export function clearVoiceSession() {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.removeItem('aegis_qa_session_active');
  } catch (e) {}
}

/**
 * Evaluates completion status across all applicable questions.
 * Distinguishes collected, missing required, skipped optional, and unknown/unanswered fields.
 */
export function getCompletionStatus(applicableQuestions, collectedFields) {
  const missingRequired = [];
  const skippedOptional = [];
  const collectedList = [];
  const unknownList = [];

  for (const q of applicableQuestions) {
    const isPop = q.isPopulated(collectedFields);
    if (isPop) {
      collectedList.push(q);
    } else if (q.isRequired) {
      missingRequired.push(q);
    } else if (q.isOptional) {
      skippedOptional.push(q);
    } else {
      unknownList.push(q);
    }
  }

  const isReadyForApply = missingRequired.length === 0;

  return {
    collectedList,
    missingRequired,
    skippedOptional,
    unknownList,
    isReadyForApply
  };
}

/**
 * Checks if a user voice or text response indicates an explicit intent to skip or not answer
 */
export function isSkipIntent(transcript) {
  if (!transcript || typeof transcript !== 'string') return false;
  const t = transcript.trim().toLowerCase();
  if (!t) return false;

  const skipPatterns = [
    /^(skip|next|pass|none|no|n\/?a|not applicable|nothing|leave blank|prefer not to say|idk|i\s*(?:do\s*not|don'?t)\s*know|not sure|unknown|no thanks|skip question|next question)$/i,
    /^(i\s*(?:do\s*not|don'?t)\s*have (any|one|insurance|allergies|conditions|medications|number))$/i,
    /^(no (known )?allergies|no allergies|nkda|no medications|none reported)$/i,
    /^(?:skip|next|pass)\s*(?:question|this)?$/i
  ];

  return skipPatterns.some(rx => rx.test(t));
}

/**
 * Checks if a specific value is non-empty and user-populated
 */
export function isValuePopulated(val) {
  if (val === undefined || val === null || val === '') return false;
  if (typeof val === 'string') return val.trim().length > 0 && val.trim() !== 'Unknown';
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === 'boolean') return true;
  if (typeof val === 'number') return !isNaN(val);
  if (typeof val === 'object') {
    return Object.values(val).some(v => v !== '' && v !== null && v !== undefined);
  }
  return false;
}

/**
 * Authoritative, ordered question catalog covering every patient-provided field
 * across Sections 1–6. System-generated fields are strictly omitted.
 */
export const VOICE_QA_CATALOG = [
  // ==========================================
  // SECTION 1: DEMOGRAPHICS
  // ==========================================
  {
    id: 'name',
    sectionNumber: 1,
    sectionTitle: 'Demographics & Identity',
    fieldKeys: ['firstName', 'middleName', 'lastName'],
    question: 'What is your full legal name, including your first, middle, and last name?',
    hint: 'e.g. "My name is David Michael Miller" or "Sarah Connor"',
    isRequired: true,
    isOptional: false,
    isConditional: false,
    isPopulated: (c) => Boolean(c.firstName && c.lastName)
  },
  {
    id: 'dob',
    sectionNumber: 1,
    sectionTitle: 'Demographics & Identity',
    fieldKeys: ['dateOfBirth', 'age'],
    question: 'What is your date of birth?',
    hint: 'e.g. "April 12, 1985" or "12/04/1985"',
    isRequired: true,
    isOptional: false,
    isConditional: false,
    isPopulated: (c) => Boolean(c.dateOfBirth)
  },
  {
    id: 'gender',
    sectionNumber: 1,
    sectionTitle: 'Demographics & Identity',
    fieldKeys: ['gender'],
    question: 'What is your biological gender marker?',
    hint: 'e.g. "Male", "Female", "Non-Binary", or "Other"',
    isRequired: true,
    isOptional: false,
    isConditional: false,
    isPopulated: (c) => Boolean(c.gender)
  },
  {
    id: 'bloodGroup',
    sectionNumber: 1,
    sectionTitle: 'Demographics & Identity',
    fieldKeys: ['bloodGroup'],
    question: 'What is your blood group, if you happen to know it?',
    hint: 'e.g. "O positive", "A negative", or say "Unknown"',
    isRequired: false,
    isOptional: true,
    isConditional: false,
    isPopulated: (c) => Boolean(c.bloodGroup && c.bloodGroup !== 'Unknown')
  },
  {
    id: 'maritalStatus',
    sectionNumber: 1,
    sectionTitle: 'Demographics & Identity',
    fieldKeys: ['maritalStatus'],
    question: 'What is your marital status?',
    hint: 'e.g. "Single", "Married", "Divorced", or "Widowed"',
    isRequired: false,
    isOptional: true,
    isConditional: false,
    isPopulated: (c) => Boolean(c.maritalStatus)
  },
  {
    id: 'language_occupation',
    sectionNumber: 1,
    sectionTitle: 'Demographics & Identity',
    fieldKeys: ['preferredLanguage', 'occupation'],
    question: 'What is your preferred language for communication and your current occupation?',
    hint: 'e.g. "English, Software Engineer" or "Spanish, Retired"',
    isRequired: false,
    isOptional: true,
    isConditional: false,
    isPopulated: (c) => Boolean(c.occupation || (c.preferredLanguage && c.preferredLanguage !== 'English'))
  },
  {
    id: 'nationalId',
    sectionNumber: 1,
    sectionTitle: 'Demographics & Identity',
    fieldKeys: ['nationalId'],
    question: 'Do you have a National ID or Social Security Number you would like to provide?',
    hint: 'e.g. "123-45-6789" or say "Skip"',
    isRequired: false,
    isOptional: true,
    isConditional: false,
    isPopulated: (c) => Boolean(c.nationalId)
  },

  // ==========================================
  // SECTION 2: CONTACT INFORMATION
  // ==========================================
  {
    id: 'phone',
    sectionNumber: 2,
    sectionTitle: 'Contact Information',
    fieldKeys: ['phone'],
    question: 'What is your primary contact mobile or telephone number?',
    hint: 'e.g. "415-555-3819"',
    isRequired: true,
    isOptional: false,
    isConditional: false,
    isPopulated: (c) => Boolean(c.phone)
  },
  {
    id: 'email',
    sectionNumber: 2,
    sectionTitle: 'Contact Information',
    fieldKeys: ['email'],
    question: 'What is your email address for digital appointment confirmations?',
    hint: 'e.g. "david.miller@example.com" or say "Skip"',
    isRequired: false,
    isOptional: true,
    isConditional: false,
    isPopulated: (c) => Boolean(c.email)
  },
  {
    id: 'addressStreet',
    sectionNumber: 2,
    sectionTitle: 'Contact Information',
    fieldKeys: ['addressLine1', 'addressLine2'],
    question: 'What is your house number and street address, including any apartment or unit number?',
    hint: 'e.g. "742 Evergreen Terrace, Apartment 4B"',
    isRequired: true,
    isOptional: false,
    isConditional: false,
    isPopulated: (c) => Boolean(c.addressLine1)
  },
  {
    id: 'addressCityStateZip',
    sectionNumber: 2,
    sectionTitle: 'Contact Information',
    fieldKeys: ['city', 'state', 'postalCode'],
    question: 'What city, state or region, and postal zip code do you reside in?',
    hint: 'e.g. "San Francisco, California, 94107"',
    isRequired: true,
    isOptional: false,
    isConditional: false,
    isPopulated: (c) => Boolean(c.city && c.state && c.postalCode)
  },

  // ==========================================
  // SECTION 3: EMERGENCY CONTACT
  // ==========================================
  {
    id: 'emergencyContact',
    sectionNumber: 3,
    sectionTitle: 'Emergency Contact',
    fieldKeys: ['emergencyContactName', 'emergencyContactRelation', 'emergencyContactPhone'],
    question: 'Who is your primary emergency contact person, what is their relationship to you, and what is their phone number?',
    hint: 'e.g. "Jennifer Miller, my spouse, phone 415-555-9924"',
    isRequired: true,
    isOptional: false,
    isConditional: false,
    isPopulated: (c) => Boolean(c.emergencyContactName && (c.emergencyContactPhone || c.emergencyContactRelation))
  },
  {
    id: 'emergencyAltPhone',
    sectionNumber: 3,
    sectionTitle: 'Emergency Contact',
    fieldKeys: ['emergencyContactAltPhone'],
    question: 'Do you have an alternate or work phone number for your emergency contact?',
    hint: 'e.g. "415-555-9925" or say "None"',
    isRequired: false,
    isOptional: true,
    isConditional: false,
    isPopulated: (c) => Boolean(c.emergencyContactAltPhone)
  },

  // ==========================================
  // SECTION 4: CLINICAL HISTORY, ALLERGIES & MEDICATIONS
  // ==========================================
  {
    id: 'allergies',
    sectionNumber: 4,
    sectionTitle: 'Clinical History & Safety',
    fieldKeys: ['hasAllergies'],
    question: 'Do you have any known drug, food, or environmental allergies, or do you have No Known Drug Allergies (NKDA)?',
    hint: 'e.g. "I have allergies" or "No allergies (NKDA)"',
    isRequired: true,
    isOptional: false,
    isConditional: false,
    isPopulated: (c) => c.hasAllergies !== undefined && c.hasAllergies !== null
  },
  {
    id: 'allergyDetails',
    sectionNumber: 4,
    sectionTitle: 'Clinical History & Safety',
    fieldKeys: ['allergies', 'allergyNotes'],
    question: 'Please list the specific allergens, what reactions occur, and any additional allergy notes.',
    hint: 'e.g. "Severe Penicillin allergy causing hives and facial swelling"',
    isRequired: false,
    isOptional: false,
    isConditional: true,
    condition: (c) => c.hasAllergies === true,
    isPopulated: (c) => Boolean(c.allergies && c.allergies.length > 0)
  },
  {
    id: 'chronicConditions',
    sectionNumber: 4,
    sectionTitle: 'Clinical History & Safety',
    fieldKeys: ['chronicConditions'],
    question: 'Do you have any diagnosed chronic medical conditions, such as high blood pressure, diabetes, or asthma?',
    hint: 'e.g. "Hypertension and Type 2 Diabetes" or say "None"',
    isRequired: false,
    isOptional: true,
    isConditional: false,
    isPopulated: (c) => Boolean(c.chronicConditions && c.chronicConditions.length > 0)
  },
  {
    id: 'currentMedications',
    sectionNumber: 4,
    sectionTitle: 'Clinical History & Safety',
    fieldKeys: ['currentMedications'],
    question: 'Are you currently taking any daily prescription medications or supplements? Please state the name, dosage, and frequency.',
    hint: 'e.g. "Metformin 500mg twice daily and Lisinopril 10mg once daily" or "None"',
    isRequired: false,
    isOptional: true,
    isConditional: false,
    isPopulated: (c) => Boolean(c.currentMedications && c.currentMedications.length > 0)
  },
  {
    id: 'surgeries_familyHistory',
    sectionNumber: 4,
    sectionTitle: 'Clinical History & Safety',
    fieldKeys: ['pastSurgeries', 'familyMedicalHistory'],
    question: 'Have you had any past surgeries, hospitalizations, or notable family medical history?',
    hint: 'e.g. "Appendectomy in 2018, family history of heart disease" or say "None"',
    isRequired: false,
    isOptional: true,
    isConditional: false,
    isPopulated: (c) => Boolean(c.pastSurgeries || c.familyMedicalHistory)
  },

  // ==========================================
  // SECTION 5: HEALTH INSURANCE & BILLING
  // ==========================================
  {
    id: 'hasInsurance',
    sectionNumber: 5,
    sectionTitle: 'Health Insurance',
    fieldKeys: ['hasInsurance'],
    question: 'Do you have active health insurance coverage for this hospital visit, or will this encounter be self-pay?',
    hint: 'e.g. "I have health insurance" or "Self-pay, no insurance"',
    isRequired: true,
    isOptional: false,
    isConditional: false,
    isPopulated: (c) => c.hasInsurance !== undefined && c.hasInsurance !== null
  },
  {
    id: 'insuranceDetails',
    sectionNumber: 5,
    sectionTitle: 'Health Insurance',
    fieldKeys: ['insuranceProvider', 'policyNumber', 'groupNumber'],
    question: 'What is your health insurance company name, policy member ID, and group number?',
    hint: 'e.g. "Blue Cross Blue Shield, policy BCBS-8821904, group GRP-100"',
    isRequired: false,
    isOptional: true,
    isConditional: true,
    condition: (c) => c.hasInsurance === true,
    isPopulated: (c) => Boolean(c.insuranceProvider || c.policyNumber)
  },
  {
    id: 'insuranceSubscriber',
    sectionNumber: 5,
    sectionTitle: 'Health Insurance',
    fieldKeys: ['policyHolderName', 'relationshipToPolicyHolder'],
    question: 'Who is the primary policy holder, and what is your relationship to them?',
    hint: 'e.g. "Self" or "My spouse, Jennifer Miller"',
    isRequired: false,
    isOptional: true,
    isConditional: true,
    condition: (c) => c.hasInsurance === true,
    isPopulated: (c) => Boolean(c.policyHolderName || (c.relationshipToPolicyHolder && c.relationshipToPolicyHolder !== 'Self'))
  },

  // ==========================================
  // SECTION 6: VISIT REASON & PRE-ADMISSION VITALS
  // ==========================================
  {
    id: 'department',
    sectionNumber: 6,
    sectionTitle: 'Visit Reason & Vitals',
    fieldKeys: ['department'],
    question: 'Which clinical department are you visiting for this appointment?',
    hint: 'e.g. "General Medicine", "Cardiology", "Orthopedics", or "Pediatrics"',
    isRequired: true,
    isOptional: false,
    isConditional: false,
    isPopulated: (c) => Boolean(c.department)
  },
  {
    id: 'chiefComplaint',
    sectionNumber: 6,
    sectionTitle: 'Visit Reason & Vitals',
    fieldKeys: ['chiefComplaint', 'symptomDuration'],
    question: 'What primary symptoms or health concerns bring you in today, and how long have you experienced them?',
    hint: 'e.g. "Acute lower back pain radiating to left leg for the past 4 days"',
    isRequired: true,
    isOptional: false,
    isConditional: false,
    isPopulated: (c) => Boolean(c.chiefComplaint)
  },
  {
    id: 'consultingDoctor',
    sectionNumber: 6,
    sectionTitle: 'Visit Reason & Vitals',
    fieldKeys: ['consultingDoctor'],
    question: 'Do you have a specific attending physician or consulting doctor requested for this visit?',
    hint: 'e.g. "Dr. Sarah Jenkins" or say "No preference"',
    isRequired: false,
    isOptional: true,
    isConditional: false,
    isPopulated: (c) => Boolean(c.consultingDoctor)
  },
  {
    id: 'vitalsCardio',
    sectionNumber: 6,
    sectionTitle: 'Visit Reason & Vitals',
    fieldKeys: ['vitals.bloodPressureSystolic', 'vitals.bloodPressureDiastolic', 'vitals.heartRate'],
    question: 'Do you have a recent blood pressure reading or resting pulse rate to report?',
    hint: 'e.g. "120 over 80, pulse 72" or say "Skip"',
    isRequired: false,
    isOptional: true,
    isConditional: false,
    isPopulated: (c) => Boolean(c.vitals && (c.vitals.bloodPressureSystolic || c.vitals.heartRate))
  },
  {
    id: 'vitalsPhysio',
    sectionNumber: 6,
    sectionTitle: 'Visit Reason & Vitals',
    fieldKeys: ['vitals.temperature', 'vitals.oxygenSaturation', 'vitals.respiratoryRate'],
    question: 'Do you have a recent body temperature, oxygen saturation, or respiratory rate to record?',
    hint: 'e.g. "98.6 degrees, 99 percent oxygen" or say "Skip"',
    isRequired: false,
    isOptional: true,
    isConditional: false,
    isPopulated: (c) => Boolean(c.vitals && (c.vitals.temperature || c.vitals.oxygenSaturation || c.vitals.respiratoryRate))
  },
  {
    id: 'vitalsBody',
    sectionNumber: 6,
    sectionTitle: 'Visit Reason & Vitals',
    fieldKeys: ['vitals.heightCm', 'vitals.weightKg', 'vitals.bmi'],
    question: 'What is your current height and weight for pre-admission baseline records?',
    hint: 'e.g. "Height 175 centimeters, weight 70 kilograms" or say "Skip"',
    isRequired: false,
    isOptional: true,
    isConditional: false,
    isPopulated: (c) => Boolean(c.vitals && (c.vitals.heightCm || c.vitals.weightKg))
  }
];

// Alias for backwards compatibility if needed
export const VOICE_QA_QUESTIONS = VOICE_QA_CATALOG;

/**
 * Returns the stable list of active applicable questions based on current session data.
 * Questions whose prerequisite condition is not satisfied are cleanly excluded,
 * preventing stale indices or numbering jumps.
 */
export function getApplicableQuestions(catalog, collected) {
  return catalog.filter(q => !q.condition || q.condition(collected));
}

/**
 * Question-targeted conversational parser.
 * Converts direct voice responses into structured field values for the active question.
 */
export function parseTargetedAnswer(questionId, transcript, currentCollected = {}) {
  if (!transcript || typeof transcript !== 'string') return {};
  const text = transcript.trim();
  if (text.length < 1) return {};

  const patch = {};

  switch (questionId) {
    case 'name': {
      // If patient mentions a doctor ("Dr. Kumar" or "consult Dr."), reject as patient name
      if (/^(?:Dr\.?|Doctor)\b/i.test(text.trim()) || /(?:consult|see\s*dr|physician)/i.test(text)) {
        break;
      }
      const clean = text
        .replace(/^(?:my\s*name\s*is|i\s*am|this\s*is|patient\s*(?:name\s*)?is|name\s*[:\-])\s*/i, '')
        .replace(/[,\.]/g, '')
        .trim();
      const parts = clean.split(/\s+/).filter(Boolean);
      if (parts.length === 1) {
        patch.firstName = parts[0];
      } else if (parts.length === 2) {
        patch.firstName = parts[0];
        patch.lastName = parts[1];
      } else if (parts.length >= 3) {
        patch.firstName = parts[0];
        patch.middleName = parts.slice(1, -1).join(' ');
        patch.lastName = parts[parts.length - 1];
      }
      break;
    }

    case 'dob': {
      const parsedDate = normalizeDate(text);
      if (parsedDate) {
        patch.dateOfBirth = parsedDate;
        const age = calculateAge(parsedDate);
        if (age) patch.age = age;
      }
      break;
    }

    case 'gender': {
      if (/female|\bwoman\b|\bgirl\b/i.test(text)) {
        patch.gender = 'Female';
      } else if (/\bmale\b|\bman\b|\bboy\b/i.test(text)) {
        patch.gender = 'Male';
      } else if (/non[\-\s]?binary/i.test(text)) {
        patch.gender = 'Non-Binary';
      } else if (/other|prefer not/i.test(text)) {
        patch.gender = 'Other';
      }
      break;
    }

    case 'bloodGroup': {
      const bgMatch = text.match(/\b(A|B|AB|O)\s*([+\-]|pos(?:itive)?|neg(?:ative)?)/i) ||
                      text.match(/\b(A|B|AB|O)\b/i);
      if (bgMatch) {
        const type = bgMatch[1].toUpperCase();
        let sign = '+';
        if (bgMatch[2]) {
          sign = bgMatch[2].toLowerCase().startsWith('n') || bgMatch[2] === '-' ? '-' : '+';
        } else if (/neg/i.test(text)) {
          sign = '-';
        }
        patch.bloodGroup = `${type}${sign}`;
      } else if (/unknown|not sure|don'?t know/i.test(text)) {
        patch.bloodGroup = 'Unknown';
      }
      break;
    }

    case 'maritalStatus': {
      if (/married/i.test(text)) patch.maritalStatus = 'Married';
      else if (/single/i.test(text)) patch.maritalStatus = 'Single';
      else if (/divorced/i.test(text)) patch.maritalStatus = 'Divorced';
      else if (/widowed/i.test(text)) patch.maritalStatus = 'Widowed';
      else if (/other/i.test(text)) patch.maritalStatus = 'Other';
      break;
    }

    case 'language_occupation': {
      const langMatch = text.match(/\b(English|Spanish|French|Mandarin|Cantonese|Hindi|Arabic|Russian|German|Portuguese|Vietnamese|Tagalog)\b/i);
      if (langMatch) {
        patch.preferredLanguage = langMatch[1].charAt(0).toUpperCase() + langMatch[1].slice(1).toLowerCase();
      }

      // Occupation: clean introductory filler
      const occCandidate = text
        .replace(/\b(English|Spanish|French|Mandarin|Cantonese|Hindi|Arabic|Russian|German|Portuguese|Vietnamese|Tagalog)\b/gi, '')
        .replace(/^(?:my\s*occupation\s*is|i\s*work\s*as\s*(?:a|an)?|occupation\s*is|i\s*am\s*(?:a|an)?)\s*/i, '')
        .replace(/[,;]/g, ' ')
        .trim();
      if (occCandidate.length > 2) {
        patch.occupation = occCandidate;
      }
      break;
    }

    case 'nationalId': {
      const cleanId = text.replace(/^(?:my\s*(?:national\s*id|ssn)\s*is|ssn\s*is|id\s*is)\s*/i, '').trim();
      if (cleanId.length >= 4) {
        patch.nationalId = cleanId;
      }
      break;
    }

    case 'phone': {
      const phone = normalizePhone(text);
      if (phone) patch.phone = phone;
      break;
    }

    case 'email': {
      let emailClean = text.toLowerCase()
        .replace(/\s+at\s+/g, '@')
        .replace(/\s+dot\s+/g, '.')
        .replace(/\s+/g, '');
      const match = emailClean.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (match) {
        patch.email = match[1];
      }
      break;
    }

    case 'addressStreet': {
      // Look for Apt / Suite / Unit
      const unitMatch = text.match(/\b(?:Apt|Apartment|Suite|Ste|Unit|Building|Bldg|#)\s*([A-Za-z0-9\-]+)/i);
      if (unitMatch) {
        patch.addressLine2 = unitMatch[0].trim();
        patch.addressLine1 = text.replace(unitMatch[0], '').replace(/[,\s]+$/, '').trim();
      } else {
        const parts = text.split(/,\s*/);
        if (parts.length >= 2) {
          patch.addressLine1 = parts[0].trim();
          patch.addressLine2 = parts.slice(1).join(', ').trim();
        } else {
          patch.addressLine1 = text.trim();
        }
      }
      break;
    }

    case 'addressCityStateZip': {
      const parts = text.split(/,\s*/);
      if (parts.length >= 3) {
        patch.city = parts[0].trim();
        patch.state = parts[1].trim().toUpperCase();
        patch.postalCode = parts[2].trim();
      } else if (parts.length === 2) {
        patch.city = parts[0].trim();
        const stateZip = parts[1].trim().split(/\s+/);
        patch.state = stateZip[0].toUpperCase();
        if (stateZip[1]) patch.postalCode = stateZip[1];
      } else {
        const zipMatch = text.match(/\b[0-9]{5}(?:-[0-9]{4})?\b/);
        if (zipMatch) patch.postalCode = zipMatch[0];
        const stateMatch = text.match(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|California|New York|Texas|Florida|Illinois)\b/i);
        if (stateMatch) patch.state = stateMatch[0];
      }
      break;
    }

    case 'emergencyContact': {
      const phone = normalizePhone(text);
      if (phone && phone !== text) patch.emergencyContactPhone = phone;

      const relMatch = text.match(/\b(Spouse|Husband|Wife|Parent|Mother|Father|Son|Daughter|Sibling|Brother|Sister|Guardian|Relative|Friend|Partner|Child)\b/i);
      if (relMatch) {
        patch.emergencyContactRelation = relMatch[1].charAt(0).toUpperCase() + relMatch[1].slice(1).toLowerCase();
      }

      let nameCandidate = text
        .replace(/^(?:my\s*emergency\s*contact\s*is|emergency\s*contact\s*is)\s*/i, '')
        .replace(/\b(Spouse|Husband|Wife|Parent|Mother|Father|Son|Daughter|Sibling|Brother|Sister|Guardian|Relative|Friend|Partner|Child|phone|number|is|call|at|my)\b/gi, '')
        .replace(/[\d\(\)\-\.,]/g, '')
        .trim();
      if (nameCandidate.length > 2) {
        patch.emergencyContactName = nameCandidate;
      }
      break;
    }

    case 'emergencyAltPhone': {
      const altPhone = normalizePhone(text);
      if (altPhone) patch.emergencyContactAltPhone = altPhone;
      break;
    }

    case 'allergies': {
      const medType = detectMedicalAnswerType(text);
      if (medType === 'NEGATIVE') {
        patch.hasAllergies = false;
        patch.allergies = [];
      } else if (medType === 'UNKNOWN') {
        // Unknown/uncertain: return empty patch so field remains unpopulated/null
        return {};
      } else {
        patch.hasAllergies = true;
        const detected = [];
        COMMON_ALLERGIES.forEach(allergen => {
          if (new RegExp(`\\b${allergen}\\b`, 'i').test(text)) {
            let severity = 'Moderate';
            let reaction = 'Allergic Reaction';
            if (/severe|anaphylaxis|throat/i.test(text)) severity = 'Severe';
            if (/mild/i.test(text)) severity = 'Mild';
            if (/hives|rash/i.test(text)) reaction = 'Hives / Rash';
            if (/anaphylaxis/i.test(text)) reaction = 'Anaphylaxis';
            detected.push({ allergen, reaction, severity });
          }
        });
        if (detected.length > 0) {
          patch.allergies = detected;
          patch.allergyNotes = text.trim();
        }
      }
      break;
    }

    case 'allergyDetails': {
      patch.hasAllergies = true;
      const detected = [];
      COMMON_ALLERGIES.forEach(allergen => {
        if (new RegExp(`\\b${allergen}\\b`, 'i').test(text)) {
          let severity = 'Moderate';
          let reaction = 'Allergic Reaction';
          if (/severe|anaphylaxis|throat/i.test(text)) severity = 'Severe';
          if (/mild/i.test(text)) severity = 'Mild';
          if (/hives|rash/i.test(text)) reaction = 'Hives / Rash';
          if (/anaphylaxis/i.test(text)) reaction = 'Anaphylaxis';
          detected.push({ allergen, reaction, severity });
        }
      });
      if (detected.length === 0) {
        detected.push({ allergen: text.trim(), reaction: 'Documented Sensitivity', severity: 'Active' });
      }
      patch.allergies = detected;
      patch.allergyNotes = text.trim();
      break;
    }

    case 'chronicConditions': {
      const medType = detectMedicalAnswerType(text);
      if (medType === 'UNKNOWN') {
        // Unknown/uncertain: do NOT mark as empty array or positive
        break;
      }
      if (medType === 'NEGATIVE') {
        patch.chronicConditions = [];
      } else {
        const detected = [];
        COMMON_CONDITIONS.forEach(cond => {
          const base = cond.split('(')[0].trim();
          // Ensure condition is not preceded by negation (e.g. "don't have diabetes")
          const rx = new RegExp(`(?:(don'?t\\s*have|do\\s*not\\s*have|no|never\\s*had)\\s+)?\\b${base}\\b`, 'i');
          const m = text.match(rx);
          if (m && !m[1]) {
            detected.push(cond);
          }
        });
        if (detected.length === 0 && !/\b(?:no|none|negative)\b/i.test(text)) {
          detected.push(text.trim());
        }
        patch.chronicConditions = detected;
      }
      break;
    }

    case 'currentMedications': {
      const medType = detectMedicalAnswerType(text);
      if (medType === 'UNKNOWN') {
        // Unknown/uncertain: do NOT assume empty or negative
        break;
      }
      if (medType === 'NEGATIVE') {
        patch.currentMedications = [];
      } else {
        const medParts = text.split(/,|;|\band\b/).map(s => s.trim()).filter(Boolean);
        const meds = [];
        for (const part of medParts) {
          const mMatch = part.match(/([A-Za-z]{3,25})\s*([0-9]+(?:\.[0-9]+)?\s*(?:mg|mcg|ml|g|units)s?)?\s*(.*)/i);
          if (mMatch) {
            meds.push({
              name: mMatch[1].trim(),
              dosage: (mMatch[2] || '').trim(),
              frequency: (mMatch[3] || 'Once daily').trim() || 'Once daily'
            });
          } else if (part.length > 2 && !/\b(?:medications?|prescriptions?|daily)\b/i.test(part)) {
            meds.push({ name: part, dosage: '', frequency: 'Once daily' });
          }
        }
        patch.currentMedications = meds;
      }
      break;
    }

    case 'surgeries_familyHistory': {
      const medType = detectMedicalAnswerType(text);
      if (medType === 'UNKNOWN') {
        break;
      }
      if (medType === 'NEGATIVE') {
        patch.pastSurgeries = 'None Reported';
      } else {
        patch.pastSurgeries = text.trim();
        if (/family|mother|father|parent|history/i.test(text)) {
          patch.familyMedicalHistory = text.trim();
        }
      }
      break;
    }

    case 'hasInsurance': {
      if (/\b(?:no|none|self[\-\s]?pay|uninsured|no\s*insurance)\b/i.test(text)) {
        patch.hasInsurance = false;
        patch.insuranceProvider = '';
        patch.policyNumber = '';
        patch.groupNumber = '';
        patch.policyHolderName = '';
      } else if (/\b(?:i\s*(?:am\s*not\s*sure|don'?t\s*know)|not\s*sure|unsure)\b/i.test(text)) {
        patch.hasInsurance = null;
      } else {
        patch.hasInsurance = true;
      }
      break;
    }

    case 'insuranceDetails': {
      patch.hasInsurance = true;
      const provMatch = text.match(/\b(Blue\s*Cross(?:\s*Blue\s*Shield)?|Aetna|Cigna|UnitedHealthcare|Humana|Kaiser|Medicare|Medicaid)\b/i);
      if (provMatch) {
        patch.insuranceProvider = provMatch[0].trim();
      } else {
        const provCandidate = text.split(/policy|member|id|group/i)[0].replace(/,/g, '').trim();
        if (provCandidate.length > 2) patch.insuranceProvider = provCandidate;
      }

      const polMatch = text.match(/(?:policy|member|id)\s*(?:#|number|is)?\s*([A-Za-z0-9\-]+)/i);
      if (polMatch) patch.policyNumber = polMatch[1].trim();

      const grpMatch = text.match(/(?:group|grp)\s*(?:#|number|is)?\s*([A-Za-z0-9\-]+)/i);
      if (grpMatch) patch.groupNumber = grpMatch[1].trim();
      break;
    }

    case 'insuranceSubscriber': {
      if (/\b(?:self|myself|me|patient)\b/i.test(text)) {
        patch.relationshipToPolicyHolder = 'Self';
        patch.policyHolderName = currentCollected.firstName ? `${currentCollected.firstName} ${currentCollected.lastName || ''}`.trim() : 'Self';
      } else {
        if (/\b(?:spouse|husband|wife|partner)\b/i.test(text)) {
          patch.relationshipToPolicyHolder = 'Spouse';
        } else if (/\b(?:child|son|daughter)\b/i.test(text)) {
          patch.relationshipToPolicyHolder = 'Child';
        } else if (/\b(?:parent|mother|father|mom|dad)\b/i.test(text)) {
          patch.relationshipToPolicyHolder = 'Parent';
        } else if (/\b(?:guardian)\b/i.test(text)) {
          patch.relationshipToPolicyHolder = 'Guardian';
        } else {
          patch.relationshipToPolicyHolder = 'Other';
        }

        const nameCandidate = text
          .replace(/^(?:the\s*)?(?:policy\s*holder|subscriber|primary\s*insured)\s*(?:is\s*)?/i, '')
          .replace(/\b(?:spouse|husband|wife|partner|child|son|daughter|parent|mother|father|mom|dad|guardian|other|my|is)\b/gi, '')
          .replace(/[,;]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (nameCandidate.length >= 2) {
          patch.policyHolderName = nameCandidate;
        }
      }
      break;
    }

    case 'department': {
      for (const dept of DEPARTMENTS) {
        if (new RegExp(`\\b${dept}\\b`, 'i').test(text)) {
          patch.department = dept;
          break;
        }
      }
      break;
    }

    case 'chiefComplaint': {
      patch.chiefComplaint = text.trim();
      const durMatch = text.match(/(?:for|since|past|duration\s*is)\s*([0-9]+\s*(?:days?|weeks?|months?|hours?|today))/i);
      if (durMatch) {
        patch.symptomDuration = durMatch[1].trim();
      }
      break;
    }

    case 'consultingDoctor': {
      const docMatch = text.match(/(?:Dr\.?\s+[A-Za-z\s\.\-]+)/i);
      if (docMatch) {
        patch.consultingDoctor = docMatch[0].trim();
      } else if (!/no|none|no\s*preference|any/i.test(text)) {
        const cleanDoctor = text
          .replace(/^(?:i\s*want\s*to\s*consult|i\s*would\s*like\s*to\s*see|consult\s*with|doctor\s*is|dr\.?\s*is)\s*/i, '')
          .trim();
        if (cleanDoctor.length > 2) {
          patch.consultingDoctor = cleanDoctor.startsWith('Dr.') ? cleanDoctor : `Dr. ${cleanDoctor}`;
        }
      }
      break;
    }

    case 'vitalsCardio': {
      const vitals = { ...(currentCollected.vitals || {}) };
      const bp = extractBloodPressure(text);
      if (bp) {
        vitals.bloodPressureSystolic = bp.systolic;
        vitals.bloodPressureDiastolic = bp.diastolic;
      }
      const hr = extractHeartRate(text);
      if (hr !== null && hr !== undefined) {
        vitals.heartRate = String(hr);
      }
      patch.vitals = vitals;
      break;
    }

    case 'vitalsPhysio': {
      const vitals = { ...(currentCollected.vitals || {}) };
      const spo2 = extractOxygenSaturation(text);
      if (spo2 !== null && spo2 !== undefined) {
        vitals.oxygenSaturation = String(spo2);
      }
      const temp = extractTemperature(text);
      if (temp !== null && temp !== undefined) {
        vitals.temperature = String(temp);
      }
      const resp = extractRespiratoryRate(text);
      if (resp !== null && resp !== undefined) {
        vitals.respiratoryRate = String(resp);
      }
      patch.vitals = vitals;
      break;
    }

    case 'vitalsBody': {
      const vitals = { ...(currentCollected.vitals || {}) };
      const body = extractHeightWeight(text);
      if (body.heightCm) vitals.heightCm = body.heightCm;
      if (body.weightKg) vitals.weightKg = body.weightKg;
      if (body.bmi) vitals.bmi = body.bmi;
      patch.vitals = vitals;
      break;
    }

    default:
      break;
  }

  return patch;
}

/**
 * Counts total user-populated fields in collected data.
 * Excludes system-generated, metadata, empty, and null fields.
 */
export function countPopulatedFields(data) {
  if (!data || typeof data !== 'object') return 0;
  let count = 0;

  const EXCLUDED_KEYS = new Set([
    'registrationId',
    'mrn',
    'registrationDate',
    'registrationTime',
    'signatureDataUrl',
    'signatureType',
    'typedSignature',
    'notes',
    'patientConsent',
    'hipaaAcknowledged'
  ]);

  for (const [key, val] of Object.entries(data)) {
    if (EXCLUDED_KEYS.has(key)) continue;
    if (val === null || val === undefined || val === '') continue;

    if (key === 'vitals') {
      if (typeof val === 'object') {
        for (const [vKey, vVal] of Object.entries(val)) {
          if (vVal !== null && vVal !== undefined && vVal !== '') {
            count++;
          }
        }
      }
      continue;
    }

    if (Array.isArray(val)) {
      if (val.length > 0) count++;
      continue;
    }

    if (typeof val === 'boolean') {
      count++;
      continue;
    }

    if (typeof val === 'string' && val.trim() !== '') {
      if (key === 'bloodGroup' && val === 'Unknown') continue;
      count++;
    }
  }

  return count;
}

/**
 * Finds the next unpopulated question in the active applicable question sequence.
 * Never moves backwards; searches forward from currentPosition.
 */
export function getNextUnpopulatedInSequence(applicableQuestions, currentCollected, currentPosition = 0) {
  for (let i = currentPosition; i < applicableQuestions.length; i++) {
    const q = applicableQuestions[i];
    if (!q.isPopulated(currentCollected)) {
      return { question: q, index: i };
    }
  }
  return null;
}

/**
 * Finds the next unpopulated question in a question list (deriving applicable questions automatically).
 */
export function getNextUnpopulatedQuestion(questions, currentCollected, startIndex = 0) {
  const applicable = getApplicableQuestions(questions, currentCollected);
  return getNextUnpopulatedInSequence(applicable, currentCollected, startIndex);
}

/**
 * Merges newly extracted fields into existing collected data while strictly
 * preserving locked or manually entered fields.
 */
export function mergeExtractedFields(existingData, newPatch, lockedFieldKeys = new Set()) {
  const merged = { ...existingData };

  for (const [key, val] of Object.entries(newPatch)) {
    if (lockedFieldKeys.has(key)) {
      continue;
    }

    if (val === undefined || val === null || val === '') {
      continue;
    }

    if (key === 'vitals') {
      merged.vitals = {
        ...(merged.vitals || {}),
        ...val
      };
    } else if (Array.isArray(val)) {
      if (val.length > 0) {
        merged[key] = val;
      }
    } else {
      merged[key] = val;
    }
  }

  return merged;
}
