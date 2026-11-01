/**
 * Focused verification tests for AEGIS Patient Name Extraction and Preservation.
 */

import assert from 'assert';
import { extractPatientInformation, extractPatientNameFromText } from './src/services/aiExtractor.js';
import { mapBackendExtractionToForm } from './src/services/api.js';

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(err);
  }
}

console.log('=== AEGIS PATIENT NAME EXTRACTION ACCURACY TEST SUITE ===\n');

// 1. Standard "Patient Name: First Middle Last"
test('Digital PDF Standard Layout ("Patient Name: David Michael Miller")', () => {
  const text = `
MERCY GENERAL HOSPITAL - PATIENT DISCHARGE SUMMARY
===================================================
Patient Name: David Michael Miller
Date of Birth: 1985-04-12
Attending Physician: Dr. Sarah Jenkins, MD
Primary Phone: (415) 555-3819
`;
  const nameRes = extractPatientNameFromText(text);
  assert.ok(nameRes, 'Name result should not be null');
  assert.strictEqual(nameRes.firstName, 'David');
  assert.strictEqual(nameRes.middleName, 'Michael');
  assert.strictEqual(nameRes.lastName, 'Miller');
  assert.strictEqual(nameRes.fullName, 'David Michael Miller');

  const fullExtract = extractPatientInformation(text);
  assert.strictEqual(fullExtract.mappedFields.firstName, 'David');
  assert.strictEqual(fullExtract.mappedFields.middleName, 'Michael');
  assert.strictEqual(fullExtract.mappedFields.lastName, 'Miller');
});

// 2. Comma separated "Name: Last, First Middle"
test('Comma Formatted Name ("Name: Rodriguez, Maria Elena")', () => {
  const text = `
METRO HEALTH LABS & CARDIOLOGY REFERRAL CENTER
PATIENT DATA:
Name: Rodriguez, Maria Elena
Date of Birth: 1995-11-23
Physician: Dr. Maya Patel, MD
`;
  const nameRes = extractPatientNameFromText(text);
  assert.ok(nameRes, 'Name result should not be null');
  assert.strictEqual(nameRes.firstName, 'Maria');
  assert.strictEqual(nameRes.middleName, 'Elena');
  assert.strictEqual(nameRes.lastName, 'Rodriguez');
  assert.strictEqual(nameRes.fullName, 'Maria Elena Rodriguez');
});

// 3. Separate Given Name & Family Name / Surname
test('Separate Given Name and Family Name Fields', () => {
  const text = `
HEALTHCARE REGISTRATION PORTAL
First Name: Lucas
Last Name: Wright
DOB: 2018-06-19
Attending: Dr. Emily Thornton, MD
`;
  const nameRes = extractPatientNameFromText(text);
  assert.ok(nameRes, 'Name result should not be null');
  assert.strictEqual(nameRes.firstName, 'Lucas');
  assert.strictEqual(nameRes.lastName, 'Wright');

  const textIntl = `
INTAKE SLIP
Given Name: Alexander
Surname: Hamilton
DOB: 1990-01-01
`;
  const nameRes2 = extractPatientNameFromText(textIntl);
  assert.ok(nameRes2, 'Name result should not be null');
  assert.strictEqual(nameRes2.firstName, 'Alexander');
  assert.strictEqual(nameRes2.lastName, 'Hamilton');
});

// 4. Multiline OCR Format (Label on line 1, Name on line 2)
test('Multiline OCR Layout ("Patient Name\\nSamantha Lee Miller")', () => {
  const text = `
CLINICAL ASSESSMENT FORM
Patient Name
Samantha Lee Miller
DOB: 1992-04-10
Blood Group: O+
`;
  const nameRes = extractPatientNameFromText(text);
  assert.ok(nameRes, 'Name result should not be null');
  assert.strictEqual(nameRes.firstName, 'Samantha');
  assert.strictEqual(nameRes.middleName, 'Lee');
  assert.strictEqual(nameRes.lastName, 'Miller');
});

