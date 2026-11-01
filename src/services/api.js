/**
 * Centralized AEGIS API Service using Axios.
 * 
 * Complies with BMD-AEGIS-2026 v1.3 & DB-AEGIS-2026 v1.2:
 * 1. Base URL proxying through Vite to FastAPI (/api/v1).
 * 2. In-memory token management with sessionStorage fallback (NEVER localStorage for tokens/passwords).
 * 3. Support for HttpOnly refresh-cookie and X-CSRF-Token handshake.
 * 4. Automatic transparent token rotation on HTTP 401 with retry.
 * 5. Mappings for Patients, Registrations, AI Document Extraction, and PDF Dossiers.
 */

import axios from 'axios';
import { calculateAge } from '../types/patient.js';

const API_BASE = '/api/v1';

// In-memory token state
let inMemoryAccessToken = null;
let inMemoryCsrfToken = null;

// Helpers for non-sensitive token persistence (sessionStorage survives tab refresh, cleared on tab close)
const SESSION_KEYS = {
  ACCESS_TOKEN: 'aegis_access_token_session',
  CSRF_TOKEN: 'aegis_csrf_token_session',
  USER: 'aegis_auth_user_session',
};

export function getAccessToken() {
  if (inMemoryAccessToken) return inMemoryAccessToken;
  try {
    inMemoryAccessToken = sessionStorage.getItem(SESSION_KEYS.ACCESS_TOKEN);
  } catch (e) {}
  return inMemoryAccessToken;
}

export function getCsrfToken() {
  if (inMemoryCsrfToken) return inMemoryCsrfToken;
  try {
    inMemoryCsrfToken = sessionStorage.getItem(SESSION_KEYS.CSRF_TOKEN);
  } catch (e) {}
  return inMemoryCsrfToken;
}

export function setAuthTokens(accessToken, csrfToken, user = null) {
  inMemoryAccessToken = accessToken;
  inMemoryCsrfToken = csrfToken;
  try {
    if (accessToken) {
      sessionStorage.setItem(SESSION_KEYS.ACCESS_TOKEN, accessToken);
    } else {
      sessionStorage.removeItem(SESSION_KEYS.ACCESS_TOKEN);
    }

    if (csrfToken) {
      sessionStorage.setItem(SESSION_KEYS.CSRF_TOKEN, csrfToken);
    } else {
      sessionStorage.removeItem(SESSION_KEYS.CSRF_TOKEN);
    }

    if (user) {
      sessionStorage.setItem(SESSION_KEYS.USER, JSON.stringify(user));
    } else if (accessToken === null) {
      sessionStorage.removeItem(SESSION_KEYS.USER);
    }
  } catch (e) {}
}

export function getStoredUser() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEYS.USER);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

export function clearAuthTokens() {
  setAuthTokens(null, null, null);
}

