import React from 'react';
import { Stethoscope, Activity, Heart, Thermometer, Wind, Scale, AlertCircle } from 'lucide-react';
import SpeechToTextButton from './SpeechToTextButton';
import { DEPARTMENTS, calculateBMI } from '../types/patient';

export default function StepVisitVitals({
  data,
  onChange,
  highlightSection = ''
}) {
  const isHighlighted = highlightSection === 'visit';

  const vitals = data.vitals || {};

  const handleVitalChange = (field, val) => {
    const updatedVitals = { ...vitals, [field]: val };
    
    // Auto-calculate BMI if height and weight changed
    if (field === 'heightCm' || field === 'weightKg') {
      const h = field === 'heightCm' ? val : vitals.heightCm;
      const w = field === 'weightKg' ? val : vitals.weightKg;
      updatedVitals.bmi = calculateBMI(h, w);
    }

    onChange({ vitals: updatedVitals });
  };

  const getBMICategory = (bmi) => {
    const b = parseFloat(bmi);
    if (!b || isNaN(b)) return null;
    if (b < 18.5) return { label: 'Underweight', color: 'text-amber-600 bg-amber-50 border-amber-200' };
    if (b < 25.0) return { label: 'Normal / Healthy Weight', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
    if (b < 30.0) return { label: 'Overweight', color: 'text-amber-700 bg-amber-50 border-amber-200' };
    return { label: 'Obese', color: 'text-rose-700 bg-rose-50 border-rose-200' };
  };

  const bmiCategory = getBMICategory(vitals.bmi);

  return (
    <div className={`p-6 sm:p-7 rounded-3xl bg-white border transition-all duration-300 space-y-6 ${
      isHighlighted
        ? 'ring-2 ring-teal-500 shadow-xl shadow-teal-500/10 border-teal-400 bg-teal-50/20'
        : 'border-slate-200/90 shadow-sm'
    }`}>
      
      {/* Section Title */}
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center font-black text-sm shadow-xs">
          6
        </div>
        <div>
          <h3 className="text-base font-black text-slate-900 tracking-tight">Section 6: Visit Reason & Pre-Admission Vitals</h3>
          <p className="text-xs text-slate-500">Clinical department, presenting symptoms, and baseline physiological measurements</p>
        </div>
      </div>

      {/* Department & Physician */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1">
            <Stethoscope size={14} className="text-teal-600" />
            Admitting Clinical Department *
          </label>
          <select
            value={data.department || 'General Medicine'}
            onChange={(e) => onChange({ department: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-semibold text-slate-900"
          >
            {DEPARTMENTS.map((dept) => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-slate-700">Attending / Consulting Physician</label>
            <SpeechToTextButton
              fieldName="Consulting Physician"
              onTranscript={(text) => onChange({ consultingDoctor: text })}
            />
          </div>
          <input
            type="text"
            placeholder="e.g. Dr. Sarah Jenkins, MD"
            value={data.consultingDoctor || ''}
            onChange={(e) => onChange({ consultingDoctor: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
          />
        </div>
      </div>

      {/* Chief Complaint & Duration */}
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-slate-700">Chief Complaint / Presenting Symptoms *</label>
            <SpeechToTextButton
              fieldName="Chief Complaint"
              onTranscript={(text) => onChange({ chiefComplaint: text })}
            />
          </div>
          <textarea
            rows={2}
            required
            placeholder="Describe reason for visit (e.g. Acute lower back pain radiating to left leg, fever for 3 days)..."
            value={data.chiefComplaint || ''}
            onChange={(e) => onChange({ chiefComplaint: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-slate-700">Symptom Duration / Onset</label>
            <SpeechToTextButton
              fieldName="Symptom Duration"
              onTranscript={(text) => onChange({ symptomDuration: text })}
            />
          </div>
          <input
            type="text"
            placeholder="e.g. 4 days, 2 weeks, sudden onset today"
            value={data.symptomDuration || ''}
            onChange={(e) => onChange({ symptomDuration: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
          />
        </div>
      </div>

      {/* CLINICAL VITALS GRID */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-800">
            <Activity size={16} className="text-teal-600" />
            <h4 className="text-xs font-bold uppercase tracking-wider">Baseline Physiological Vitals</h4>
          </div>
          <span className="text-[11px] text-slate-500">Optional or pre-triage recorded</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          
          {/* BP */}
          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">Blood Pressure (mmHg)</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                placeholder="Systolic (120)"
                value={vitals.bloodPressureSystolic || ''}
                onChange={(e) => handleVitalChange('bloodPressureSystolic', e.target.value)}
                className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-center"
              />
              <span className="text-slate-400 font-bold">/</span>
              <input
                type="number"
                placeholder="Diastolic (80)"
                value={vitals.bloodPressureDiastolic || ''}
                onChange={(e) => handleVitalChange('bloodPressureDiastolic', e.target.value)}
                className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-center"
              />
            </div>
          </div>

          {/* Heart Rate */}
          <div>
            <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1 mb-1">
              <Heart size={12} className="text-rose-500" /> Pulse (bpm)
            </label>
            <input
              type="number"
              placeholder="e.g. 72"
              value={vitals.heartRate || ''}
              onChange={(e) => handleVitalChange('heartRate', e.target.value)}
              className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-center"
            />
          </div>

          {/* Temperature */}
          <div>
            <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1 mb-1">
              <Thermometer size={12} className="text-amber-500" /> Temp (°F)
            </label>
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 98.6"
              value={vitals.temperature || ''}
              onChange={(e) => handleVitalChange('temperature', e.target.value)}
              className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-center"
            />
          </div>

          {/* SpO2 */}
          <div>
            <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1 mb-1">
              <Wind size={12} className="text-teal-500" /> SpO2 Oxygen (%)
            </label>
            <input
              type="number"
              min="70"
              max="100"
              placeholder="e.g. 99"
              value={vitals.oxygenSaturation || ''}
              onChange={(e) => handleVitalChange('oxygenSaturation', e.target.value)}
              className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-center"
            />
          </div>
        </div>

        {/* Height, Weight, BMI */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-slate-200 pt-3 items-center">
          <div>
            <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1 mb-1">
              <Scale size={12} className="text-slate-400" /> Height (cm)
            </label>
            <input
              type="number"
              placeholder="e.g. 175"
              value={vitals.heightCm || ''}
              onChange={(e) => handleVitalChange('heightCm', e.target.value)}
              className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-center"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1 mb-1">
              <Scale size={12} className="text-slate-400" /> Weight (kg)
            </label>
            <input
              type="number"
              placeholder="e.g. 70"
              value={vitals.weightKg || ''}
              onChange={(e) => handleVitalChange('weightKg', e.target.value)}
              className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-center"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">Body Mass Index (BMI)</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-teal-800 text-center">
                {vitals.bmi ? `${vitals.bmi} kg/m²` : '--'}
              </div>
              {bmiCategory && (
                <span className={`px-2 py-1 rounded-lg border text-[10px] font-bold ${bmiCategory.color}`}>
                  {bmiCategory.label}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