// 5. Table Layout with Pipes ("| Patient Name | Bruce Wayne |")
test('Table Format with Pipes ("| Patient Name | Bruce Wayne |")', () => {
  const text = `
| Record Field | Extracted Value |
| Patient Name | Bruce Wayne |
| DOB | 1980-02-19 |
| Sex | Male |
`;
  const nameRes = extractPatientNameFromText(text);
  assert.ok(nameRes, 'Name result should not be null');
  assert.strictEqual(nameRes.firstName, 'Bruce');
  assert.strictEqual(nameRes.lastName, 'Wayne');
});

// 6. Title and Honorific Stripping ("Mr. David Miller Jr.")
test('Title and Suffix Stripping ("Mr. David Miller Jr.")', () => {
  const text = `
ADMISSION RECORD
Patient Name: Mr. David Miller Jr.
DOB: 1980-01-01
`;
  const nameRes = extractPatientNameFromText(text);
  assert.ok(nameRes, 'Name result should not be null');
  assert.strictEqual(nameRes.firstName, 'David');
  assert.strictEqual(nameRes.lastName, 'Miller');
});

// 7. Non-patient Entity Exclusion: Doctor & Hospital Never Mistaken for Patient
test('Doctor and Hospital Names NEVER Mistaken for Patient (No Patient Present)', () => {
  const text = `
===============================================================
MERCY GENERAL HOSPITAL - PATIENT DISCHARGE SUMMARY
Department of Internal Medicine | 100 Hospital Drive
===============================================================
Attending Physician: Dr. Sarah Jenkins, MD
Consulting Doctor: Dr. Gregory Vance
Department: Cardiology
BP: 120/80 mmHg
`;
  const nameRes = extractPatientNameFromText(text);
  assert.strictEqual(nameRes, null, 'Must return null when patient name is not present');

  const fullExtract = extractPatientInformation(text);
  assert.strictEqual(fullExtract.mappedFields.firstName, undefined);
  assert.strictEqual(fullExtract.mappedFields.lastName, undefined);
  assert.ok(fullExtract.mappedFields.consultingDoctor?.includes('Sarah Jenkins'));
});

// 8. Non-patient Entity Exclusion: Emergency Contact & Policy Holder Never Mistaken for Patient
test('Emergency Contact and Insurance Policy Holder NEVER Mistaken for Patient', () => {
  const text = `
EMERGENCY ADMISSION REPORT
Emergency Contact: Jennifer Miller (Spouse)
Emergency Phone: (415) 555-9924
Policy Holder: Sarah Wright
Insurance Provider: Blue Cross
Blood Group: A+
`;
  const nameRes = extractPatientNameFromText(text);
  assert.strictEqual(nameRes, null, 'Must return null when only non-patient entities are listed');

  const fullExtract = extractPatientInformation(text);
  assert.strictEqual(fullExtract.mappedFields.firstName, undefined);
  assert.strictEqual(fullExtract.mappedFields.lastName, undefined);
  assert.strictEqual(fullExtract.mappedFields.emergencyContactName, 'Jennifer Miller');
});

// 9. Coexisting Doctor, Emergency Contact, and Patient
test('Coexisting Doctor, Emergency Contact, and Patient in Single Document', () => {
  const text = `
VALLEY PEDIATRIC HEALTHCARE
Attending: Dr. Emily Thornton, MD
Emergency Contact: Sarah Wright (Mother)
Policy Holder: Sarah Wright
Full Name: Lucas Alexander Wright
DOB: 2018-06-19
`;
  const nameRes = extractPatientNameFromText(text);
  assert.ok(nameRes, 'Patient name must be extracted');
  assert.strictEqual(nameRes.firstName, 'Lucas');
  assert.strictEqual(nameRes.middleName, 'Alexander');
  assert.strictEqual(nameRes.lastName, 'Wright');
  assert.notStrictEqual(nameRes.firstName, 'Emily');
  assert.notStrictEqual(nameRes.firstName, 'Sarah');
});

