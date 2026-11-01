import React from 'react';
import { Phone, Mail, MapPin, Globe } from 'lucide-react';
import SpeechToTextButton from './SpeechToTextButton';

export default function StepContactInfo({
  data,
  onChange,
  highlightSection = ''
}) {
  const isHighlighted = highlightSection === 'contact';

  return (
    <div className={`p-6 sm:p-7 rounded-3xl bg-white border transition-all duration-300 space-y-6 ${isHighlighted
        ? 'ring-2 ring-teal-500 shadow-xl shadow-teal-500/10 border-teal-400 bg-teal-50/20'
        : 'border-slate-200/90 shadow-sm'
      }`}>

      {/* Section Title */}
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center font-black text-sm shadow-xs">
          2
        </div>
        <div>
          <h3 className="text-base font-black text-slate-900 tracking-tight">Section 2: Contact Information</h3>
          <p className="text-xs text-slate-500">Primary telephone, email, and residential mailing address</p>
        </div>
      </div>

      {/* Primary Phone & Email */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Phone size={13} className="text-slate-400" /> Primary Mobile / Phone Number *
            </label>
            <SpeechToTextButton
              fieldName="Phone Number"
              onTranscript={(text) => onChange({ phone: text })}
            />
          </div>
          <input
            type="tel"
            required
            placeholder="e.g. +1 (415) 555-0199"
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
            <MapPin size={13} className="text-slate-400" /> House Number & Street Address *
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

      {/* Address Line 2 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-bold text-slate-700">Address Line 2 (Apartment, Suite, Unit)</label>
          <SpeechToTextButton
            fieldName="Address Line 2"
            onTranscript={(text) => onChange({ addressLine2: text })}
          />
        </div>
        <input
          type="text"
          placeholder="e.g. Suite 300, Building B"
          value={data.addressLine2 || ''}
          onChange={(e) => onChange({ addressLine2: e.target.value })}
          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
        />
      </div>

      {/* City, State, Zip, Country */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
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
            <label className="text-xs font-bold text-slate-700">PIN / Postal Code *</label>
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

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Globe size={13} className="text-slate-400" /> Country
            </label>
          </div>
          <input
            type="text"
            placeholder="e.g. United States"
            value={data.country || 'United States'}
            onChange={(e) => onChange({ country: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
          />
        </div>
      </div>

    </div>
  );
}

