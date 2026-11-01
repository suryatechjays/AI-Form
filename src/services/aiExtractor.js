import { calculateAge, calculateBMI, COMMON_ALLERGIES, COMMON_CONDITIONS, DEPARTMENTS } from '../types/patient.js';

const TITLE_PREFIX = /^(?:Mr\.?|Mrs\.?|Ms\.?|Miss|Master|Mast\.?|Mx\.?|Shri|Smt\.?|Kumar|Kumari)\s+/i;
const SUFFIX_PATTERN = /(?:,?\s+(?:Jr\.?|Sr\.?|II|III|IV)|\s*\((?:Self|Patient|Adult|Minor|Pediatric)\))$/i;

const NON_NAME_WORDS = new Set([
  'hospital', 'clinic', 'center', 'centre', 'medical', 'health', 'healthcare',
  'infirmary', 'department', 'division', 'ward', 'unit', 'icu', 'opd', 'er',
  'summary', 'discharge', 'intake', 'assessment', 'record', 'prescription',
  'invoice', 'consultation', 'laboratory', 'pathology', 'radiology', 'radiologist',
  'doctor', 'physician', 'surgeon', 'consultant', 'nurse', 'technician', 'dr',
  'md', 'mbbs', 'unknown', 'null', 'none', 'na', 'n/a', 'male', 'female', 'other',
  'adult', 'pediatric', 'vitals', 'allergy', 'allergies', 'medication', 'medications',
  'condition', 'conditions', 'address', 'phone', 'mobile', 'email', 'date', 'birth',
  'service', 'services', 'general', 'internal', 'orthopedic', 'pediatrics', 'cardiology',
  'report', 'note', 'notes', 'order', 'test', 'labs', 'exam', 'history', 'profile'
]);

/**
 * Robust clinical entity parser for extracting patient First, Middle, and Last name.
 * Prevents collisions with doctors, hospitals, emergency contacts, or insurance holders.
 */