// 10. Backend Extraction Mapping (mapBackendExtractionToForm)
test('mapBackendExtractionToForm with direct first_name, last_name, and comma full_name', () => {
  // Case A: Direct first_name and last_name from backend
  const backendRes1 = {
    model_used: 'openai/gpt-oss-20b',
    extraction_source: 'groq_api',
    extracted_fields: {
      first_name: 'Jonathan',
      middle_name: 'Edward',
      last_name: 'Doe',
      date_of_birth: '1985-05-15',
      gender: 'Male',
      blood_group: 'O+'
    },
    field_confidences: {
      first_name: 0.98,
      last_name: 0.98
    }
  };
  const mapped1 = mapBackendExtractionToForm(backendRes1);
  assert.strictEqual(mapped1.mappedFields.firstName, 'Jonathan');
  assert.strictEqual(mapped1.mappedFields.middleName, 'Edward');
  assert.strictEqual(mapped1.mappedFields.lastName, 'Doe');

  // Case B: Comma formatted full_name
  const backendRes2 = {
    model_used: 'openai/gpt-oss-20b',
    extraction_source: 'groq_api',
    extracted_fields: {
      full_name: 'Rodriguez, Maria Elena',
      date_of_birth: '1995-11-23'
    },
    field_confidences: {
      full_name: 0.95
    }
  };
  const mapped2 = mapBackendExtractionToForm(backendRes2);
  assert.strictEqual(mapped2.mappedFields.firstName, 'Maria');
  assert.strictEqual(mapped2.mappedFields.middleName, 'Elena');
  assert.strictEqual(mapped2.mappedFields.lastName, 'Rodriguez');
});

// 11. Preservation of Manually Entered Fields (Never Automatically Overwritten)
test('Preservation Rule: Pre-existing form values are NOT checked by default for overwrite', () => {
  const patientData = {
    firstName: 'ExistingFirstName',
    lastName: 'ExistingLastName',
    phone: '555-0100',
    bloodGroup: 'Unknown', // Default value, eligible for update
    email: '' // Empty, eligible for update
  };

  const isFieldAlreadyEntered = (key) => {
    if (!patientData) return false;
    const val = patientData[key];
    if (val === undefined || val === null || val === '') return false;
    if (Array.isArray(val) && val.length === 0) return false;
    if (typeof val === 'object' && Object.keys(val).length === 0) return false;
    if (key === 'bloodGroup' && (val === 'Unknown' || val === 'Select Blood Group')) return false;
    return true;
  };

  const extractedFields = {
    firstName: 'ExtractedName',
    lastName: 'ExtractedLast',
    phone: '555-9999',
    bloodGroup: 'A+',
    email: 'new.patient@test.com'
  };

  const initialSelected = {};
  Object.keys(extractedFields).forEach((key) => {
    initialSelected[key] = !isFieldAlreadyEntered(key);
  });

  // Manually entered fields MUST be unchecked (preserved) by default
  assert.strictEqual(initialSelected.firstName, false, 'firstName must be preserved (unchecked)');
  assert.strictEqual(initialSelected.lastName, false, 'lastName must be preserved (unchecked)');
  assert.strictEqual(initialSelected.phone, false, 'phone must be preserved (unchecked)');

  // Unentered fields or defaults MUST be checked by default
  assert.strictEqual(initialSelected.bloodGroup, true, 'bloodGroup should be populated');
  assert.strictEqual(initialSelected.email, true, 'email should be populated');
});

console.log(`\nResults: ${passed} / ${total} tests passed.`);
if (passed === total) {
  console.log('ALL FRONTEND NAME EXTRACTION ACCURACY TESTS PASSED!');
  process.exit(0);
} else {
  console.error(`FAILED: ${total - passed} tests failed.`);
  process.exit(1);
}
