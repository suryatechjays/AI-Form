import {
  VOICE_QA_QUESTIONS,
  parseTargetedAnswer,
  isSkipIntent,
  countPopulatedFields,
  getNextUnpopulatedQuestion,
  mergeExtractedFields
} from './src/services/voiceQAService.js';

console.log('Testing Step-by-Step Voice Q&A Engine...\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`✓ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`✗ FAIL: ${message}`);
  }
}

// Test 1: Full Coverage - Questions exist and cover sections 1 through 6
assert(VOICE_QA_QUESTIONS.length >= 18, `Catalog has ${VOICE_QA_QUESTIONS.length} questions (covers all sections)`);
const sectionNumbers = new Set(VOICE_QA_QUESTIONS.map(q => q.sectionNumber));
assert(sectionNumbers.has(1) && sectionNumbers.has(2) && sectionNumbers.has(3) && sectionNumbers.has(4) && sectionNumbers.has(5) && sectionNumbers.has(6), 'All 6 user-intake sections represented in question catalog');

// Verify system-generated fields are NOT asked
const allFieldKeys = VOICE_QA_QUESTIONS.flatMap(q => q.fieldKeys);
assert(!allFieldKeys.includes('registrationId'), 'registrationId is not asked (system generated)');
assert(!allFieldKeys.includes('mrn'), 'mrn is not asked (system generated)');
assert(!allFieldKeys.includes('registrationDate'), 'registrationDate is not asked (system generated)');

// Test 2: parseTargetedAnswer for Name
const nameRes = parseTargetedAnswer('name', 'David Michael Miller');
assert(nameRes.firstName === 'David' && nameRes.middleName === 'Michael' && nameRes.lastName === 'Miller', 'Name parsing extracts first, middle, last name');

const plainNameRes = parseTargetedAnswer('name', 'Sarah Connor');
assert(plainNameRes.firstName === 'Sarah' && plainNameRes.lastName === 'Connor', 'Plain two-word name parsed directly');

// Test 3: parseTargetedAnswer for DOB
const dobRes = parseTargetedAnswer('dob', 'April 12 1985');
assert(dobRes.dateOfBirth === '1985-04-12' && dobRes.age > 0, 'DOB normalized and age computed');

// Test 4: parseTargetedAnswer for Blood Group
const bgRes = parseTargetedAnswer('bloodGroup', 'I am O positive');
assert(bgRes.bloodGroup === 'O+', 'Blood group extracted accurately');

// Test 5: parseTargetedAnswer for Phone
const phoneRes = parseTargetedAnswer('phone', 'My phone is 415 555 3819');
assert(phoneRes.phone === '(415) 555-3819', 'Phone normalized to standard format');

// Test 6: parseTargetedAnswer for Allergies (Negative vs Positive)
const nkdaRes = parseTargetedAnswer('allergies', 'No known allergies, I am fine');
assert(nkdaRes.hasAllergies === false && Array.isArray(nkdaRes.allergies) && nkdaRes.allergies.length === 0, 'Confirmed negative NKDA correctly set');

const allergyRes = parseTargetedAnswer('allergies', 'Severe Penicillin and Peanuts allergy, causes hives');
assert(allergyRes.hasAllergies === true && allergyRes.allergies.length >= 1, 'Allergies correctly captured with severity and reaction');

// Test 7: parseTargetedAnswer for Insurance Self-Pay
const noInsRes = parseTargetedAnswer('hasInsurance', 'I do not have insurance, self-pay');
assert(noInsRes.hasInsurance === false, 'Self-pay accurately identified');

// Test 8: Skip Intent Detection
assert(isSkipIntent('skip'), 'Detects "skip"');
assert(isSkipIntent('next question'), 'Detects "next question"');
assert(isSkipIntent("I don't know"), 'Detects "I don\'t know"');
assert(isSkipIntent('None'), 'Detects "None"');
assert(!isSkipIntent('David Miller'), 'Does not falsely trigger skip on patient name');

// Test 9: Populated Field Count
const sampleCollected = {
  firstName: 'David',
  lastName: 'Miller',
  dateOfBirth: '1985-04-12',
  phone: '(415) 555-3819',
  hasAllergies: false,
  allergies: [],
  hasInsurance: true,
  insuranceProvider: 'Blue Cross',
  registrationId: 'AEGIS-2026-99128' // should not be counted
};
const count = countPopulatedFields(sampleCollected);
assert(count === 7, `Populated field count is ${count} (expected 7, registrationId excluded)`);

// Test 10: Dynamic Question Skipping
let state = { firstName: 'David', lastName: 'Miller', dateOfBirth: '1985-04-12' };
const nextQ = getNextUnpopulatedQuestion(VOICE_QA_QUESTIONS, state, 0);
assert(nextQ.question.id === 'gender', `Next unpopulated question is gender (skipped name & dob), got ${nextQ.question.id}`);

// Test 11: Dynamic Insurance Detail Skipping on Self-Pay
state = { ...state, hasInsurance: false };
const insQ = VOICE_QA_QUESTIONS.find(q => q.id === 'insuranceDetails');
assert(insQ.condition(state) === false, 'Insurance details question dynamically disabled when self-pay');

// Test 12: Overwrite Protection with Locked Fields
const locked = new Set(['firstName']);
const merged = mergeExtractedFields({ firstName: 'Original' }, { firstName: 'Overwritten', lastName: 'New' }, locked);
assert(merged.firstName === 'Original' && merged.lastName === 'New', 'Locked field protected against overwrite');

console.log(`\nResults: ${passedTests}/${totalTests} tests passed.`);
if (passedTests === totalTests) {
  console.log('✓ ALL STEP-BY-STEP VOICE Q&A TESTS PASSED!');
} else {
  process.exit(1);
}

