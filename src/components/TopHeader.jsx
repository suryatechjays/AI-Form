import React from 'react';
import {
  Menu, Upload, Mic, ShieldCheck, HeartPulse, LogOut,
  Building2, Sparkles, ChevronRight, FileText, Database, Users, Activity, Settings
} from 'lucide-react';
import { ROLES, normalizeRole } from '../types/auth';

export default function TopHeader({
  currentUser,
  activeView,
  recordsCount = 0,
  patientData = {},
  onOpenDocumentUpload,
  onOpenVoiceAssistant,
  onLogout,
  onToggleMobileSidebar
}) {
  const currentRole = normalizeRole(currentUser?.role);
  const isSuperUser = currentRole === ROLES.SUPER_USER;
  const isReceptionist = currentRole === ROLES.RECEPTIONIST;
  const isAssistantAdmin = currentRole === ROLES.ASSISTANT_ADMIN;
  const isPatient = currentRole === ROLES.PATIENT;

  const getViewInfo = () => {
    switch (activeView) {
      case 'register':
        return {
          title: isPatient ? 'Patient Self-Registration' : 'Clinical Patient Intake Wizard',
          category: 'Intake & Registration',
          icon: FileText,
          meta: `Encounter ID: ${patientData.registrationId || 'Draft'}`
        };
      case 'records':
        return {
          title: isPatient ? 'My Medical Registration Records' : 'Hospital Admissions Roster',
          category: 'Clinical Encounters',
          icon: Database,
          meta: isPatient
            ? (recordsCount === 1 ? '1 Record Stored' : `${recordsCount} Records Stored`)
            : `${recordsCount} Admissions Recorded`
        };
      case 'users':
        return {
          title: 'User Accounts & Access Control',
          category: 'Security & RBAC',
          icon: Users,
          meta: 'Role Delegations & Permissions'
        };
      case 'activity':
        return {
          title: 'Security Audit Trail & Telemetry',
          category: 'System Monitoring',
          icon: Activity,
          meta: 'Real-Time Event Tracking'
        };
      case 'settings':
        return {
          title: 'Hospital Settings & Parameters',
          category: 'Facility Master',
          icon: Settings,
          meta: 'Administrative Configuration'
        };
      default:
        return {
          title: 'AI Form OS',
          category: 'Clinical Workspace',
          icon: HeartPulse,
          meta: 'Active Session'
        };
    }
  };

  const viewInfo = getViewInfo();
  const ViewIcon = viewInfo.icon;

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between shrink-0 select-none shadow-xs z-20">

      {/* Left: Mobile Toggle & Page Title Breadcrumb */}
      <div className="flex items-center gap-3">

        {/* Mobile menu button */}
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          className="lg:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          aria-label="Open navigation menu"
        >
          <Menu size={20} />
        </button>

        {/* Breadcrumb & Section Name */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200 text-teal-700 flex items-center justify-center font-bold">
            <ViewIcon size={16} />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
              <span>{viewInfo.category}</span>
              <ChevronRight size={12} className="text-slate-300" />
              <span className="text-slate-600 font-semibold">{viewInfo.meta}</span>
            </div>
            <h1 className="text-sm font-bold text-slate-900 leading-tight">
              {viewInfo.title}
            </h1>
          </div>
        </div>

      </div>

      {/* Right: Quick Action Buttons & RBAC Session Pill */}
      <div className="flex items-center gap-3">

        {/* Multi-modal Ingestion Action Shortcuts */}
        <button
          type="button"
          onClick={onOpenDocumentUpload}
          title="Upload Medical Record for OCR & Groq AI extraction"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200 hover:border-teal-400 text-slate-700 hover:text-teal-700 hover:bg-teal-50/50 transition-all cursor-pointer shadow-xs active:scale-95"
        >
          <Upload size={14} className="text-teal-600" />
          <span>Upload Document</span>
        </button>

        <button
          type="button"
          onClick={onOpenVoiceAssistant}
          title="Open Clinical Speech Dictation Assistant"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white transition-all cursor-pointer shadow-xs active:scale-95"
        >
          <Mic size={14} />
          <span>Voice Assistant</span>
        </button>

        {/* Role Badge Indicator */}
        <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 ${isSuperUser
            ? 'bg-purple-50 text-purple-700 border border-purple-200'
            : isReceptionist
              ? 'bg-teal-50 text-teal-700 border border-teal-200'
              : isAssistantAdmin
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          <span>
            {isSuperUser
              ? 'Super User'
              : isReceptionist
                ? 'Receptionist'
                : isAssistantAdmin
                  ? 'Assistant Admin'
                  : 'Patient'}
          </span>
        </div>

      </div>

    </header>
  );
}

