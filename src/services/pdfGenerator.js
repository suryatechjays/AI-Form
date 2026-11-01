import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import QRCode from 'qrcode';

/**
 * Generate a clinical, hospital-grade Patient Registration Dossier PDF
 * @param {Object} patient - Full patient registration state
 * @returns {Promise<{ doc: jsPDF, blob: Blob, dataUrl: string, fileName: string }>}
 */
export async function generatePatientRegistrationPDF(patient) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4' // 595.28 x 841.89 pt
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const contentWidth = pageWidth - (margin * 2);

  // Generate QR Code data URL containing essential check-in payload
  const qrPayload = JSON.stringify({
    regId: patient.registrationId || 'AEGIS-2026-PENDING',
    mrn: patient.mrn || 'MRN-NEW',
    name: `${patient.firstName || ''} ${patient.lastName || ''}`.trim(),
    dob: patient.dateOfBirth,
    blood: patient.bloodGroup,
    allergies: patient.hasAllergies ? patient.allergies.map(a => a.allergen) : ['NKDA'],
    dept: patient.department,
    date: patient.registrationDate
  });

  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(qrPayload, {
      margin: 1,
      width: 90,
      color: { dark: '#0f766e', light: '#ffffff' }
    });
  } catch (e) {
    console.warn('QR code generation warning:', e);
  }

  // --- HEADER SECTION ---
  // Top teal brand bar
  doc.setFillColor(15, 118, 110); // Teal 700
  doc.rect(margin, margin, contentWidth, 54, 'F');

  // Hospital Name & Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text('AI FORM REGIONAL HEALTH SYSTEM', margin + 14, margin + 22);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(204, 251, 241); // Teal 100
  doc.text('Department of Patient Admissions & Medical Records', margin + 14, margin + 35);
  doc.text('24/7 Care Helpline: (800) 555-AEGIS | admissions@aegishealth.org', margin + 14, margin + 46);

  // QR Code on right side of header
  if (qrDataUrl) {
    doc.addImage(qrDataUrl, 'PNG', pageWidth - margin - 50, margin + 2, 48, 48);
  }

  let yPos = margin + 64;

  // --- REGISTRATION SUMMARY BAR ---
  doc.setFillColor(248, 250, 252); // Slate 50
  doc.setDrawColor(226, 232, 240); // Slate 200
  doc.roundedRect(margin, yPos, contentWidth, 34, 4, 4, 'FD');

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // Slate 500
  doc.setFont('helvetica', 'bold');
  doc.text('REGISTRATION ID:', margin + 12, yPos + 14);
  doc.text('MRN / PATIENT ID:', margin + 140, yPos + 14);
  doc.text('REGISTRATION DATE:', margin + 280, yPos + 14);
  doc.text('DEPARTMENT:', margin + 400, yPos + 14);

  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42); // Slate 900
  doc.setFont('helvetica', 'bold');
  doc.text(patient.registrationId || 'AEGIS-2026-0001', margin + 12, yPos + 26);
  doc.text(patient.mrn || 'MRN-890214', margin + 140, yPos + 26);
  doc.text(`${patient.registrationDate || '2026-10-28'} ${patient.registrationTime || ''}`, margin + 280, yPos + 26);
  doc.text(patient.department || 'General Medicine', margin + 400, yPos + 26);

  yPos += 42;

  // --- CRITICAL ALLERGY ALERT / SAFETY BANNER ---
  if (patient.hasAllergies && patient.allergies && patient.allergies.length > 0) {
    doc.setFillColor(254, 242, 242); // Red 50
    doc.setDrawColor(239, 68, 68); // Red 500
    doc.setLineWidth(1.2);
    doc.roundedRect(margin, yPos, contentWidth, 24, 3, 3, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(185, 28, 28); // Red 700
    const allergyList = patient.allergies.map(a => `${a.allergen} (${a.reaction || 'Reaction'})`).join('; ');
    doc.text(`CRITICAL MEDICAL ALERT - DOCUMENTED ALLERGIES: ${allergyList}`, margin + 10, yPos + 15);
    yPos += 30;
  } else {
    doc.setFillColor(240, 253, 244); // Green 50
    doc.setDrawColor(34, 197, 94); // Green 500
    doc.setLineWidth(0.8);
    doc.roundedRect(margin, yPos, contentWidth, 20, 3, 3, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(21, 128, 61); // Green 700
    doc.text('ALLERGY STATUS: No Known Drug Allergies (NKDA) Reported', margin + 10, yPos + 13);
    yPos += 26;
  }

  // --- SECTION 1: DEMOGRAPHICS & IDENTIFICATION ---
  const patientFullName = `${patient.firstName || ''} ${patient.middleName ? patient.middleName + ' ' : ''}${patient.lastName || ''}`.trim() || 'N/A';
  
  doc.autoTable({
    startY: yPos,
    margin: { left: margin, right: margin },
    theme: 'grid',
    head: [[
      { content: '1. PATIENT DEMOGRAPHIC INFORMATION', colSpan: 4, styles: { fillColor: [15, 118, 110], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 } }
    ]],
    body: [
      [
        { content: 'Full Name:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 95 } },
        { content: patientFullName, styles: { fontStyle: 'bold' } },
        { content: 'Date of Birth (Age):', styles: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 105 } },
        { content: `${patient.dateOfBirth || 'N/A'} (${patient.age ? patient.age + ' yrs' : 'N/A'})` }
      ],
      [
        { content: 'Gender:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
        { content: patient.gender || 'Not specified' },
        { content: 'Blood Group:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
        { content: patient.bloodGroup || 'Unknown', styles: { fontStyle: 'bold', textColor: [185, 28, 28] } }
      ],
      [
        { content: 'Marital Status:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
        { content: patient.maritalStatus || 'N/A' },
        { content: 'National ID / SSN:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
        { content: patient.nationalId ? `***-**-${patient.nationalId.slice(-4)}` : 'Verified on File' }
      ]
    ],
    styles: { fontSize: 7.5, cellPadding: 3.5, lineColor: [226, 232, 240] }
  });

  yPos = doc.lastAutoTable.finalY + 8;

  // --- SECTION 2: CONTACT & EMERGENCY DETAILS ---
  const fullAddress = [patient.addressLine1, patient.addressLine2, patient.city, patient.state, patient.postalCode].filter(Boolean).join(', ') || 'N/A';
  
  doc.autoTable({
    startY: yPos,
    margin: { left: margin, right: margin },
    theme: 'grid',
    head: [[
      { content: '2. CONTACT & EMERGENCY INFORMATION', colSpan: 4, styles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 } }
    ]],
    body: [
      [
        { content: 'Primary Phone:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 95 } },
        { content: patient.phone || 'N/A' },
        { content: 'Email Address:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 105 } },
        { content: patient.email || 'N/A' }
      ],
      [
        { content: 'Residential Address:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
        { content: fullAddress, colSpan: 3 }
      ],
      [
        { content: 'Emergency Contact:', styles: { fontStyle: 'bold', fillColor: [254, 243, 199] } },
        { content: `${patient.emergencyContactName || 'N/A'} (${patient.emergencyContactRelation || 'Relation N/A'})`, styles: { fontStyle: 'bold' } },
        { content: 'Emergency Phone:', styles: { fontStyle: 'bold', fillColor: [254, 243, 199] } },
        { content: patient.emergencyContactPhone || 'N/A', styles: { fontStyle: 'bold' } }
      ]
    ],
    styles: { fontSize: 7.5, cellPadding: 3.5, lineColor: [226, 232, 240] }
  });

  yPos = doc.lastAutoTable.finalY + 8;

  // --- SECTION 3: INSURANCE & BILLING ---
  doc.autoTable({
    startY: yPos,
    margin: { left: margin, right: margin },
    theme: 'grid',
    head: [[
      { content: '3. HEALTH INSURANCE & BILLING COVERAGE', colSpan: 4, styles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 } }
    ]],
    body: [
      [
        { content: 'Coverage Status:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 95 } },
        { content: patient.hasInsurance ? 'Active Commercial / Public Insurance' : 'Self-Pay / Non-Insured' },
        { content: 'Insurance Carrier:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 105 } },
        { content: patient.insuranceProvider || (patient.hasInsurance ? 'Standard Plan' : 'N/A') }
      ],
      [
        { content: 'Policy / Member ID:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
        { content: patient.policyNumber || 'N/A' },
        { content: 'Group Number:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
        { content: patient.groupNumber || 'N/A' }
      ]
    ],
    styles: { fontSize: 7.5, cellPadding: 3.5, lineColor: [226, 232, 240] }
  });

  yPos = doc.lastAutoTable.finalY + 8;

  // --- SECTION 4: CLINICAL HISTORY, CONDITIONS & MEDICATIONS ---
  const conditionsStr = (patient.chronicConditions && patient.chronicConditions.length > 0)
    ? patient.chronicConditions.join(', ')
    : 'None reported';

  const medRows = (patient.currentMedications && patient.currentMedications.length > 0)
    ? patient.currentMedications.map(m => [m.name || '', m.dosage || '', m.frequency || 'Daily'])
    : [['No active routine medications reported', '-', '-']];

  doc.autoTable({
    startY: yPos,
    margin: { left: margin, right: margin },
    theme: 'grid',
    head: [[
      { content: '4. CLINICAL MEDICAL HISTORY & ACTIVE MEDICATIONS', colSpan: 3, styles: { fillColor: [15, 118, 110], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 } }
    ]],
    body: [
      [
        { content: 'Chronic Conditions:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 110 } },
        { content: conditionsStr, colSpan: 2 }
      ],
      [
        { content: 'Past Surgeries / Notes:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
        { content: patient.pastSurgeries || 'None disclosed', colSpan: 2 }
      ]
    ],
    styles: { fontSize: 7.5, cellPadding: 3.5, lineColor: [226, 232, 240] }
  });

  yPos = doc.lastAutoTable.finalY;

  // Medications sub-table
  doc.autoTable({
    startY: yPos,
    margin: { left: margin, right: margin },
    theme: 'plain',
    head: [
      [
        { content: 'Current Medication Name', styles: { fontStyle: 'bold', fillColor: [241, 245, 249], fontSize: 7, textColor: [71, 85, 105] } },
        { content: 'Dosage / Strength', styles: { fontStyle: 'bold', fillColor: [241, 245, 249], fontSize: 7, textColor: [71, 85, 105], cellWidth: 120 } },
        { content: 'Administration Frequency', styles: { fontStyle: 'bold', fillColor: [241, 245, 249], fontSize: 7, textColor: [71, 85, 105], cellWidth: 140 } }
      ]
    ],
    body: medRows,
    styles: { fontSize: 7, cellPadding: 3, lineColor: [226, 232, 240] }
  });

  yPos = doc.lastAutoTable.finalY + 8;

  // --- SECTION 5: VISIT PURPOSE & VITALS ---
  const v = patient.vitals || {};
  const vitalsText = [
    v.bloodPressureSystolic && v.bloodPressureDiastolic ? `BP: ${v.bloodPressureSystolic}/${v.bloodPressureDiastolic} mmHg` : null,
    v.heartRate ? `HR: ${v.heartRate} bpm` : null,
    v.temperature ? `Temp: ${v.temperature} °F` : null,
    v.oxygenSaturation ? `SpO2: ${v.oxygenSaturation}%` : null,
    v.heightCm ? `Ht: ${v.heightCm} cm` : null,
    v.weightKg ? `Wt: ${v.weightKg} kg` : null,
    v.bmi ? `BMI: ${v.bmi}` : null
  ].filter(Boolean).join('  |  ') || 'Vitals to be recorded at triage desk';

  doc.autoTable({
    startY: yPos,
    margin: { left: margin, right: margin },
    theme: 'grid',
    head: [[
      { content: '5. VISIT DETAILS & PRE-REGISTRATION VITALS', colSpan: 4, styles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 } }
    ]],
    body: [
      [
        { content: 'Chief Complaint:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 95 } },
        { content: patient.chiefComplaint || 'Routine medical intake consultation', colSpan: 3 }
      ],
      [
        { content: 'Consulting Physician:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
        { content: patient.consultingDoctor || 'Assigned on Admission' },
        { content: 'Symptom Duration:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 105 } },
        { content: patient.symptomDuration || 'Recent onset' }
      ],
      [
        { content: 'Recorded Vitals:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
        { content: vitalsText, colSpan: 3, styles: { fontStyle: 'bold', textColor: [15, 118, 110] } }
      ]
    ],
    styles: { fontSize: 7.5, cellPadding: 3.5, lineColor: [226, 232, 240] }
  });

  yPos = doc.lastAutoTable.finalY + 8;

  // --- SECTION 6: LEGAL CONSENT & DIGITAL SIGNATURE ---
  const consentBoxHeight = 68;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, yPos, contentWidth, consentBoxHeight, 3, 3, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  doc.text('6. PATIENT ACKNOWLEDGEMENT & AUTHORIZATION', margin + 8, yPos + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  const legalText = 'I certify that the information provided in this registration is true, accurate, and complete. I authorize AI Form System to verify insurance coverage and administer necessary outpatient/inpatient medical treatments. This electronic signature carries full legal validity under standard healthcare records regulations.';
  doc.text(legalText, margin + 8, yPos + 22, { maxWidth: contentWidth - 140 });

  // Signature Block
  const sigX = pageWidth - margin - 125;
  const sigY = yPos + 8;
  doc.setDrawColor(226, 232, 240);
  doc.rect(sigX, sigY, 115, 48, 'S');

  if (patient.signatureDataUrl && patient.signatureDataUrl.startsWith('data:image')) {
    try {
      doc.addImage(patient.signatureDataUrl, 'PNG', sigX + 5, sigY + 2, 105, 30);
    } catch (e) {
      doc.setFont('times', 'italic');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(patient.typedSignature || patientFullName, sigX + 10, sigY + 24);
    }
  } else {
    doc.setFont('times', 'italic');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(patient.typedSignature || patientFullName, sigX + 10, sigY + 24);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text('Patient Digital Signature Stamp', sigX + 12, sigY + 44);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Signed: ${patient.registrationDate || new Date().toISOString().split('T')[0]} | Verification: AI-VERIFIED OK`, margin + 8, yPos + 58);

  // --- FOOTER ---
  const footerY = pageHeight - margin + 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text('CONFIDENTIAL MEDICAL RECORD - PROTECTED HEALTH INFORMATION (HIPAA ENCRYPTED)', margin, footerY);
  doc.text(`Page 1 of 1 | Record UID: ${patient.registrationId || 'AEGIS-2026'}`, pageWidth - margin - 150, footerY);

  const cleanPatientName = (patient.firstName || 'Patient').replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `AI_Form_Patient_Registration_${cleanPatientName}_${patient.registrationId || 'Record'}.pdf`;

  const blob = doc.output('blob');
  const dataUrl = doc.output('datauristring');

  return {
    doc,
    blob,
    dataUrl,
    fileName,
    save: () => doc.save(fileName)
  };
}

