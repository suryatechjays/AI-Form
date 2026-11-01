import React, { useState } from 'react';
import {
  User, ShieldCheck,
  Upload, Mic,
  RotateCcw, Sparkles, CheckCircle2, Shield, UserCheck
} from 'lucide-react';
import StepDemographics from './StepDemographics';
import StepContactInfo from './StepContactInfo';
import StepEmergencyContact from './StepEmergencyContact';
import StepInsurance from './StepInsurance';
import StepMedicalHistory from './StepMedicalHistory';
import StepVisitVitals from './StepVisitVitals';
import StepReviewConfirm from './StepReviewConfirm';
import { SAMPLE_DOCUMENTS } from '../data/sampleDocuments';
import { extractPatientInformation } from '../services/aiExtractor';
import { ROLES, normalizeRole } from '../types/auth';

export default function RegistrationWizard({
  patientData,
  currentUser,
  onPatientChange,
  onResetForm,
  onSubmitRegistration,
  isSubmitting,
  onOpenDocumentUpload,
  onOpenVoiceAssistant
}) {
  const [highlightSection, setHighlightSection] = useState('');
  const [lastPopulatedFieldsCount, setLastPopulatedFieldsCount] = useState(0);

  const currentRole = normalizeRole(currentUser?.role);
  const isReceptionist = currentRole === ROLES.RECEPTIONIST;
  const isSuperUser = currentRole === ROLES.SUPER_USER;
  const isAssistantAdmin = currentRole === ROLES.ASSISTANT_ADMIN;
  const isPatient = currentRole === ROLES.PATIENT;

  // Quick load sample 1 for instant evaluation
  const handleQuickDemo = () => {
    const sample = SAMPLE_DOCUMENTS[0];
    const extracted = extractPatientInformation(sample.text);
    onPatientChange(extracted.mappedFields);
    setLastPopulatedFieldsCount(extracted.stats.extractedCount);
    setTimeout(() => setLastPopulatedFieldsCount(0), 4000);
  };

  return (
    <div className="space-y-6">

      {/* Role-Specific Context & Actions Hero Card */}
      <div className={`p-5 rounded-3xl border shadow-sm transition-all relative overflow-hidden ${
        isReceptionist
          ? 'bg-gradient-to-r from-teal-50/90 via-slate-50 to-teal-50/50 border-teal-200/90'
          : isSuperUser
          ? 'bg-gradient-to-r from-purple-50/90 via-slate-50 to-purple-50/50 border-purple-200/90'
          : isAssistantAdmin
          ? 'bg-gradient-to-r from-indigo-50/90 via-slate-50 to-indigo-50/50 border-indigo-200/90'
          : 'bg-gradient-to-r from-emerald-50/90 via-slate-50 to-emerald-50/50 border-emerald-200/90'
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {isReceptionist ? (
                <span className="text-[10px] font-extrabold bg-teal-100/90 text-teal-800 border border-teal-300/80 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                  <UserCheck size={12} className="text-teal-700" /> RECEPTION DESK INTAKE
                </span>
              ) : isSuperUser ? (
                <span className="text-[10px] font-extrabold bg-purple-100/90 text-purple-800 border border-purple-300/80 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                  <Shield size={12} className="text-purple-700" /> SUPER USER ADMIN INTAKE
                </span>
              ) : isAssistantAdmin ? (
                <span className="text-[10px] font-extrabold bg-indigo-100/90 text-indigo-800 border border-indigo-300/80 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                  <ShieldCheck size={12} className="text-indigo-700" /> ASSISTANT ADMIN INTAKE
                </span>
              ) : (
                <span className="text-[10px] font-extrabold bg-emerald-100/90 text-emerald-800 border border-emerald-300/80 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                  <User size={12} className="text-emerald-700" /> PATIENT SELF-REGISTRATION
                </span>
              )}
              <span className="text-xs font-mono font-bold text-slate-500 bg-white/80 px-2 py-0.5 rounded-lg border border-slate-200">
                {patientData.registrationId || 'Draft Encounter'}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              {isReceptionist
                ? 'Clinical Patient Intake & Registration Dossier'
                : isSuperUser
                ? 'Executive Patient Intake & Master Dossier Creation'
                : isAssistantAdmin
                ? 'Staff Delegated Patient Intake & Encounters'
                : 'Patient Self-Registration & Intake Portal'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
              Complete the seven approved clinical intake sections manually, auto-populate via Groq AI document parsing, or dictate using the Voice Assistant.
            </p>
          </div>

          {/* Action Controls & Multi-Modal Triggers */}
          <div className="flex flex-wrap items-center gap-2">
            
            {/* Document Upload Button */}
            <button
              type="button"
              onClick={onOpenDocumentUpload}
              className="px-3.5 py-2 bg-white hover:bg-teal-50 text-teal-700 hover:text-teal-800 border border-teal-300/80 hover:border-teal-400 rounded-2xl text-xs font-bold flex items-center gap-1.5 shadow-sm hover:shadow transition-all active:scale-95 cursor-pointer"
            >
              <Upload size={14} className="text-teal-600" /> Upload Document (PDF/OCR)
            </button>

            {/* Voice Dictation Button */}
            <button
              type="button"
              onClick={onOpenVoiceAssistant}
              className="px-3.5 py-2 bg-white hover:bg-teal-50 text-teal-700 hover:text-teal-800 border border-teal-300/80 hover:border-teal-400 rounded-2xl text-xs font-bold flex items-center gap-1.5 shadow-sm hover:shadow transition-all active:scale-95 cursor-pointer"
            >
              <Mic size={14} className="text-teal-600" /> Voice Assistant
            </button>

            {/* Quick Demo Data */}
            <button
              type="button"
              onClick={handleQuickDemo}
              className="px-3.5 py-2 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white rounded-2xl text-xs font-bold shadow-md shadow-teal-600/20 hover:shadow-teal-600/30 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            >
              <Sparkles size={13} /> Quick Demo Data
            </button>

            {/* Reset Form */}
            <button
              type="button"
              onClick={onResetForm}
              title="Reset registration form"
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-white rounded-2xl border border-transparent hover:border-slate-200 transition-all cursor-pointer active:scale-95"
            >
              <RotateCcw size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Auto-fill notification alert */}
      {lastPopulatedFieldsCount > 0 && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center gap-3 text-xs text-emerald-900 shadow-sm animate-fadeIn">
          <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
            <CheckCircle2 size={18} />
          </div>
          <div>
            <span className="font-bold text-emerald-900 block">AI Clinical Extraction Complete</span>
            <span>
              Groq AI parsed and populated <strong>{lastPopulatedFieldsCount} fields</strong> across the seven intake sections. Please review and confirm each section below.
            </span>
          </div>
        </div>
      )}

      {/* ALL 7 SECTIONS CONTINUOUS VIEW */}
      <div className="space-y-6">
        <div id="section-personal">
          <StepDemographics
            data={patientData}
            onChange={onPatientChange}
            highlightSection={highlightSection}
          />
        </div>

        <div id="section-contact">
          <StepContactInfo
            data={patientData}
            onChange={onPatientChange}
            highlightSection={highlightSection}
          />
        </div>

        <div id="section-emergency">
          <StepEmergencyContact
            data={patientData}
            onChange={onPatientChange}
            highlightSection={highlightSection}
          />
        </div>

        <div id="section-medical">
          <StepMedicalHistory
            data={patientData}
            onChange={onPatientChange}
            highlightSection={highlightSection}
          />
        </div>

        <div id="section-insurance">
          <StepInsurance
            data={patientData}
            onChange={onPatientChange}
            highlightSection={highlightSection}
          />
        </div>

        <div id="section-appointment">
          <StepVisitVitals
            data={patientData}
            onChange={onPatientChange}
            highlightSection={highlightSection}
          />
        </div>

        <div id="section-system">
          <StepReviewConfirm
            data={patientData}
            onChange={onPatientChange}
            onSubmit={onSubmitRegistration}
            isSubmitting={isSubmitting}
            onActiveSectionChange={(sectionId) => setHighlightSection(sectionId)}
          />
        </div>
      </div>

    </div>
  );
}
