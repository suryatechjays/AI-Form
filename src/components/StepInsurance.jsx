import React from 'react';
import { ShieldCheck, CreditCard, UserCheck, AlertTriangle } from 'lucide-react';
import SpeechToTextButton from './SpeechToTextButton';

export default function StepInsurance({
  data,
  onChange,
  highlightSection = ''
}) {
  const isHighlighted = highlightSection === 'insurance';

  const COMMON_PROVIDERS = [
    'Blue Cross Blue Shield',
    'Aetna Health',
    'UnitedHealthcare',
    'Cigna Healthcare',
    'Humana',
    'Kaiser Permanente',
    'Medicare',
    'Medicaid',
    'Other / Private Payer'
  ];

  return (
    <div className={`p-6 sm:p-7 rounded-3xl bg-white border transition-all duration-300 space-y-6 ${
      isHighlighted
        ? 'ring-2 ring-teal-500 shadow-xl shadow-teal-500/10 border-teal-400 bg-teal-50/20'
        : 'border-slate-200/90 shadow-sm'
    }`}>
      
      {/* Section Title */}
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center font-black text-sm shadow-xs">
          5
        </div>
        <div>
          <h3 className="text-base font-black text-slate-900 tracking-tight">Section 5: Health Insurance & Billing Details</h3>
          <p className="text-xs text-slate-500">Coverage verification for direct claims processing and payment coordination</p>
        </div>
      </div>

      {/* Insurance Toggle */}
      <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
        <span className="text-xs font-bold text-slate-700">Insurance Coverage Status:</span>
        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
          <input
            type="radio"
            name="hasInsurance"
            checked={data.hasInsurance === true}
            onChange={() => onChange({ hasInsurance: true })}
            className="text-teal-600 focus:ring-teal-500"
          />
          Active Health Insurance
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
          <input
            type="radio"
            name="hasInsurance"
            checked={data.hasInsurance === false}
            onChange={() => onChange({ hasInsurance: false, insuranceProvider: '', policyNumber: '', groupNumber: '' })}
            className="text-teal-600 focus:ring-teal-500"
          />
          Self-Pay / No Insurance
        </label>
      </div>

      {data.hasInsurance ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">Insurance Provider *</label>
                <SpeechToTextButton
                  fieldName="Insurance Provider"
                  onTranscript={(text) => onChange({ insuranceProvider: text })}
                />
              </div>
              <input
                type="text"
                list="provider-list"
                placeholder="e.g. Blue Cross Blue Shield"
                value={data.insuranceProvider || ''}
                onChange={(e) => onChange({ insuranceProvider: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
              />
              <datalist id="provider-list">
                {COMMON_PROVIDERS.map(p => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">Policy / Member ID *</label>
                <SpeechToTextButton
                  fieldName="Policy Number"
                  onTranscript={(text) => onChange({ policyNumber: text })}
                />
              </div>
              <input
                type="text"
                placeholder="e.g. BCBS-99418204"
                value={data.policyNumber || ''}
                onChange={(e) => onChange({ policyNumber: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">Group Number</label>
                <SpeechToTextButton
                  fieldName="Group Number"
                  onTranscript={(text) => onChange({ groupNumber: text })}
                />
              </div>
              <input
                type="text"
                placeholder="e.g. GRP-88310"
                value={data.groupNumber || ''}
                onChange={(e) => onChange({ groupNumber: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">Policy Holder / Subscriber Name</label>
                <SpeechToTextButton
                  fieldName="Policy Holder Name"
                  onTranscript={(text) => onChange({ policyHolderName: text })}
                />
              </div>
              <input
                type="text"
                placeholder="e.g. Self or Name"
                value={data.policyHolderName || ''}
                onChange={(e) => onChange({ policyHolderName: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Relationship to Policy Holder</label>
              <select
                value={data.relationshipToPolicyHolder || 'Self'}
                onChange={(e) => onChange({ relationshipToPolicyHolder: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
              >
                <option value="Self">Self (Patient is Policy Holder)</option>
                <option value="Spouse">Spouse</option>
                <option value="Child">Child / Dependent</option>
                <option value="Parent">Parent / Guardian</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3 text-xs text-slate-600">
          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />
          <span>
            Patient has selected Self-Pay. Hospital financial counselors will provide a prompt payment cost estimate and assistance options at check-in.
          </span>
        </div>
      )}

    </div>
  );
}

