import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, Sparkles, X, ChevronRight, Eye, FileCheck, Copy } from 'lucide-react';
import { parseDocument } from '../services/pdfParser';
import { extractPatientInformation } from '../services/aiExtractor';
import { SAMPLE_DOCUMENTS } from '../data/sampleDocuments';
import { documentAPI, mapBackendExtractionToForm } from '../services/api';

/**
 * Sanitizes document text to ensure only actual extracted clinical document text
 * is shown to the user, stripping any internal engine/model/length diagnostics.
 */
function sanitizeExtractedDocumentText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/^\[(?:Engine|AEGIS Server Extraction Engine):[^\]]+\]\s*/gim, '')
    .replace(/^Length:\s*\d+\s*chars\s*/gim, '')
    .replace(/^Status:\s*[^\n]+\n?/gim, '')
    .replace(/^Model:\s*[^\n]+\n?/gim, '')
    .replace(/^Source:\s*[^\n]+\n?/gim, '')
    .trim();
}

export default function DocumentUploadModal({
  isOpen,
  onClose,
  onApplyFields,
  patientData = {},
  patientId = 1,
  registrationId = null
}) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ stage: '', percent: 0, message: '' });
  const [extractedResult, setExtractedResult] = useState(null);
  const [rawText, setRawText] = useState('');
  const [showRawText, setShowRawText] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [error, setError] = useState('');
  const [selectedFields, setSelectedFields] = useState({});

  const fileInputRef = useRef(null);

  /**
   * Helper to check if a field already has non-empty manual data entered in the form.
   * Used to guarantee manually entered or locked fields are preserved and never automatically overwritten.
   */
  const isFieldAlreadyEntered = (key) => {
    if (!patientData) return false;
    if (key.startsWith('vitals.') && patientData.vitals) {
      const subKey = key.split('.')[1];
      const val = patientData.vitals[subKey];
      return val !== undefined && val !== null && val !== '';
    }
    const val = patientData[key];
    if (val === undefined || val === null || val === '') return false;
    if (Array.isArray(val) && val.length === 0) return false;
    if (typeof val === 'object' && Object.keys(val).length === 0) return false;
    if (key === 'bloodGroup' && (val === 'Unknown' || val === 'Select Blood Group')) return false;
    if (key === 'department' && (val === 'General Medicine' || val === 'Select Department')) return false;
    if (key === 'hasInsurance' || key === 'hasAllergies') return false;
    return true;
  };

  if (!isOpen) return null;

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = async (file) => {
    setError('');
    setSelectedFile(file);
    setIsProcessing(true);
    setExtractedResult(null);
    setRawText('');
    setCopiedText(false);

    try {
      setProgress({ stage: 'upload', percent: 25, message: 'Uploading document to AI Form secure document store...' });

      let extracted = null;
      let textContent = '';

      // Concurrently run client-side extraction to guarantee the exact extracted document text is ready
      const clientParsePromise = parseDocument(file).catch((err) => {
        console.warn('Client-side document parse fallback notice:', err);
        return null;
      });

      // Primary: Attempt backend upload and Groq AI extraction
      try {
        setProgress({ stage: 'ai', percent: 60, message: 'Executing Groq AI clinical entity extraction...' });
        const targetPid = patientId || 1;
        const aiRes = await documentAPI.uploadAndExtract(file, targetPid, registrationId);
        extracted = mapBackendExtractionToForm(aiRes);

        // Retrieve the genuine clinical document text (not diagnostic headers)
        if (aiRes.raw_extracted_text && typeof aiRes.raw_extracted_text === 'string' && aiRes.raw_extracted_text.trim()) {
          textContent = sanitizeExtractedDocumentText(aiRes.raw_extracted_text);
        } else {
          const clientParsed = await clientParsePromise;
          if (clientParsed?.text && clientParsed.text.trim()) {
            textContent = sanitizeExtractedDocumentText(clientParsed.text);
          }
        }
      } catch (backendErr) {
        console.warn('Backend Groq extraction fallback to client parser:', backendErr);
        // Fallback: Local client OCR and extraction
        setProgress({ stage: 'ocr', percent: 50, message: 'Running local OCR and client NLP parsing...' });
        const parseResult = (await clientParsePromise) || (await parseDocument(file, (p) => {
          setProgress(p);
        }));
        textContent = sanitizeExtractedDocumentText(parseResult?.text || '');
        setProgress({ stage: 'nlp', percent: 90, message: 'Intelligently mapping extracted medical data to form fields...' });
        extracted = extractPatientInformation(textContent);
      }

      setRawText(textContent);

      // Preserve manually entered or locked fields: leave unchecked by default if form already has data
      const initialSelected = {};
      Object.keys(extracted.mappedFields).forEach(key => {
        initialSelected[key] = !isFieldAlreadyEntered(key);
      });
      setSelectedFields(initialSelected);

      setExtractedResult(extracted);
      setProgress({ stage: 'done', percent: 100, message: 'Information extraction completed!' });
    } catch (err) {
      console.error('File parsing error:', err);
      setError(err.message || 'Failed to parse the uploaded document.');
    } finally {
      setIsProcessing(false);
    }
  };

  const loadSampleDocument = (sample) => {
    setError('');
    setSelectedFile({ name: `${sample.title}.pdf`, size: 142000, type: 'application/pdf' });
    setIsProcessing(true);
    setExtractedResult(null);
    setRawText(sanitizeExtractedDocumentText(sample.text));
    setCopiedText(false);

    setTimeout(() => {
      setProgress({ stage: 'nlp', percent: 90, message: 'Analyzing medical document entities...' });
      const extracted = extractPatientInformation(sample.text);
      
      // Preserve manually entered or locked fields: leave unchecked by default if form already has data
      const initialSelected = {};
      Object.keys(extracted.mappedFields).forEach(key => {
        initialSelected[key] = !isFieldAlreadyEntered(key);
      });
      setSelectedFields(initialSelected);

      setExtractedResult(extracted);
      setIsProcessing(false);
      setProgress({ stage: 'done', percent: 100, message: 'Information extraction completed!' });
    }, 600);
  };

  const toggleFieldSelection = (fieldKey) => {
    setSelectedFields(prev => ({
      ...prev,
      [fieldKey]: !prev[fieldKey]
    }));
  };

  const handleApply = () => {
    if (!extractedResult) return;
    const fieldsToApply = {};
    Object.keys(extractedResult.mappedFields).forEach(key => {
      if (selectedFields[key]) {
        fieldsToApply[key] = extractedResult.mappedFields[key];
      }
    });
    onApplyFields(fieldsToApply);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-teal-950 text-white p-5 sm:p-6 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-teal-500/20 border border-teal-400/40 flex items-center justify-center text-teal-300 shadow-sm">
              <FileText size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white tracking-tight">
                  AI Medical Document Parser & OCR
                </h2>
                <span className="text-[10px] bg-teal-500/20 text-teal-300 border border-teal-400/30 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Groq 20B Enabled
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">Upload medical records, prescription slips, or discharge summaries for automated intake population.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs text-rose-800">
              <AlertCircle size={16} className="text-rose-600 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Upload Area */}
          {!extractedResult && !isProcessing && (
            <div className="space-y-5">
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                  dragActive
                    ? 'border-teal-500 bg-teal-50/60 scale-[1.01]'
                    : 'border-slate-300 hover:border-teal-500 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/png,image/jpeg,image/jpg"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-teal-50 border border-teal-200 text-teal-600 flex items-center justify-center shadow-sm">
                  <Upload size={26} />
                </div>
                <h3 className="text-sm font-bold text-slate-800">
                  Drag and drop your medical PDF or scanned document here
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Supports Digital PDFs, Scanned Doctor Prescriptions, Discharge Summaries, Lab Slips, and Images (PNG, JPG)
                </p>
                <div className="mt-4">
                  <span className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm">
                    Browse Files
                  </span>
                </div>
              </div>

              {/* Sample Documents for Instant 1-Click Testing */}
              <div className="border-t border-slate-200 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles size={14} className="text-teal-600" />
                    Or test immediately with a ready clinical sample:
                  </h4>
                  <span className="text-[11px] text-slate-400">Click to parse</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {SAMPLE_DOCUMENTS.map((sample) => (
                    <div
                      key={sample.id}
                      onClick={() => loadSampleDocument(sample)}
                      className="p-3.5 bg-slate-50 hover:bg-teal-50/60 border border-slate-200 hover:border-teal-300 rounded-xl cursor-pointer transition-all group flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full">
                            {sample.badge}
                          </span>
                          <span className="text-[11px] text-slate-400 group-hover:text-teal-600 font-medium">
                            {sample.patientName}
                          </span>
                        </div>
                        <h5 className="text-xs font-bold text-slate-900 group-hover:text-teal-900">
                          {sample.title}
                        </h5>
                        <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                          {sample.description}
                        </p>
                      </div>
                      <div className="mt-3 flex items-center text-[11px] font-semibold text-teal-600 group-hover:text-teal-700">
                        Parse this document <ChevronRight size={13} className="ml-0.5 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Progress / Loading Screen */}
          {isProcessing && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-teal-50 border-2 border-teal-200 flex items-center justify-center text-teal-600 animate-spin">
                  <Loader2 size={32} />
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  {progress.message || 'Processing document...'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Extracting text structure, running OCR filters, and mapping clinical entities.
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full max-w-md bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-teal-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${progress.percent || 40}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-teal-700">{progress.percent || 40}% completed</span>
            </div>
          )}

          {/* Extraction Review Results */}
          {extractedResult && !isProcessing && (
            <div className="space-y-5">
              
              {/* Summary Banner */}
              <div className="p-4 bg-teal-50 border border-teal-200/90 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-md shadow-teal-600/20 flex-shrink-0">
                    <FileCheck size={20} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-teal-900 tracking-tight">
                      Successfully Extracted {extractedResult.stats.extractedCount} Patient Data Fields
                    </h3>
                    <p className="text-[11px] text-teal-700/90 mt-0.5 leading-normal">
                      {extractedResult.summary}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRawText(!showRawText)}
                    className="px-3.5 py-1.5 bg-white border border-teal-300 text-teal-700 hover:bg-teal-100/70 hover:border-teal-400 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    <Eye size={13} /> {showRawText ? 'Hide Raw Document Text' : 'Show Raw Document Text'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setExtractedResult(null); setSelectedFile(null); }}
                    className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-semibold transition-all shadow-sm"
                  >
                    Upload Another
                  </button>
                </div>
              </div>

              {/* Raw text preview toggle - Strictly displays only the actual extracted clinical document text */}
              {showRawText && (
                <div className="rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden shadow-inner animate-fadeIn">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 text-[11px] text-slate-300">
                    <div className="flex items-center gap-2 font-semibold text-teal-300">
                      <FileText size={14} className="text-teal-400" />
                      <span>Extracted Document Text</span>
                      <span className="text-[10px] text-teal-400/80 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded-full font-normal">
                        Pure Text View
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-[10px] text-slate-400 font-mono">
                        {sanitizeExtractedDocumentText(rawText) 
                          ? `${sanitizeExtractedDocumentText(rawText).split('\n').filter(Boolean).length} lines` 
                          : '0 lines'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const cleaned = sanitizeExtractedDocumentText(rawText);
                          if (cleaned) {
                            navigator.clipboard.writeText(cleaned);
                            setCopiedText(true);
                            setTimeout(() => setCopiedText(false), 2000);
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <Copy size={11} />
                        {copiedText ? 'Copied!' : 'Copy Text'}
                      </button>
                    </div>
                  </div>
                  <pre className="p-4 text-teal-100/90 font-mono text-[11px] max-h-56 overflow-y-auto whitespace-pre-wrap leading-relaxed select-text selection:bg-teal-800/60 scrollbar-thin">
                    {sanitizeExtractedDocumentText(rawText) || 'No text extracted from document.'}
                  </pre>
                </div>
              )}

              {/* Mapped Fields Table / Cards */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Select Fields to Populate into Registration Form:
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const all = {};
                        Object.keys(extractedResult.mappedFields).forEach(k => all[k] = true);
                        setSelectedFields(all);
                      }}
                      className="text-xs font-semibold text-teal-700 hover:underline"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      onClick={() => setSelectedFields({})}
                      className="text-xs font-semibold text-slate-500 hover:underline"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                  {Object.entries(extractedResult.mappedFields).map(([key, value]) => {
                    const confidence = extractedResult.fieldConfidences?.[key];
                    const isSelected = !!selectedFields[key];
                    
                    const score = typeof confidence === 'object' && confidence !== null 
                      ? confidence.score 
                      : (typeof confidence === 'number' ? confidence : null);
                    const level = typeof confidence === 'object' && confidence?.level 
                      ? confidence.level 
                      : (score !== null ? (score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low') : null);

                    let displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
                    if (Array.isArray(value)) {
                      if (key === 'allergies') {
                        displayValue = value.map(a => typeof a === 'object' ? `${a.allergen || ''} (${a.reaction || ''})` : String(a)).join(', ');
                      } else if (key === 'currentMedications') {
                        displayValue = value.map(m => typeof m === 'object' ? `${m.name || ''} ${m.dosage || ''}`.trim() : String(m)).join(', ');
                      } else {
                        displayValue = value.join(', ');
                      }
                    } else if (key === 'vitals' && typeof value === 'object' && value !== null) {
                      displayValue = Object.entries(value).map(([k, v]) => `${k}: ${v}`).join(' | ');
                    }

                    return (
                      <div
                        key={key}
                        onClick={() => toggleFieldSelection(key)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                          isSelected
                            ? 'bg-teal-50/60 border-teal-300 shadow-sm ring-1 ring-teal-400/20'
                            : 'bg-slate-50/70 border-slate-200/80 hover:bg-slate-100/60 opacity-60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}} // Controlled by parent div click
                          className="mt-0.5 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1 gap-1">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">
                              {key}
                            </span>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {isFieldAlreadyEntered(key) && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 border border-slate-300">
                                  Existing Value Preserved
                                </span>
                              )}
                              {score !== null && (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                                  level === 'high'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : level === 'medium'
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                    : 'bg-slate-200 text-slate-700'
                                }`}>
                                  {score}% Confidence
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="text-xs font-semibold text-slate-800 break-words leading-snug">
                            {displayValue}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            Cancel
          </button>

          {extractedResult && (
            <button
              onClick={handleApply}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-md shadow-teal-600/20 flex items-center gap-2 transition-transform active:scale-95"
            >
              <CheckCircle2 size={16} />
              Populate Selected ({Object.values(selectedFields).filter(Boolean).length}) Fields into Form
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

