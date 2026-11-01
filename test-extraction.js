import { extractPatientInformation } from './src/services/aiExtractor.js';
import { SAMPLE_DOCUMENTS } from './src/data/sampleDocuments.js';
import { generateVerificationScript } from './src/services/speechService.js';
import { INITIAL_PATIENT_STATE } from './src/types/patient.js';

console.log('Testing AI Extraction Engine on Sample Medical Documents...\n');

let totalPassed = 0;

SAMPLE_DOCUMENTS.forEach((sample, i) => {
  console.log(`--- Test ${i + 1}: ${sample.title} (${sample.badge}) ---`);
  const result = extractPatientInformation(sample.text);
  
  console.log(`Extracted count: ${result.stats.extractedCount}`);
  console.log(`High confidence count: ${result.stats.highConfidenceCount}`);
  console.log('Name:', result.mappedFields.firstName, result.mappedFields.lastName);
  console.log('DOB:', result.mappedFields.dateOfBirth, 'Age:', result.mappedFields.age);
  console.log('Blood Group:', result.mappedFields.bloodGroup);
  console.log('Phone:', result.mappedFields.phone);
  console.log('Allergies:', result.mappedFields.allergies);
  console.log('Conditions:', result.mappedFields.chronicConditions);
  console.log('Medications:', result.mappedFields.currentMedications?.length, 'meds');
  console.log('Department:', result.mappedFields.department);
  console.log('Vitals:', result.mappedFields.vitals);
  console.log('Summary:', result.summary);

  // Validate critical fields
  if (result.mappedFields.firstName && result.mappedFields.lastName) {
    totalPassed++;
    console.log('✓ PASS: Name correctly extracted');
  } else {
    console.error('✗ FAIL: Name missing');
  }

  // Test TTS script generation on extracted patient
  const patient = { ...INITIAL_PATIENT_STATE, ...result.mappedFields };
  const ttsSections = generateVerificationScript(patient);
  if (ttsSections.length >= 3) {
    console.log(`✓ PASS: TTS script generated with ${ttsSections.length} voice sections`);
  } else {
    console.error('✗ FAIL: TTS script incomplete');
  }

  console.log('\n');
});

console.log(`Finished: ${totalPassed}/${SAMPLE_DOCUMENTS.length} documents parsed successfully!`);

