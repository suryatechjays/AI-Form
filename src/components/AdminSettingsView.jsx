import React, { useState } from 'react';
import { Settings, Shield, Sliders, Building, CheckCircle2, Cpu, Database, Save, RefreshCw } from 'lucide-react';

export default function AdminSettingsView({
  settings,
  onSaveSettings,
  recordsCount = 0,
  usersCount = 0,
  activityCount = 0
}) {
  const [formData, setFormData] = useState({
    hospitalName: settings?.hospitalName || 'AI Form Regional Health System',
    facilityId: settings?.facilityId || 'AEGIS-HOSP-NYC-01',
    emergencyHelpline: settings?.emergencyHelpline || '(800) 555-CARE',
    admissionsPhone: settings?.admissionsPhone || '(800) 555-AEGIS',
    defaultDepartment: settings?.defaultDepartment || 'General Medicine',
    requireSignature: settings?.requireSignature !== false,
    autoTriggerOCR: settings?.autoTriggerOCR !== false,
    minConfidenceScore: settings?.minConfidenceScore || 70,
    hipaaRetentionDays: settings?.hipaaRetentionDays || 365,
    enableVoiceConfirmation: settings?.enableVoiceConfirmation !== false
  });

  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSaveSettings(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="space-y-6">
      
      {/* Metrics Dashboard Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Patient Admissions</span>
            <div className="text-2xl font-black text-slate-900 mt-1">{recordsCount}</div>
            <span className="text-[11px] text-teal-600 font-semibold mt-0.5 block">Stored in Admissions DB</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shadow-xs">
            <Database size={20} />
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Configured User Accounts</span>
            <div className="text-2xl font-black text-purple-700 mt-1">{usersCount}</div>
            <span className="text-[11px] text-purple-600 font-semibold mt-0.5 block">Patients, Staff & Super Users</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-purple-50 border border-purple-200 text-purple-700 flex items-center justify-center shadow-xs">
            <Shield size={20} />
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">AI OCR Engine Status</span>
            <div className="text-2xl font-black text-emerald-600 mt-1">Ready</div>
            <span className="text-[11px] text-emerald-600 font-semibold mt-0.5 block">PyMuPDF & Tesseract OCR</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shadow-xs">
            <Cpu size={20} />
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Audit Events Logged</span>
            <div className="text-2xl font-black text-slate-900 mt-1">{activityCount}</div>
            <span className="text-[11px] text-slate-500 font-semibold mt-0.5 block">Real-time monitoring trail</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-slate-50 border border-slate-200 text-slate-700 flex items-center justify-center shadow-xs">
            <Sliders size={20} />
          </div>
        </div>
      </div>

      {/* Settings Form */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-7 shadow-sm space-y-6">
        
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">Hospital Administration & System Parameters</h2>
              <span className="text-[11px] bg-purple-100 text-purple-800 border border-purple-200 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                <Shield size={12} /> Super User Only
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Control facility identifiers, AI recognition thresholds, default routing, and clinical dossier branding.
            </p>
          </div>

          {savedSuccess && (
            <span className="text-xs bg-emerald-100 text-emerald-800 border border-emerald-300 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 animate-fadeIn">
              <CheckCircle2 size={14} /> Settings Saved
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Facility Branding */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Building size={14} className="text-purple-600" /> Facility Branding & PDF Header Credentials
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Hospital / Clinic Official Name</label>
                <input
                  type="text"
                  value={formData.hospitalName}
                  onChange={(e) => setFormData({ ...formData, hospitalName: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500 font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Facility Code / License ID</label>
                <input
                  type="text"
                  value={formData.facilityId}
                  onChange={(e) => setFormData({ ...formData, facilityId: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500 font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Emergency Helpline</label>
                <input
                  type="text"
                  value={formData.emergencyHelpline}
                  onChange={(e) => setFormData({ ...formData, emergencyHelpline: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500 font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Admissions Desk Direct Contact</label>
                <input
                  type="text"
                  value={formData.admissionsPhone}
                  onChange={(e) => setFormData({ ...formData, admissionsPhone: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500 font-medium"
                />
              </div>
            </div>
          </div>

          {/* AI Intake & OCR Engine Preferences */}
          <div className="space-y-3 border-t border-slate-100 pt-5">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Cpu size={14} className="text-purple-600" /> AI Document Extraction & Speech Parameters
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Minimum Confidence Score for Auto-Fill (%)</label>
                <input
                  type="number"
                  min="40"
                  max="95"
                  value={formData.minConfidenceScore}
                  onChange={(e) => setFormData({ ...formData, minConfidenceScore: parseInt(e.target.value) || 70 })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500 font-medium"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">Fields with lower score will be flagged for manual review.</span>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Default Admitting Department</label>
                <select
                  value={formData.defaultDepartment}
                  onChange={(e) => setFormData({ ...formData, defaultDepartment: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500 font-medium"
                >
                  <option value="General Medicine">General Medicine</option>
                  <option value="Cardiology">Cardiology</option>
                  <option value="Orthopedics">Orthopedics</option>
                  <option value="Pediatrics">Pediatrics</option>
                  <option value="Emergency Care">Emergency Care</option>
                </select>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-800 font-medium">
                <input
                  type="checkbox"
                  checked={formData.autoTriggerOCR}
                  onChange={(e) => setFormData({ ...formData, autoTriggerOCR: e.target.checked })}
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <span>Automatically run Optical Character Recognition (OCR) when scanned documents or images are dropped</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-800 font-medium">
                <input
                  type="checkbox"
                  checked={formData.requireSignature}
                  onChange={(e) => setFormData({ ...formData, requireSignature: e.target.checked })}
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <span>Enforce digital signature authorization before PDF Dossier generation is permitted</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-800 font-medium">
                <input
                  type="checkbox"
                  checked={formData.enableVoiceConfirmation}
                  onChange={(e) => setFormData({ ...formData, enableVoiceConfirmation: e.target.checked })}
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <span>Enable interactive speech listener for voice confirmation ("Confirm" / "Yes") after text-to-speech form read-out</span>
              </label>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 flex items-center justify-end">
            <button
              type="submit"
              className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/20 flex items-center gap-2 transition-transform active:scale-95"
            >
              <Save size={14} /> Save Administrative Configuration
            </button>
          </div>

        </form>
      </div>

    </div>
  );
}

