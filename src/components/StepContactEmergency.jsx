import React from 'react';
import { Phone, Mail, MapPin, AlertCircle, Heart } from 'lucide-react';
import SpeechToTextButton from './SpeechToTextButton';

export default function StepContactEmergency({
  data,
  onChange,
  highlightSection = ''
}) {
  const isHighlighted = highlightSection === 'contact';

  const RELATIONS = ['Spouse', 'Parent', 'Child', 'Sibling', 'Guardian', 'Friend', 'Partner', 'Other'];

  return (
    <div className={`p-6 rounded-2xl bg-white border transition-all duration-300 space-y-6 ${
      isHighlighted
        ? 'ring-2 ring-teal-500 shadow-lg shadow-teal-500/10 border-teal-400 bg-teal-50/20'
        : 'border-slate-200 shadow-sm'
    }`}>
      
      {/* Section Title */}
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center font-bold">
          2
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900">Contact & Emergency Next of Kin</h3>
          <p className="text-xs text-slate-500">Phone numbers, residential address, and primary emergency contact</p>
        </div>
      </div>

      {/* Primary Phone & Email */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Phone size={13} className="text-slate-400" /> Primary Phone Number *
            </label>
            <SpeechToTextButton
              fieldName="Phone Number"
              onTranscript={(text) => onChange({ phone: text })}
            />
          </div>
          <input
            type="tel"
            required
            placeholder="e.g. (415) 555-0199"
            value={data.phone || ''}
            onChange={(e) => onChange({ phone: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Mail size={13} className="text-slate-400" /> Email Address
            </label>
            <SpeechToTextButton
              fieldName="Email Address"
              onTranscript={(text) => onChange({ email: text })}
            />
          </div>
          <input
            type="email"
            placeholder="e.g. patient@example.com"
            value={data.email || ''}
            onChange={(e) => onChange({ email: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
          />
        </div>
      </div>

      {/* Address Line 1 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
            <MapPin size={13} className="text-slate-400" /> Street Address *
          </label>
          <SpeechToTextButton
            fieldName="Street Address"
            onTranscript={(text) => onChange({ addressLine1: text })}
          />
        </div>
        <input
          type="text"
          placeholder="e.g. 1420 Franklin Street, Apt 4B"
          value={data.addressLine1 || ''}
          onChange={(e) => onChange({ addressLine1: e.target.value })}
          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
        />
      </div>

      {/* City, State, Zip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-slate-700">City *</label>
            <SpeechToTextButton
              fieldName="City"
              onTranscript={(text) => onChange({ city: text })}
            />
          </div>
          <input
            type="text"
            placeholder="e.g. San Francisco"
            value={data.city || ''}
            onChange={(e) => onChange({ city: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-slate-700">State / Region *</label>
            <SpeechToTextButton
              fieldName="State"
              onTranscript={(text) => onChange({ state: text })}
            />
          </div>
          <input
            type="text"
            placeholder="e.g. CA"
            value={data.state || ''}
            onChange={(e) => onChange({ state: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-slate-700">Postal / Zip Code *</label>
            <SpeechToTextButton
              fieldName="Postal Code"
              onTranscript={(text) => onChange({ postalCode: text })}
            />
          </div>
          <input
            type="text"
            placeholder="e.g. 94109"
            value={data.postalCode || ''}
            onChange={(e) => onChange({ postalCode: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
          />
        </div>
      </div>

      {/* Emergency Contact Box */}
      <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2 text-amber-900">
          <Heart size={16} className="text-rose-500 fill-rose-500" />
          <h4 className="text-xs font-bold uppercase tracking-wider">Designated Emergency Contact</h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700">Contact Full Name *</label>
              <SpeechToTextButton
                fieldName="Emergency Contact Name"
                onTranscript={(text) => onChange({ emergencyContactName: text })}
              />
            </div>
            <input
              type="text"
              placeholder="e.g. Jennifer Miller"
              value={data.emergencyContactName || ''}
              onChange={(e) => onChange({ emergencyContactName: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Relationship *</label>
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
              placeholder="e.g. (415) 555-9924"
              value={data.emergencyContactPhone || ''}
              onChange={(e) => onChange({ emergencyContactPhone: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-white border border-amber-200 rounded-xl text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
            />
          </div>
        </div>
      </div>

    </div>
  );
}

