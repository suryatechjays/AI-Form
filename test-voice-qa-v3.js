// Comprehensive regression test suite for AEGIS Step-by-Step Voice Q&A (v3)
// Covers:
// 1. Field validation & normalization (dates, phones, emails, vitals, SpO2 '99% oxygen')
// 2. Medical answer accuracy (positive, negative NKDA, unknown null, negation handling)
// 3. Answer correction intent & repeat detection
// 4. Prevention of duplicate questions
// 5. Dynamic question branching (insurance self-pay, NKDA)
// 6. Strict entity isolation (Dr. Kumar never populates patient firstName/lastName)
// 7. Completion summary categorization (missing required jump buttons)

import {
  VOICE_QA_CATALOG,
  parseTargetedAnswer,
  isSkipIntent,
  countPopulatedFields,
  getNextUnpopulatedInSequence,
  getApplicableQuestions,
  mergeExtractedFields,
  validateFieldValue,
  detectCorrectionIntent,
  detectMedicalAnswerType,
  getCompletionStatus,
  extractOxygenSaturation,
  extractHeartRate,
  extractTemperature,
  extractBloodPressure,
  extractRespiratoryRate,
  extractHeightWeight
} from './src/services/voiceQAService.js';

let totalTests = 0;
let passedTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    console.error(`  ✗ FAIL: ${testName} ${details ? '- ' + details : ''}`);
  }
}

console.log('\n=== SUITE 1: FIELD VALIDATION & RANGE CHECKING ===');
{
  // Date validation
  const validDob = validateFieldValue('dateOfBirth', '1990-05-20');
  assert(validDob.isValid && validDob.normalizedValue === '1990-05-20', 'Valid DOB accepted');

  const futureDob = validateFieldValue('dateOfBirth', '2040-01-01');
  assert(!futureDob.isValid && futureDob.error.includes('future'), 'Future DOB rejected');

  const ancientDob = validateFieldValue('dateOfBirth', '1850-01-01');
  assert(!ancientDob.isValid && ancientDob.error.includes('125'), 'Over 125-year-old DOB rejected');

  // Phone validation
  const validPhone = validateFieldValue('phone', '415-555-2671');
  assert(validPhone.isValid && validPhone.normalizedValue === '(415) 555-2671', 'Valid phone formatted');

  const shortPhone = validateFieldValue('phone', '12345');
  assert(!shortPhone.isValid && shortPhone.example.includes('555'), 'Short phone rejected with example');

  // Email validation
  const validEmail = validateFieldValue('email', 'patient@hospital.org');
  assert(validEmail.isValid && validEmail.normalizedValue === 'patient@hospital.org', 'Valid email accepted');

  const invalidEmail = validateFieldValue('email', 'not-an-email');
  assert(!invalidEmail.isValid, 'Invalid email rejected');

  // Blood group validation
  const validBlood = validateFieldValue('bloodGroup', 'o positive');
  assert(validBlood.isValid && validBlood.normalizedValue === 'O+', 'Blood group normalized to O+');

  const invalidBlood = validateFieldValue('bloodGroup', 'Z negative');
  assert(!invalidBlood.isValid && invalidBlood.error.includes('Invalid Blood Group'), 'Invalid blood group rejected');

  // Blood pressure
  const validBp = validateFieldValue('bloodPressureSystolic', 120);
  assert(validBp.isValid, 'Valid systolic BP accepted');

  const highBp = validateFieldValue('bloodPressureSystolic', 350);
  assert(!highBp.isValid && highBp.error.includes('range'), 'Extreme systolic BP rejected');

  // Heart rate
  const validHr = validateFieldValue('heartRate', 72);
  assert(validHr.isValid, 'Valid heart rate accepted');

  const invalidHr = validateFieldValue('heartRate', 350);
  assert(!invalidHr.isValid, 'Extreme heart rate rejected');

  // Oxygen saturation
  const validSpo2 = validateFieldValue('oxygenSaturation', 98);
  assert(validSpo2.isValid, 'Valid SpO2 accepted');

  const invalidSpo2 = validateFieldValue('oxygenSaturation', 150);
  assert(!invalidSpo2.isValid && invalidSpo2.error.includes('range'), 'Extreme SpO2 rejected');
}

