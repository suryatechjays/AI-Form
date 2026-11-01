import React, { useState } from 'react';
import { AlertOctagon, Plus, Trash2, Pill, Activity, Scissors } from 'lucide-react';
import SpeechToTextButton from './SpeechToTextButton';
import { COMMON_ALLERGIES, COMMON_CONDITIONS } from '../types/patient';

export default function StepMedicalHistory({
  data,
  onChange,
  highlightSection = ''
}) {
  const isHighlighted = highlightSection === 'clinical';

  const [customAllergen, setCustomAllergen] = useState('');
  const [customSeverity, setCustomSeverity] = useState('Moderate');
  const [customReaction, setCustomReaction] = useState('Hives / Rash');

  // Helper to toggle NKDA
  const handleToggleNKDA = (isNKDA) => {
    if (isNKDA) {
      onChange({
        hasAllergies: false,
        allergies: []
      });
    } else {
      onChange({
        hasAllergies: true
      });
    }
  };

  // Add allergen
  const handleAddAllergen = (allergenName, severity = 'Moderate', reaction = 'Hives / Rash') => {
    if (!allergenName || !allergenName.trim()) return;
    const exists = data.allergies?.some(a => a.allergen.toLowerCase() === allergenName.toLowerCase());
    if (exists) return;

    const updated = [...(data.allergies || []), {
      allergen: allergenName.trim(),
      severity,
      reaction
    }];

    onChange({
      hasAllergies: true,
      allergies: updated
    });
  };

  // Remove allergen
  const handleRemoveAllergen = (index) => {
    const updated = data.allergies.filter((_, i) => i !== index);
    onChange({
      allergies: updated,
      hasAllergies: updated.length > 0
    });
  };

  // Toggle chronic condition
  const handleToggleCondition = (cond) => {
    const current = data.chronicConditions || [];
    let updated;
    if (current.includes(cond)) {
      updated = current.filter(c => c !== cond);
    } else {
      updated = [...current, cond];
    }
    onChange({ chronicConditions: updated });
  };

  // Medication handlers
  const handleAddMedication = () => {
    const updated = [...(data.currentMedications || []), { name: '', dosage: '', frequency: 'Once daily' }];
    onChange({ currentMedications: updated });
  };

  const handleUpdateMedication = (index, field, val) => {
    const updated = [...(data.currentMedications || [])];
    updated[index] = { ...updated[index], [field]: val };
    onChange({ currentMedications: updated });
  };

  const handleRemoveMedication = (index) => {
    const updated = data.currentMedications.filter((_, i) => i !== index);
    onChange({ currentMedications: updated });
  };

  return (
    <div className={`p-6 sm:p-7 rounded-3xl bg-white border transition-all duration-300 space-y-6 ${isHighlighted
        ? 'ring-2 ring-teal-500 shadow-xl shadow-teal-500/10 border-teal-400 bg-teal-50/20'
        : 'border-slate-200/90 shadow-sm'
      }`}>

      {/* Section Title */}
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center font-black text-sm shadow-xs">
          4
        </div>
        <div>
          <h3 className="text-base font-black text-slate-900 tracking-tight">Clinical History, Allergies & Active Medications</h3>
          <p className="text-xs text-slate-500">Critical safety alerts, documented drug sensitivities, and routine prescription regimens</p>
        </div>
      </div>

      {/* ALLERGY SAFETY MODULE */}
      <div className="p-4 bg-rose-50/60 border border-rose-200 rounded-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-rose-900">
            <AlertOctagon size={18} className="text-rose-600" />
            <h4 className="text-xs font-bold uppercase tracking-wider">Allergies & Adverse Reactions Alert</h4>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold">
            <button
              type="button"
              onClick={() => handleToggleNKDA(true)}
              className={`px-3 py-1 rounded-lg border transition-all ${!data.hasAllergies
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
            >
              ✓ NKDA (No Known Drug Allergies)
            </button>
            <button
              type="button"
              onClick={() => handleToggleNKDA(false)}
              className={`px-3 py-1 rounded-lg border transition-all ${data.hasAllergies
                  ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
            >
              ⚠ Patient Has Known Allergies
            </button>
          </div>
        </div>

        {data.hasAllergies ? (
          <div className="space-y-3">
            {/* Quick add chips */}
            <div>
              <span className="text-[11px] font-bold text-rose-800 block mb-1.5">Common Allergens (click to add):</span>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_ALLERGIES.map((allergen) => {
                  const isAdded = data.allergies?.some(a => a.allergen.toLowerCase() === allergen.toLowerCase());
                  return (
                    <button
                      key={allergen}
                      type="button"
                      disabled={isAdded}
                      onClick={() => handleAddAllergen(allergen, 'Severe', 'Anaphylaxis / Hives')}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${isAdded
                          ? 'bg-rose-200 text-rose-800 opacity-60 cursor-not-allowed'
                          : 'bg-white border border-rose-200 text-rose-800 hover:bg-rose-100'
                        }`}
                    >
                      + {allergen}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom add row */}
            <div className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-xl border border-rose-200">
              <input
                type="text"
                placeholder="Custom allergen (e.g. Iodine, Latex)..."
                value={customAllergen}
                onChange={(e) => setCustomAllergen(e.target.value)}
                className="flex-1 min-w-[160px] px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-rose-500"
              />
              <select
                value={customSeverity}
                onChange={(e) => setCustomSeverity(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none"
              >
                <option value="Severe">Severe (Anaphylaxis)</option>
                <option value="Moderate">Moderate (Hives/Swelling)</option>
                <option value="Mild">Mild (Itch/GI upset)</option>
              </select>
              <input
                type="text"
                placeholder="Reaction description..."
                value={customReaction}
                onChange={(e) => setCustomReaction(e.target.value)}
                className="w-40 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (customAllergen.trim()) {
                    handleAddAllergen(customAllergen, customSeverity, customReaction);
                    setCustomAllergen('');
                  }
                }}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm"
              >
                <Plus size={14} /> Add
              </button>
            </div>

            {/* Configured Allergies List */}
            {data.allergies && data.allergies.length > 0 ? (
              <div className="space-y-1.5">
                {data.allergies.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 bg-white border border-rose-200 rounded-xl text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.severity === 'Severe'
                          ? 'bg-rose-600 text-white'
                          : item.severity === 'Moderate'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                        {item.severity}
                      </span>
                      <span className="font-bold text-slate-900">{item.allergen}</span>
                      <span className="text-slate-400">•</span>
                      <span className="text-slate-600 italic">Reaction: {item.reaction}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAllergen(idx)}
                      className="text-slate-400 hover:text-rose-600 p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-rose-700 italic">No specific allergies added yet. Please choose from above or type custom allergen.</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-emerald-800 font-semibold bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
            ✓ Patient confirmed No Known Drug Allergies (NKDA).
          </p>
        )}
      </div>

      {/* CHRONIC CONDITIONS */}
      <div className="space-y-3">
        <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <Activity size={14} className="text-teal-600" />
          Chronic Medical Conditions (Select all that apply):
        </label>
        <div className="flex flex-wrap gap-2">
          {COMMON_CONDITIONS.map((cond) => {
            const isChecked = data.chronicConditions?.includes(cond);
            return (
              <button
                key={cond}
                type="button"
                onClick={() => handleToggleCondition(cond)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${isChecked
                    ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
              >
                {isChecked ? '✓ ' : '+ '} {cond}
              </button>
            );
          })}
        </div>
      </div>

      {/* ROUTINE MEDICATIONS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Pill size={14} className="text-teal-600" />
            Current Active Medications & Dosages:
          </label>
          <button
            type="button"
            onClick={handleAddMedication}
            className="px-3 py-1 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-lg text-xs font-bold flex items-center gap-1"
          >
            <Plus size={13} /> Add Medication
          </button>
        </div>

        {data.currentMedications && data.currentMedications.length > 0 ? (
          <div className="space-y-2">
            {data.currentMedications.map((med, index) => (
              <div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 items-center">
                <div className="sm:col-span-5">
                  <input
                    type="text"
                    placeholder="Medication name (e.g. Metformin)"
                    value={med.name || ''}
                    onChange={(e) => handleUpdateMedication(index, 'name', e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none font-medium"
                  />
                </div>
                <div className="sm:col-span-3">
                  <input
                    type="text"
                    placeholder="Dosage (e.g. 500mg)"
                    value={med.dosage || ''}
                    onChange={(e) => handleUpdateMedication(index, 'dosage', e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none"
                  />
                </div>
                <div className="sm:col-span-3">
                  <input
                    type="text"
                    placeholder="Frequency (e.g. Twice daily)"
                    value={med.frequency || ''}
                    onChange={(e) => handleUpdateMedication(index, 'frequency', e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none"
                  />
                </div>
                <div className="sm:col-span-1 text-center">
                  <button
                    type="button"
                    onClick={() => handleRemoveMedication(index)}
                    className="text-slate-400 hover:text-rose-600 p-1"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl border border-slate-200">
            No active prescription medications recorded. Click "Add Medication" if currently taking any drugs.
          </p>
        )}
      </div>

      {/* PAST SURGERIES & NOTES */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Scissors size={14} className="text-slate-400" />
            Past Surgeries & Significant Medical History
          </label>
          <SpeechToTextButton
            fieldName="Past Surgeries"
            onTranscript={(text) => onChange({ pastSurgeries: text })}
          />
        </div>
        <textarea
          rows={2}
          placeholder="e.g. Appendectomy in 2018, Right Knee Arthroscopy in 2021..."
          value={data.pastSurgeries || ''}
          onChange={(e) => onChange({ pastSurgeries: e.target.value })}
          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all font-medium"
        />
      </div>

    </div>
  );
}

