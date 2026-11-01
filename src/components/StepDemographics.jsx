import React from 'react';
import { User, Calendar, Droplet, Hash, Globe, Shield } from 'lucide-react';
import SpeechToTextButton from './SpeechToTextButton';
import { BLOOD_GROUPS, calculateAge } from '../types/patient';

export default function StepDemographics({
  data,
  onChange,
  highlightSection = ''
}) {
  const isHighlighted = highlightSection === 'demographics' || highlightSection === 'intro';

  const handleDobChange = (e) => {
    const dob = e.target.value;
    const age = calculateAge(dob);
    onChange({
      dateOfBirth: dob,
      age: age || data.age
    });
  };

  return (
    <div className={`p-6 sm:p-7 rounded-3xl bg-white border transition-all duration-300 space-y-6 ${
      isHighlighted
        ? 'ring-2 ring-teal-500 shadow-xl shadow-teal-500/10 border-teal-400 bg-teal-50/20'
        : 'border-slate-200/90 shadow-sm'
    }`}>
      
      {/* Section Title */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center font-black text-sm shadow-xs">
            1
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 tracking-tight">Demographic Information & Identification</h3>
            <p className="text-xs text-slate-500">Legal patient identity and demographic markers for hospital records</p>
          </div>
        </div>

        {data.registrationId && (
          <span className="text-xs font-mono font-bold bg-teal-50 text-teal-800 px-3 py-1 rounded-xl border border-teal-200/80 shadow-xs">
            {data.registrationId}
          </span>
        )}
      </div>

      {/* Name Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-slate-700">First Name *</label>
            <SpeechToTextButton
              fieldName="First Name"
              onTranscript={(text) => onChange({ firstName: text })}
            />
          </div>
          <input
            type="text"
            required
            placeholder="e.g. David"
            value={data.firstName || ''}
            onChange={(e) => onChange({ firstName: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-slate-700">Middle Name</label>
            <SpeechToTextButton
              fieldName="Middle Name"
              onTranscript={(text) => onChange({ middleName: text })}
            />
          </div>
          <input
            type="text"
            placeholder="e.g. Michael"
            value={data.middleName || ''}
            onChange={(e) => onChange({ middleName: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-slate-700">Last Name *</label>
            <SpeechToTextButton
              fieldName="Last Name"
              onTranscript={(text) => onChange({ lastName: text })}
            />
          </div>
          <input
            type="text"
            required
            placeholder="e.g. Miller"
            value={data.lastName || ''}
            onChange={(e) => onChange({ lastName: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
          />
        </div>
      </div>

      {/* DOB, Age, Gender, Blood Group */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Calendar size={13} className="text-slate-400" /> Date of Birth *
            </label>
            <SpeechToTextButton
              fieldName="Date of Birth"
              onTranscript={(text) => {
                // Try parse
                onChange({ dateOfBirth: text });
              }}
            />
          </div>
          <input
            type="date"
            value={data.dateOfBirth || ''}
            onChange={handleDobChange}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1">Age (Years)</label>
          <input
            type="number"
            min="0"
            max="125"
            placeholder="Auto or enter"
            value={data.age || ''}
            onChange={(e) => onChange({ age: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1">Gender *</label>
          <select
            value={data.gender || ''}
            onChange={(e) => onChange({ gender: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
          >
            <option value="">Select Gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Non-Binary">Non-Binary</option>
            <option value="Other">Other / Prefer not to say</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1 mb-1">
            <Droplet size={13} className="text-rose-500" /> Blood Group
          </label>
          <select
            value={data.bloodGroup || 'Unknown'}
            onChange={(e) => onChange({ bloodGroup: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-rose-700 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all"
          >
            {BLOOD_GROUPS.map((bg) => (
              <option key={bg} value={bg}>{bg}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Marital Status, National ID, Language */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1">Marital Status</label>
          <select
            value={data.maritalStatus || ''}
            onChange={(e) => onChange({ maritalStatus: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
          >
            <option value="">Select Status</option>
            <option value="Single">Single</option>
            <option value="Married">Married</option>
            <option value="Divorced">Divorced</option>
            <option value="Widowed">Widowed</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Shield size={13} className="text-slate-400" /> National ID / SSN
            </label>
            <SpeechToTextButton
              fieldName="National ID"
              onTranscript={(text) => onChange({ nationalId: text })}
            />
          </div>
          <input
            type="text"
            placeholder="e.g. 123-45-6789"
            value={data.nationalId || ''}
            onChange={(e) => onChange({ nationalId: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1">Preferred Language</label>
          <input
            type="text"
            placeholder="e.g. English, Spanish"
            value={data.preferredLanguage || 'English'}
            onChange={(e) => onChange({ preferredLanguage: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
          />
        </div>
      </div>

    </div>
  );
}

