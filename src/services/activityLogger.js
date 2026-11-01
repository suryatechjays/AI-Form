// Activity Monitoring & Audit Trail Service for Super User

const ACTIVITY_STORAGE_KEY = 'aegis_activity_logs_v1';

const INITIAL_LOGS = [
  {
    id: 'act-101',
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    action: 'USER_LOGIN',
    actorName: 'Dr. Eleanor Vance',
    actorRole: 'superuser',
    actorEmail: 'admin@aegishealth.org',
    details: 'Super User session initiated with administrative security context.',
    severity: 'info'
  },
  {
    id: 'act-102',
    timestamp: new Date(Date.now() - 3600000 * 1.5).toISOString(),
    action: 'DOCUMENT_PARSED',
    actorName: 'Sarah Jenkins',
    actorRole: 'receptionist',
    actorEmail: 'sarah.jenkins@aegishealth.org',
    details: 'Uploaded Discharge Summary PDF for patient intake. OCR engine extracted 33 clinical fields (Confidence: 95%).',
    severity: 'success'
  },
  {
    id: 'act-103',
    timestamp: new Date(Date.now() - 3600000 * 1.2).toISOString(),
    action: 'REGISTRATION_SUBMITTED',
    actorName: 'Sarah Jenkins',
    actorRole: 'receptionist',
    actorEmail: 'sarah.jenkins@aegishealth.org',
    details: 'Registered patient David Michael Miller under Record ID AEGIS-2026-01042.',
    severity: 'success'
  },
  {
    id: 'act-104',
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    action: 'VOICE_INTAKE_USED',
    actorName: 'David Michael Miller',
    actorRole: 'patient',
    actorEmail: 'david.miller85@example.com',
    details: 'Used Speech-to-Text natural voice intake to supply emergency contact and allergy symptoms.',
    severity: 'info'
  },
  {
    id: 'act-105',
    timestamp: new Date(Date.now() - 600000).toISOString(),
    action: 'PDF_DOWNLOADED',
    actorName: 'David Michael Miller',
    actorRole: 'patient',
    actorEmail: 'david.miller85@example.com',
    details: 'Generated and downloaded official hospital intake card Aegis_Patient_Registration_David_Miller.pdf with secure QR code.',
    severity: 'success'
  }
];

export function getStoredActivityLogs() {
  try {
    const saved = localStorage.getItem(ACTIVITY_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return INITIAL_LOGS;
}

export function logActivity({
  action,
  actor,
  details,
  severity = 'info'
}) {
  const currentLogs = getStoredActivityLogs();
  const newLog = {
    id: `act-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    action,
    actorName: actor?.name || 'Anonymous User',
    actorRole: actor?.role || 'patient',
    actorEmail: actor?.email || 'unknown@aegishealth.org',
    details: details || '',
    severity
  };

  const updated = [newLog, ...currentLogs.slice(0, 199)]; // Keep latest 200 logs
  try {
    localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {}

  return updated;
}

