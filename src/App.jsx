import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import TopHeader from './components/TopHeader';
import LoginPage from './components/LoginPage';
import RegistrationWizard from './components/RegistrationWizard';
import PatientRecordsView from './components/PatientRecordsView';
import UserManagementView from './components/UserManagementView';
import ActivityLogView from './components/ActivityLogView';
import AdminSettingsView from './components/AdminSettingsView';
import DocumentUploadModal from './components/DocumentUploadModal';
import VoiceAssistantModal from './components/VoiceAssistantModal';
import PDFPreviewModal from './components/PDFPreviewModal';
import { HeartPulse, Loader2, ShieldCheck, CheckCircle2, Clock, Sparkles } from 'lucide-react';
import { INITIAL_PATIENT_STATE, generateRegistrationId, generateMRN } from './types/patient';
import { generatePatientRegistrationPDF } from './services/pdfGenerator';
import { extractPatientInformation } from './services/aiExtractor';
import { ROLES, INITIAL_USERS, hasPermission, PERMISSIONS, normalizeRole } from './types/auth';
import { getStoredActivityLogs, logActivity } from './services/activityLogger';
import {
  authAPI,
  patientAPI,
  registrationAPI,
  userAPI,
  transformToPatientCreate,
  transformToRegistrationDraft,
  transformToUIRecord,
  transformToUIUser,
  transformMeResponse,
  getStoredUser,
  clearAuthTokens
} from './services/api';

const STORAGE_KEYS = {
  SETTINGS: 'aegis_admin_settings_v1'
};

