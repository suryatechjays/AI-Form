import React from 'react';
import {
  HeartPulse, FileText, Database, Users, Activity, Settings,
  Upload, Mic, LogOut, Building2, Sparkles, ChevronRight, X
} from 'lucide-react';
import { ROLES, normalizeRole } from '../types/auth';

export default function Sidebar({
  currentUser,
  activeView,
  setActiveView,
  recordsCount = 0,
  onOpenDocumentUpload,
  onOpenVoiceAssistant,
  onLogout,
  isOpen = false,
  onClose = () => {}
}) {
  const currentRole = normalizeRole(currentUser?.role);
  const isSuperUser = currentRole === ROLES.SUPER_USER;
  const isReceptionist = currentRole === ROLES.RECEPTIONIST;
  const isAssistantAdmin = currentRole === ROLES.ASSISTANT_ADMIN;
  const isPatient = currentRole === ROLES.PATIENT;

  // Dynamic live permissions from backend
  const permissions = Array.isArray(currentUser?.permissions) ? currentUser.permissions : [];
  const canViewRecords = isSuperUser || isReceptionist || isPatient || permissions.includes('records:view_all');
  const canManageUsers = isSuperUser || (isAssistantAdmin && (permissions.includes('accounts:receptionist_manage') || permissions.includes('accounts:patient_manage')));
  const canViewActivity = isSuperUser || (isAssistantAdmin && permissions.includes('audit:view_logs'));

  const renderNavButton = ({ viewKey, label, icon: Icon, count, isMobile = false }) => {
    const isActive = activeView === viewKey;

    return (
      <button
        key={viewKey}
        type="button"
        onClick={() => {
          setActiveView(viewKey);
          if (isMobile) onClose();
        }}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 my-0.5 rounded-2xl text-xs font-semibold transition-all duration-200 cursor-pointer group relative overflow-hidden [&_*]:cursor-pointer ${
          isActive
            ? 'bg-gradient-to-r from-teal-500/[0.18] via-teal-500/[0.10] to-emerald-500/[0.04] text-white font-bold border border-teal-500/40 shadow-[0_0_20px_-4px_rgba(20,184,166,0.35),inset_0_1px_1px_rgba(255,255,255,0.12)]'
            : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06]'
        }`}
      >
        {/* Active Left Indicator Notch */}
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 rounded-r-full bg-gradient-to-b from-teal-400 via-teal-300 to-emerald-400 shadow-[0_0_12px_#2dd4bf] animate-pulse" />
        )}

        <div className="flex items-center gap-3 min-w-0">
          {/* Futuristic Icon Capsule */}
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200 ${
              isActive
                ? 'bg-gradient-to-tr from-teal-500/30 to-emerald-500/20 text-teal-200 border border-teal-400/40 shadow-[0_0_14px_rgba(20,184,166,0.4)]'
                : 'bg-slate-800/50 text-slate-400 border border-slate-750/60 group-hover:bg-slate-800/90 group-hover:text-teal-300 group-hover:border-teal-500/30 group-hover:shadow-[0_0_12px_rgba(20,184,166,0.2)]'
            }`}
          >
            <Icon size={16} className="transition-transform duration-200 group-hover:scale-105" />
          </div>

          <span className="truncate tracking-wide">{label}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {count !== undefined && (
            <span
              className={`font-mono text-[10px] px-2 py-0.5 rounded-full font-bold transition-all ${
                isActive
                  ? 'bg-teal-400/20 text-teal-200 border border-teal-400/35 shadow-[0_0_8px_rgba(45,212,191,0.3)]'
                  : 'bg-slate-800/90 text-slate-400 group-hover:text-teal-300 border border-slate-700/60'
              }`}
            >
              {count}
            </span>
          )}
          <ChevronRight
            size={14}
            className={`transition-all duration-200 ${
              isActive
                ? 'text-teal-300 translate-x-0 opacity-100'
                : 'text-slate-600 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-slate-300'
            }`}
          />
        </div>
      </button>
    );
  };

  const renderNavContent = (isMobile = false) => {
    return (
      <div className="relative flex flex-col h-full w-full bg-[#0a0f18]/95 border-r border-slate-800/80 shadow-[4px_0_28px_-4px_rgba(0,0,0,0.6)] select-none backdrop-blur-2xl overflow-hidden cursor-default">
        
        {/* Subtle Futuristic Ambient Glow (Top-Down) */}
        <div className="pointer-events-none absolute -top-12 -left-12 w-64 h-48 bg-teal-500/10 rounded-full blur-3xl" />
        <div className="pointer-events-none absolute top-1/3 -right-20 w-52 h-44 bg-emerald-500/5 rounded-full blur-3xl" />

        {/* 1. Brand & Header Area */}
        <div className="relative z-10 p-3.5 sm:p-4 border-b border-white/[0.06] flex items-center justify-between">
          {/* Brand Logo & Name (Clickable Navigation to Registration) */}
          <div
            className="flex items-center gap-3 cursor-pointer group min-w-0 [&_*]:cursor-pointer"
            onClick={() => {
              setActiveView('register');
              if (isMobile) onClose();
            }}
            title="AI Form • Patient Registration"
          >
            {/* Holographic Logo Emblem */}
            <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-tr from-teal-500 via-teal-400 to-emerald-400 p-[1.5px] shadow-[0_0_20px_-3px_rgba(20,184,166,0.35)] shrink-0 transition-transform duration-300 group-hover:scale-105 group-hover:shadow-[0_0_25px_-2px_rgba(20,184,166,0.5)]">
              <div className="w-full h-full rounded-[14px] bg-slate-950 flex items-center justify-center text-teal-300">
                <HeartPulse size={20} className="stroke-[2.5] text-teal-400 drop-shadow-[0_0_8px_rgba(45,212,191,0.6)]" />
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base tracking-tight text-white font-sans truncate">
                  AI Form
                </span>
                <span className="text-[9px] bg-gradient-to-r from-teal-500/15 to-emerald-500/15 text-teal-300 border border-teal-400/30 px-1.5 py-0.2 rounded-full font-mono font-bold tracking-wider shadow-[0_0_10px_-3px_rgba(20,184,166,0.3)]">
                  OS
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium tracking-wide truncate">
                Clinical Operating System
              </p>
            </div>
          </div>

          {/* Mobile Drawer Close Button */}
          {isMobile && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08] transition-all duration-200 cursor-pointer [&_*]:cursor-pointer"
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Operational Status Subheader */}
        <div className="relative z-10 py-2 px-4 border-b border-white/[0.06] bg-slate-950/60 backdrop-blur-md flex items-center justify-between cursor-default [&_*]:cursor-default">
          <div className="flex items-center gap-1.5 min-w-0 text-slate-400">
            <Building2 size={13} className="text-teal-400 shrink-0" />
            <span className="truncate max-w-[125px] font-medium text-[11px] text-slate-300">
              AI Form Regional
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 font-mono text-[9px] font-semibold shadow-[0_0_12px_-2px_rgba(16,185,129,0.3)] shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>ONLINE</span>
          </div>
        </div>

        {/* 2. Scrollable Navigation List */}
        <div className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden p-2.5 sm:p-3 space-y-5 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          
          {/* Section: Clinical Workflows */}
          <div>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 font-semibold px-3 mb-1.5 block cursor-default">
              Workflows
            </span>
            <div className="space-y-0.5">
              {renderNavButton({
                viewKey: 'register',
                label: isPatient
                  ? 'My Registration'
                  : isReceptionist
                  ? 'Patient Intake Desk'
                  : isAssistantAdmin
                  ? 'Patient Intake'
                  : 'Intake Wizard',
                icon: FileText,
                isMobile
              })}

              {canViewRecords && renderNavButton({
                viewKey: 'records',
                label: isPatient ? 'My Records' : 'Admissions Roster',
                icon: Database,
                isMobile
              })}
            </div>
          </div>

          {/* Section: System Administration (RBAC-gated) */}
          {(canManageUsers || canViewActivity || isSuperUser) && (
            <div>
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 font-semibold px-3 mb-1.5 block cursor-default">
                Management
              </span>
              <div className="space-y-0.5">
                {canManageUsers && renderNavButton({
                  viewKey: 'users',
                  label: 'User Accounts',
                  icon: Users,
                  isMobile
                })}

                {canViewActivity && renderNavButton({
                  viewKey: 'activity',
                  label: 'Activity Logs',
                  icon: Activity,
                  isMobile
                })}

                {isSuperUser && renderNavButton({
                  viewKey: 'settings',
                  label: 'Hospital Settings',
                  icon: Settings,
                  isMobile
                })}
              </div>
            </div>
          )}

          {/* Section: AI Ingestion Co-Pilots */}
          <div>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 font-semibold px-3 mb-2 flex items-center gap-1.5 cursor-default">
              <Sparkles size={11} className="text-teal-400" />
              <span>AI Ingestion</span>
            </span>
            <div className="space-y-2">
              
              {/* Upload Document Action Card */}
              <button
                type="button"
                onClick={() => {
                  onOpenDocumentUpload();
                  if (isMobile) onClose();
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-2xl bg-gradient-to-r from-slate-900/90 via-slate-850 to-slate-900/90 hover:from-slate-850 hover:to-slate-800 text-slate-200 hover:text-white border border-slate-800 hover:border-teal-500/40 shadow-xs hover:shadow-[0_0_22px_-5px_rgba(20,184,166,0.3)] transition-all duration-200 cursor-pointer group active:scale-[0.98] [&_*]:cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-400 group-hover:bg-teal-500/25 group-hover:text-teal-200 group-hover:border-teal-400/50 flex items-center justify-center shadow-[0_0_12px_rgba(20,184,166,0.2)] transition-all shrink-0">
                    <Upload size={15} className="stroke-[2.2] group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="text-left min-w-0">
                    <span className="block text-xs font-semibold truncate leading-tight group-hover:text-teal-200 transition-colors">
                      Upload Medical Doc
                    </span>
                    <span className="block text-[10px] text-slate-400 font-normal leading-tight mt-0.5">
                      PDF AI Extraction
                    </span>
                  </div>
                </div>
                <span className="text-[9px] bg-teal-500/15 border border-teal-500/30 text-teal-300 px-2 py-0.5 rounded-full font-mono font-bold tracking-wider shrink-0 shadow-[0_0_8px_rgba(20,184,166,0.2)]">
                  OCR
                </span>
              </button>

              {/* Voice Dictation Action Card */}
              <button
                type="button"
                onClick={() => {
                  onOpenVoiceAssistant();
                  if (isMobile) onClose();
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-2xl bg-gradient-to-r from-slate-900/90 via-slate-850 to-slate-900/90 hover:from-slate-850 hover:to-slate-800 text-slate-200 hover:text-white border border-slate-800 hover:border-emerald-500/40 shadow-xs hover:shadow-[0_0_22px_-5px_rgba(16,185,129,0.3)] transition-all duration-200 cursor-pointer group active:scale-[0.98] [&_*]:cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 group-hover:bg-emerald-500/25 group-hover:text-emerald-200 group-hover:border-emerald-400/50 flex items-center justify-center shadow-[0_0_12px_rgba(16,185,129,0.2)] transition-all shrink-0">
                    <Mic size={15} className="stroke-[2.2] group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="text-left min-w-0">
                    <span className="block text-xs font-semibold truncate leading-tight group-hover:text-emerald-200 transition-colors">
                      Voice Assistant
                    </span>
                    <span className="block text-[10px] text-slate-400 font-normal leading-tight mt-0.5">
                      Clinical Speech-to-Text
                    </span>
                  </div>
                </div>
                <span className="text-[9px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded-full font-mono font-bold tracking-wider shrink-0 shadow-[0_0_8px_rgba(16,185,129,0.2)]">
                  STT
                </span>
              </button>

            </div>
          </div>

        </div>

        {/* 3. Floating User Profile Dock (Bottom) */}
        <div className="relative z-10 p-2.5 border-t border-white/[0.06] bg-slate-950/80 backdrop-blur-xl">
          <div className="rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-white/[0.08] shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5)] p-2.5 flex items-center justify-between gap-2">
            {/* Non-clickable User Information Block */}
            <div className="flex items-center gap-2.5 min-w-0 cursor-default [&_*]:cursor-default">
              {/* Profile Avatar with Live Ping */}
              <div className="relative shrink-0">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-500 via-emerald-400 to-cyan-400 p-[1.5px] shadow-[0_0_12px_rgba(20,184,166,0.3)]">
                  <div className="w-full h-full rounded-[10px] bg-slate-950 flex items-center justify-center text-teal-300 font-black text-xs">
                    {(currentUser?.name || currentUser?.username || 'U').charAt(0).toUpperCase()}
                  </div>
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-slate-950 shadow-[0_0_6px_#34d399]" />
              </div>

              <div className="min-w-0">
                <span className="text-xs font-bold text-white block truncate leading-tight">
                  {currentUser?.name || currentUser?.username || 'User'}
                </span>
                <span className="text-[9px] font-mono font-bold text-teal-300 bg-teal-500/10 border border-teal-500/25 px-1.5 py-0.2 rounded-md inline-block uppercase tracking-wider mt-0.5">
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

            {/* Clickable Logout Action Button */}
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                title="Sign Out of AI Form"
                className="p-2 text-slate-400 hover:text-rose-300 hover:bg-rose-500/15 rounded-xl border border-transparent hover:border-rose-500/30 hover:shadow-[0_0_14px_rgba(244,63,94,0.3)] transition-all duration-200 cursor-pointer shrink-0 active:scale-95 [&_*]:cursor-pointer"
                aria-label="Sign Out of AI Form"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>

      </div>
    );
  };

  return (
    <>
      {/* Desktop Persistent Sidebar (Permanently Expanded) */}
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0 z-30">
        {renderNavContent(false)}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex animate-fadeIn">
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity duration-300"
            onClick={onClose}
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10 shadow-2xl transition-transform duration-300 ease-out">
            {renderNavContent(true)}
          </div>
        </div>
      )}
    </>
  );
}