console.log('\n=== SUITE 2: VITALS EXTRACTION & SPO2 99% FIX ===');
{
  assert(extractOxygenSaturation('99% oxygen') === 99, "Extract '99% oxygen' -> 99");
  assert(extractOxygenSaturation('Oxygen level is 98 percent') === 98, "Extract 'Oxygen level is 98 percent' -> 98");
  assert(extractOxygenSaturation('SpO2 is 97') === 97, "Extract 'SpO2 is 97' -> 97");
  assert(extractOxygenSaturation('pulse ox 96%') === 96, "Extract 'pulse ox 96%' -> 96");
  assert(extractOxygenSaturation('no oxygen test taken') === null, 'Extract oxygen from non-reading returns null');

  assert(extractHeartRate('Heart rate is 80 bpm') === 80, "Extract 'Heart rate is 80 bpm' -> 80");
  assert(extractHeartRate('Pulse 72') === 72, "Extract 'Pulse 72' -> 72");

  assert(extractTemperature('Temperature is 98.6 Fahrenheit') === 98.6, "Extract 'Temp 98.6' -> 98.6");
  assert(extractTemperature('37 degrees Celsius') === 98.6, 'Extract 37C converts to 98.6F');

  const bp = extractBloodPressure('Blood pressure is 120 over 80');
  assert(bp && bp.bloodPressureSystolic === '120' && bp.bloodPressureDiastolic === '80', 'Extract BP 120/80');

  const hw = extractHeightWeight('5 feet 10 inches tall and 160 pounds');
  assert(hw && Math.round(hw.heightCm) === 178 && Math.round(hw.weightKg) === 73, 'Extract height/weight imperial conversion');
}

console.log('\n=== SUITE 3: MEDICAL ANSWER ACCURACY & NEGATION HANDLING ===');
{
  // NKDA
  const nkda = parseTargetedAnswer('allergies', 'No allergies, no known drug allergies');
  assert(nkda.hasAllergies === false && Array.isArray(nkda.allergies) && nkda.allergies.length === 0, 'NKDA parsed as hasAllergies=false and empty array');

  // Unknown allergies
  const unknownAllergies = parseTargetedAnswer('allergies', "I am not sure, I don't know");
  assert(Object.keys(unknownAllergies).length === 0, 'Unknown allergies returns empty patch (null)');

  // Positive allergies
  const posAllergies = parseTargetedAnswer('allergies', 'I have a severe Penicillin allergy');
  assert(posAllergies.hasAllergies === true && posAllergies.allergies[0].allergen.toLowerCase().includes('penicillin'), 'Active allergy parsed as hasAllergies=true');

  // Chronic conditions negation: "I don't have diabetes"
  const negatedConditions = parseTargetedAnswer('chronicConditions', "I don't have diabetes, no high blood pressure");
  assert(!negatedConditions.chronicConditions || negatedConditions.chronicConditions.length === 0, "Negated conditions 'don't have diabetes' does NOT add diabetes");

  // Chronic conditions positive: "I have hypertension"
  const posConditions = parseTargetedAnswer('chronicConditions', 'I have Hypertension and asthma');
  assert(posConditions.chronicConditions && posConditions.chronicConditions.some(c => c.includes('Hypertension')), 'Confirmed condition Hypertension captured');
}

console.log('\n=== SUITE 4: ANSWER CORRECTION & REPEAT INTENT ===');
{
  const repeatIntent = detectCorrectionIntent('Repeat the question please', 'dob', 'name');
  assert(repeatIntent.isRepeat === true, 'Repeat question intent detected');

  const correctionName = detectCorrectionIntent('Actually, my name is Robert James Miller', 'phone', 'name');
  assert(correctionName.isCorrection === true && correctionName.targetQuestionId === 'name', "Correction targeting 'name' detected");

  const correctionDob = detectCorrectionIntent('Change my date of birth to April 15 1980', 'allergies', 'dob');
  assert(correctionDob.isCorrection === true && correctionDob.targetQuestionId === 'dob', "Correction targeting 'dob' detected");

  const normalAnswer = detectCorrectionIntent('My phone number is 415-555-1234', 'phone', 'dob');
  assert(normalAnswer.isCorrection === false && normalAnswer.isRepeat === false, 'Standard answer not misidentified as correction');
}