export default function App() {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthInitializing, setIsAuthInitializing] = useState(true);

  const [activityLogs, setActivityLogs] = useState(() => getStoredActivityLogs());

  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      hospitalName: 'AI Form Regional Health System',
      facilityId: 'AEGIS-HOSP-NYC-01',
      emergencyHelpline: '(800) 555-CARE',
      admissionsPhone: '(800) 555-AEGIS',
      defaultDepartment: 'General Medicine',
      requireSignature: true,
      autoTriggerOCR: true,
      minConfidenceScore: 70
    };
  });

  const [activeView, setActiveView] = useState('register'); // 'register' | 'records' | 'users' | 'activity' | 'settings'

  // Current patient registration draft state
  const [patientData, setPatientData] = useState(() => ({
    ...INITIAL_PATIENT_STATE,
    registrationId: generateRegistrationId(),
    mrn: generateMRN()
  }));

  // Initial admissions records state
  const [records, setRecords] = useState([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);

  // Modals state
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isPDFPreviewOpen, setIsPDFPreviewOpen] = useState(false);
  const [generatedPDF, setGeneratedPDF] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Server-side pagination and filter state for User Management
  const [userPagination, setUserPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('ALL');
  const [userStatusFilter, setUserStatusFilter] = useState('active');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const userReqSeqRef = useRef(0);

  // Server-side pagination and filter state for Admission Roster
  const [rosterPagination, setRosterPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [rosterSearchTerm, setRosterSearchTerm] = useState('');
  const [rosterDeptFilter, setRosterDeptFilter] = useState('All');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4500);
  };

  // ============================================================================
  // BACKEND RECORDS & USERS SYNCHRONIZATION
  // ============================================================================

  const loadBackendUsers = useCallback(async (opts = {}) => {
    setIsLoadingUsers(true);
    const seq = ++userReqSeqRef.current;
    try {
      const page = opts.page !== undefined ? opts.page : (userPagination.page || 1);
      const pageSize = opts.pageSize !== undefined ? opts.pageSize : (userPagination.limit || 15);
      const role = opts.role !== undefined ? opts.role : userRoleFilter;
      const status = opts.status !== undefined ? opts.status : userStatusFilter;
      const search = opts.search !== undefined ? opts.search : userSearchTerm;

      const data = await userAPI.listUsers({
        page,
        pageSize,
        role: role !== 'ALL' ? role : null,
        status: status || 'active',
        search: search.trim() || ''
      });
      if (seq !== userReqSeqRef.current) return null;

      if (data && Array.isArray(data.items)) {
        const transformed = data.items.map(transformToUIUser);
        setUsers(transformed);
        setUserPagination({
          page: data.page || page,
          limit: data.limit || pageSize,
          total: data.total !== undefined ? data.total : transformed.length,
          totalPages: data.total_pages || Math.ceil((data.total || 0) / (data.limit || pageSize)) || 1
        });
        return transformed;
      }
    } catch (err) {
      if (seq === userReqSeqRef.current) {
        console.warn('Failed to fetch backend users, maintaining current state:', err);
      }
    } finally {
      if (seq === userReqSeqRef.current) {
        setIsLoadingUsers(false);
      }
    }
    return null;
  }, [userPagination.page, userPagination.limit, userRoleFilter, userStatusFilter, userSearchTerm]);

  const loadBackendRecords = useCallback(async (opts = {}) => {
    setIsLoadingRecords(true);
    try {
      const page = opts.page !== undefined ? opts.page : (rosterPagination.page || 1);
      const pageSize = opts.pageSize !== undefined ? opts.pageSize : (rosterPagination.limit || 15);
      const dept = opts.department !== undefined ? opts.department : rosterDeptFilter;
      const search = opts.search !== undefined ? opts.search : rosterSearchTerm;

      const data = await registrationAPI.listRegistrations({
        page,
        pageSize,
        department: dept !== 'All' ? dept : null,
        search: search.trim() || ''
      });
      if (data && Array.isArray(data.items)) {
        const transformed = data.items.map(reg => transformToUIRecord(reg, reg.patient));
        setRecords(transformed);
        setRosterPagination({
          page: data.page || page,
          limit: data.limit || pageSize,
          total: data.total !== undefined ? data.total : transformed.length,
          totalPages: data.total_pages || Math.ceil((data.total || 0) / (data.limit || pageSize)) || 1
        });
      }
    } catch (err) {
      console.warn('Failed to fetch backend registrations, maintaining current state:', err);
    } finally {
      setIsLoadingRecords(false);
    }
  }, [rosterPagination.page, rosterPagination.limit, rosterDeptFilter, rosterSearchTerm]);

  // Initial authentication handshake & session restoration on mount
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      try {
        // Attempt session restoration via /api/v1/auth/me (triggers refresh interceptor if cookie present)
        const meData = await authAPI.getMe();
        if (meData && meData.id && isMounted) {
          const profile = transformMeResponse(meData);
          setCurrentUser(profile);
          setIsAuthenticated(true);
        }
      } catch (err) {
        if (isMounted) {
          setCurrentUser(null);
          setIsAuthenticated(false);
          clearAuthTokens();
        }
      } finally {
        if (isMounted) {
          setIsAuthInitializing(false);
        }
      }
    }

    initSession();

    // Listen for auth expiration event from Axios interceptor
    const handleAuthExpired = () => {
      setCurrentUser(null);
      setIsAuthenticated(false);
      clearAuthTokens();
      showToast('Session expired. Please sign in again.');
    };

    window.addEventListener('aegis:auth_expired', handleAuthExpired);
    return () => {
      isMounted = false;
      window.removeEventListener('aegis:auth_expired', handleAuthExpired);
    };
  }, []);

  // Handle successful login from LoginPage
  const handleLoginSuccess = (userProfile) => {
    setCurrentUser(userProfile);
    setIsAuthenticated(true);
    setActiveView('register');
    showToast(`Welcome, ${userProfile.name || userProfile.username}!`);

    const updatedLogs = logActivity({
      action: 'USER_LOGIN',
      actor: userProfile,
      details: `Authenticated live against FastAPI backend as ${userProfile.name || userProfile.username} (${userProfile.role}).`,
      severity: 'info'
    });
    setActivityLogs(updatedLogs);
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await authAPI.logout();
      showToast('Logged out of AI Form.');
    } catch (err) {
      console.warn('Logout API notice (terminating local session):', err);
      showToast('Session terminated.');
    } finally {
      clearAuthTokens();
      const prevUser = currentUser;
      setCurrentUser(null);
      setIsAuthenticated(false);
      setRecords([]);
      setUsers([]);
      setRosterPagination({ page: 1, limit: 15, total: 0, totalPages: 1 });
      setUserPagination({ page: 1, limit: 15, total: 0, totalPages: 1 });
      setActiveView('register');

      if (prevUser) {
        const updatedLogs = logActivity({
          action: 'USER_LOGOUT',
          actor: prevUser,
          details: `User ${prevUser.username} logged out and terminated session.`,
          severity: 'info'
        });
        setActivityLogs(updatedLogs);
      }
    }
  };

  // Load backend records and users upon successful authentication
  useEffect(() => {
    if (isAuthenticated && currentUser) {
      const currentRole = normalizeRole(currentUser.role);
      const isSuperUser = currentRole === ROLES.SUPER_USER;
      const isReceptionist = currentRole === ROLES.RECEPTIONIST;
      const isPatient = currentRole === ROLES.PATIENT;
      const isAssistantAdmin = currentRole === ROLES.ASSISTANT_ADMIN;
      const perms = Array.isArray(currentUser.permissions) ? currentUser.permissions : [];

      const canViewRecords = isSuperUser || isReceptionist || isPatient || perms.includes('records:view_all');
      if (canViewRecords) {
        loadBackendRecords();
      }

      const canManageUsers = isSuperUser || (isAssistantAdmin && (perms.includes('accounts:receptionist_manage') || perms.includes('accounts:patient_manage')));
      if (canManageUsers) {
        loadBackendUsers();
      }
    }
  }, [isAuthenticated, currentUser?.role, currentUser?.id, loadBackendRecords, loadBackendUsers]);

  // Refresh backend records whenever entering Records view
  useEffect(() => {
    if (isAuthenticated && activeView === 'records') {
      loadBackendRecords();
    }
  }, [activeView, loadBackendRecords, isAuthenticated]);

  // Refresh backend users whenever entering User Management view
  useEffect(() => {
    if (isAuthenticated && activeView === 'users') {
      loadBackendUsers({ status: userStatusFilter || 'active' });
    }
  }, [activeView, loadBackendUsers, isAuthenticated, userStatusFilter]);

  // Persist settings
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {}
  }, [settings]);

  // Enforce RBAC navigation protection when role or permissions change
  useEffect(() => {
    if (!isAuthenticated || !currentUser) return;
    const currentRole = normalizeRole(currentUser.role);
    const isSuperUser = currentRole === ROLES.SUPER_USER;
    const isAssistantAdmin = currentRole === ROLES.ASSISTANT_ADMIN;
    const perms = Array.isArray(currentUser.permissions) ? currentUser.permissions : [];

    const canManageUsers = isSuperUser || (isAssistantAdmin && (perms.includes('accounts:receptionist_manage') || perms.includes('accounts:patient_manage')));
    const canViewActivity = isSuperUser || (isAssistantAdmin && perms.includes('audit:view_logs'));

    if (activeView === 'users' && !canManageUsers) {
      setActiveView('register');
    }
    if (activeView === 'activity' && !canViewActivity) {
      setActiveView('register');
    }
    if (activeView === 'settings' && !isSuperUser) {
      setActiveView('register');
    }
  }, [currentUser, activeView, isAuthenticated]);

  const handlePatientChange = (patch) => {
    setPatientData(prev => ({
      ...prev,
      ...patch,
      vitals: patch.vitals ? { ...prev.vitals, ...patch.vitals } : prev.vitals
    }));
  };

  const handleApplyFields = (fields) => {
    handlePatientChange(fields);
    const count = Object.keys(fields).length;

    const updatedLogs = logActivity({
      action: 'DOCUMENT_PARSED',
      actor: currentUser,
      details: `AI document parsing & Groq entity extraction populated ${count} clinical fields into registration form.`,
      severity: 'success'
    });
    setActivityLogs(updatedLogs);

    showToast(`Groq AI successfully auto-populated ${count} registration fields!`);
  };

  const handleResetForm = () => {
    setPatientData({
      ...INITIAL_PATIENT_STATE,
      registrationId: generateRegistrationId(),
      mrn: generateMRN()
    });
    showToast('Registration form has been reset with a new Registration ID.');
  };

  // ============================================================================
  // REGISTRATION SUBMISSION & BACKEND PDF GENERATION PIPELINE
  // ============================================================================

  const handleSubmitRegistration = async () => {
    if (!patientData.firstName || !patientData.lastName) {
      alert('Please enter at least the patient First Name and Last Name.');
      return;
    }

    if (!patientData.patientConsent) {
      alert('Please check the Patient Authorization and Consent checkbox to proceed.');
      return;
    }

    setIsSubmitting(true);
    try {
      let patientRecord = null;
      const role = normalizeRole(currentUser?.role);

      // Step 1: Resolve / Provision Patient Master Record on Backend
      if (role === ROLES.PATIENT) {
        try {
          patientRecord = await patientAPI.getMyPatient();
        } catch (e) {
          // Patient record not yet linked, provision one
          const patientPayload = transformToPatientCreate(patientData);
          try {
            patientRecord = await patientAPI.createPatient(patientPayload);
          } catch (createErr) {
            try {
              patientRecord = await patientAPI.getMyPatient();
            } catch {
              throw createErr;
            }
          }
        }
      } else {
        // Staff Desk Intake: Provision new Patient Master Record
        const patientPayload = transformToPatientCreate(patientData);
        try {
          patientRecord = await patientAPI.createPatient(patientPayload);
        } catch (createErr) {
          // If duplicate warning (HTTP 409 DUPLICATE_PATIENT_RECORD), auto-override with administrative justification
          if (createErr.response && createErr.response.status === 409) {
            patientRecord = await patientAPI.createPatient(
              patientPayload,
              true,
              'Authorized walk-in intake duplicate resolution at admissions desk'
            );
          } else {
            throw createErr;
          }
        }
      }

      // Step 2: Create Intake Registration Encounter in DRAFT status
      const draftPayload = transformToRegistrationDraft(patientData, patientRecord?.id);
      const createdReg = await registrationAPI.createDraft(draftPayload);

      // Step 3: Transition Registration to SUBMITTED status (Triggers background PDF compilation)
      const submittedReg = await registrationAPI.submitRegistration(createdReg.id);

      // Step 4: Retrieve Authoritative Generated PDF Dossier from Backend
      // Wait 1.5 seconds for background worker PyMuPDF compilation
      await new Promise(resolve => setTimeout(resolve, 1500));

      let officialPdfBlob = null;
      try {
        officialPdfBlob = await registrationAPI.downloadPDF(submittedReg.id);
      } catch (pdfErr) {
        console.warn('PDF still compiling in background, will use client preview:', pdfErr);
      }

      let pdfObject;
      if (officialPdfBlob) {
        const blobUrl = URL.createObjectURL(new Blob([officialPdfBlob], { type: 'application/pdf' }));
        pdfObject = {
          blob: officialPdfBlob,
          dataUrl: blobUrl,
          fileName: `AI_Form_Registration_${submittedReg.registration_id}.pdf`,
          save: () => {
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `AI_Form_Registration_${submittedReg.registration_id}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
        };
      } else {
        // Client-side fallback PDF generator
        pdfObject = await generatePatientRegistrationPDF(patientData);
      }

      setGeneratedPDF(pdfObject);

      // Step 5: Save UI state & refresh admissions roster from backend (Page 1)
      setRosterSearchTerm('');
      setRosterDeptFilter('All');
      setRosterPagination(prev => ({ ...prev, page: 1 }));
      await loadBackendRecords({ page: 1, department: 'All', search: '' });
      if (role === ROLES.PATIENT) {
        setActiveView('records');
      }

      // Log activity
      const patientFullName = `${patientData.firstName} ${patientData.lastName}`;
      const updatedLogs = logActivity({
        action: 'REGISTRATION_SUBMITTED',
        actor: currentUser,
        details: `${currentUser.name || currentUser.username} submitted registration for ${patientFullName} (ID: ${submittedReg.registration_id}, Dept: ${submittedReg.department}).`,
        severity: 'success'
      });
      setActivityLogs(updatedLogs);

      // Step 6: Trigger download of official PDF & Open Preview
      try {
        pdfObject.save();
      } catch (e) {}

      setIsPDFPreviewOpen(true);
      showToast(`Registration confirmed! Official dossier ${submittedReg.registration_id} generated.`);
    } catch (err) {
      console.error('Registration submission error:', err);
      const errDetail = err.response?.data?.detail || err.message || 'Unknown error';
      alert('Failed to complete registration submission: ' + errDetail);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectRecord = (record) => {
    setPatientData(record);
    setActiveView('register');
    showToast(`Loaded record for ${record.firstName} ${record.lastName}.`);
  };

  const handleDeleteRecord = async (id) => {
    if (!hasPermission(currentUser, PERMISSIONS.DELETE_RECORDS)) {
      showToast('Access Denied: Only Super Users with record deletion privileges can remove admissions.', 'error');
      return;
    }

    if (!window.confirm(`Are you sure you want to permanently delete admission record ${id}? This will remove the admission and its clinical records from the database.`)) {
      return;
    }

    const deletedRecord = records.find(r => r.registrationId === id);
    setIsLoadingRecords(true);
    try {
      await registrationAPI.deleteRegistration(id);

      const updatedLogs = logActivity({
        action: 'RECORD_DELETED',
        actor: currentUser,
        details: `Permanently removed admission record ${id} (${deletedRecord?.firstName || ''} ${deletedRecord?.lastName || ''}).`,
        severity: 'warning'
      });
      setActivityLogs(updatedLogs);

      showToast(`Admission record ${id} successfully deleted from database.`);

      // Explicitly reload backend records directly from persisted SQLite database
      await loadBackendRecords({ page: rosterPagination.page });
    } catch (err) {
      console.error('Failed to delete admission record:', err);
      const detail = err.response?.data?.detail || err.message || 'Failed to delete admission record.';
      showToast(`Error: ${detail}`, 'error');
    } finally {
      setIsLoadingRecords(false);
    }
  };

  // Super User: User Management Handlers (Persisted directly to SQLite via FastAPI backend)
  const handleCreateUser = async (newUserData) => {
    try {
      const username = (
        newUserData.username ||
        newUserData.email.split('@')[0] ||
        newUserData.name.toLowerCase().replace(/[^a-z0-9]/g, '_')
      ).trim();

      const payload = {
        username: username,
        email: newUserData.email.trim(),
        role: newUserData.role,
        password: newUserData.password,
        is_active: newUserData.status === 'deactivated' ? 0 : 1,
        permissions: newUserData.permissions || []
      };

      await userAPI.createUser(payload);
      await loadBackendUsers();

      const updatedLogs = logActivity({
        action: 'ACCOUNT_CREATED',
        actor: currentUser,
        details: `Created new ${newUserData.role} account "${username}" (${newUserData.email}) in SQLite database.`,
        severity: 'success'
      });
      setActivityLogs(updatedLogs);
      showToast(`Created account "${username}" successfully.`);
    } catch (err) {
      console.error('Failed to create user in backend:', err);
      const errDetail = err.response?.data?.detail || err.message || 'Unknown error';
      alert('Failed to create user account: ' + errDetail);
    }
  };

  const handleUpdateUser = async (userId, updatedFields) => {
    try {
      const payload = {
        email: updatedFields.email,
        role: updatedFields.role,
        is_active: updatedFields.status === 'deactivated' ? 0 : 1,
        permissions: updatedFields.permissions
      };
      await userAPI.updateUser(userId, payload);
      await loadBackendUsers();

      if (currentUser?.id === userId || currentUser?.username === updatedFields.username) {
        setCurrentUser(prev => ({ ...prev, ...updatedFields }));
      }

      const updatedLogs = logActivity({
        action: 'ACCOUNT_UPDATED',
        actor: currentUser,
        details: `Updated account details and permissions for ${updatedFields.name || updatedFields.username || userId}.`,
        severity: 'info'
      });
      setActivityLogs(updatedLogs);
      showToast(`Updated account successfully.`);
    } catch (err) {
      console.error('Failed to update user in backend:', err);
      const errDetail = err.response?.data?.detail || err.message || 'Unknown error';
      alert('Failed to update user account: ' + errDetail);
    }
  };

  const handleToggleDeactivate = async (userId) => {
    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) return;

    try {
      const result = await userAPI.toggleDeactivate(userId);
      if (userStatusFilter === 'active' && result.is_active === 0) {
        setUsers(prev => prev.filter(u => u.id !== userId));
        setUserPagination(prev => ({
          ...prev,
          total: Math.max(0, (prev.total || users.length) - 1)
        }));
      }
      await loadBackendUsers({ page: userPagination.page, status: userStatusFilter || 'active' });

      const newStatus = result.is_active === 0 ? 'deactivated' : 'active';
      const updatedLogs = logActivity({
        action: newStatus === 'deactivated' ? 'ACCOUNT_DEACTIVATED' : 'ACCOUNT_REACTIVATED',
        actor: currentUser,
        details: `${newStatus === 'deactivated' ? 'Deactivated' : 'Reactivated'} account access for ${targetUser.name || targetUser.username} in SQLite database.`,
        severity: newStatus === 'deactivated' ? 'warning' : 'success'
      });
      setActivityLogs(updatedLogs);
      showToast(`Account for ${targetUser.name || targetUser.username} is now ${newStatus}`);
    } catch (err) {
      console.error('Failed to toggle deactivation in backend:', err);
      const errDetail = err.response?.data?.detail || err.message || 'Unknown error';
      alert('Failed to toggle account activation: ' + errDetail);
    }
  };

  const handleDeleteUser = async (userId) => {
    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) return;

    if (confirm(`Are you sure you want to deactivate and archive user account "${targetUser.name || targetUser.username}"?`)) {
      try {
        await userAPI.deleteUser(userId);
        setUsers(prev => prev.filter(u => u.id !== userId));
        setUserPagination(prev => ({
          ...prev,
          total: Math.max(0, (prev.total || users.length) - 1)
        }));
        await loadBackendUsers({ page: userPagination.page, status: userStatusFilter || 'active' });

        const updatedLogs = logActivity({
          action: 'ACCOUNT_DELETED',
          actor: currentUser,
          details: `Soft-deactivated user account ${targetUser.name || targetUser.username} (${targetUser.email}) adhering to HIPAA audit retention.`,
          severity: 'danger'
        });
        setActivityLogs(updatedLogs);
        showToast(`User account ${targetUser.name || targetUser.username} deactivated.`);
      } catch (err) {
        console.error('Failed to delete user in backend:', err);
        const errDetail = err.response?.data?.detail || err.message || 'Unknown error';
        alert('Failed to remove user account: ' + errDetail);
      }
    }
  };

  // Pagination & filter handlers for User Management
  const handleUserPageChange = (newPage) => {
    setUserPagination(prev => ({ ...prev, page: newPage }));
    loadBackendUsers({ page: newPage });
  };
  const handleUserPageSizeChange = (newSize) => {
    setUserPagination(prev => ({ ...prev, page: 1, limit: newSize }));
    loadBackendUsers({ page: 1, pageSize: newSize });
  };
  const handleUserSearchChange = (term) => {
    setUserSearchTerm(term);
    setUserPagination(prev => ({ ...prev, page: 1 }));
    loadBackendUsers({ page: 1, search: term });
  };
  const handleUserRoleChange = (role) => {
    setUserRoleFilter(role);
    setUserPagination(prev => ({ ...prev, page: 1 }));
    loadBackendUsers({ page: 1, role });
  };
  const handleUserStatusChange = (status) => {
    setUserStatusFilter(status);
    setUserPagination(prev => ({ ...prev, page: 1 }));
    loadBackendUsers({ page: 1, status });
  };

  // Pagination & filter handlers for Admission Roster
  const handleRosterPageChange = (newPage) => {
    setRosterPagination(prev => ({ ...prev, page: newPage }));
    loadBackendRecords({ page: newPage });
  };
  const handleRosterPageSizeChange = (newSize) => {
    setRosterPagination(prev => ({ ...prev, page: 1, limit: newSize }));
    loadBackendRecords({ page: 1, pageSize: newSize });
  };
  const handleRosterSearchChange = (term) => {
    setRosterSearchTerm(term);
    setRosterPagination(prev => ({ ...prev, page: 1 }));
    loadBackendRecords({ page: 1, search: term });
  };
  const handleRosterDeptChange = (dept) => {
    setRosterDeptFilter(dept);
    setRosterPagination(prev => ({ ...prev, page: 1 }));
    loadBackendRecords({ page: 1, department: dept });
  };

  const handleSaveSettings = (newSettings) => {
    setSettings(newSettings);
    const updatedLogs = logActivity({
      action: 'SETTINGS_UPDATED',
      actor: currentUser,
      details: 'Super User updated hospital administrative parameters and facility branding.',
      severity: 'info'
    });
    setActivityLogs(updatedLogs);
    showToast('Administrative settings saved.');
  };

  const handleClearLogs = () => {
    if (confirm('Clear all activity monitoring logs?')) {
      setActivityLogs([]);
      try {
        localStorage.removeItem('aegis_activity_logs_v1');
      } catch (e) {}
      showToast('Activity audit logs cleared.');
    }
  };

  // 1. Initial Authentication Check State: show clean loading splash
  if (isAuthInitializing) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 font-sans">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-400 text-slate-950 font-black flex items-center justify-center shadow-xl shadow-teal-500/20 mb-4 animate-pulse">
          <HeartPulse size={30} className="stroke-[2.5]" />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-white mb-2">AI Form</h2>
        <div className="flex items-center gap-2 text-xs text-teal-400 font-medium">
          <Loader2 size={16} className="animate-spin text-teal-400" />
          <span>Verifying secure session...</span>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated Gate: Render standalone LoginPage
  if (!isAuthenticated || !currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const currentRole = normalizeRole(currentUser?.role);
  const isSuperUser = currentRole === ROLES.SUPER_USER;
  const isAssistantAdmin = currentRole === ROLES.ASSISTANT_ADMIN;
  const perms = Array.isArray(currentUser?.permissions) ? currentUser.permissions : [];
  const canManageUsers = isSuperUser || (isAssistantAdmin && (perms.includes('accounts:receptionist_manage') || perms.includes('accounts:patient_manage')));
  const canViewActivity = isSuperUser || (isAssistantAdmin && perms.includes('audit:view_logs'));

  return (
    <div className="flex h-screen bg-slate-100 text-slate-800 antialiased font-sans overflow-hidden">
      
      {/* 1. Left Persistent Sidebar Navigation */}
      <Sidebar
        currentUser={currentUser}
        activeView={activeView}
        setActiveView={setActiveView}
        recordsCount={rosterPagination.total !== undefined ? rosterPagination.total : records.length}
        onOpenDocumentUpload={() => setIsDocumentModalOpen(true)}
        onOpenVoiceAssistant={() => setIsVoiceModalOpen(true)}
        onLogout={handleLogout}
        isOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
      />

      {/* 2. Main Content Canvas */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        
        {/* Top App Header */}
        <TopHeader
          currentUser={currentUser}
          activeView={activeView}
          recordsCount={rosterPagination.total !== undefined ? rosterPagination.total : records.length}
          patientData={patientData}
          onOpenDocumentUpload={() => setIsDocumentModalOpen(true)}
          onOpenVoiceAssistant={() => setIsVoiceModalOpen(true)}
          onLogout={handleLogout}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        />

        {/* Scrollable View Canvas */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-50/70">
          
          {/* Floating Toast Notification */}
          {toastMessage && (
            <div className="fixed bottom-6 right-6 z-50 bg-slate-950 text-white px-4 py-3 rounded-2xl shadow-2xl border border-teal-500/40 flex items-center gap-3 text-xs animate-fadeIn">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-ping inline-block" />
              <span className="font-bold tracking-tight text-slate-100">{toastMessage}</span>
            </div>
          )}

          <div className="max-w-7xl mx-auto space-y-6">

            {/* View 1: Registration Intake Wizard (Patients, Receptionists, Super Users) */}
            {activeView === 'register' && (
              <RegistrationWizard
                patientData={patientData}
                currentUser={currentUser}
                onPatientChange={handlePatientChange}
                onResetForm={handleResetForm}
                onSubmitRegistration={handleSubmitRegistration}
                isSubmitting={isSubmitting}
                onOpenDocumentUpload={() => setIsDocumentModalOpen(true)}
                onOpenVoiceAssistant={() => setIsVoiceModalOpen(true)}
              />
            )}

            {/* View 2: Admissions Records Database (Role-filtered) */}
            {activeView === 'records' && (
              <PatientRecordsView
                records={records}
                pagination={rosterPagination}
                isLoading={isLoadingRecords}
                searchTerm={rosterSearchTerm}
                onSearchChange={handleRosterSearchChange}
                deptFilter={rosterDeptFilter}
                onDeptChange={handleRosterDeptChange}
                onPageChange={handleRosterPageChange}
                onPageSizeChange={handleRosterPageSizeChange}
                currentUser={currentUser}
                onSelectRecord={handleSelectRecord}
                onNewRegistration={() => {
                  handleResetForm();
                  setActiveView('register');
                }}
                onDeleteRecord={handleDeleteRecord}
                onReloadRecords={() => loadBackendRecords({ page: rosterPagination.page })}
              />
            )}

            {/* View 3: User Management Console (Super User & Delegated Assistant Admin) */}
            {activeView === 'users' && canManageUsers && (
              <UserManagementView
                users={users}
                pagination={userPagination}
                isLoading={isLoadingUsers}
                searchTerm={userSearchTerm}
                onSearchChange={handleUserSearchChange}
                roleFilter={userRoleFilter}
                onRoleChange={handleUserRoleChange}
                statusFilter={userStatusFilter}
                onStatusChange={handleUserStatusChange}
                onPageChange={handleUserPageChange}
                onPageSizeChange={handleUserPageSizeChange}
                currentUser={currentUser}
                onCreateUser={handleCreateUser}
                onUpdateUser={handleUpdateUser}
                onToggleDeactivate={handleToggleDeactivate}
                onDeleteUser={handleDeleteUser}
              />
            )}

            {/* View 4: Activity Monitoring & Audit Trail (Super User & Delegated Assistant Admin) */}
            {activeView === 'activity' && canViewActivity && (
              <ActivityLogView
                logs={activityLogs}
                onClearLogs={handleClearLogs}
              />
            )}

            {/* View 5: Administrative Settings & System Dashboard (Super User Only) */}
            {activeView === 'settings' && isSuperUser && (
              <AdminSettingsView
                settings={settings}
                onSaveSettings={handleSaveSettings}
                recordsCount={rosterPagination.total || records.length}
                usersCount={userPagination.total || users.length}
                activityCount={activityLogs.length}
              />
            )}

          </div>

        </main>
      </div>

      {/* MODALS */}
      {/* 1. Document Upload & Groq AI OCR Parser Modal */}
      <DocumentUploadModal
        isOpen={isDocumentModalOpen}
        onClose={() => setIsDocumentModalOpen(false)}
        onApplyFields={handleApplyFields}
        patientData={patientData}
        patientId={patientData.patientId || patientData.id || 1}
      />

      {/* 2. Smart Voice Intake Assistant Modal */}
      <VoiceAssistantModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        patientData={patientData}
        onApplyFields={handleApplyFields}
      />

      {/* 3. Official Generated PDF Preview & Download Modal */}
      <PDFPreviewModal
        isOpen={isPDFPreviewOpen}
        onClose={() => {
          setIsPDFPreviewOpen(false);
          if (normalizeRole(currentUser?.role) === ROLES.PATIENT) {
            handleResetForm();
          }
        }}
        pdfData={generatedPDF}
        patientData={patientData}
      />

    </div>
  );
}
