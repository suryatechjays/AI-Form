import React from 'react';
import {
  HeartPulse, FileText, Database, Users, Activity, Settings,
  Upload, Mic, Shield, User, LogOut, CheckCircle2, ShieldCheck,
  Building2, Sparkles, ChevronRight, Bell
} from 'lucide-react';
import { ROLES, normalizeRole } from '../types/auth';

export default function Header({
  currentUser,
  activeView,
  setActiveView,
  recordsCount = 0,
  onOpenDocumentUpload,
  onOpenVoiceAssistant,
  onLogout
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

  return (
    <header className="bg-slate-950 text-white border-b border-slate-800/90 sticky top-0 z-40 backdrop-blur-xl bg-slate-950/95 shadow-xl transition-all">

      {/* Top Telemetry & Session Bar */}
      <div className="bg-slate-900/90 border-b border-slate-800/70 px-4 sm:px-6 lg:px-8 py-1.5 flex flex-wrap items-center justify-between text-xs gap-2">
        
        {/* Left: Facility & Security Compliance */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-slate-400 font-medium text-[11px]">
            <Building2 size={13} className="text-teal-400" />
            <span className="hidden sm:inline">AI Form Regional Medical Center</span>
            <span className="text-slate-600">•</span>
            <span className="font-mono text-[10px] text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700/60">
              NYC-01
            </span>
          </div>

          <span className="hidden md:flex items-center gap-1 text-[10px] text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-semibold">
            <ShieldCheck size={11} /> HIPAA 256-Bit Encrypted
          </span>
        </div>

        {/* Right: RBAC Active Role Indicator & Authenticated User Session */}
        <div className="flex items-center gap-2.5">
          
          {/* Active Role Pill */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:inline">
              Role:
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold flex items-center gap-1.5 shadow-sm transition-all ${
              isSuperUser
                ? 'bg-purple-500/20 text-purple-300 border border-purple-400/40 shadow-purple-500/10'
                : isReceptionist
                ? 'bg-teal-500/20 text-teal-300 border border-teal-400/40 shadow-teal-500/10'
                : isAssistantAdmin
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/40 shadow-indigo-500/10'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 shadow-emerald-500/10'
            }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping" />
              {isSuperUser
                ? 'Super User • Admin Console'
                : isReceptionist
                ? 'Receptionist • Desk Intake'
                : isAssistantAdmin
                ? 'Assistant Admin • Delegated'
                : 'Patient • Self Intake'}
            </span>
          </div>

          {/* User Badge */}
          <div className="flex items-center gap-2 bg-slate-850 bg-slate-900 border border-slate-700/90 px-2.5 py-0.5 rounded-lg text-xs font-medium shadow-inner">
            <div className={`w-2 h-2 rounded-full ${
              isSuperUser ? 'bg-purple-400' : isReceptionist ? 'bg-teal-400' : isAssistantAdmin ? 'bg-indigo-400' : 'bg-emerald-400'
            }`} />
            <span className="font-bold text-white text-[11px] truncate max-w-[120px]">
              {currentUser?.name || currentUser?.username || 'User'}
            </span>
            <span className="font-mono text-[10px] text-slate-400 hidden sm:inline">
              (@{currentUser?.username || 'user'})
            </span>
          </div>

          {/* Logout Button */}
          {onLogout && (
            <button
              onClick={onLogout}
              title="Terminate current session and sign out"
              className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 hover:text-red-100 border border-red-500/30 hover:border-red-500/50 text-[11px] font-semibold transition-all cursor-pointer active:scale-95"
            >
              <LogOut size={11} />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          )}

        </div>

      </div>

      {/* Main Command Header Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">

          {/* Logo & Hospital Brand Identity */}
          <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => setActiveView('register')}>
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-teal-500 via-teal-400 to-emerald-400 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-teal-500/25 ring-2 ring-teal-400/20 transform transition-transform hover:scale-105">
              <HeartPulse size={22} className="stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-base tracking-tight text-white font-sans">AI Form</span>
                <span className="text-[9px] bg-gradient-to-r from-teal-500/20 to-emerald-500/20 text-teal-300 border border-teal-400/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  OS 2.0
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium leading-none mt-0.5">
                {isPatient
                  ? 'Patient Self-Registration Portal'
                  : isReceptionist
                  ? 'Clinical Intake & Admissions Command'
                  : isAssistantAdmin
                  ? 'Delegated Staff Admissions Console'
                  : 'Executive Healthcare Administration'}
              </p>
            </div>
          </div>

          {/* Primary View Navigation Tabs */}
          <nav className="hidden lg:flex items-center bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800 text-xs shadow-inner gap-1">

            {/* Registration Wizard (All Roles) */}
            <button
              onClick={() => setActiveView('register')}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeView === 'register'
                  ? 'bg-gradient-to-r from-teal-600 to-teal-500 text-white shadow-md shadow-teal-600/30 ring-1 ring-teal-400/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <FileText size={14} className={activeView === 'register' ? 'text-white' : 'text-teal-400'} />
              <span>{isPatient ? 'My Registration' : isReceptionist ? 'Register Patient' : isAssistantAdmin ? 'Patient Intake' : 'Intake Wizard'}</span>
            </button>

            {/* Admissions Roster (Scoped by role & permissions) */}
            {canViewRecords && (
              <button
                onClick={() => setActiveView('records')}
                className={`px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  activeView === 'records'
                    ? 'bg-gradient-to-r from-teal-600 to-teal-500 text-white shadow-md shadow-teal-600/30 ring-1 ring-teal-400/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Database size={14} className={activeView === 'records' ? 'text-white' : 'text-teal-400'} />
                <span>{isPatient ? 'My Medical Record' : 'Admissions Roster'}</span>
                <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${
                  activeView === 'records'
                    ? 'bg-white/20 text-white'
                    : 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                }`}>
                  {recordsCount}
                </span>
              </button>
            )}

            {/* User Accounts Management (Super User & Assistant Admin with scopes) */}
            {canManageUsers && (
              <button
                onClick={() => setActiveView('users')}
                className={`px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  activeView === 'users'
                    ? 'bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-md shadow-purple-600/30 ring-1 ring-purple-400/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Users size={14} className={activeView === 'users' ? 'text-white' : 'text-purple-400'} />
                <span>User Accounts</span>
              </button>
            )}

            {/* Activity Logs (Super User & Assistant Admin with audit scope) */}
            {canViewActivity && (
              <button
                onClick={() => setActiveView('activity')}
                className={`px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  activeView === 'activity'
                    ? 'bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-md shadow-purple-600/30 ring-1 ring-purple-400/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Activity size={14} className={activeView === 'activity' ? 'text-white' : 'text-purple-400'} />
                <span>Activity Logs</span>
              </button>
            )}

            {/* Admin Settings (Super User Only) */}
            {isSuperUser && (
              <button
                onClick={() => setActiveView('settings')}
                className={`px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  activeView === 'settings'
                    ? 'bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-md shadow-purple-600/30 ring-1 ring-purple-400/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Settings size={14} className={activeView === 'settings' ? 'text-white' : 'text-purple-400'} />
                <span>Admin Settings</span>
              </button>
            )}

          </nav>

          {/* Quick AI & Multi-Modal Action Buttons */}
          <div className="flex items-center gap-2.5">

            {/* Upload Document Button */}
            <button
              onClick={onOpenDocumentUpload}
              title="Upload PDF or Scanned Medical Document for OCR & Groq AI field extraction"
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-teal-300 hover:text-white rounded-xl text-xs font-bold border border-teal-500/30 hover:border-teal-400/60 flex items-center gap-2 transition-all shadow-sm active:scale-95 cursor-pointer group"
            >
              <Upload size={14} className="text-teal-400 group-hover:scale-110 transition-transform" />
              <span className="hidden sm:inline">Upload Medical Doc</span>
            </button>

            {/* Voice Dictation Assistant Button */}
            <button
              onClick={onOpenVoiceAssistant}
              title="Open Voice Assistant for interactive clinical speech dictation"
              className="px-3.5 py-2 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white rounded-xl text-xs font-bold shadow-md shadow-teal-600/25 hover:shadow-teal-500/40 flex items-center gap-2 transition-all active:scale-95 cursor-pointer ring-1 ring-teal-400/30"
            >
              <Mic size={14} className="animate-pulse" />
              <span className="hidden sm:inline">Voice Assistant</span>
            </button>

            {/* User Profile Avatar Pill */}
            <div className="pl-2 border-l border-slate-800 flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-full ${currentUser?.avatarColor || 'bg-slate-700'} text-white font-extrabold flex items-center justify-center text-xs shadow-md ring-2 ring-slate-700/80`}>
                {(currentUser?.name || currentUser?.username || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="hidden xl:block text-left">
                <span className="text-xs font-bold text-white block leading-tight truncate max-w-[110px]">
                  {currentUser?.name || currentUser?.username || 'User'}
                </span>
                <span className="text-[10px] text-teal-300 block leading-tight capitalize font-semibold">
                  {isSuperUser
                    ? 'Super User'
                    : isReceptionist
                    ? 'Reception Desk'
                    : isAssistantAdmin
                    ? 'Assistant Admin'
                    : 'Patient'}
                </span>
              </div>
            </div>

          </div>

        </div>
      </div>

      {/* Mobile Sub-Navigation Bar */}
      <div className="lg:hidden flex items-center overflow-x-auto px-4 py-2 bg-slate-900 border-t border-slate-800/80 gap-1.5 text-xs scrollbar-none">
        <button
          onClick={() => setActiveView('register')}
          className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition-all ${
            activeView === 'register' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          {isPatient ? 'My Registration' : 'Intake Form'}
        </button>
        {canViewRecords && (
          <button
            onClick={() => setActiveView('records')}
            className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition-all ${
              activeView === 'records' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            {isPatient ? `My Records (${recordsCount})` : `Admissions (${recordsCount})`}
          </button>
        )}
        {canManageUsers && (
          <button
            onClick={() => setActiveView('users')}
            className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition-all ${
              activeView === 'users' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Users
          </button>
        )}
        {canViewActivity && (
          <button
            onClick={() => setActiveView('activity')}
            className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition-all ${
              activeView === 'activity' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Activity Logs
          </button>
        )}
        {isSuperUser && (
          <button
            onClick={() => setActiveView('settings')}
            className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition-all ${
              activeView === 'settings' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Admin Settings
          </button>
        )}
      </div>

    </header>
  );
}
