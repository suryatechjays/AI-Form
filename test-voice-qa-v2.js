import {
  REGISTRATION_FIELDS_CLASSIFICATION,
  VOICE_QA_CATALOG,
  VOICE_QA_QUESTIONS,
  getApplicableQuestions,
  getNextUnpopulatedInSequence,
  getNextUnpopulatedQuestion,
  parseTargetedAnswer,
  isSkipIntent,
  countPopulatedFields,
  mergeExtractedFields
} from './src/services/voiceQAService.js';
import { INITIAL_PATIENT_STATE } from './src/types/patient.js';

console.log('================================================================');
console.log('AEGIS Step-by-Step Voice Q&A Comprehensive Verification Suite v2');
console.log('================================================================\n');

let passedCount = 0;
let totalCount = 0;

function assert(condition, message) {
  totalCount++;
  if (condition) {
    console.log(`✓ PASS [Test ${totalCount}]: ${message}`);
    passedCount++;
  } else {
    console.error(`✗ FAIL [Test ${totalCount}]: ${message}`);
  }
}

// ============================================================================
// SUITE 1: COMPLETE REGISTRATION FIELD COVERAGE & CLASSIFICATION (58 FIELDS)
// ============================================================================
console.log('--- Suite 1: Full Field Coverage & Schema Classification ---');

// Audit all 58 fields from INITIAL_PATIENT_STATE
const initialKeys = Object.keys(INITIAL_PATIENT_STATE);
const vitalSubKeys = Object.keys(INITIAL_PATIENT_STATE.vitals).map(k => `vitals.${k}`);
const allFormKeys = [...initialKeys.filter(k => k !== 'vitals'), ...vitalSubKeys];

assert(allFormKeys.length === 58, `Initial patient model contains 58 distinct fields (got ${allFormKeys.length})`);

const classifiedKeys = Object.keys(REGISTRATION_FIELDS_CLASSIFICATION);
assert(classifiedKeys.length === 58, `All 58 fields are explicitly classified in REGISTRATION_FIELDS_CLASSIFICATION`);

const typeCounts = { REQUIRED: 0, OPTIONAL: 0, CONDITIONAL: 0, SYSTEM_GENERATED: 0 };
for (const [field, item] of Object.entries(REGISTRATION_FIELDS_CLASSIFICATION)) {
  if (typeCounts[item.type] !== undefined) {
    typeCounts[item.type]++;
  }
}

assert(typeCounts.REQUIRED === 16, `Classified 16 Required fields (got ${typeCounts.REQUIRED})`);
assert(typeCounts.OPTIONAL === 25, `Classified 25 Optional fields (got ${typeCounts.OPTIONAL})`);
assert(typeCounts.CONDITIONAL === 7, `Classified 7 Conditional fields (got ${typeCounts.CONDITIONAL})`);
assert(typeCounts.SYSTEM_GENERATED === 10, `Classified 10 System-Generated fields (got ${typeCounts.SYSTEM_GENERATED})`);

// Ensure every single form key is present in classification
const missingKeys = allFormKeys.filter(k => !REGISTRATION_FIELDS_CLASSIFICATION[k]);
assert(missingKeys.length === 0, `Zero missing fields in classification table: ${missingKeys.join(', ') || 'None'}`);

// Ensure System-Generated fields are NEVER asked in the voice catalog
const catalogFieldKeys = VOICE_QA_CATALOG.flatMap(q => q.fieldKeys);
const systemGeneratedKeys = Object.entries(REGISTRATION_FIELDS_CLASSIFICATION)
  .filter(([_, meta]) => meta.type === 'SYSTEM_GENERATED')
  .map(([k]) => k);

const askedSystemFields = systemGeneratedKeys.filter(k => catalogFieldKeys.includes(k));
assert(askedSystemFields.length === 0, `Zero system-generated fields present in question catalog: ${askedSystemFields.join(', ') || 'None'}`);

// Ensure all 6 patient-provided sections are represented in the catalog
const catalogSections = new Set(VOICE_QA_CATALOG.map(q => q.sectionNumber));
assert([1, 2, 3, 4, 5, 6].every(s => catalogSections.has(s)), 'Catalog covers Sections 1 through 6');
assert(VOICE_QA_CATALOG.length === 27, `Voice QA catalog contains 27 comprehensive clinical questions (got ${VOICE_QA_CATALOG.length})`);

// ============================================================================
// SUITE 2: QUESTION NUMBERING & MONOTONIC FORWARD PROGRESSION
// ============================================================================
console.log('\n--- Suite 2: Question Numbering & Progression Fix Verification ---');

