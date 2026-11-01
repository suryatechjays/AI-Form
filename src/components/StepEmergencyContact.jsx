import React from 'react';
import { Heart, AlertCircle, Phone, UserCheck } from 'lucide-react';
import SpeechToTextButton from './SpeechToTextButton';

export default function StepEmergencyContact({
  data,
  onChange,
  highlightSection = ''
}) {
  const isHighlighted = highlightSection === 'emergency';
  const RELATIONS = ['Parent', 'Spouse', 'Child', 'Sibling', 'Guardian', 'Relative', 'Friend', 'Other'];
  const isMinor = data.age && parseInt(data.age, 10) < 18;

  return (
    <div className={`p-6 sm:p-7 rounded-3xl bg-white border transition-all duration-300 space-y-6 ${
      isHighlighted
        ? 'ring-2 ring-teal-500 shadow-xl shadow-teal-500/10 border-teal-400 bg-teal-50/20'
        : 'border-slate-200/90 shadow-sm'
    }`}>
      
      {/* Section Title */}
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center font-black text-sm shadow-xs">
          3
        </div>
        <div>
          <h3 className="text-base font-black text-slate-900 tracking-tight">Section 3: Emergency Contact Information</h3>
          <p className="text-xs text-slate-500">Designated primary and alternate emergency contacts for clinical escalations</p>
        </div>
      </div>

      {isMinor && (
        <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl flex items-center gap-2.5 text-xs text-amber-900">
          <AlertCircle size={16} className="text-amber-600 flex-shrink-0" />
          <span>
            <strong>Minor Patient Alert:</strong> Patient age is under 18 ({data.age || '<18'}). A designated Parent, Guardian, or Adult Emergency Contact is mandatory under HIPAA intake guidelines.
          </span>
        </div>
      )}

      {/* Emergency Contact Form */}
      <div className="bg-amber-50/40 border border-amber-200/80 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-amber-900 border-b border-amber-200/60 pb-3">
          <Heart size={16} className="text-rose-500 fill-rose-500" />
          <h4 className="text-xs font-bold uppercase tracking-wider">Primary Emergency Contact</h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700">Contact Person Full Name *</label>
              <SpeechToTextButton
                fieldName="Emergency Contact Name"
                onTranscript={(text) => onChange({ emergencyContactName: text })}
              />
            </div>
            <input
              type="text"
              required
              placeholder="e.g. Jennifer Miller"
              value={data.emergencyContactName || ''}
              onChange={(e) => onChange({ emergencyContactName: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Relationship to Patient *</label>
            <select
              value={data.emergencyContactRelation || ''}
              onChange={(e) => onChange({ emergencyContactRelation: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
            >
              <option value="">Select Relation</option>
              {RELATIONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700">Emergency Phone Number *</label>
              <SpeechToTextButton
                fieldName="Emergency Phone"
                onTranscript={(text) => onChange({ emergencyContactPhone: text })}
              />
            </div>
            <input
              type="tel"
              required
              placeholder="e.g. +1 (415) 555-9924"
              value={data.emergencyContactPhone || ''}
              onChange={(e) => onChange({ emergencyContactPhone: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
            />
          </div>
        </div>

        {/* Alternate Emergency Phone */}
        <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700">Alternate / Work Phone Number (Optional)</label>
              <SpeechToTextButton
                fieldName="Alternate Phone"
                onTranscript={(text) => onChange({ emergencyContactAltPhone: text })}
              />
            </div>
            <input
              type="tel"
              placeholder="e.g. +1 (415) 555-9925"
              value={data.emergencyContactAltPhone || ''}
              onChange={(e) => onChange({ emergencyContactAltPhone: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Contact Authorization & Notifications</label>
            <div className="flex items-center gap-2 mt-2.5 text-xs text-slate-600 font-medium">
              <UserCheck size={16} className="text-teal-600" />
              <span>Authorized to receive medical updates in case of emergency</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