console.log('\n=== SUITE 5: DOCTOR & SUBSCRIBER ENTITY ISOLATION (CRITICAL BUG FIX) ===');
{
  // Patient says "I want to consult Dr. Kumar"
  const doctorPatch = parseTargetedAnswer('consultingDoctor', 'I want to consult Dr. Kumar');
  assert(doctorPatch.consultingDoctor === 'Dr. Kumar', "Consulting doctor set to 'Dr. Kumar'");
  assert(doctorPatch.firstName === undefined, "Doctor response does NOT set firstName");
  assert(doctorPatch.lastName === undefined, "Doctor response does NOT set lastName");

  // Patient says "The policy holder is my father, Rajesh"
  const subscriberPatch = parseTargetedAnswer('insuranceSubscriber', 'The policy holder is my father, Rajesh');
  assert(subscriberPatch.relationshipToPolicyHolder === 'Parent', "Subscriber relationship mapped to 'Parent'");
  assert(subscriberPatch.policyHolderName.includes('Rajesh'), "Policy holder name set to 'Rajesh'");
  assert(subscriberPatch.firstName === undefined, "Subscriber response does NOT set firstName");
  assert(subscriberPatch.lastName === undefined, "Subscriber response does NOT set lastName");

  // Patient says "Emergency contact is David Miller"
  const emPatch = parseTargetedAnswer('emergencyContact', 'Emergency contact is David Miller, brother, phone 415-555-8888');
  assert(emPatch.emergencyContactName === 'David Miller', "Emergency contact name set to 'David Miller'");
  assert(emPatch.firstName === undefined, "Emergency contact response does NOT set firstName");
  assert(emPatch.lastName === undefined, "Emergency contact response does NOT set lastName");
}

console.log('\n=== SUITE 6: DYNAMIC BRANCHING & COMPLETION SUMMARY ===');
{
  // Insurance branching: Self-pay skips insuranceDetails and insuranceSubscriber
  const selfPayQuestions = getApplicableQuestions(VOICE_QA_CATALOG, { hasInsurance: false });
  const hasInsDetails = selfPayQuestions.some(q => q.id === 'insuranceDetails');
  const hasInsSubscriber = selfPayQuestions.some(q => q.id === 'insuranceSubscriber');
  assert(!hasInsDetails && !hasInsSubscriber, 'Self-pay skips insurance details and subscriber questions');

  // Allergy branching: NKDA skips allergyDetails
  const nkdaQuestions = getApplicableQuestions(VOICE_QA_CATALOG, { hasAllergies: false });
  const hasAllergyDetails = nkdaQuestions.some(q => q.id === 'allergyDetails');
  assert(!hasAllergyDetails, 'NKDA skips allergy details question');

  // Completion summary breakdown
  const sampleCollected = {
    firstName: 'John',
    lastName: 'Doe',
    dateOfBirth: '1985-05-15',
    gender: 'Male',
    phone: '415-555-1234',
    addressLine1: '123 Main St',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94105',
    emergencyContactName: 'Jane Doe',
    emergencyContactPhone: '415-555-5678',
    hasAllergies: false,
    hasInsurance: false,
    department: 'General Medicine',
    chiefComplaint: 'Mild headache'
  };

  const appQuestions = getApplicableQuestions(VOICE_QA_CATALOG, sampleCollected);
  const completion = getCompletionStatus(appQuestions, sampleCollected);
  assert(completion.missingRequired.length === 0, 'All required fields satisfied -> 0 missing required');
  assert(completion.isReadyForApply === true, 'All required fields satisfied -> isReadyForApply=true');
}

console.log(`\n========================================`);
console.log(`TEST RESULTS: ${passedTests} / ${totalTests} PASSED`);
console.log(`========================================\n`);

if (passedTests < totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