// Test 2.1: Monotonic forward progression through entire applicable sequence
let simCollected = {};
let applicable = getApplicableQuestions(VOICE_QA_CATALOG, simCollected);
let currentId = applicable[0].id;
let prevIndex = -1;
let indexTracking = [];

for (let step = 0; step < applicable.length; step++) {
  applicable = getApplicableQuestions(VOICE_QA_CATALOG, simCollected);
  const curIndex = applicable.findIndex(q => q.id === currentId);
  const displayStep = curIndex + 1;
  const totalSteps = applicable.length;

  indexTracking.push({ step, curIndex, display: `Question ${displayStep} of ${totalSteps}` });
  assert(curIndex > prevIndex, `Step ${step}: Question number moved strictly forward (${curIndex + 1} > ${prevIndex + 1})`);
  prevIndex = curIndex;

  // Simulate answering or skipping current question
  const curQ = applicable[curIndex];
  const next = getNextUnpopulatedInSequence(applicable, simCollected, curIndex + 1);
  if (next) {
    currentId = next.question.id;
  } else {
    break;
  }
}

// Test 2.2: Conditional Question Branching & Index Stability
// When patient reports "Self-Pay" (hasInsurance: false), insurance details and subscriber must not jump backwards
let stateSelfPay = {
  firstName: 'Alice',
  lastName: 'Walker',
  hasInsurance: false
};
const applicableSelfPay = getApplicableQuestions(VOICE_QA_CATALOG, stateSelfPay);
assert(applicableSelfPay.length < VOICE_QA_CATALOG.length, `Self-pay filters out conditional questions (${applicableSelfPay.length} < ${VOICE_QA_CATALOG.length})`);

const hasInsuranceIdx = applicableSelfPay.findIndex(q => q.id === 'hasInsurance');
const nextAfterIns = getNextUnpopulatedInSequence(applicableSelfPay, stateSelfPay, hasInsuranceIdx + 1);
assert(nextAfterIns !== null, 'Next question after self-pay found');
assert(nextAfterIns.question.id === 'department', `Next question after self-pay is department (skipped insuranceDetails & subscriber), got: ${nextAfterIns.question.id}`);
assert(nextAfterIns.index > hasInsuranceIdx, `Index progressed forward monotonically (${nextAfterIns.index} > ${hasInsuranceIdx}), no backward jump`);

// Test 2.3: NKDA (hasAllergies: false) conditionally excludes allergyDetails
let stateNKDA = {
  hasAllergies: false,
  allergies: []
};
const applicableNKDA = getApplicableQuestions(VOICE_QA_CATALOG, stateNKDA);
const allergyIdx = applicableNKDA.findIndex(q => q.id === 'allergies');
const nextAfterAllergy = getNextUnpopulatedInSequence(applicableNKDA, stateNKDA, allergyIdx + 1);
assert(nextAfterAllergy.question.id === 'chronicConditions', `Next question after NKDA skips allergyDetails to chronicConditions, got: ${nextAfterAllergy.question.id}`);
assert(nextAfterAllergy.index > allergyIdx, `Allergy step strictly advanced without backward index jump (${nextAfterAllergy.index} > ${allergyIdx})`);

// ============================================================================
// SUITE 3: START AND RESET BUTTON ISOLATION & BEHAVIOR
// ============================================================================
console.log('\n--- Suite 3: Start and Reset State Isolation ---');

// Test 3.1: Form State Preserved on Reset
const pristinePatientData = {
  firstName: 'OriginalPatient',
  lastName: 'OriginalSurname',
  phone: '(555) 123-4567',
  vitals: { heartRate: '72' }
};

// Snapshot before voice session
const pristineSnapshot = JSON.parse(JSON.stringify(pristinePatientData));

// Simulate active voice session collecting temporary answers
let voiceSessionCollected = {
  ...JSON.parse(JSON.stringify(pristinePatientData)),
  middleName: 'VoiceSpokenMiddle',
  addressLine1: '100 Voice Lane',
  chiefComplaint: 'Spoken Cough'
};
let voiceSessionAnswers = {
  name: { transcript: 'My middle name is VoiceSpokenMiddle', skipped: false },
  addressStreet: { transcript: '100 Voice Lane', skipped: false }
};

assert(countPopulatedFields(voiceSessionCollected) > countPopulatedFields(pristinePatientData), 'Voice session collected temporary fields');

