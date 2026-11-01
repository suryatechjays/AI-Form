import React from 'react';
import { CheckCircle2, ShieldCheck, FileText, AlertTriangle, User, Heart, Lock, Volume2 } from 'lucide-react';
import TTSVerificationBar from './TTSVerificationBar';
import SignaturePad from './SignaturePad';

export default function StepReviewConfirm({
  data,
  onChange,
  onSubmit,
  isSubmitting,
  onActiveSectionChange
}) {
  const patientFullName = `${data.firstName || ''} ${data.middleName ? data.middleName + ' ' : ''}${data.lastName || ''}`.trim() || 'Patient Name Pending';

  return (
    <div className="space-y-6">
      
      {/* TEXT-TO-SPEECH VERIFICATION BAR */}
      <TTSVerificationBar
        patientData={data}
        onActiveSectionChange={onActiveSectionChange}
        onConfirmVerification={() => {
          onChange({ patientConsent: true, hipaaAcknowledged: true });
        }}
      />

      {/* COMPREHENSIVE CLINICAL DOSSIER PREVIEW */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-7 shadow-sm space-y-6">
        
        {/* Header of review */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-4 gap-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
              <span className="text-xs font-black text-teal-700 uppercase tracking-wider">Section 7: Review & Final Confirmation</span>
            </div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight">{patientFullName}</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono bg-teal-50 border border-teal-200 text-teal-800 px-3 py-1 rounded-xl font-bold shadow-xs">
              {data.registrationId || 'AEGIS-2026'}
            </span>
            <span className="text-xs bg-slate-100 text-slate-600 px-3 py-1 rounded-xl font-semibold border border-slate-200">
              Dept: {data.department || 'General Medicine'}
            </span>
          </div>
        </div>

        {/* SECTION 7: SYSTEM-GENERATED METADATA CARD */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-950 via-slate-900 to-teal-950 text-white rounded-2xl shadow-md border border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-800/80 pb-3 gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-300 flex items-center gap-2">
              <FileText size={15} className="text-teal-400" /> 7. System-Generated Information & Identifiers
            </span>
            <span className="text-[10px] bg-teal-500/20 text-teal-200 border border-teal-400/40 px-2.5 py-0.5 rounded-full font-mono font-bold">
              Status: DRAFT / READY FOR COMPILATION
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-1">
            <div className="flex flex-col items-center justify-center text-center p-4 rounded-xl bg-slate-900/80 border border-slate-800/90 shadow-inner">
              <span className="text-[11px] text-teal-300/80 block font-semibold uppercase tracking-wider mb-1.5">
                System Registration ID
              </span>
              <span className="font-mono font-bold text-white text-sm tracking-tight">
                {data.registrationId || 'AEGIS-2026-PENDING'}
              </span>
            </div>

            <div className="flex flex-col items-center justify-center text-center p-4 rounded-xl bg-slate-900/80 border border-slate-800/90 shadow-inner">
              <span className="text-[11px] text-teal-300/80 block font-semibold uppercase tracking-wider mb-1.5">
                Medical Record Number (MRN)
              </span>
              <span className="font-mono font-bold text-white text-sm tracking-tight">
                {data.mrn || 'MRN-ASSIGNED-ON-SUBMIT'}
              </span>
            </div>

            <div className="flex flex-col items-center justify-center text-center p-4 rounded-xl bg-slate-900/80 border border-slate-800/90 shadow-inner">
              <span className="text-[11px] text-teal-300/80 block font-semibold uppercase tracking-wider mb-1.5">
                Intake Date & Time
              </span>
              <span className="font-semibold text-white text-sm tracking-tight">
                {data.registrationDate || new Date().toISOString().split('T')[0]} {data.registrationTime || ''}
              </span>
            </div>
          </div>
        </div>

        {/* Allergy Alert Box */}
        {data.hasAllergies && data.allergies && data.allergies.length > 0 ? (
          <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-xl flex items-start gap-3 text-xs text-rose-900">
            <AlertTriangle size={18} className="text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold uppercase tracking-wider text-rose-700 block">Critical Allergy Alert:</span>
              <p className="mt-0.5 font-semibold">
                {data.allergies.map(a => `${a.allergen} (${a.reaction || 'Adverse Reaction'})`).join(' • ')}
              </p>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800">
            <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
            <span><strong>Allergy Status:</strong> No Known Drug Allergies (NKDA) reported.</span>
          </div>
        )}

        {/* Grid of Key Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          
          {/* Box 1: Demographics */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <span className="font-bold text-slate-500 uppercase tracking-wider block text-[10px]">1. Demographics</span>
            <div className="grid grid-cols-2 gap-2 text-slate-800">
              <div><span className="text-slate-400">DOB (Age):</span> <span className="font-semibold">{data.dateOfBirth || 'N/A'} ({data.age ? data.age + ' yrs' : ''})</span></div>
              <div><span className="text-slate-400">Gender:</span> <span className="font-semibold">{data.gender || 'N/A'}</span></div>
              <div><span className="text-slate-400">Blood Group:</span> <span className="font-bold text-rose-600">{data.bloodGroup || 'Unknown'}</span></div>
              <div><span className="text-slate-400">Marital Status:</span> <span className="font-semibold">{data.maritalStatus || 'N/A'}</span></div>
            </div>
          </div>

          {/* Box 2: Contact & Emergency */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <span className="font-bold text-slate-500 uppercase tracking-wider block text-[10px]">2. Contact & Emergency</span>
            <div className="space-y-1 text-slate-800">
              <div><span className="text-slate-400">Phone:</span> <span className="font-semibold">{data.phone || 'N/A'}</span></div>
              <div><span className="text-slate-400">Address:</span> <span className="font-semibold">{[data.addressLine1, data.city, data.state, data.postalCode].filter(Boolean).join(', ') || 'N/A'}</span></div>
              <div><span className="text-slate-400">Emergency ICE:</span> <span className="font-bold text-teal-800">{data.emergencyContactName ? `${data.emergencyContactName} (${data.emergencyContactRelation}) - ${data.emergencyContactPhone}` : 'N/A'}</span></div>
            </div>
          </div>

          {/* Box 3: Insurance */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <span className="font-bold text-slate-500 uppercase tracking-wider block text-[10px]">3. Health Insurance</span>
            <div className="space-y-1 text-slate-800">
              <div><span className="text-slate-400">Payer:</span> <span className="font-semibold">{data.hasInsurance ? (data.insuranceProvider || 'Commercial Plan') : 'Self-Pay / None'}</span></div>
              {data.hasInsurance && (
                <>
                  <div><span className="text-slate-400">Policy #:</span> <span className="font-semibold font-mono">{data.policyNumber || 'N/A'}</span></div>
                  <div><span className="text-slate-400">Group #:</span> <span className="font-semibold font-mono">{data.groupNumber || 'N/A'}</span></div>
                </>
              )}
            </div>
          </div>

          {/* Box 4: Clinical History */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <span className="font-bold text-slate-500 uppercase tracking-wider block text-[10px]">4. Clinical Conditions & Meds</span>
            <div className="space-y-1 text-slate-800">
              <div><span className="text-slate-400">Conditions:</span> <span className="font-semibold">{data.chronicConditions?.length ? data.chronicConditions.join(', ') : 'None'}</span></div>
              <div><span className="text-slate-400">Active Rx:</span> <span className="font-semibold">{data.currentMedications?.length ? data.currentMedications.map(m => `${m.name} ${m.dosage}`).join('; ') : 'None'}</span></div>
              <div><span className="text-slate-400">Chief Complaint:</span> <span className="font-semibold text-teal-900">{data.chiefComplaint || 'Consultation'}</span></div>
            </div>
          </div>

        </div>

        {/* LEGAL CONSENT & DIGITAL SIGNATURE */}
        <div className="border-t border-slate-100 pt-5 space-y-4">
          <div className="flex items-center gap-2 text-slate-900">
            <ShieldCheck size={18} className="text-teal-600" />
            <h4 className="text-sm font-bold">Patient Authorization & Electronic Consent</h4>
          </div>

          {/* Checkboxes */}
          <div className="space-y-2.5">
            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-700">
              <input
                type="checkbox"
                required
                checked={data.patientConsent === true}
                onChange={(e) => onChange({ patientConsent: e.target.checked })}
                className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
              />
              <span>
                I certify that all details entered manually, parsed from uploaded medical records, or spoken via voice assistant are complete, correct, and verified by me.
              </span>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-700">
              <input
                type="checkbox"
                required
                checked={data.hipaaAcknowledged === true}
                onChange={(e) => onChange({ hipaaAcknowledged: e.target.checked })}
                className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
              />
              <span>
                I acknowledge the HIPAA Notice of Privacy Practices and consent to treatment and diagnostic review by AI Form System.
              </span>
            </label>
          </div>

          {/* Signature Canvas */}
          <div className="pt-2">
            <label className="block text-xs font-bold text-slate-700 mb-2">
              Patient Digital Signature (Draw or Type) *
            </label>
            <SignaturePad
              patientName={patientFullName}
              onChange={({ dataUrl, typedSignature }) => {
                onChange({
                  signatureDataUrl: dataUrl,
                  typedSignature
                });
              }}
            />
          </div>
        </div>

      </div>

      {/* FINAL SUBMIT BUTTON */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          disabled={isSubmitting || !data.patientConsent}
          onClick={onSubmit}
          className={`px-8 py-3.5 rounded-2xl font-bold text-sm shadow-xl flex items-center gap-2.5 transition-all transform active:scale-95 ${
            !isSubmitting && data.patientConsent
              ? 'bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white shadow-teal-600/30'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
          }`}
        >
          {isSubmitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Generating Official Hospital PDF...</span>
            </>
          ) : (
            <>
              <FileText size={18} />
              <span>Confirm Registration & Generate Official PDF</span>
            </>
          )}
        </button>
      </div>

    </div>
  );
}