// Instantiate Axios client
export const apiClient = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // Mandatory for HttpOnly refresh cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: inject Bearer token and CSRF token
apiClient.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token && !config.headers['Authorization']) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    const csrf = getCsrfToken();
    if (csrf && !config.headers['X-CSRF-Token']) {
      config.headers['X-CSRF-Token'] = csrf;
    }

    if (!config.headers['X-Requested-With']) {
      config.headers['X-Requested-With'] = 'XMLHttpRequest';
    }

    config.headers['Cache-Control'] = 'no-cache';
    config.headers['Pragma'] = 'no-cache';

    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: handle 401 with automatic token refresh
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and not already a retry or refresh endpoint
    if (
      error.response &&
      error.response.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url.includes('/auth/refresh') &&
      !originalRequest.url.includes('/auth/login')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers['Authorization'] = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const csrf = getCsrfToken();
        const refreshRes = await axios.post(
          `${API_BASE}/auth/refresh`,
          {},
          {
            withCredentials: true,
            headers: {
              'X-Requested-With': 'XMLHttpRequest',
              ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
            },
          }
        );

        const { access_token, csrf_token, user } = refreshRes.data;
        setAuthTokens(access_token, csrf_token, user);
        originalRequest.headers['Authorization'] = `Bearer ${access_token}`;
        processQueue(null, access_token);
        return apiClient(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        clearAuthTokens();
        // Trigger event so UI can react if needed
        window.dispatchEvent(new CustomEvent('aegis:auth_expired'));
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ==============================================================================
// AUTHENTICATION APIs
// ==============================================================================

export const authAPI = {
  login: async (usernameOrEmail, password) => {
    const res = await apiClient.post('/auth/login', {
      username_or_email: usernameOrEmail,
      password,
    });
    const { access_token, csrf_token, user_id, username, role } = res.data;
    const user = res.data.user || {
      id: user_id,
      username,
      role,
      name: username === 'admin' ? 'Dr. Eleanor Vance (Super User)' : username === 'receptionist' ? 'Sarah Jenkins (Receptionist)' : username,
      avatarColor: role === 'ROLE_SUPER_USER' ? 'bg-purple-600' : role === 'ROLE_RECEPTIONIST' ? 'bg-teal-600' : 'bg-emerald-600',
    };
    setAuthTokens(access_token, csrf_token, user);
    return { ...res.data, user };
  },

  logout: async () => {
    try {
      const csrf = getCsrfToken();
      await apiClient.post(
        '/auth/logout',
        {},
        {
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
          },
        }
      );
    } finally {
      clearAuthTokens();
    }
  },

  refresh: async () => {
    const csrf = getCsrfToken();
    const res = await apiClient.post(
      '/auth/refresh',
      {},
      {
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
      }
    );
    const { access_token, csrf_token, user } = res.data;
    setAuthTokens(access_token, csrf_token, user);
    return res.data;
  },

  getMe: async () => {
    const res = await apiClient.get('/auth/me');
    return res.data;
  },

  registerPatient: async (payload) => {
    const res = await apiClient.post('/auth/register-patient', payload);
    return res.data;
  },

  forgotPassword: async (email) => {
    const res = await apiClient.post('/auth/forgot-password', { email });
    return res.data;
  },

  resetPassword: async (token, newPassword) => {
    const res = await apiClient.post('/auth/reset-password', {
      token,
      new_password: newPassword,
    });
    return res.data;
  },
};

// ==============================================================================
// PATIENT MASTER RECORD APIs
// ==============================================================================

export const patientAPI = {
  createPatient: async (patientData, overrideDuplicate = false, justification = null) => {
    const res = await apiClient.post('/patients', {
      ...patientData,
      override_duplicate: overrideDuplicate,
      justification,
    });
    return res.data;
  },

  getPatient: async (id) => {
    const res = await apiClient.get(`/patients/${id}`);
    return res.data;
  },

  getMyPatient: async () => {
    const res = await apiClient.get('/patients/me');
    return res.data;
  },

  listPatients: async ({ page = 1, pageSize = 20, search = '' } = {}) => {
    const params = new URLSearchParams();
    params.set('page', page);
    params.set('page_size', pageSize);
    if (search) params.set('search', search);

    const res = await apiClient.get(`/patients?${params.toString()}`);
    return res.data;
  },

  updatePatient: async (id, patchData) => {
    const res = await apiClient.patch(`/patients/${id}`, patchData);
    return res.data;
  },

  deletePatient: async (id) => {
    const res = await apiClient.delete(`/patients/${id}`);
    return res.data;
  },
};

// ==============================================================================
// REGISTRATION ENCOUNTER APIs
// ==============================================================================

export const registrationAPI = {
  createDraft: async (registrationData, idempotencyKey = null) => {
    const headers = {};
    if (idempotencyKey) {
      headers['X-Idempotency-Key'] = idempotencyKey;
    }
    const res = await apiClient.post('/registrations', registrationData, { headers });
    return res.data;
  },

  getRegistration: async (id) => {
    const res = await apiClient.get(`/registrations/${id}`);
    return res.data;
  },

  deleteRegistration: async (id) => {
    const res = await apiClient.delete(`/registrations/${id}`);
    return res.data;
  },

  listRegistrations: async ({ page = 1, pageSize = 15, status = null, statusFilter = null, department = null, search = '' } = {}) => {
    const params = new URLSearchParams();
    if (page) params.set('page', page);
    const limitVal = pageSize;
    if (limitVal) {
      params.set('limit', limitVal);
      params.set('page_size', limitVal);
    }
    const st = statusFilter || status;
    if (st && st !== 'ALL') {
      params.set('status', st);
      params.set('status_filter', st);
    }
    if (department && department !== 'All' && department !== 'ALL') {
      params.set('department', department);
    }
    if (search && search.trim()) {
      params.set('search', search.trim());
    }

    const res = await apiClient.get(`/registrations?${params.toString()}`);
    return res.data;
  },

  updateDraft: async (id, patchData) => {
    const res = await apiClient.patch(`/registrations/${id}`, patchData);
    return res.data;
  },

  submitRegistration: async (id) => {
    const res = await apiClient.post(`/registrations/${id}/submit`);
    return res.data;
  },

  reviewRegistration: async (id, action, rejectionReason = null) => {
    const res = await apiClient.post(`/registrations/${id}/review`, {
      action,
      rejection_reason: rejectionReason,
    });
    return res.data;
  },

  regeneratePDF: async (id) => {
    const res = await apiClient.post(`/registrations/${id}/pdf/regenerate`);
    return res.data;
  },

  downloadPDF: async (id) => {
    const res = await apiClient.get(`/registrations/${id}/pdf`, {
      responseType: 'blob',
    });
    return res.data;
  },
};

// ==============================================================================
// DOCUMENT UPLOAD & AI EXTRACTION APIs
// ==============================================================================

export const documentAPI = {
  uploadDocument: async (file, patientId, registrationId = null) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('patient_id', patientId);
    if (registrationId) {
      formData.append('registration_id', registrationId);
    }
    const res = await apiClient.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  extractEntities: async (documentUuid) => {
    const res = await apiClient.post(`/documents/${documentUuid}/extract`);
    return res.data;
  },

  uploadAndExtract: async (file, patientId, registrationId = null) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('patient_id', patientId);
    if (registrationId) {
      formData.append('registration_id', registrationId);
    }
    const res = await apiClient.post('/documents/upload-and-extract', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  listDocuments: async ({ patientId = null, registrationId = null, page = 1, limit = 20 } = {}) => {
    const params = new URLSearchParams();
    if (patientId) params.set('patient_id', patientId);
    if (registrationId) params.set('registration_id', registrationId);
    params.set('page', page);
    params.set('limit', limit);

    const res = await apiClient.get(`/documents?${params.toString()}`);
    return res.data;
  },

  downloadDocument: async (documentUuid) => {
    const res = await apiClient.get(`/documents/${documentUuid}/download`, {
      responseType: 'blob',
    });
    return res.data;
  },

  extractText: async (text) => {
    const res = await apiClient.post('/documents/extract-text', { text });
    return res.data;
  },
};

// ==============================================================================
// USER & ROLE MANAGEMENT APIs
// ==============================================================================

export const userAPI = {
  listUsers: async ({ page = 1, pageSize = 15, role = 'ALL', status = 'active', search = '' } = {}) => {
    const params = new URLSearchParams();
    if (page) params.set('page', page);
    if (pageSize) {
      params.set('limit', pageSize);
      params.set('page_size', pageSize);
    }
    if (role && role !== 'ALL') params.set('role', role);
    if (status) params.set('status', status);
    if (search && search.trim()) params.set('search', search.trim());
    params.set('_t', Date.now().toString());

    const res = await apiClient.get(`/users?${params.toString()}`);
    return res.data;
  },

  createUser: async (userData) => {
    const res = await apiClient.post('/users', userData);
    return res.data;
  },

  updateUser: async (userId, userData) => {
    const res = await apiClient.patch(`/users/${userId}`, userData);
    return res.data;
  },

  toggleDeactivate: async (userId) => {
    const res = await apiClient.patch(`/users/${userId}/deactivate`);
    return res.data;
  },

  deleteUser: async (userId) => {
    const res = await apiClient.delete(`/users/${userId}`);
    return res.data;
  },
};

/**
 * Transforms Backend UserResponse to UI user model for UserManagementView.
 */
export function transformToUIUser(user) {
  const roleName = user.role || 'ROLE_RECEPTIONIST';
  let dept = 'Admissions & Intake';
  let avatarColor = 'bg-teal-600';
  let displayName = user.full_name || user.name || user.username;

  if (roleName === 'ROLE_SUPER_USER') {
    dept = 'Hospital Administration';
    avatarColor = 'bg-purple-600';
    if (!displayName || displayName === user.username) {
      displayName = user.username === 'admin' ? 'Dr. Eleanor Vance (Admin)' : user.username;
    }
  } else if (roleName === 'ROLE_ASSISTANT_ADMIN') {
    dept = 'Admissions Support';
    avatarColor = 'bg-blue-600';
    if (!displayName || displayName === user.username) {
      displayName = user.username === 'assistant' ? 'Marcus Brody' : user.username;
    }
  } else if (roleName === 'ROLE_RECEPTIONIST') {
    dept = 'Admissions & Triage Desk';
    avatarColor = 'bg-teal-600';
    if (!displayName || displayName === user.username) {
      displayName = user.username === 'receptionist' ? 'Sarah Jenkins' : user.username;
    }
  } else if (roleName === 'ROLE_PATIENT') {
    dept = 'Patient Portal';
    avatarColor = 'bg-emerald-600';
    if (!displayName || displayName === user.username) {
      displayName = user.username === 'patient' ? 'David Michael Miller' : user.username;
    }
  }

  return {
    id: user.id,
    name: displayName,
    username: user.username,
    email: user.email,
    role: user.role,
    department: dept,
    status: user.is_active === 1 ? 'active' : 'deactivated',
    is_active: user.is_active,
    createdAt: (user.created_at || '').split('T')[0] || '2026-01-01',
    lastActive: user.last_login_at ? user.last_login_at.split('T')[0] : 'Never',
    avatarColor,
    permissions: user.permissions || [],
  };
}

/**
 * Transforms /api/v1/auth/me response into the authoritative currentUser profile.
 */
export function transformMeResponse(meData) {
  if (!meData) return null;
  const roleName = meData.role || 'ROLE_PATIENT';
  let dept = 'Patient Portal';
  let avatarColor = 'bg-emerald-600';
  let displayName = meData.username;

  if (roleName === 'ROLE_SUPER_USER') {
    dept = 'Hospital Administration';
    avatarColor = 'bg-purple-600';
    displayName = meData.username === 'admin' ? 'Dr. Eleanor Vance' : meData.username;
  } else if (roleName === 'ROLE_ASSISTANT_ADMIN') {
    dept = 'Admissions Support';
    avatarColor = 'bg-indigo-600';
    displayName = meData.username === 'assistant' ? 'Marcus Brody' : meData.username;
  } else if (roleName === 'ROLE_RECEPTIONIST') {
    dept = 'Admissions & Triage Desk';
    avatarColor = 'bg-teal-600';
    displayName = meData.username === 'receptionist' ? 'Sarah Jenkins' : meData.username;
  } else if (roleName === 'ROLE_PATIENT') {
    dept = 'Patient Portal';
    avatarColor = 'bg-emerald-600';
    displayName = meData.username === 'patient' ? 'David Michael Miller' : meData.username;
  }

  return {
    id: meData.id,
    name: displayName,
    username: meData.username,
    email: meData.email,
    role: meData.role,
    department: dept,
    status: meData.is_active ? 'active' : 'deactivated',
    is_active: meData.is_active ? 1 : 0,
    isActive: Boolean(meData.is_active),
    createdAt: (meData.created_at || '').split('T')[0] || '2026-01-01',
    avatarColor,
    permissions: Array.isArray(meData.permissions) ? meData.permissions : [],
  };
}

// ==============================================================================
// DATA TRANSFORMERS (Form UI Model <-> Backend API Model)
// ==============================================================================

/**
 * Transforms UI patientData state to Backend PatientCreate payload.
 */
export function transformToPatientCreate(patientData, overrideDuplicate = false, justification = null) {
  const fullName = `${patientData.firstName || ''} ${patientData.middleName || ''} ${patientData.lastName || ''}`
    .replace(/\s+/g, ' ')
    .trim() || 'Patient Unknown';

  // Format valid DOB
  let dob = patientData.dateOfBirth;
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    dob = '1990-01-01';
  }

  // Valid Gender
  let gender = patientData.gender || 'Prefer Not to Say';
  if (!['Male', 'Female', 'Other', 'Prefer Not to Say'].includes(gender)) {
    gender = 'Other';
  }

  // Valid Blood Group
  let bloodGroup = patientData.bloodGroup || 'Unknown';
  if (!['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'].includes(bloodGroup)) {
    bloodGroup = 'Unknown';
  }

  return {
    full_name: fullName,
    date_of_birth: dob,
    gender,
    blood_group: bloodGroup,
    primary_mobile: patientData.phone || '+15550000000',
    email: (patientData.email && patientData.email.trim()) ? patientData.email.trim() : null,
    street_address: [patientData.addressLine1, patientData.addressLine2].filter(Boolean).join(', ') || null,
    city: patientData.city || null,
    state: patientData.state || null,
    country: patientData.country || 'India',
    postal_code: patientData.postalCode || null,
    override_duplicate: overrideDuplicate,
    justification,
  };
}

/**
 * Transforms UI patientData state to Backend RegistrationDraftCreate payload.
 */
export function transformToRegistrationDraft(patientData, patientId = null) {
  // Chronic conditions
  let existingConditions = 'Not Provided';
  if (Array.isArray(patientData.chronicConditions) && patientData.chronicConditions.length > 0) {
    existingConditions = patientData.chronicConditions.join(', ');
  } else if (typeof patientData.chronicConditions === 'string' && patientData.chronicConditions.trim()) {
    existingConditions = patientData.chronicConditions.trim();
  }

  // Active medications
  let currentMedications = 'Not Provided';
  if (Array.isArray(patientData.currentMedications) && patientData.currentMedications.length > 0) {
    currentMedications = patientData.currentMedications
      .map((m) => (typeof m === 'object' ? `${m.name || ''} ${m.dosage || ''} ${m.frequency || ''}`.trim() : m))
      .filter(Boolean)
      .join('; ') || 'Not Provided';
  } else if (typeof patientData.currentMedications === 'string' && patientData.currentMedications.trim()) {
    currentMedications = patientData.currentMedications.trim();
  }

  // Allergies
  let allergyStatus = 'Not Provided / Unknown';
  let allergiesDetail = null;
  if (patientData.hasAllergies && Array.isArray(patientData.allergies) && patientData.allergies.length > 0) {
    allergyStatus = 'Active Allergies Listed';
    allergiesDetail = patientData.allergies
      .map((a) => (typeof a === 'object' ? `${a.allergen || ''} (${a.reaction || 'reaction'}, ${a.severity || 'severity'})` : a))
      .join('; ');
  } else if (patientData.hasAllergies === false) {
    allergyStatus = 'No Known Allergies (NKDA)';
  }

  // Expiration date
  let insuranceExpiry = patientData.insuranceExpiryDate;
  if (insuranceExpiry && !/^\d{4}-\d{2}-\d{2}$/.test(insuranceExpiry)) {
    insuranceExpiry = null;
  }

  const patientPayload = transformToPatientCreate(patientData);

  return {
    patient_id: patientId,
    patient_data: patientPayload,
    contact_mobile: patientData.phone || null,
    contact_email: (patientData.email && patientData.email.trim()) ? patientData.email.trim() : null,
    residential_address: [patientData.addressLine1, patientData.addressLine2, patientData.city, patientData.state, patientData.postalCode]
      .filter(Boolean)
      .join(', ') || null,
    emergency_contact_name: patientData.emergencyContactName || null,
    emergency_contact_relationship: patientData.emergencyContactRelation || null,
    emergency_contact_phone: patientData.emergencyContactPhone || null,
    existing_conditions: existingConditions,
    previous_surgeries: patientData.pastSurgeries || 'None Reported',
    current_medications: currentMedications,
    allergy_status: allergyStatus,
    allergies_detail: allergiesDetail,
    medical_history: patientData.familyMedicalHistory || 'Not Provided',
    disability_accommodations: null,
    has_insurance: patientData.hasInsurance ? 1 : 0,
    insurance_provider: patientData.insuranceProvider || null,
    insurance_policy_number: patientData.policyNumber || null,
    insurance_policy_holder: patientData.policyHolderName || null,
    insurance_expiry_date: insuranceExpiry,
    preferred_doctor: patientData.consultingDoctor || null,
    department: patientData.department || 'General Medicine',
    reason_for_visit: patientData.chiefComplaint || 'Routine medical intake',
    preferred_appointment_date: null,
  };
}

/**
 * Transforms Backend RegistrationResponse and PatientResponse to UI record structure.
 */
export function transformToUIRecord(registration, patientObj = null) {
  const patient = patientObj || registration.patient || {};
  const fullName = patient.full_name || '';
  const parts = fullName.trim().split(' ');
  const firstName = parts[0] || (fullName ? fullName : 'Unknown');
  const lastName = parts.slice(1).join(' ') || '';

  return {
    id: registration.id,
    registrationId: registration.registration_id,
    mrn: patient.patient_id || (patient.id ? `PID-${patient.id}` : `REG-${registration.id}`),
    patientId: registration.patient_id,
    status: registration.status,
    pdfStatus: registration.pdf_status,
    pdfChecksum: registration.pdf_checksum_sha256,
    pdfGeneratedAt: registration.pdf_generated_at,
    canRegenerate: registration.can_regenerate,
    firstName,
    lastName,
    fullName: fullName || `${firstName} ${lastName}`.trim(),
    dateOfBirth: patient.date_of_birth || '',
    age: registration.age_at_registration !== undefined ? registration.age_at_registration : '',
    gender: patient.gender || '',
    bloodGroup: patient.blood_group || 'Unknown',
    phone: registration.contact_mobile || patient.primary_mobile || '',
    email: registration.contact_email || patient.email || '',
    department: registration.department || 'General Medicine',
    registrationDate: (registration.created_at || '').split('T')[0] || new Date().toISOString().split('T')[0],
    hasAllergies: registration.allergy_status === 'Active Allergies Listed',
    allergies: registration.allergies_detail ? [{ allergen: registration.allergies_detail, reaction: 'documented', severity: 'Active' }] : [],
    chiefComplaint: registration.reason_for_visit || '',
    consultingDoctor: registration.preferred_doctor || '',
    hasInsurance: Boolean(registration.has_insurance),
    insuranceProvider: registration.insurance_provider || '',
    policyNumber: registration.insurance_policy_number || '',
    rawRegistration: registration,
    rawPatient: patient,
  };
}

/**
 * Maps Groq AI extraction response (AIExtractionResponse) to UI form fields and confidence stats.
 */
export function mapBackendExtractionToForm(aiRes) {
  const fields = aiRes.extracted_fields || {};
  const confidences = aiRes.field_confidences || {};
  const mappedFields = {};
  const fieldConfidences = {};

  const TITLE_PREFIX = /^(?:Mr\.?|Mrs\.?|Ms\.?|Miss|Master|Mast\.?|Mx\.?|Shri|Smt\.?|Kumar|Kumari)\s+/i;
  const SUFFIX_PATTERN = /(?:,\s*(?:Jr\.?|Sr\.?|II|III|IV)|\s*\((?:Self|Patient|Adult|Minor|Pediatric)\))$/i;

  // Direct first_name, middle_name, last_name extraction from backend
  if (fields.first_name && typeof fields.first_name === 'string') {
    const cleanFn = fields.first_name.replace(TITLE_PREFIX, '').trim();
    if (cleanFn && !/^(?:Dr\.?|Doctor)\b/i.test(cleanFn)) {
      mappedFields.firstName = cleanFn;
      fieldConfidences.firstName = Math.round((confidences.first_name || confidences.full_name || 0.95) * 100);
    }
  }

  if (fields.middle_name && typeof fields.middle_name === 'string') {
    const cleanMn = fields.middle_name.trim();
    if (cleanMn) {
      mappedFields.middleName = cleanMn;
      fieldConfidences.middleName = Math.round((confidences.middle_name || confidences.full_name || 0.85) * 100);
    }
  }

  if (fields.last_name && typeof fields.last_name === 'string') {
    const cleanLn = fields.last_name.replace(SUFFIX_PATTERN, '').trim();
    if (cleanLn) {
      mappedFields.lastName = cleanLn;
      fieldConfidences.lastName = Math.round((confidences.last_name || confidences.full_name || 0.95) * 100);
    }
  }

  // Parse full_name if first_name or last_name wasn't individually extracted
  if (fields.full_name && (!mappedFields.firstName || !mappedFields.lastName)) {
    const rawFullName = fields.full_name.trim();
    const isDoctor = /^(?:Dr\.?|Doctor)\b/i.test(rawFullName);
    
    if (isDoctor) {
      if (!mappedFields.consultingDoctor) {
        mappedFields.consultingDoctor = rawFullName;
        fieldConfidences.consultingDoctor = Math.round((confidences.full_name || 0.9) * 100);
      }
    } else if (
      (fields.preferred_doctor && rawFullName.toLowerCase() === fields.preferred_doctor.trim().toLowerCase()) ||
      (fields.emergency_contact_name && rawFullName.toLowerCase() === fields.emergency_contact_name.trim().toLowerCase()) ||
      (fields.insurance_policy_holder && rawFullName.toLowerCase() === fields.insurance_policy_holder.trim().toLowerCase())
    ) {
      // Non-patient entity name, do NOT map into patient legal identity
    } else {
      const cleaned = rawFullName.replace(TITLE_PREFIX, '').replace(SUFFIX_PATTERN, '').trim();
      if (cleaned.includes(',')) {
        const commaParts = cleaned.split(',').map((p) => p.trim());
        const ln = commaParts[0] || '';
        const firstMiddle = (commaParts[1] || '').split(/\s+/).filter(Boolean);
        const fn = firstMiddle[0] || '';
        const mn = firstMiddle.slice(1).join(' ');

        if (fn && !mappedFields.firstName) {
          mappedFields.firstName = fn;
          fieldConfidences.firstName = Math.round((confidences.full_name || 0.95) * 100);
        }
        if (mn && !mappedFields.middleName) {
          mappedFields.middleName = mn;
          fieldConfidences.middleName = Math.round((confidences.full_name || 0.85) * 100);
        }
        if (ln && !mappedFields.lastName) {
          mappedFields.lastName = ln;
          fieldConfidences.lastName = Math.round((confidences.full_name || 0.95) * 100);
        }
      } else {
        const parts = cleaned.split(/\s+/).filter(Boolean);
        if (parts.length === 1 && !mappedFields.firstName) {
          mappedFields.firstName = parts[0];
          fieldConfidences.firstName = Math.round((confidences.full_name || 0.75) * 100);
        } else if (parts.length === 2) {
          if (!mappedFields.firstName) {
            mappedFields.firstName = parts[0];
            fieldConfidences.firstName = Math.round((confidences.full_name || 0.95) * 100);
          }
          if (!mappedFields.lastName) {
            mappedFields.lastName = parts[1];
            fieldConfidences.lastName = Math.round((confidences.full_name || 0.95) * 100);
          }
        } else if (parts.length >= 3) {
          if (!mappedFields.firstName) {
            mappedFields.firstName = parts[0];
            fieldConfidences.firstName = Math.round((confidences.full_name || 0.95) * 100);
          }
          if (!mappedFields.middleName) {
            mappedFields.middleName = parts.slice(1, -1).join(' ');
            fieldConfidences.middleName = Math.round((confidences.full_name || 0.85) * 100);
          }
          if (!mappedFields.lastName) {
            mappedFields.lastName = parts[parts.length - 1];
            fieldConfidences.lastName = Math.round((confidences.full_name || 0.95) * 100);
          }
        }
      }
    }
  }
  if (fields.date_of_birth) {
    mappedFields.dateOfBirth = fields.date_of_birth;
    fieldConfidences.dateOfBirth = Math.round((confidences.date_of_birth || 0.9) * 100);
    const age = calculateAge(fields.date_of_birth);
    if (age) {
      mappedFields.age = age;
      fieldConfidences.age = 92;
    }
  }
  if (fields.gender) {
    mappedFields.gender = fields.gender;
    fieldConfidences.gender = Math.round((confidences.gender || 0.95) * 100);
  }
  if (fields.blood_group) {
    mappedFields.bloodGroup = fields.blood_group;
    fieldConfidences.bloodGroup = Math.round((confidences.blood_group || 0.9) * 100);
  }
  if (fields.primary_mobile) {
    mappedFields.phone = fields.primary_mobile;
    fieldConfidences.phone = Math.round((confidences.primary_mobile || 0.9) * 100);
  }
  if (fields.email) {
    mappedFields.email = fields.email;
    fieldConfidences.email = Math.round((confidences.email || 0.9) * 100);
  }
  if (fields.street_address) {
    mappedFields.addressLine1 = fields.street_address;
    fieldConfidences.addressLine1 = Math.round((confidences.street_address || 0.85) * 100);
  }
  if (fields.city) {
    mappedFields.city = fields.city;
    fieldConfidences.city = Math.round((confidences.city || 0.9) * 100);
  }
  if (fields.state) {
    mappedFields.state = fields.state;
    fieldConfidences.state = Math.round((confidences.state || 0.9) * 100);
  }
  if (fields.postal_code) {
    mappedFields.postalCode = fields.postal_code;
    fieldConfidences.postalCode = Math.round((confidences.postal_code || 0.9) * 100);
  }
  if (fields.country) {
    mappedFields.country = fields.country;
    fieldConfidences.country = Math.round((confidences.country || 0.85) * 100);
  }
  if (fields.emergency_contact_name) {
    mappedFields.emergencyContactName = fields.emergency_contact_name;
    fieldConfidences.emergencyContactName = Math.round((confidences.emergency_contact_name || 0.85) * 100);
  }
  if (fields.emergency_contact_relationship) {
    mappedFields.emergencyContactRelation = fields.emergency_contact_relationship;
    fieldConfidences.emergencyContactRelation = Math.round((confidences.emergency_contact_relationship || 0.85) * 100);
  }
  if (fields.emergency_contact_phone) {
    mappedFields.emergencyContactPhone = fields.emergency_contact_phone;
    fieldConfidences.emergencyContactPhone = Math.round((confidences.emergency_contact_phone || 0.85) * 100);
  }
  if (fields.existing_conditions && fields.existing_conditions !== 'Not Provided') {
    mappedFields.chronicConditions = fields.existing_conditions.split(',').map((s) => s.trim()).filter(Boolean);
    fieldConfidences.chronicConditions = Math.round((confidences.existing_conditions || 0.85) * 100);
  }
  if (fields.previous_surgeries && fields.previous_surgeries !== 'None Reported') {
    mappedFields.pastSurgeries = fields.previous_surgeries;
    fieldConfidences.pastSurgeries = Math.round((confidences.previous_surgeries || 0.85) * 100);
  }
  if (fields.current_medications && fields.current_medications !== 'Not Provided') {
    mappedFields.currentMedications = fields.current_medications.split(';').map((s) => ({
      name: s.trim(),
      dosage: '',
      frequency: '',
    }));
    fieldConfidences.currentMedications = Math.round((confidences.current_medications || 0.85) * 100);
  }
  if (fields.allergy_status) {
    const isNKDA = fields.allergy_status === 'No Known Allergies (NKDA)';
    mappedFields.hasAllergies = !isNKDA;
    fieldConfidences.hasAllergies = Math.round((confidences.allergy_status || 0.9) * 100);
    if (!isNKDA && fields.allergies_detail) {
      mappedFields.allergies = [{ allergen: fields.allergies_detail, reaction: 'Identified', severity: 'Active' }];
      fieldConfidences.allergies = Math.round((confidences.allergies_detail || 0.85) * 100);
    } else if (isNKDA) {
      mappedFields.allergies = [];
    }
  }
  if (fields.medical_history && fields.medical_history !== 'Not Provided') {
    mappedFields.familyMedicalHistory = fields.medical_history;
    fieldConfidences.familyMedicalHistory = Math.round((confidences.medical_history || 0.85) * 100);
  }
  if (fields.has_insurance !== null && fields.has_insurance !== undefined) {
    mappedFields.hasInsurance = Boolean(fields.has_insurance);
    fieldConfidences.hasInsurance = Math.round((confidences.has_insurance || 0.95) * 100);
  }
  if (fields.insurance_provider) {
    mappedFields.insuranceProvider = fields.insurance_provider;
    fieldConfidences.insuranceProvider = Math.round((confidences.insurance_provider || 0.9) * 100);
  }
  if (fields.insurance_policy_number) {
    mappedFields.policyNumber = fields.insurance_policy_number;
    fieldConfidences.policyNumber = Math.round((confidences.insurance_policy_number || 0.9) * 100);
  }
  if (fields.insurance_policy_holder) {
    mappedFields.policyHolderName = fields.insurance_policy_holder;
    fieldConfidences.policyHolderName = Math.round((confidences.insurance_policy_holder || 0.9) * 100);
  }
  if (fields.department) {
    mappedFields.department = fields.department;
    fieldConfidences.department = Math.round((confidences.department || 0.9) * 100);
  }
  if (fields.preferred_doctor) {
    mappedFields.consultingDoctor = fields.preferred_doctor;
    fieldConfidences.consultingDoctor = Math.round((confidences.preferred_doctor || 0.85) * 100);
  }
  if (fields.reason_for_visit) {
    mappedFields.chiefComplaint = fields.reason_for_visit;
    fieldConfidences.chiefComplaint = Math.round((confidences.reason_for_visit || 0.85) * 100);
  }

  const count = Object.keys(mappedFields).length;
  return {
    summary: `Groq AI (${aiRes.model_used || 'openai/gpt-oss-20b'}) extracted ${count} structured fields with ${aiRes.extraction_source === 'groq_api' ? 'high' : 'heuristic'} confidence.`,
    stats: { extractedCount: count },
    mappedFields,
    fieldConfidences,
    rawText: aiRes.raw_extracted_text || aiRes.rawText || '',
  };
}