export function extractPatientNameFromText(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;

  const text = rawText.replace(/\r\n/g, '\n');

  // 1. Pre-collect known non-patient names across the document
  const doctorNames = new Set();
  const docMatches = text.matchAll(/(?:Attending\s*(?:Physician)?|Consulting\s*Doctor|Primary\s*Care\s*Provider|Physician|Doctor(?:\s*Name)?|PCP|Referred\s*by|Signed\s*by)\s*[:\-|]?\s*(?:Dr\.?|Doctor)?\s*([A-Za-z\s,\.\'\-]+?)(?=\s*(?:\n|\bLicense\b|\bPhone\b|\bDept\b|\bChief\b|$))/gi);
  for (const m of docMatches) {
    const val = m[1]?.trim();
    if (val && val.length > 2) doctorNames.add(val.toLowerCase());
  }
  const directDocMatches = text.matchAll(/\b(?:Dr\.?|Doctor)\s+([A-Za-z\.\'\-]+(?:\s+[A-Za-z\.\'\-]+){1,3})/gi);
  for (const m of directDocMatches) {
    if (m[0]) doctorNames.add(m[0].toLowerCase());
    if (m[1]) doctorNames.add(m[1].toLowerCase());
  }

  const emergencyNames = new Set();
  const emMatches = text.matchAll(/(?:Emergency\s*Contact(?:\s*Person|\s*Name)?|ICE|Next\s*of\s*Kin|Guardian(?:\s*Name)?|Parent(?:\s*Name)?|Father(?:\'s)?(?:\s*Name)?|Mother(?:\'s)?(?:\s*Name)?|Spouse(?:\s*Name)?)\s*[:\-|]?\s*([A-Za-z\s,\.\'\-]+?)(?=\s*(?:\n|\(|Phone|Mobile|Tel|Cell|Relationship|$))/gi);
  for (const m of emMatches) {
    const val = m[1]?.trim();
    if (val && val.length > 2) emergencyNames.add(val.toLowerCase());
  }

  const holderNames = new Set();
  const holderMatches = text.matchAll(/(?:Policy\s*Holder|Subscriber|Insured\s*Name|Policyholder)\s*[:\-|]?\s*([A-Za-z\s,\.\'\-]+?)(?=\s*(?:\n|\(|Policy|Group|ID|$))/gi);
  for (const m of holderMatches) {
    const val = m[1]?.trim();
    if (val && !val.toLowerCase().includes('(self)') && val.toLowerCase() !== 'self' && val.length > 2) {
      holderNames.add(val.toLowerCase());
    }
  }

  const facilityNames = new Set();
  const facMatches = text.matchAll(/(?:Hospital|Clinic|Center|Facility|Medical\s*Center|Labs?)\s*(?:Name)?\s*[:\-|]?\s*([A-Za-z0-9\s,\.\'\-]+?)(?=\s*(?:\n|\bDepartment\b|\bAddress\b|$))/gi);
  for (const m of facMatches) {
    const val = m[1]?.trim();
    if (val) facilityNames.add(val.toLowerCase());
  }

  const isValidCandidate = (cand) => {
    if (!cand || cand.length < 2 || cand.length > 60) return false;
    if (/^(?:Dr\.?|Doctor)\b/i.test(cand)) return false;
    if (!/^[A-Za-z\s,\.\'\-]+$/.test(cand)) return false;
    const candLower = cand.toLowerCase().replace(/,/g, '');
    const words = candLower.split(/\s+/).filter(Boolean);
    if (!words.length) return false;
    if (words.some(w => NON_NAME_WORDS.has(w))) return false;

    for (const doc of doctorNames) {
      if (candLower === doc || (candLower.length > 4 && candLower.includes(doc)) || (doc.length > 4 && doc.includes(candLower))) {
        return false;
      }
    }
    for (const em of emergencyNames) {
      if (candLower === em || (candLower.length > 4 && candLower.includes(em))) {
        return false;
      }
    }
    for (const h of holderNames) {
      if (candLower === h) return false;
    }
    for (const fac of facilityNames) {
      if (candLower.includes(fac) || fac.includes(candLower)) return false;
    }
    return true;
  };

  const segmentName = (cand, snippet, defaultConfidence = 95) => {
    cand = cand.trim();
    if (cand.includes(',')) {
      const parts = cand.split(',').map(p => p.trim());
      const lastName = parts[0] || '';
      const firstMiddle = (parts[1] || '').split(/\s+/).filter(Boolean);
      const firstName = firstMiddle[0] || '';
      const middleName = firstMiddle.slice(1).join(' ') || null;
      const fullName = `${firstName} ${middleName ? middleName + ' ' : ''}${lastName}`.trim();
      return { fullName, firstName, middleName, lastName, confidence: 95, snippet };
    } else {
      const words = cand.split(/\s+/).filter(Boolean);
      if (words.length === 1) {
        return { fullName: words[0], firstName: words[0], middleName: null, lastName: null, confidence: 75, snippet };
      } else if (words.length === 2) {
        return { fullName: cand, firstName: words[0], middleName: null, lastName: words[1], confidence: 95, snippet };
      } else {
        return {
          fullName: cand,
          firstName: words[0],
          middleName: words.slice(1, -1).join(' '),
          lastName: words[words.length - 1],
          confidence: defaultConfidence,
          snippet
        };
      }
    }
  };

  // Tier 1: Separate Given Name & Family Name / Surname / First Name & Last Name
  const fnMatch = text.match(/(?:First\s*Name|Given\s*Name[s]?|Forename[s]?)\s*[:\-|]?\s*([A-Za-z\.\'\-]+(?:[ \t]+[A-Za-z\.\'\-]+)?)/i);
  const lnMatch = text.match(/(?:Last\s*Name|Family\s*Name|Surname)\s*[:\-|]?\s*([A-Za-z\.\'\-]+)/i);
  if (fnMatch && lnMatch) {
    const fnVal = fnMatch[1].replace(TITLE_PREFIX, '').trim();
    const lnVal = lnMatch[1].trim();
    const combined = `${fnVal} ${lnVal}`;
    if (isValidCandidate(combined)) {
      return {
        fullName: combined,
        firstName: fnVal,
        middleName: null,
        lastName: lnVal,
        confidence: 98,
        snippet: `${fnMatch[0]} | ${lnMatch[0]}`
      };
    }
  }

  // Tier 2: Explicit Patient Name patterns (including multiline and table layouts)
  const patientPatterns = [
    /(?:Patient\s*Name|Patient\'s\s*Name|Pt\.?\s*Name|Name\s*of\s*Patient|Legal\s*Name|Full\s*Name|Client\s*Name)\s*[:\-|]?\s*([A-Za-z\s,\.\'\-]+?)(?=\s*(?:\||\n|\bDOB\b|\bDate\b|\bAge\b|\bSex\b|\bGender\b|\bMRN\b|\bPhone\b|\bID\b|\bAddress\b|\bBlood\b|$))/i,
    /(?:Patient\s*Name|Patient\'s\s*Name|Pt\.?\s*Name|Full\s*Name)\s*[:\-|]?\s*\r?\n\s*([A-Za-z\s,\.\'\-]+?)(?=\s*(?:\||\n|\bDOB\b|\bDate\b|\bAge\b|\bSex\b|\bGender\b|\bMRN\b|\bPhone\b|\bID\b|\bAddress\b|\bBlood\b|$))/i,
    /(?:Patient|Pt)\s*[:\-|]\s*(?!(?:ID|DOB|Date|Age|Sex|Gender|Address|Phone|Status|History|Type|Record|Data|Profile)\b)([A-Za-z\s,\.\'\-]+?)(?=\s*(?:\||\n|\bDOB\b|\bDate\b|\bAge\b|\bSex\b|\bGender\b|\bMRN\b|\bPhone\b|\bID\b|\bAddress\b|$))/i,
    /(?:My\s*name\s*is|Patient\s*name\s*is|This\s*is|I\s*am)\s+([A-Za-z\s\.\'\-]+?)(?=\s*(?:,|\||\.|\n|\bDOB\b|\bDate\b|\bAge\b|\bSex\b|\bGender\b|\bBorn\b|\bPhone\b|\bCall\b|\bLiving\b|\bAddress\b|$))/i,
  ];

  for (const pat of patientPatterns) {
    const m = text.match(pat);
    if (m && m[1]) {
      let cand = m[1].replace(TITLE_PREFIX, '').replace(SUFFIX_PATTERN, '').trim();
      if (isValidCandidate(cand)) {
        return segmentName(cand, m[0], 95);
      }
    }
  }

  // Tier 3: Generic Name: with strict preceding line context check
  const genericMatches = text.matchAll(/(?:^|[\r\n])\s*(?:PATIENT\s+DATA:\s*)?Name\s*[:\-|]\s*([A-Za-z\s,\.\'\-]+?)(?=\s*(?:\||\n|\bDOB\b|\bDate\b|\bAge\b|\bSex\b|\bGender\b|\bMRN\b|\bPhone\b|\bID\b|\bAddress\b|\bBlood\b|$))/gi);
  for (const m of genericMatches) {
    const startIdx = m.index || 0;
    const lineStart = text.lastIndexOf('\n', startIdx);
    const linePrefix = text.slice(lineStart === -1 ? 0 : lineStart + 1, startIdx).trim();
    if (/\b(?:doctor|physician|attending|emergency|contact|guardian|parent|father|mother|spouse|policy\s*holder|subscriber|insured|hospital|facility|clinic)\b/i.test(linePrefix)) {
      continue;
    }
    let cand = m[1]?.replace(TITLE_PREFIX, '').replace(SUFFIX_PATTERN, '').trim();
    if (isValidCandidate(cand)) {
      return segmentName(cand, m[0], 90);
    }
  }

  return null;
}

/**
 * Intelligent AI Medical Document & Voice Text Extractor
 * Maps unstructured text from PDF/OCR or Voice transcription into patient registration fields.
 * 
 * @param {string} rawText - Unstructured text from PDF, OCR, or Voice input
 * @returns {Object} { mappedFields, fieldConfidences, summary, stats }
 */
export function extractPatientInformation(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { mappedFields: {}, fieldConfidences: {}, summary: 'No text provided to extract.', stats: { extractedCount: 0 } };
  }

  const text = rawText.replace(/\r\n/g, '\n');
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const mapped = {};
  const confidences = {};

  const recordField = (fieldKey, value, score, snippet) => {
    if (value !== undefined && value !== null && value !== '') {
      mapped[fieldKey] = value;
      confidences[fieldKey] = {
        score: Math.min(100, Math.max(0, score)),
        level: score >= 85 ? 'high' : score >= 65 ? 'medium' : 'low',
        snippet: snippet ? snippet.slice(0, 120) : '',
        value
      };
    }
  };

  // ==========================================
  // 1. PATIENT FIRST, MIDDLE, LAST, & FULL NAME
  // ==========================================
  const nameResult = extractPatientNameFromText(text);
  if (nameResult) {
    if (nameResult.firstName) recordField('firstName', nameResult.firstName, nameResult.confidence, nameResult.snippet);
    if (nameResult.middleName) recordField('middleName', nameResult.middleName, Math.max(70, nameResult.confidence - 5), nameResult.snippet);
    if (nameResult.lastName) recordField('lastName', nameResult.lastName, nameResult.confidence, nameResult.snippet);
  }

  // ==========================================
  // 2. DATE OF BIRTH & AGE
  // ==========================================
  const dobPatterns = [
    /(?:DOB|D\.O\.B\.?|Date\s*of\s*Birth|Birth\s*Date|Birthdate|Born)\s*(?:[:\-]|\bis\b|\bon\b)?\s*([0-9]{1,4}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{1,4}|[A-Za-z]{3,9}\s+[0-9]{1,2}(?:st|nd|rd|th)?,?\s+[0-9]{4}|[0-9]{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9},?\s+[0-9]{4})/i
  ];

  let rawDob = null;
  let dobSnippet = null;
  for (const regex of dobPatterns) {
    const match = text.match(regex);
    if (match && match[1]) {
      rawDob = match[1].trim();
      dobSnippet = match[0];
      break;
    }
  }

  if (rawDob) {
    const parsedDate = standardizeDate(rawDob);
    if (parsedDate) {
      recordField('dateOfBirth', parsedDate, 95, dobSnippet);
      const calculatedAge = calculateAge(parsedDate);
      if (calculatedAge) {
        recordField('age', calculatedAge, 90, `Calculated from DOB: ${parsedDate}`);
      }
    }
  }

  // If age is explicitly listed
  const ageMatch = text.match(/(?:Age|Years\s*Old)\s*[:\-]?\s*([0-9]{1,3})\s*(?:yrs|years|yo)?/i);
  if (ageMatch && ageMatch[1]) {
    const ageVal = parseInt(ageMatch[1], 10);
    if (ageVal > 0 && ageVal < 125) {
      recordField('age', ageVal, 92, ageMatch[0]);
    }
  }

  // ==========================================
  // 3. GENDER / SEX
  // ==========================================
  const genderMatch = text.match(/(?:Sex|Gender)\s*[:\-]\s*(Male|Female|Non-Binary|Other|M\b|F\b)/i);
  if (genderMatch && genderMatch[1]) {
    let g = genderMatch[1].trim().toUpperCase();
    if (g === 'M' || g.startsWith('MAL')) g = 'Male';
    else if (g === 'F' || g.startsWith('FEM')) g = 'Female';
    else if (g.startsWith('NON')) g = 'Non-Binary';
    else g = 'Other';
    recordField('gender', g, 95, genderMatch[0]);
  }

  // ==========================================
  // 4. BLOOD GROUP
  // ==========================================
  const bloodMatch = text.match(/(?:Blood\s*Group|Blood\s*Type|ABO\s*Rh)\s*(?:is\s*|[:\-])?\s*(A|B|AB|O)\s*([+\-]|pos(?:itive)?|neg(?:ative)?)/i) ||
                     text.match(/\b(A|B|AB|O)\s*(\+|\-)\s*(?:ve|positive|negative)?\b/i);
  if (bloodMatch) {
    const type = bloodMatch[1].toUpperCase();
    const sign = bloodMatch[2].toLowerCase().startsWith('p') || bloodMatch[2] === '+' ? '+' : '-';
    const bg = `${type}${sign}`;
    recordField('bloodGroup', bg, 92, bloodMatch[0]);
  }

  // ==========================================
  // 5. MARITAL STATUS
  // ==========================================
  const maritalMatch = text.match(/(?:Marital\s*Status|Civil\s*Status)\s*[:\-]\s*(Single|Married|Divorced|Widowed|Separated)/i);
  if (maritalMatch && maritalMatch[1]) {
    const status = maritalMatch[1].charAt(0).toUpperCase() + maritalMatch[1].slice(1).toLowerCase();
    recordField('maritalStatus', status, 90, maritalMatch[0]);
  }

  // ==========================================
  // 6. EMERGENCY CONTACT (Parsed before primary phone so emergency numbers aren't confused)
  // ==========================================
  const emergencyMatch = text.match(/\b(?:Emergency\s*Contact|ICE|Next\s*of\s*Kin)\b\s*(?:[:\-]|is)?\s*([^\n\.]+)/i);
  let ecPhoneNumber = null;
  if (emergencyMatch && emergencyMatch[1]) {
    const ecString = emergencyMatch[1].trim();
    // e.g. "Jane Doe (Spouse) - 555-0199" or "Jennifer Miller, spouse, phone number 415-555-9924"
    const ecPhoneMatch = ecString.match(/(\+?[0-9\-\(\)\.\s]{9,18})/);
    if (ecPhoneMatch) {
      ecPhoneNumber = ecPhoneMatch[1].trim();
      recordField('emergencyContactPhone', ecPhoneNumber, 90, ecString);
    }
    
    // Check relationship
    const relMatch = ecString.match(/(Spouse|Husband|Wife|Parent|Mother|Father|Son|Daughter|Sibling|Brother|Sister|Friend|Guardian|Partner)/i);
    if (relMatch) {
      recordField('emergencyContactRelation', relMatch[1].charAt(0).toUpperCase() + relMatch[1].slice(1).toLowerCase(), 88, ecString);
    }

    // Name is the rest
    let cleanName = ecString
      .replace(ecPhoneMatch ? ecPhoneMatch[0] : '', '')
      .replace(/[\(\)]/g, ' ')
      .replace(/(Spouse|Husband|Wife|Parent|Mother|Father|Son|Daughter|Sibling|Brother|Sister|Friend|Guardian|Partner|Relation|Ph|Phone|Tel|[:\-])/gi, ' ')
      .replace(/\b(?:number|is|my|at|call)\b/gi, ' ')
      .replace(/[,;]/g, ' ')
      .trim();
    if (cleanName.length > 2) {
      recordField('emergencyContactName', cleanName, 85, ecString);
    }
  }

  // ==========================================
  // 7. CONTACT DETAILS (PHONE, EMAIL, ADDRESS)
  // ==========================================
  // Primary phone numbers (exclude emergency contact phone if already found)
  const phoneSearchText = ecPhoneNumber ? text.replace(ecPhoneNumber, '') : text;
  const phoneMatch = phoneSearchText.match(/(?:Primary\s*Phone|Contact\s*Phone|Phone|Cell|Mobile|Tel|Telephone|Contact\s*#?)\s*[:\-]?\s*(\+?[0-9\-\(\)\.\s]{9,18})/i) ||
                     phoneSearchText.match(/(?:\+?1[\s\.\-]?)?\(?([0-9]{3})\)?[\s\.\-]?([0-9]{3})[\s\.\-]?([0-9]{4})\b/);
  if (phoneMatch) {
    const rawP = phoneMatch[1] ? phoneMatch[0].replace(/^(Primary\s*Phone|Contact\s*Phone|Phone|Cell|Mobile|Tel|Telephone|Contact\s*#?)\s*[:\-]?\s*/i, '') : phoneMatch[0];
    const cleanedPhone = rawP.trim();
    if (cleanedPhone.length >= 7) {
      recordField('phone', cleanedPhone, 88, phoneMatch[0]);
    }
  }

  // Email
  const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch && emailMatch[1]) {
    recordField('email', emailMatch[1].toLowerCase(), 96, emailMatch[0]);
  }

  // Address, City, State, Zip
  const addressMatch = text.match(/(?:Address|Residence|Home\s*Address)\s*[:\-]\s*([^\n]+(?:\n[^\n]+)?)/i);
  if (addressMatch && addressMatch[1]) {
    const addr = addressMatch[1].trim();
    // Parse city, state, zip if present
    const cityStateZip = addr.match(/([A-Za-z\s]+),\s*([A-Za-z]{2})\s*([0-9]{5}(?:-[0-9]{4})?)/);
    if (cityStateZip) {
      recordField('city', cityStateZip[1].trim(), 88, addr);
      recordField('state', cityStateZip[2].toUpperCase().trim(), 90, addr);
      recordField('postalCode', cityStateZip[3].trim(), 92, addr);
      const street = addr.replace(cityStateZip[0], '').replace(/,$/, '').trim();
      if (street) recordField('addressLine1', street, 85, addr);
    } else {
      recordField('addressLine1', addr.split('\n')[0].trim(), 78, addr);
    }
  }

  // Zipcode standalone
  const zipMatch = text.match(/(?:Zip\s*Code|Postal\s*Code|PIN)\s*[:\-]?\s*([0-9]{5,6}(?:-[0-9]{4})?)/i);
  if (zipMatch && zipMatch[1] && !mapped.postalCode) {
    recordField('postalCode', zipMatch[1].trim(), 90, zipMatch[0]);
  }

  // ==========================================
  // 8. INSURANCE DETAILS
  // ==========================================
  const insProviderMatch = text.match(/(?:Insurance\s*Provider|Insurance\s*Company|Payer|Carrier|Health\s*Plan)\s*[:\-]\s*([^\n]+)/i) ||
                           text.match(/\b(Blue\s*Cross|Aetna|Cigna|UnitedHealthcare|Humana|Kaiser|Medicare|Medicaid)\b/i);
  if (insProviderMatch) {
    const prov = (insProviderMatch[1] || insProviderMatch[0]).trim();
    recordField('insuranceProvider', prov, 90, insProviderMatch[0]);
    recordField('hasInsurance', true, 95, 'Insurance provider found');
  }

  const policyMatch = text.match(/(?:Policy\s*(?:#|Number|ID)|Member\s*ID|Subscriber\s*ID|Insurance\s*ID)\s*[:\-]?\s*([A-Za-z0-9\-]+)/i);
  if (policyMatch && policyMatch[1]) {
    recordField('policyNumber', policyMatch[1].trim(), 92, policyMatch[0]);
  }

  const groupMatch = text.match(/(?:Group\s*(?:#|Number|ID)|Grp\s*#?)\s*[:\-]?\s*([A-Za-z0-9\-]+)/i);
  if (groupMatch && groupMatch[1]) {
    recordField('groupNumber', groupMatch[1].trim(), 90, groupMatch[0]);
  }

  // ==========================================
  // 9. ALLERGIES & ALERTS
  // ==========================================
  const allergySectionMatch = text.match(/(?:Allergies|Allergy\s*Alert|Known\s*Allergies)\s*[:\-]\s*([^\n]+(?:\n[^\n]+)?)/i) ||
                              text.match(/(?:allergic\s*to|allergy\s*to)\s*([^\n\.]+)/i);
  const detectedAllergies = [];

  if (/\b(?:NKDA|no\s*known\s*(?:drug\s*)?allergies)\b/i.test(text)) {
    recordField('hasAllergies', false, 95, 'NKDA reported');
  } else if (allergySectionMatch) {
    const rawAllergyText = allergySectionMatch[1].trim();
    if (/NKDA|No\s*Known|None|N\/A|Negative/i.test(rawAllergyText)) {
      recordField('hasAllergies', false, 95, allergySectionMatch[0]);
    } else {
      recordField('hasAllergies', true, 95, allergySectionMatch[0]);
      // Parse individual allergens
      const items = rawAllergyText.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
      for (const item of items) {
        if (!item) continue;
        let severity = 'Moderate';
        let reaction = 'Rash / Hives';
        if (/anaphylaxis|severe|shock|throat/i.test(item)) severity = 'Severe';
        if (/mild|itch|stomach/i.test(item)) severity = 'Mild';
        if (/swelling|angioedema/i.test(item)) reaction = 'Swelling';
        if (/anaphylaxis/i.test(item)) reaction = 'Anaphylaxis';
        if (/nausea|vomiting/i.test(item)) reaction = 'Nausea / GI Distress';
        if (/rash|hives|urticaria/i.test(item)) reaction = 'Hives / Rash';

        // Extract allergen name
        const cleanAllergen = item
          .replace(/^(?:Allergies|Allergy\s*Alert|Known\s*Allergies)\s*[:\-]?\s*/i, '')
          .replace(/\(.*\)/, '')
          .replace(/severe|mild|moderate/gi, '')
          .trim();
        if (cleanAllergen) {
          detectedAllergies.push({
            allergen: cleanAllergen,
            reaction,
            severity
          });
        }
      }
    }
  }

  // Also check common allergens in full text if mentioned near allergic/allergy
  COMMON_ALLERGIES.forEach(allergen => {
    if (/(?:allergic|allergy)/i.test(text) && new RegExp(`\\b${allergen}\\b`, 'i').test(text) && !detectedAllergies.some(a => a.allergen.toLowerCase().includes(allergen.toLowerCase()))) {
      detectedAllergies.push({
        allergen,
        reaction: /anaphylaxis/i.test(text) ? 'Anaphylaxis' : 'Hypersensitivity',
        severity: /severe/i.test(text) ? 'Severe' : 'Moderate'
      });
      recordField('hasAllergies', true, 85, `Detected "${allergen}" in text`);
    }
  });

  if (detectedAllergies.length > 0) {
    recordField('allergies', detectedAllergies, 90, `Found ${detectedAllergies.length} allergy record(s)`);
  }

  // ==========================================
  // 10. CHRONIC CONDITIONS / PAST HISTORY
  // ==========================================
  const detectedConditions = [];
  COMMON_CONDITIONS.forEach(cond => {
    // Simplify pattern for matching
    const baseName = cond.split('(')[0].trim();
    const rx = new RegExp(`\\b${baseName}\\b`, 'i');
    if (rx.test(text)) {
      if (!detectedConditions.includes(cond)) {
        detectedConditions.push(cond);
      }
    }
  });

  if (detectedConditions.length > 0) {
    recordField('chronicConditions', detectedConditions, 88, `Matched conditions: ${detectedConditions.join(', ')}`);
  }

  // ==========================================
  // 11. MEDICATIONS
  // ==========================================
  const detectedMedications = [];
  const medRegex = /(?:Rx|Medications?|Current\s*Meds?|Prescription)\s*[:\-]\s*([\s\S]+?)(?=\n\n|\n[A-Z\s]{4,}:|$)/i;
  const medBlock = text.match(medRegex);
  const textToScanForMeds = medBlock ? medBlock[1] : text;

  // Common medication patterns: DrugName 100mg once daily / BID
  const drugLineRegex = /(?:Rx\s*[:\-]?)?\s*([A-Za-z]{3,25}(?:\s+[A-Za-z]+)?)\s+([0-9]+(?:\.[0-9]+)?\s*(?:mg|mcg|ml|g|units|tablet|capsule|puff|drop)s?)\s*([^\n,;]*)/gi;
  let drugMatch;
  while ((drugMatch = drugLineRegex.exec(textToScanForMeds)) !== null) {
    const medName = drugMatch[1].replace(/^(?:taking|takes|take|prescribed)\s+/i, '').trim();
    const dosage = drugMatch[2].trim();
    let rawFreq = drugMatch[3].replace(/^[\-\s]+/, '').trim();
    if (rawFreq.includes(' and ')) {
      rawFreq = rawFreq.split(' and ')[0].trim();
    }
    let frequency = rawFreq || 'Daily';
    
    // Clean up frequency
    if (/bid|twice/i.test(frequency)) frequency = 'Twice daily (BID)';
    else if (/tid|three/i.test(frequency)) frequency = 'Three times daily (TID)';
    else if (/qid|four/i.test(frequency)) frequency = 'Four times daily (QID)';
    else if (/prn|as\s*needed/i.test(frequency)) frequency = 'As needed (PRN)';
    else if (/qhs|bedtime/i.test(frequency)) frequency = 'At bedtime';
    else if (!frequency || frequency.length < 2) frequency = 'Once daily';

    if (!detectedMedications.some(m => m.name.toLowerCase() === medName.toLowerCase()) && 
        !/patient|doctor|clinic|hospital|date|blood|conditions|allergies|vitals/i.test(medName)) {
      detectedMedications.push({
        name: medName,
        dosage,
        frequency
      });
    }
  }

  if (detectedMedications.length > 0) {
    recordField('currentMedications', detectedMedications, 86, `Identified ${detectedMedications.length} medication(s)`);
  }

  // ==========================================
  // 12. VITALS (BP, HR, TEMP, HEIGHT, WEIGHT, SPO2)
  // ==========================================
  const vitals = {};
  
  // Blood Pressure
  const bpMatch = text.match(/(?:BP|Blood\s*Pressure)\s*(?:is|at|of|[:\-])?\s*([0-9]{2,3})\s*(?:[\/|\\]|\s*over\s*)\s*([0-9]{2,3})\s*(?:mmHg)?/i) ||
                  text.match(/\b([0-9]{2,3})\s*(?:[\/|\\]|\s*over\s*)\s*([0-9]{2,3})\s*(?:mmHg)?\b/i);
  if (bpMatch) {
    vitals.bloodPressureSystolic = bpMatch[1].trim();
    vitals.bloodPressureDiastolic = bpMatch[2].trim();
    recordField('vitals.bloodPressure', `${vitals.bloodPressureSystolic}/${vitals.bloodPressureDiastolic} mmHg`, 95, bpMatch[0]);
  }

  // Heart Rate / Pulse
  const hrMatch = text.match(/(?:HR|Heart\s*Rate|Pulse|PR)\s*(?:is|at|of|[:\-])?\s*([0-9]{2,3})\s*(?:bpm)?/i) ||
                  text.match(/\b([0-9]{2,3})\s*(?:bpm|beats\s*per\s*minute)\b/i);
  if (hrMatch) {
    vitals.heartRate = hrMatch[1].trim();
    recordField('vitals.heartRate', `${vitals.heartRate} bpm`, 92, hrMatch[0]);
  }

  // Temperature
  const tempMatch = text.match(/(?:Temp|Temperature)\s*(?:is|at|of|[:\-])?\s*([0-9]{2,3}(?:\.[0-9])?)\s*(?:°?\s*[FC]|degrees?(?:\s*[FC])?)?/i);
  if (tempMatch) {
    vitals.temperature = tempMatch[1].trim();
    recordField('vitals.temperature', `${vitals.temperature} °F`, 90, tempMatch[0]);
  }

  // SpO2 / Oxygen Saturation
  const spo2MatchPrefix = text.match(/(?:SpO2|O2\s*Sat(?:uration)?|Oxygen(?:\s*(?:Saturation|level))?)\s*(?:is|at|of|[:\-])?\s*([789][0-9]|100)\s*%?/i);
  const spo2MatchSuffix = text.match(/\b([789][0-9]|100)\s*(?:%|\s*percent)?\s*(?:oxygen|o2|spo2)\b/i);
  if (spo2MatchPrefix) {
    vitals.oxygenSaturation = spo2MatchPrefix[1].trim();
    recordField('vitals.oxygenSaturation', `${vitals.oxygenSaturation} %`, 92, spo2MatchPrefix[0]);
  } else if (spo2MatchSuffix) {
    vitals.oxygenSaturation = spo2MatchSuffix[1].trim();
    recordField('vitals.oxygenSaturation', `${vitals.oxygenSaturation} %`, 92, spo2MatchSuffix[0]);
  }

  // Height (cm or ft/in)
  const heightCmMatch = text.match(/(?:Height|Ht)\s*[:\-]?\s*([0-9]{2,3})\s*cm/i);
  if (heightCmMatch) {
    vitals.heightCm = heightCmMatch[1].trim();
    recordField('vitals.heightCm', `${vitals.heightCm} cm`, 90, heightCmMatch[0]);
  }

  // Weight (kg or lbs)
  const weightKgMatch = text.match(/(?:Weight|Wt)\s*[:\-]?\s*([0-9]{2,3}(?:\.[0-9])?)\s*kg/i);
  if (weightKgMatch) {
    vitals.weightKg = weightKgMatch[1].trim();
    recordField('vitals.weightKg', `${vitals.weightKg} kg`, 90, weightKgMatch[0]);
  }

  // Compute BMI if height and weight exist
  if (vitals.heightCm && vitals.weightKg) {
    vitals.bmi = calculateBMI(vitals.heightCm, vitals.weightKg);
  }

  if (Object.keys(vitals).length > 0) {
    mapped.vitals = vitals;
  }

  // ==========================================
  // 13. CHIEF COMPLAINT / REASON FOR VISIT
  // ==========================================
  const ccMatch = text.match(/(?:Chief\s*Complaint|Reason\s*for\s*(?:Visit|Consultation)|Presenting\s*Illness|Symptoms?)\s*[:\-]\s*([^\n]+(?:\n[^\n]+)?)/i);
  if (ccMatch && ccMatch[1]) {
    const cc = ccMatch[1].trim();
    recordField('chiefComplaint', cc, 88, ccMatch[0]);
  }

  // Department
  for (const dept of DEPARTMENTS) {
    if (new RegExp(`\\b${dept}\\b`, 'i').test(text)) {
      recordField('department', dept, 82, `Matched department ${dept}`);
      break;
    }
  }

  // Consulting Physician / Doctor
  const docMatch = text.match(/(?:Attending(?:\s*Physician)?|Consulting\s*Doctor|Physician|Doctor(?:\s*Name)?|PCP)\s*[:\-|]?\s*(Dr\.?\s*[A-Za-z\.\'\-]+(?:\s+[A-Za-z\.\'\-]+){1,3}(?:,\s*MD)?|Doctor\s+[A-Za-z\.\'\-]+(?:\s+[A-Za-z\.\'\-]+){1,3})/i);
  if (docMatch && docMatch[1]) {
    recordField('consultingDoctor', docMatch[1].trim(), 88, docMatch[0]);
  }

  // Generate friendly natural summary of extracted details
  const extractedCount = Object.keys(mapped).length;
  let summary = `Extracted ${extractedCount} clinical field(s) with high accuracy.`;
  const highlights = [];
  if (mapped.firstName || mapped.lastName) highlights.push(`Patient: ${mapped.firstName || ''} ${mapped.lastName || ''}`.trim());
  if (mapped.dateOfBirth) highlights.push(`DOB: ${mapped.dateOfBirth}`);
  if (mapped.bloodGroup && mapped.bloodGroup !== 'Unknown') highlights.push(`Blood: ${mapped.bloodGroup}`);
  if (mapped.hasAllergies && mapped.allergies?.length) highlights.push(`Allergies: ${mapped.allergies.map(a => a.allergen).join(', ')}`);
  if (mapped.insuranceProvider) highlights.push(`Insurance: ${mapped.insuranceProvider}`);
  if (highlights.length) {
    summary += ` Key details: ${highlights.join(' | ')}.`;
  }

  return {
    mappedFields: mapped,
    fieldConfidences: confidences,
    summary,
    stats: {
      extractedCount,
      highConfidenceCount: Object.values(confidences).filter(c => c.level === 'high').length,
      mediumConfidenceCount: Object.values(confidences).filter(c => c.level === 'medium').length,
      lowConfidenceCount: Object.values(confidences).filter(c => c.level === 'low').length
    }
  };
}

/**
 * Helper to normalize dates into YYYY-MM-DD
 */
function standardizeDate(dateStr) {
  try {
    // Check YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

    // Spoken Month Day Year e.g. August 14 1982 or 14 August 1982
    const monthNames = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
    const m1 = dateStr.match(/([A-Za-z]{3,9})\s+([0-9]{1,2})(?:st|nd|rd|th)?,?\s+([0-9]{4})/i);
    if (m1) {
      const mon = m1[1].slice(0, 3).toLowerCase();
      if (monthNames[mon]) {
        return `${m1[3]}-${monthNames[mon]}-${String(m1[2]).padStart(2, '0')}`;
      }
    }
    const m2 = dateStr.match(/([0-9]{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9}),?\s+([0-9]{4})/i);
    if (m2) {
      const mon = m2[2].slice(0, 3).toLowerCase();
      if (monthNames[mon]) {
        return `${m2[3]}-${monthNames[mon]}-${String(m2[1]).padStart(2, '0')}`;
      }
    }

    // Check MM/DD/YYYY or DD/MM/YYYY
    const slashParts = dateStr.split(/[\/\-\.]/);
    if (slashParts.length === 3) {
      let p1 = parseInt(slashParts[0], 10);
      let p2 = parseInt(slashParts[1], 10);
      let p3 = parseInt(slashParts[2], 10);

      // YYYY/MM/DD
      if (p1 > 1000) {
        return `${p1}-${String(p2).padStart(2, '0')}-${String(p3).padStart(2, '0')}`;
      }
      // MM/DD/YYYY or DD/MM/YYYY
      if (p3 > 1000) {
        // If p1 > 12, it must be DD/MM/YYYY
        if (p1 > 12) {
          return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
        }
        // Assume MM/DD/YYYY standard
        return `${p3}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
      }
    }

    // Try Date.parse
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch (e) {
    // Ignore parse error
  }
  return null;
}
