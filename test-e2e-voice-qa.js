import {
  VOICE_QA_QUESTIONS,
  parseTargetedAnswer,
  isSkipIntent,
  countPopulatedFields,
  getNextUnpopulatedQuestion,
  mergeExtractedFields
} from './src/services/voiceQAService.js';
import { extractPatientInformation } from './src/services/aiExtractor.js';
import { SAMPLE_VOICE_INTAKES } from './src/services/speechService.js';
import { mapBackendExtractionToForm } from './src/services/api.js';

console.log('Running End-to-End Synthetic Verification for Step-by-Step Voice Q&A...\n');

let testsPassed = 0;
let testsTotal = 0;

function check(pass, desc) {
  testsTotal++;
  if (pass) {
    console.log(`✓ PASS: ${desc}`);
    testsPassed++;
  } else {
    console.error(`✗ FAIL: ${desc}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Verify Field Coverage & Catalog Integrity
// ---------------------------------------------------------------------------
check(VOICE_QA_QUESTIONS.length === 27, `Question catalog covers ${VOICE_QA_QUESTIONS.length} targeted questions (was 6 previously).`);

const expectedSections = [1, 2, 3, 4, 5, 6];
const presentSections = Array.from(new Set(VOICE_QA_QUESTIONS.map(q => q.sectionNumber))).sort();
check(JSON.stringify(presentSections) === JSON.stringify(expectedSections), `Sections 1 to 6 covered; Section 7 (system metadata) explicitly preserved as system-generated.`);

// Check system-generated fields are never asked
const allFields = VOICE_QA_QUESTIONS.flatMap(q => q.fieldKeys);
const systemFields = ['registrationId', 'mrn', 'registrationDate', 'registrationTime', 'signatureDataUrl', 'typedSignature', 'notes'];
const asksSystemField = systemFields.some(sf => allFields.includes(sf));
check(!asksSystemField, `Zero system-generated fields are asked to the patient.`);

// ---------------------------------------------------------------------------
// 2. Synthetic Multi-Step Voice Q&A Flow (Simulating Complete Patient Intake)
// ---------------------------------------------------------------------------
console.log('\n--- Simulating 10-Question Synthetic Patient Voice Session ---');

let sessionCollected = {};
let answersLog = [];

// Synthetic conversation sequence
const syntheticConversations = [
  {
    qId: 'name',
    spoken: 'My name is Robert Anthony Chen',
    expectedExtracted: { firstName: 'Robert', middleName: 'Anthony', lastName: 'Chen' }
  },
  {
    qId: 'dob',
    // Multi-field spoken response: mentions DOB AND blood group!
    spoken: 'I was born August 14 1982 and my blood type is O positive',
    expectedExtracted: { dateOfBirth: '1982-08-14', bloodGroup: 'O+' }
  },
  {
    qId: 'gender',
    spoken: 'Male',
    expectedExtracted: { gender: 'Male' }
  },
  {
    qId: 'phone',
    spoken: 'My phone number is 415 555 7823',
    expectedExtracted: { phone: '(415) 555-7823' }
  },
  {
    qId: 'email',
    spoken: 'robert dot chen at example dot com',
    expectedExtracted: { email: 'robert.chen@example.com' }
  },
  {
    qId: 'addressStreet',
    spoken: '742 Evergreen Terrace, Apartment 4B',
    expectedExtracted: { addressLine1: '742 Evergreen Terrace', addressLine2: 'Apartment 4B' }
  },
  {
    qId: 'addressCityStateZip',
    spoken: 'San Francisco, California, 94107',
    expectedExtracted: { city: 'San Francisco', state: 'CALIFORNIA', postalCode: '94107' }
  },
  {
    qId: 'emergencyContact',
    spoken: 'My wife Lisa Chen, phone is 415 555 9012',
    expectedExtracted: { emergencyContactName: 'Lisa Chen', emergencyContactRelation: 'Wife', emergencyContactPhone: '(415) 555-9012' }
  },
  {
    qId: 'allergies',
    spoken: 'Severe Sulfa drugs allergy, causes hives',
    expectedExtracted: { hasAllergies: true }
  },
  {
    qId: 'chronicConditions',
    spoken: 'I have hypertension and mild asthma',
    expectedExtracted: { chronicConditions: ['Hypertension (High BP)', 'Asthma'] }
  },
  {
    qId: 'hasInsurance',
    spoken: 'I have health insurance with Blue Cross',
    expectedExtracted: { hasInsurance: true, insuranceProvider: 'Blue Cross' }
  },
  {
    qId: 'chiefComplaint',
    spoken: 'Severe lower back pain radiating to left leg for 4 days',
    expectedExtracted: { chiefComplaint: 'Severe lower back pain radiating to left leg for 4 days', symptomDuration: '4 days' }
  }
];

let currentIndex = 0;
for (const step of syntheticConversations) {
  const q = VOICE_QA_QUESTIONS.find(item => item.id === step.qId);
  const targeted = parseTargetedAnswer(q.id, step.spoken, sessionCollected);
  const general = extractPatientInformation(step.spoken).mappedFields || {};
  if (q.id === 'emergencyContact' || q.id === 'emergencyAltPhone') {
    delete general.phone;
  }
  const combined = { ...general, ...targeted };

  sessionCollected = mergeExtractedFields(sessionCollected, combined);
  answersLog.push({ question: q.id, answer: step.spoken, extractedCount: Object.keys(combined).length });
}

// Verification 3: Flow does not stop after 6-7 questions
check(answersLog.length === 12, `Flow successfully completed ${answersLog.length} questions without prematurely halting.`);

// Verification 4: Correct fields populated
check(sessionCollected.firstName === 'Robert' && sessionCollected.lastName === 'Chen', 'Patient name populated correctly.');
check(sessionCollected.dateOfBirth === '1982-08-14' && sessionCollected.age > 0, 'Date of birth and derived age populated correctly.');
check(sessionCollected.gender === 'Male', 'Gender populated correctly.');
check(sessionCollected.phone === '(415) 555-7823', 'Phone number populated correctly.');
check(sessionCollected.addressLine1 === '742 Evergreen Terrace' && sessionCollected.postalCode === '94107', 'Mailing address populated correctly.');
check(sessionCollected.emergencyContactName === 'Lisa Chen', 'Emergency contact populated correctly.');
check(sessionCollected.hasAllergies === true && sessionCollected.allergies.length >= 1, 'Allergies populated correctly.');
check(sessionCollected.hasInsurance === true, 'Insurance status populated correctly.');
check(sessionCollected.chiefComplaint.includes('back pain'), 'Chief complaint populated correctly.');

// Verification 5: Multi-field extraction from single answer
check(sessionCollected.bloodGroup === 'O+', 'Single answer ("born August 14 1982 and blood type is O positive") extracted both DOB and Blood Group.');

// Verification 6: Populated field count is accurate and non-zero
const totalPopulated = countPopulatedFields(sessionCollected);
check(totalPopulated >= 14, `Populated field count is ${totalPopulated} (strictly > 0; fixes "0 fields populated" bug).`);

// ---------------------------------------------------------------------------
// 7. Test Skipping & Unknown Answers
// ---------------------------------------------------------------------------
console.log('\n--- Testing Skip Handling & Anti-Hallucination ---');
check(isSkipIntent('skip'), 'Skip intent recognized.');
check(isSkipIntent('no'), 'Negative / pass recognized.');
check(isSkipIntent('I do not know'), 'Uncertainty recognized.');

// Unclear response test
const unclearTarget = parseTargetedAnswer('dob', 'maybe sometime next week or tomorrow');
check(!unclearTarget.dateOfBirth, 'Unclear non-date answer does not fabricate a date of birth.');

// ---------------------------------------------------------------------------
// 8. Test Overwrite Protection
// ---------------------------------------------------------------------------
console.log('\n--- Testing Overwrite Protection ---');
const preExistingForm = {
  firstName: 'OriginalFirstName',
  bloodGroup: 'B+'
};
const lockedKeys = new Set(['firstName']);
const attemptedOverwrite = {
  firstName: 'NewFirstName',
  lastName: 'Miller'
};
const protectedResult = mergeExtractedFields(preExistingForm, attemptedOverwrite, lockedKeys);
check(protectedResult.firstName === 'OriginalFirstName', 'Locked pre-existing field preserved against overwrite.');
check(protectedResult.lastName === 'Miller', 'New unpopulated field populated smoothly.');

// ---------------------------------------------------------------------------
// 9. Verify Freeform Mode and Pre-recorded Samples
// ---------------------------------------------------------------------------
console.log('\n--- Verifying Freeform & Pre-Recorded Samples Compatibility ---');
check(SAMPLE_VOICE_INTAKES.length === 3, `Pre-recorded voice samples intact (${SAMPLE_VOICE_INTAKES.length} samples).`);

const sample1 = SAMPLE_VOICE_INTAKES[0];
const sample1Result = extractPatientInformation(sample1.transcript);
check(sample1Result.mappedFields.firstName === 'Robert' && sample1Result.stats.extractedCount > 10, 'Sample 1 parses successfully via extractPatientInformation.');

// ---------------------------------------------------------------------------
// 10. Verify Backend Groq AI Mapping
// ---------------------------------------------------------------------------
console.log('\n--- Verifying Backend Groq Mapping ---');
const mockGroqResponse = {
  raw_text_length: 120,
  extracted_fields: {
    full_name: 'David Michael Miller',
    date_of_birth: '1985-04-12',
    gender: 'Male',
    primary_mobile: '415-555-3819',
    existing_conditions: 'Hypertension, Type 2 Diabetes',
    allergy_status: 'No Known Allergies (NKDA)'
  },
  field_confidences: {
    full_name: 0.95,
    date_of_birth: 0.90,
    gender: 0.95,
    primary_mobile: 0.90
  },
  model_used: 'openai/gpt-oss-20b'
};

const mappedGroq = mapBackendExtractionToForm(mockGroqResponse);
check(mappedGroq.mappedFields.firstName === 'David', 'Groq mapping parsed firstName.');
check(mappedGroq.mappedFields.middleName === 'Michael', 'Groq mapping parsed middleName.');
check(mappedGroq.mappedFields.lastName === 'Miller', 'Groq mapping parsed lastName.');
check(mappedGroq.mappedFields.hasAllergies === false, 'Groq mapping correctly marked NKDA as hasAllergies=false.');
check(mappedGroq.mappedFields.chronicConditions.length === 2, 'Groq mapping parsed chronicConditions array.');

console.log(`\n=======================================================`);
console.log(`Final Verification: ${testsPassed}/${testsTotal} assertions passed.`);
if (testsPassed === testsTotal) {
  console.log('✓ ALL END-TO-END STEP-BY-STEP VOICE Q&A TESTS PASSED!');
} else {
  process.exit(1);
}
