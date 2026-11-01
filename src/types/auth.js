// Role Definitions, Permissions, and Initial Seed Accounts aligned with AEGIS BMD v1.3 & DB v1.2

export const ROLES = {
  PATIENT: 'ROLE_PATIENT',
  RECEPTIONIST: 'ROLE_RECEPTIONIST',
  ASSISTANT_ADMIN: 'ROLE_ASSISTANT_ADMIN',
  SUPER_USER: 'ROLE_SUPER_USER',
  // Lowercase aliases for UI backwards compatibility
  patient: 'ROLE_PATIENT',
  receptionist: 'ROLE_RECEPTIONIST',
  superuser: 'ROLE_SUPER_USER',
  assistant: 'ROLE_ASSISTANT_ADMIN',
};

export function normalizeRole(role) {
  if (!role) return ROLES.PATIENT;
  const upper = role.toUpperCase();
  if (upper.includes('SUPER')) return ROLES.SUPER_USER;
  if (upper.includes('RECEP')) return ROLES.RECEPTIONIST;
  if (upper.includes('ASSIST')) return ROLES.ASSISTANT_ADMIN;
  return ROLES.PATIENT;
}

export const PERMISSIONS = {
  // Registration capabilities
  REGISTER_SELF: 'register_self',
  REGISTER_OTHERS: 'register_others',
  UPLOAD_DOCUMENTS: 'upload_documents',
  AI_EXTRACTION: 'ai_extraction',
  VOICE_INTAKE: 'voice_intake',
  TTS_VERIFICATION: 'tts_verification',
  DOWNLOAD_OWN_PDF: 'download_own_pdf',
  DOWNLOAD_ANY_PDF: 'download_any_pdf',

  // Records access
  VIEW_OWN_RECORD: 'view_own_record',
  VIEW_ALL_RECORDS: 'view_all_records',
  EDIT_RECORDS: 'edit_records',
  DELETE_RECORDS: 'delete_records',

  // Administrative
  MANAGE_USERS: 'manage_users',
  ASSIGN_ROLES: 'assign_roles',
  DEACTIVATE_USERS: 'deactivate_users',
  VIEW_ACTIVITY_LOGS: 'view_activity_logs',
  ADMIN_SETTINGS: 'admin_settings'
};

// Default permissions matrix by role
export const ROLE_PERMISSIONS = {
  [ROLES.PATIENT]: [
    PERMISSIONS.REGISTER_SELF,
    PERMISSIONS.UPLOAD_DOCUMENTS,
    PERMISSIONS.AI_EXTRACTION,
    PERMISSIONS.VOICE_INTAKE,
    PERMISSIONS.TTS_VERIFICATION,
    PERMISSIONS.DOWNLOAD_OWN_PDF,
    PERMISSIONS.VIEW_OWN_RECORD
  ],
  [ROLES.RECEPTIONIST]: [
    PERMISSIONS.REGISTER_SELF,
    PERMISSIONS.REGISTER_OTHERS,
    PERMISSIONS.UPLOAD_DOCUMENTS,
    PERMISSIONS.AI_EXTRACTION,
    PERMISSIONS.VOICE_INTAKE,
    PERMISSIONS.TTS_VERIFICATION,
    PERMISSIONS.DOWNLOAD_OWN_PDF,
    PERMISSIONS.DOWNLOAD_ANY_PDF,
    PERMISSIONS.VIEW_ALL_RECORDS,
    PERMISSIONS.EDIT_RECORDS
  ],
  [ROLES.ASSISTANT_ADMIN]: [
    PERMISSIONS.REGISTER_SELF,
    PERMISSIONS.REGISTER_OTHERS,
    PERMISSIONS.UPLOAD_DOCUMENTS,
    PERMISSIONS.AI_EXTRACTION,
    PERMISSIONS.DOWNLOAD_OWN_PDF,
    PERMISSIONS.DOWNLOAD_ANY_PDF,
    PERMISSIONS.VIEW_ALL_RECORDS,
    PERMISSIONS.EDIT_RECORDS
  ],
  [ROLES.SUPER_USER]: [
    // Super User has all permissions
    PERMISSIONS.REGISTER_SELF,
    PERMISSIONS.REGISTER_OTHERS,
    PERMISSIONS.UPLOAD_DOCUMENTS,
    PERMISSIONS.AI_EXTRACTION,
    PERMISSIONS.VOICE_INTAKE,
    PERMISSIONS.TTS_VERIFICATION,
    PERMISSIONS.DOWNLOAD_OWN_PDF,
    PERMISSIONS.DOWNLOAD_ANY_PDF,
    PERMISSIONS.VIEW_OWN_RECORD,
    PERMISSIONS.VIEW_ALL_RECORDS,
    PERMISSIONS.EDIT_RECORDS,
    PERMISSIONS.DELETE_RECORDS,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.ASSIGN_ROLES,
    PERMISSIONS.DEACTIVATE_USERS,
    PERMISSIONS.VIEW_ACTIVITY_LOGS,
    PERMISSIONS.ADMIN_SETTINGS
  ]
};

// Pre-seeded Demo Accounts for immediate role testing with FastAPI backend
export const INITIAL_USERS = [
  {
    id: 'usr-admin-01',
    username: 'admin',
    name: 'Dr. Eleanor Vance',
    email: 'admin@aegishealth.org',
    role: ROLES.SUPER_USER,
    department: 'Hospital Administration',
    status: 'active',
    avatarColor: 'bg-purple-600',
    createdAt: '2026-01-15',
    lastActive: 'Just now',
    permissions: [...ROLE_PERMISSIONS[ROLES.SUPER_USER]]
  },
  {
    id: 'usr-recep-01',
    username: 'receptionist',
    name: 'Sarah Jenkins',
    email: 'receptionist@aegishealth.org',
    role: ROLES.RECEPTIONIST,
    department: 'Admissions & Triage Desk',
    status: 'active',
    avatarColor: 'bg-teal-600',
    createdAt: '2026-02-10',
    lastActive: '5 mins ago',
    permissions: [...ROLE_PERMISSIONS[ROLES.RECEPTIONIST]]
  },
  {
    id: 'usr-assist-01',
    username: 'assistant',
    name: 'Marcus Brody',
    email: 'assistant@aegishealth.org',
    role: ROLES.ASSISTANT_ADMIN,
    department: 'Admissions Support',
    status: 'active',
    avatarColor: 'bg-blue-600',
    createdAt: '2026-03-01',
    lastActive: '1 hour ago',
    permissions: [...ROLE_PERMISSIONS[ROLES.ASSISTANT_ADMIN]]
  },
  {
    id: 'usr-patient-01',
    username: 'patient',
    name: 'David Michael Miller',
    email: 'patient@aegishealth.org',
    role: ROLES.PATIENT,
    linkedRegistrationId: 'AEGIS-2026-01042',
    department: 'Patient Portal',
    status: 'active',
    avatarColor: 'bg-emerald-600',
    createdAt: '2026-10-20',
    lastActive: 'Yesterday',
    permissions: [...ROLE_PERMISSIONS[ROLES.PATIENT]]
  }
];

export function hasPermission(user, permissionKey) {
  if (!user || user.status === 'deactivated' || user.is_active === 0) return false;
  const role = normalizeRole(user.role);
  if (role === ROLES.SUPER_USER) return true;
  if (Array.isArray(user.permissions) && user.permissions.includes(permissionKey)) {
    return true;
  }
  return ROLE_PERMISSIONS[role]?.includes(permissionKey) || false;
}