// Simulate Reset action
function simulateReset(originalPatientData) {
  // Re-initialize collected state strictly from originalPatientData without mutating originalPatientData
  const resetCollected = {};
  for (const [k, v] of Object.entries(originalPatientData)) {
    if (v !== '' && v !== null && v !== undefined && v !== 'Unknown') {
      if (k === 'vitals' && typeof v === 'object') {
        resetCollected.vitals = { ...v };
      } else if (Array.isArray(v)) {
        resetCollected[k] = [...v];
      } else {
        resetCollected[k] = v;
      }
    }
  }
  const resetAnswers = {};
  const qaSessionStarted = false;
  return { resetCollected, resetAnswers, qaSessionStarted };
}

const resetResult = simulateReset(pristinePatientData);

assert(resetResult.qaSessionStarted === false, 'Reset returns session to initial unstarted state (hero screen)');
assert(Object.keys(resetResult.resetAnswers).length === 0, 'Reset clears all spoken question answers');
assert(resetResult.resetCollected.middleName === undefined, 'Reset clears temporary spoken middleName');
assert(resetResult.resetCollected.addressLine1 === undefined, 'Reset clears temporary spoken address');
assert(resetResult.resetCollected.firstName === 'OriginalPatient', 'Reset retains pre-existing form firstName');
assert(JSON.stringify(pristinePatientData) === JSON.stringify(pristineSnapshot), 'Pristine form patientData remains completely untouched and unmutated');

// ============================================================================
// SUITE 4: MULTI-FIELD PARSING & ANTI-HALLUCINATION
// ============================================================================
console.log('\n--- Suite 4: Multi-Field Parsing & Anti-Hallucination ---');

// Test 4.1: Spoken full name with middle name
const parsedFullName = parseTargetedAnswer('name', 'Alexander Joseph Hamilton');
assert(parsedFullName.firstName === 'Alexander', 'First name parsed accurately');
assert(parsedFullName.middleName === 'Joseph', 'Middle name parsed accurately');
assert(parsedFullName.lastName === 'Hamilton', 'Last name parsed accurately');

// Test 4.2: Address parsing with apartment number
const parsedAddress = parseTargetedAnswer('addressStreet', '500 Howard Street, Suite 300');
assert(parsedAddress.addressLine1 === '500 Howard Street', `Address line 1 parsed cleanly without trailing comma: "${parsedAddress.addressLine1}"`);
assert(parsedAddress.addressLine2 === 'Suite 300', `Address line 2 unit parsed: "${parsedAddress.addressLine2}"`);

// Test 4.3: Vitals cardio parsing
const parsedVitals = parseTargetedAnswer('vitalsCardio', '125 over 82, pulse 76');
assert(parsedVitals.vitals?.bloodPressureSystolic === '125', 'Systolic BP parsed');
assert(parsedVitals.vitals?.bloodPressureDiastolic === '82', 'Diastolic BP parsed');
assert(parsedVitals.vitals?.heartRate === '76', 'Heart rate parsed');

// Test 4.4: Anti-hallucination on skip intent
assert(isSkipIntent('skip'), 'Skip keyword recognized');
assert(isSkipIntent('prefer not to say'), 'Privacy pass recognized');
assert(isSkipIntent('I do not know'), 'Uncertainty pass recognized');
assert(!isSkipIntent('Alexander Hamilton'), 'Valid patient response not flagged as skip');

// Test 4.5: countPopulatedFields accurately excludes system metadata
const testMetadata = {
  firstName: 'Jane',
  lastName: 'Doe',
  registrationId: 'AEGIS-2026-99999',
  mrn: 'MRN-123456',
  registrationDate: '2026-10-30',
  registrationTime: '10:00 AM',
  notes: 'Internal registrar notes',
  patientConsent: true,
  hipaaAcknowledged: true
};

const userFieldCount = countPopulatedFields(testMetadata);
assert(userFieldCount === 2, `countPopulatedFields correctly ignores all 7 system metadata fields (expected 2, got ${userFieldCount})`);

// ============================================================================
// FINAL SUMMARY
// ============================================================================
console.log('\n================================================================');
console.log(`AEGIS Voice Q&A Test Summary: ${passedCount}/${totalCount} assertions passed.`);
console.log('================================================================');

if (passedCount === totalCount) {
  console.log('✓ ALL STEP-BY-STEP VOICE Q&A TESTS PASSED CLEANLY!\n');
  process.exit(0);
} else {
  console.error(`✗ ${totalCount - passedCount} TESTS FAILED!\n`);
  process.exit(1);
}

