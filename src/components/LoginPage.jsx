import React, { useState } from 'react';
import {
  HeartPulse, Shield, ShieldCheck, Lock, User, Eye, EyeOff,
  AlertCircle, Loader2, ArrowRight, CheckCircle2, KeyRound, Building2,
  FileCheck2, FileText, Mic, Volume2, Sparkles, Cpu, Award
} from 'lucide-react';
import { authAPI, transformMeResponse } from '../services/api';

const SYSTEM_ROLES_HINT = [
  { role: 'Super User', username: 'admin', badge: 'Full Admin', desc: 'Hospital management & audit logs' },
  { role: 'Receptionist', username: 'receptionist', badge: 'Intake Desk', desc: 'Patient intake & admissions roster' },
];

export default function LoginPage({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    const trimmedUser = username.trim();
    if (!trimmedUser) {
      setErrorMessage('Please enter your username or email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setIsLoading(true);
    try {
      // 1. Execute backend login (POST /api/v1/auth/login)
      await authAPI.login(trimmedUser, password);

      // 2. Fetch authoritative profile with dynamic scopes (GET /api/v1/auth/me)
      const meData = await authAPI.getMe();
      const userProfile = transformMeResponse(meData);

      if (onLoginSuccess) {
        onLoginSuccess(userProfile);
      }
    } catch (err) {
      const problem = err.response?.data;
      let detail = 'Authentication failed. Please verify your credentials.';

      if (problem) {
        if (problem.code === 'INVALID_CREDENTIALS') {
          detail = 'Invalid username or password. Please try again.';
        } else if (problem.code === 'ACCOUNT_DEACTIVATED') {
          detail = 'This account has been deactivated. Please contact the Hospital Administrator.';
        } else if (problem.detail) {
          detail = problem.detail;
        }
      } else if (err.message && err.message.includes('Network Error')) {
        detail = 'Cannot connect to the AI Form backend server. Please verify FastAPI is running on port 8000.';
      }

      setErrorMessage(detail);
    } finally {
      setIsLoading(false);
    }
  };

  const fillCredentials = (uname) => {
    setUsername(uname);
    setPassword('Pass123!');
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen bg-slate-900 flex font-sans select-none">
      
      {/* Left Brand Showcase Column (Desktop) */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 border-r border-slate-800 p-12 flex-col justify-between text-slate-300">
        
        {/* Brand Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center font-black shadow-sm">
              <HeartPulse size={24} className="stroke-[2.5]" />
            </div>
            <div>
              <span className="font-black text-lg tracking-tight text-white block">AI Form</span>
              <span className="text-[10px] text-teal-400 font-bold uppercase tracking-wider">Clinical Operating System</span>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2 max-w-sm">
            Enterprise clinical intake, intelligent document extraction, admissions management, and streamlined patient dossiers.
          </p>
        </div>

        {/* Feature Highlights Grid */}
        <div className="space-y-4 my-8">
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-800/60 border border-slate-800">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0 mt-0.5">
              <FileText size={16} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">AI-Powered PDF Data Extraction</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">Automatically extract patient details and medical information from uploaded PDF documents using AI.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-800/60 border border-slate-800">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0 mt-0.5">
              <Mic size={16} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">Voice-Based Patient Registration</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">Capture patient responses through voice input and convert speech into registration form fields.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-800/60 border border-slate-800">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0 mt-0.5">
              <Volume2 size={16} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">Smart Form Assistance Using Speech and Text</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">Read questions and registration information aloud to make the patient registration process easier.</p>
            </div>
          </div>
        </div>

        {/* Project Highlights Footer */}
        <div className="pt-5 border-t border-slate-800/80 space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-teal-400 uppercase tracking-wider">
            <Sparkles size={12} />
            <span>Key Project Highlights</span>
          </div>
          <div className="space-y-1.5 text-[11px] text-slate-300">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
              <span>AI-powered PDF data extraction</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
              <span>Voice-based patient registration</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
              <span>Smart form assistance using speech and text</span>
            </div>
          </div>
        </div>

      </div>

      {/* Right Authentication Panel */}
      <div className="w-full lg:w-1/2 bg-white flex flex-col justify-center items-center px-6 sm:px-12 py-10 overflow-y-auto">
        <div className="w-full max-w-md space-y-6">
          
          {/* Mobile Brand Banner */}
          <div className="lg:hidden flex items-center gap-2.5 mb-6">
            <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold">
              <HeartPulse size={20} />
            </div>
            <span className="font-bold text-base text-slate-900">AI Form</span>
          </div>

          {/* Form Header */}
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Sign In to AI Form
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Enter your clinical account credentials to access the admissions console.
            </p>
          </div>

          {/* Error Alert */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5 animate-fadeIn">
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold block">Authentication Denied</span>
                <span className="text-[11px]">{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Credentials Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Username / Email */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Username or Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User size={15} />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. admin or receptionist"
                  autoComplete="username"
                  disabled={isLoading}
                  className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 font-medium transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">
                  Password
                </label>
                <span className="text-[10px] text-slate-400">
                  Argon2id Encrypted
                </span>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock size={15} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your account password"
                  autoComplete="current-password"
                  disabled={isLoading}
                  className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 font-medium transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 size={15} className="animate-spin text-white" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign In to System</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>

          </form>

          {/* Quick Role Fill Presets for Instant Evaluation (Development Mode Only) */}
          {import.meta.env.DEV && (
            <div className="pt-5 border-t border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  1-Click Testing Accounts:
                </span>
                <span className="text-[10px] text-slate-400">
                  Default: <code className="text-teal-700 font-mono font-bold">Pass123!</code>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {SYSTEM_ROLES_HINT.map((acc) => (
                  <button
                    key={acc.username}
                    type="button"
                    onClick={() => fillCredentials(acc.username)}
                    className="p-2.5 rounded-xl bg-slate-50 hover:bg-teal-50/60 border border-slate-200 hover:border-teal-300 text-left transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 text-xs group-hover:text-teal-700">
                        {acc.role}
                      </span>
                      <span className="font-mono text-[9px] text-teal-600 font-bold">
                        @{acc.username}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 block truncate mt-0.5">
                      {acc.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="text-center text-[10px] text-slate-400 pt-2">
            AI Form Regional Health System • Intelligent Patient Intake Portal
          </div>

        </div>
      </div>

    </div>
  );
}
