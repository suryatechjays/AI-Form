import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Play,
  Square,
  ArrowRight,
  ArrowLeft,
  X,
  RefreshCw,
  Loader2,
  Check,
  SkipForward,
  Send,
  HelpCircle,
  FileText,
  User,
  Heart,
  Shield,
  Stethoscope,
  Activity,
  Edit3,
  RotateCcw
} from 'lucide-react';
import {
  createSpeechRecognizer,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  SAMPLE_VOICE_INTAKES
} from '../services/speechService';
import { extractPatientInformation } from '../services/aiExtractor';
import { documentAPI, mapBackendExtractionToForm } from '../services/api';
import {
  VOICE_QA_CATALOG,
  VOICE_QA_QUESTIONS,
  parseTargetedAnswer,
  isSkipIntent,
  countPopulatedFields,
  getNextUnpopulatedInSequence,
  getNextUnpopulatedQuestion,
  getApplicableQuestions,
  mergeExtractedFields,
  isValuePopulated,
  validateFieldValue,
  detectCorrectionIntent,
  getCompletionStatus,
  saveVoiceSession,
  loadVoiceSession,
  clearVoiceSession
} from '../services/voiceQAService';

export default function VoiceAssistantModal({
  isOpen,
  onClose,
  patientData = {},
  onApplyFields
}) {
  const [activeTab, setActiveTab] = useState('freeform'); // 'freeform' | 'guided' | 'samples'
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [extractedData, setExtractedData] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isExtractingAI, setIsExtractingAI] = useState(false);
  const extractionSeq = useRef(0);

  // ============================================================================
  // STEP-BY-STEP GUIDED VOICE Q&A STATE
  // ============================================================================
  const [qaSessionStarted, setQaSessionStarted] = useState(false);
  const [currentQuestionId, setCurrentQuestionId] = useState('name');
  const [previousQuestionId, setPreviousQuestionId] = useState(null);
  const [qaCollectedFields, setQaCollectedFields] = useState({});
  const [qaLockedFieldKeys, setQaLockedFieldKeys] = useState(new Set());
  const [qaQuestionAnswers, setQaQuestionAnswers] = useState({});
  const [qaReviewMode, setQaReviewMode] = useState(false);
  const [qaNotice, setQaNotice] = useState(null);
  const [isProcessingQA, setIsProcessingQA] = useState(false);
  const [qaTextInput, setQaTextInput] = useState('');
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);

  const recognizerRef = useRef(null);
  const speechSynthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);

  const isSTTSupported = isSpeechRecognitionSupported();
  const isTTSSupported = isSpeechSynthesisSupported();

  // Initialize guided state from patientData or active session when modal opens
  useEffect(() => {
    if (isOpen) {
      const initialCollected = {};
      const locked = new Set();
      if (patientData && typeof patientData === 'object') {
        for (const [k, v] of Object.entries(patientData)) {
          if (v !== '' && v !== null && v !== undefined && v !== 'Unknown') {
            if (k === 'vitals') {
              if (typeof v === 'object' && Object.values(v).some(val => val !== '' && val !== null && val !== undefined)) {
                initialCollected.vitals = { ...v };
                locked.add('vitals');
              }
            } else if (Array.isArray(v)) {
              if (v.length > 0) {
                initialCollected[k] = [...v];
                locked.add(k);
              }
            } else {
              initialCollected[k] = v;
              if (k !== 'department' || v !== 'General Medicine') {
                locked.add(k);
              }
            }
          }
        }
      }

      // Check for active session recovery from sessionStorage
      const savedSession = loadVoiceSession();
      if (savedSession && savedSession.collectedFields && Object.keys(savedSession.collectedFields).length > 0) {
        const merged = mergeExtractedFields(initialCollected, savedSession.collectedFields, locked);
        setQaCollectedFields(merged);
        setQaLockedFieldKeys(locked);
        setQaQuestionAnswers(savedSession.questionAnswers || {});
        setCurrentQuestionId(savedSession.currentQuestionId || 'name');
        setQaSessionStarted(true);
        setQaReviewMode(false);
        setQaNotice({
          type: 'info',
          message: 'Restored your active voice interview from this browser session. Click "Reset Session" anytime to start fresh.'
        });
      } else {
        setQaCollectedFields(initialCollected);
        setQaLockedFieldKeys(locked);
        setQaSessionStarted(false);
        setCurrentQuestionId('name');
        setQaReviewMode(false);
        setQaNotice(null);
        setQaQuestionAnswers({});
      }

      setPreviousQuestionId(null);
      setQaTextInput('');
      setTranscript('');
      setInterimTranscript('');
    }
  }, [isOpen]);

  // Clean up on modal close
  useEffect(() => {
    if (!isOpen) {
      stopListening();
      if (speechSynthRef.current) speechSynthRef.current.cancel();
    }
  }, [isOpen]);

  // ============================================================================
  // FREEFORM VOICE TAB EXTRACTION
  // ============================================================================
  const runGroqExtraction = async (textToExtract) => {
    const clean = (textToExtract || '').trim();
    if (clean.length < 5) return;
    const currentSeq = ++extractionSeq.current;
    setIsExtractingAI(true);
    try {
      const res = await documentAPI.extractText(clean);
      if (currentSeq === extractionSeq.current && res && res.extracted_fields) {
        const mapped = mapBackendExtractionToForm(res);
        setExtractedData(mapped);
      }
    } catch (err) {
      console.warn('Groq voice extraction endpoint fallback to client extractor:', err);
    } finally {
      if (currentSeq === extractionSeq.current) {
        setIsExtractingAI(false);
      }
    }
  };

  // Run AI extraction whenever freeform transcript updates
  useEffect(() => {
    if (activeTab !== 'freeform') return;
    const fullText = (transcript + ' ' + interimTranscript).trim();
    if (fullText.length > 5) {
      const localResult = extractPatientInformation(fullText);
      setExtractedData(prev => (prev && (prev.stats?.extractedCount || 0) > (localResult.stats?.extractedCount || 0)) ? prev : localResult);

      const timer = setTimeout(() => {
        runGroqExtraction(fullText);
      }, 550);
      return () => clearTimeout(timer);
    } else {
      setExtractedData(null);
    }
  }, [transcript, interimTranscript, activeTab]);

  // ============================================================================
  // SPEECH RECOGNITION CONTROLLER
  // ============================================================================
  const startListening = () => {
    setErrorMessage('');
    if (!isSTTSupported) {
      setErrorMessage('Speech recognition is not supported in this browser. Try Chrome or Edge, or use typed input.');
      return;
    }

    const recognizer = createSpeechRecognizer({
      continuous: true,
      onStart: () => {
        setIsListening(true);
      },
      onInterim: (interim) => {
        setInterimTranscript(interim);
      },
      onResult: (final) => {
        setTranscript(final);
        setInterimTranscript('');
      },
      onError: (err) => {
        console.warn('Speech error:', err);
        if (err === 'not-allowed') {
          setErrorMessage('Microphone access was denied. Please allow microphone permissions in your browser bar.');
        } else if (err === 'no-speech') {
          // Quiet notice
        } else {
          setErrorMessage(`Speech recognition notice: ${err}`);
        }
        setIsListening(false);
      },
      onEnd: () => {
        setIsListening(false);
      }
    });

    if (recognizer) {
      recognizerRef.current = recognizer;
      try {
        recognizer.start();
      } catch (e) {
        console.warn('Recognizer start error:', e);
      }
    }
  };

  const stopListening = () => {
    if (recognizerRef.current) {
      try {
        recognizerRef.current.stop();
      } catch (e) {}
    }
    setIsListening(false);
  };

  // Speak a question using SpeechSynthesis
  const speakQuestion = (questionText) => {
    if (!isTTSSupported || !speechSynthRef.current) return;
    try {
      speechSynthRef.current.cancel();
      const utterance = new SpeechSynthesisUtterance(questionText);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      utterance.onstart = () => setIsAssistantSpeaking(true);
      utterance.onend = () => {
        setIsAssistantSpeaking(false);
        // Automatically start listening for response
        startListening();
      };
      utterance.onerror = () => setIsAssistantSpeaking(false);

      speechSynthRef.current.speak(utterance);
    } catch (e) {
      console.warn('TTS error:', e);
    }
  };

  // ============================================================================
  // STEP-BY-STEP GUIDED DERIVED STATE & CONTROLLERS
  // ============================================================================
  const applicableQuestions = getApplicableQuestions(VOICE_QA_CATALOG, qaCollectedFields);
  let currentQuestionIndex = applicableQuestions.findIndex(q => q.id === currentQuestionId);
  if (currentQuestionIndex === -1) {
    const unpop = getNextUnpopulatedInSequence(applicableQuestions, qaCollectedFields, 0);
    currentQuestionIndex = unpop ? unpop.index : 0;
  }
  const currentGuidedQuestion = applicableQuestions[currentQuestionIndex] || applicableQuestions[0] || null;
  const totalApplicableQuestions = applicableQuestions.length;

  const handleStartGuidedSession = () => {
    setQaSessionStarted(true);
    setQaNotice(null);
    setQaTextInput('');
    setTranscript('');
    setInterimTranscript('');

    const applicable = getApplicableQuestions(VOICE_QA_CATALOG, qaCollectedFields);
    const firstUnpopulated = getNextUnpopulatedInSequence(applicable, qaCollectedFields, 0);

    if (firstUnpopulated) {
      setCurrentQuestionId(firstUnpopulated.question.id);
      setQaReviewMode(false);
      speakQuestion(firstUnpopulated.question.question);
    } else {
      setQaReviewMode(true);
      speakQuestion('All applicable questions have already been completed! Please review your registration details.');
    }
  };

  const handleResetGuidedSession = () => {
    const answeredCount = Object.keys(qaQuestionAnswers).length;
    if (answeredCount > 0) {
      const confirmed = window.confirm(
        'Reset this voice session? All spoken answers collected in this voice session will be cleared. (Your existing registration form will not be affected.)'
      );
      if (!confirmed) return;
    }

    stopListening();
    if (speechSynthRef.current) speechSynthRef.current.cancel();

    // Clear session-scoped temporary storage
    clearVoiceSession();

    // Reset back to initial patientData snapshot without modifying parent form
    const initialCollected = {};
    const locked = new Set();
    if (patientData && typeof patientData === 'object') {
      for (const [k, v] of Object.entries(patientData)) {
        if (v !== '' && v !== null && v !== undefined && v !== 'Unknown') {
          if (k === 'vitals') {
            if (typeof v === 'object' && Object.values(v).some(val => val !== '' && val !== null && val !== undefined)) {
              initialCollected.vitals = { ...v };
              locked.add('vitals');
            }
          } else if (Array.isArray(v)) {
            if (v.length > 0) {
              initialCollected[k] = [...v];
              locked.add(k);
            }
          } else {
            initialCollected[k] = v;
            if (k !== 'department' || v !== 'General Medicine') {
              locked.add(k);
            }
          }
        }
      }
    }

    setQaCollectedFields(initialCollected);
    setQaLockedFieldKeys(locked);
    setQaQuestionAnswers({});
    setCurrentQuestionId('name');
    setPreviousQuestionId(null);
    setQaReviewMode(false);
    setQaSessionStarted(false);
    setQaNotice(null);
    setQaTextInput('');
    setTranscript('');
    setInterimTranscript('');
  };

  const handleProcessGuidedAnswer = async (explicitText = null) => {
    const rawAnswer = explicitText !== null ? explicitText : (qaTextInput || transcript || interimTranscript);
    const cleanText = (rawAnswer || '').trim();

    if (!cleanText) {
      setQaNotice({
        type: 'warning',
        message: 'Please speak or type your answer before continuing.'
      });
      return;
    }

    const currentQ = currentGuidedQuestion;
    if (!currentQ) return;

    stopListening();
    setIsProcessingQA(true);
    setQaNotice(null);

    try {
      // 1. Detect repeat question or natural answer correction intent
      const correction = detectCorrectionIntent(cleanText, currentQ.id, previousQuestionId);
      if (correction.isRepeat) {
        setQaNotice({
          type: 'info',
          message: `Repeating question: "${currentQ.question}"`
        });
        speakQuestion(currentQ.question);
        setQaTextInput('');
        setTranscript('');
        setInterimTranscript('');
        return;
      }

      if (correction.isCorrection && correction.targetQuestionId) {
        const targetQ = VOICE_QA_CATALOG.find(q => q.id === correction.targetQuestionId) || currentQ;
        const correctionPatch = parseTargetedAnswer(targetQ.id, correction.correctedValueText || cleanText, qaCollectedFields);
        
        // Validate target fields
        const validatedCorrection = {};
        const validList = [];
        const invalidList = [];

        for (const [k, v] of Object.entries(correctionPatch)) {
          if (!isValuePopulated(v)) continue;
          if (k === 'vitals' && typeof v === 'object') {
            const vitalsObj = {};
            for (const [vk, vv] of Object.entries(v)) {
              const res = validateFieldValue(vk, vv);
              if (res.isValid) {
                vitalsObj[vk] = res.normalizedValue !== undefined ? res.normalizedValue : vv;
                validList.push({ key: vk, label: vk, value: vitalsObj[vk] });
              } else {
                invalidList.push({ key: vk, label: vk, value: vv, error: res.error, example: res.example });
              }
            }
            if (Object.keys(vitalsObj).length > 0) validatedCorrection.vitals = vitalsObj;
          } else {
            const res = validateFieldValue(k, v);
            if (res.isValid) {
              validatedCorrection[k] = res.normalizedValue !== undefined ? res.normalizedValue : v;
              validList.push({ key: k, label: k, value: validatedCorrection[k] });
            } else {
              invalidList.push({ key: k, label: k, value: v, error: res.error, example: res.example });
            }
          }
        }

        if (invalidList.length > 0 && validList.length === 0) {
          setQaNotice({
            type: 'warning',
            message: invalidList.map(item => `${item.error}. Example: ${item.example}`).join(' | '),
            invalidFields: invalidList
          });
          return;
        }

        if (validList.length > 0) {
          const updated = mergeExtractedFields(qaCollectedFields, validatedCorrection, qaLockedFieldKeys);
          setQaCollectedFields(updated);
          saveVoiceSession(updated, currentQ.id, qaQuestionAnswers);
          setQaNotice({
            type: 'success',
            message: `Corrected ${targetQ.sectionTitle} details (${validList.map(f => f.key).join(', ')}). Resuming interview.`,
            validFields: validList
          });
          setQaTextInput('');
          setTranscript('');
          setInterimTranscript('');
          return;
        }
      }

      // 2. Detect skip / don't know intent
      if (isSkipIntent(cleanText)) {
        const newAnswers = {
          ...qaQuestionAnswers,
          [currentQ.id]: { transcript: cleanText, skipped: true, extractedKeys: [] }
        };
        setQaQuestionAnswers(newAnswers);
        setPreviousQuestionId(currentQ.id);
        saveVoiceSession(qaCollectedFields, currentQ.id, newAnswers);
        setQaNotice({
          type: 'info',
          message: `Question "${currentQ.question}" skipped.`
        });
        setQaTextInput('');
        setTranscript('');
        setInterimTranscript('');

        // Move to next unpopulated question in active applicable sequence
        const next = getNextUnpopulatedInSequence(applicableQuestions, qaCollectedFields, currentQuestionIndex + 1);
        if (next) {
          setCurrentQuestionId(next.question.id);
          speakQuestion(next.question.question);
        } else {
          setQaReviewMode(true);
          speakQuestion('All applicable questions have been completed! Please review your registration details.');
        }
        return;
      }

      // 3. Targeted parsing for the current question
      const targetedPatch = parseTargetedAnswer(currentQ.id, cleanText, qaCollectedFields);

      // 4. General local rule extraction in case user provided multiple details
      const localExtracted = extractPatientInformation(cleanText);
      const generalPatch = localExtracted.mappedFields || {};

      // 5. Backend Groq AI extraction for rich natural phrases
      let groqPatch = {};
      try {
        if (cleanText.length >= 3) {
          const groqRes = await documentAPI.extractText(cleanText);
          if (groqRes && groqRes.extracted_fields) {
            const mappedGroq = mapBackendExtractionToForm(groqRes);
            groqPatch = mappedGroq.mappedFields || {};
          }
        }
      } catch (err) {
        console.warn('Groq extraction fallback to local parser:', err);
      }

      // 6. STRICT ENTITY NAME ISOLATION (CRITICAL BUG FIX)
      // Patient name fields (firstName, middleName, lastName) MUST ONLY come from 'name' question!
      if (currentQ.id !== 'name') {
        delete generalPatch.firstName;
        delete generalPatch.middleName;
        delete generalPatch.lastName;
        delete groqPatch.firstName;
        delete groqPatch.middleName;
        delete groqPatch.lastName;
      }
      // Doctor name must only populate consultingDoctor
      if (currentQ.id !== 'consultingDoctor') {
        delete generalPatch.consultingDoctor;
        delete groqPatch.consultingDoctor;
      }
      // Emergency contact details must only populate emergency contact fields
      if (currentQ.id !== 'emergencyContact' && currentQ.id !== 'emergencyAltPhone') {
        delete generalPatch.emergencyContactName;
        delete generalPatch.emergencyContactPhone;
        delete generalPatch.emergencyContactRelation;
        delete generalPatch.emergencyContactAltPhone;
        delete groqPatch.emergencyContactName;
        delete groqPatch.emergencyContactPhone;
        delete groqPatch.emergencyContactRelation;
        delete groqPatch.emergencyContactAltPhone;
      }
      if (currentQ.id === 'emergencyContact' || currentQ.id === 'emergencyAltPhone') {
        delete generalPatch.phone;
        delete groqPatch.phone;
      }
      // Insurance subscriber policyHolderName
      if (currentQ.id !== 'insuranceSubscriber' && currentQ.id !== 'insuranceDetails') {
        delete generalPatch.policyHolderName;
        delete groqPatch.policyHolderName;
      }

      // Combine extracted fields with priority: Targeted > Groq > General
      const combinedNewFields = {
        ...generalPatch,
        ...groqPatch,
        ...targetedPatch
      };

      // 7. FIELD VALIDATION & RANGE CHECKING (CRITICAL)
      const validatedPatch = {};
      const validFieldsList = [];
      const invalidFieldsList = [];

      for (const [key, val] of Object.entries(combinedNewFields)) {
        if (!isValuePopulated(val)) continue;

        if (key === 'vitals' && typeof val === 'object') {
          const validatedVitals = {};
          for (const [vKey, vVal] of Object.entries(val)) {
            if (!isValuePopulated(vVal)) continue;
            const res = validateFieldValue(vKey, vVal);
            if (res.isValid) {
              validatedVitals[vKey] = res.normalizedValue !== undefined ? res.normalizedValue : vVal;
              validFieldsList.push({ key: vKey, label: vKey, value: validatedVitals[vKey] });
            } else {
              invalidFieldsList.push({ key: vKey, label: vKey, value: vVal, error: res.error, example: res.example });
            }
          }
          if (Object.keys(validatedVitals).length > 0) {
            validatedPatch.vitals = validatedVitals;
          }
        } else {
          const res = validateFieldValue(key, val);
          if (res.isValid) {
            validatedPatch[key] = res.normalizedValue !== undefined ? res.normalizedValue : val;
            validFieldsList.push({ key, label: key, value: validatedPatch[key] });
          } else {
            invalidFieldsList.push({ key, label: key, value: val, error: res.error, example: res.example });
          }
        }
      }

      // If nothing valid was extracted
      if (validFieldsList.length === 0) {
        if (invalidFieldsList.length > 0) {
          setQaNotice({
            type: 'warning',
            message: invalidFieldsList.map(item => `${item.error}. Example: ${item.example}`).join(' | '),
            invalidFields: invalidFieldsList
          });
        } else {
          setQaNotice({
            type: 'warning',
            message: `Could not reliably recognize the details from "${cleanText}". Please clarify your response, or click "Skip" to move forward.`
          });
        }
        return;
      }

      // 8. Merge into cumulative collected state
      const updatedCollected = mergeExtractedFields(qaCollectedFields, validatedPatch, qaLockedFieldKeys);
      setQaCollectedFields(updatedCollected);

      // Record question answer & save session
      const newAnswers = {
        ...qaQuestionAnswers,
        [currentQ.id]: {
          transcript: cleanText,
          skipped: false,
          extractedKeys: validFieldsList.map(f => f.key)
        }
      };
      setQaQuestionAnswers(newAnswers);
      setPreviousQuestionId(currentQ.id);
      saveVoiceSession(updatedCollected, currentQ.id, newAnswers);

      const totalPopulated = countPopulatedFields(updatedCollected);
      if (invalidFieldsList.length > 0) {
        setQaNotice({
          type: 'warning',
          message: `Saved ${validFieldsList.length} field(s): ${validFieldsList.map(f => f.key).join(', ')}. Note: ${invalidFieldsList.map(f => f.error).join(', ')}`,
          validFields: validFieldsList,
          invalidFields: invalidFieldsList
        });
      } else {
        setQaNotice({
          type: 'success',
          message: `Extracted ${validFieldsList.length} field(s): ${validFieldsList.map(f => f.key).join(', ')} (${totalPopulated} total fields populated)`,
          validFields: validFieldsList
        });
      }

      setQaTextInput('');
      setTranscript('');
      setInterimTranscript('');

      // 9. Find next unpopulated question in newly re-evaluated applicable questions
      const updatedApplicable = getApplicableQuestions(VOICE_QA_CATALOG, updatedCollected);
      const next = getNextUnpopulatedInSequence(updatedApplicable, updatedCollected, currentQuestionIndex + 1);
      if (next) {
        setCurrentQuestionId(next.question.id);
        speakQuestion(next.question.question);
      } else {
        setQaReviewMode(true);
        speakQuestion('All applicable questions have been completed! Please review your registration details.');
      }
    } finally {
      setIsProcessingQA(false);
    }
  };

  const handleSkipCurrentQuestion = () => {
    const currentQ = currentGuidedQuestion;
    if (!currentQ) return;
    stopListening();
    const newAnswers = {
      ...qaQuestionAnswers,
      [currentQ.id]: { transcript: 'Skipped', skipped: true, extractedKeys: [] }
    };
    setQaQuestionAnswers(newAnswers);
    setPreviousQuestionId(currentQ.id);
    saveVoiceSession(qaCollectedFields, currentQ.id, newAnswers);
    setQaNotice({
      type: 'info',
      message: `Question "${currentQ.question}" skipped.`
    });
    setQaTextInput('');
    setTranscript('');
    setInterimTranscript('');

    const next = getNextUnpopulatedInSequence(applicableQuestions, qaCollectedFields, currentQuestionIndex + 1);
    if (next) {
      setCurrentQuestionId(next.question.id);
      speakQuestion(next.question.question);
    } else {
      setQaReviewMode(true);
      speakQuestion('All questions have been completed! Please review your registration details.');
    }
  };

  const handleApplyGuidedToForm = () => {
    const count = countPopulatedFields(qaCollectedFields);
    if (count > 0) {
      clearVoiceSession();
      onApplyFields(qaCollectedFields);
      onClose();
    }
  };

  const handleApplyFreeformToForm = () => {
    if (extractedData && extractedData.mappedFields) {
      onApplyFields(extractedData.mappedFields);
      onClose();
    }
  };

  const loadSampleTranscript = (sample) => {
    setTranscript(sample.transcript);
    setInterimTranscript('');
    const result = extractPatientInformation(sample.transcript);
    setExtractedData(result);
    runGroqExtraction(sample.transcript);
  };

  if (!isOpen) return null;

  const guidedPopulatedCount = countPopulatedFields(qaCollectedFields);
  const freeformCount = extractedData ? Object.keys(extractedData.mappedFields || {}).length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-teal-950 text-white p-5 sm:p-6 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3.5">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-teal-300 shadow-sm transition-all ${
              isListening ? 'bg-rose-500/20 border border-rose-400 text-rose-400 animate-pulse' : 'bg-teal-500/20 border border-teal-400/40'
            }`}>
              <Mic size={22} className={isListening ? 'animate-bounce text-rose-400' : ''} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white tracking-tight">
                  AI Form Clinical Voice Assistant & Dictation
                </h2>
                <span className="text-[10px] bg-teal-500/20 text-teal-300 border border-teal-400/30 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  STT & Groq 20B
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Speak naturally to populate registration fields, or let the assistant guide you through each section.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3 gap-2">
          <button
            onClick={() => { setActiveTab('guided'); stopListening(); if (speechSynthRef.current) speechSynthRef.current.cancel(); }}
            className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'guided'
                ? 'border-teal-600 text-teal-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Volume2 size={15} /> Step-by-Step Voice Q&A
            {guidedPopulatedCount > 0 && (
              <span className="bg-teal-100 text-teal-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                {guidedPopulatedCount}
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('freeform'); stopListening(); }}
            className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'freeform'
                ? 'border-teal-600 text-teal-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Mic size={15} /> Freeform Voice Intake
          </button>

          <button
            onClick={() => { setActiveTab('samples'); stopListening(); }}
            className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'samples'
                ? 'border-teal-600 text-teal-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sparkles size={15} /> Pre-recorded Voice Samples
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {errorMessage && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-800">
              <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Microphone Notice</p>
                <p>{errorMessage}</p>
                <p className="mt-1 text-slate-600">You can also type your answers directly or test with the Pre-recorded Voice Samples tab.</p>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 1: STEP-BY-STEP VOICE Q&A (COMPREHENSIVE FLOW)                */}
          {/* ================================================================= */}
          {activeTab === 'guided' && (
            <div className="space-y-4">
              
              {/* Review & Summary Screen */}
              {qaReviewMode ? (
                <div className="space-y-5">
                  <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-bold">
                        <Check size={20} />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-emerald-950">
                          Intake Interview Review ({guidedPopulatedCount} Fields Captured)
                        </h3>
                        <p className="text-xs text-emerald-800 mt-0.5">
                          Review all collected clinical and demographic details across all seven sections below.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleResetGuidedSession}
                        className="px-3.5 py-2 bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                      >
                        <RefreshCw size={13} /> Reset Session
                      </button>
                      <button
                        onClick={() => setQaReviewMode(false)}
                        className="px-3.5 py-2 bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                      >
                        <ArrowLeft size={14} /> Back to Questions
                      </button>
                    </div>
                  </div>

                  {/* Completion Status & Missing Required Action Breakdown */}
                  {(() => {
                    const comp = getCompletionStatus(applicableQuestions, qaCollectedFields);
                    return (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                            <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">Completed</span>
                            <span className="text-xl font-black text-emerald-950 mt-1 block">{comp.collectedList.length}</span>
                            <span className="text-[11px] text-emerald-700">Questions Answered</span>
                          </div>
                          <div className={`p-3.5 border rounded-xl ${
                            comp.missingRequired.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'
                          }`}>
                            <span className={`text-[11px] font-bold uppercase tracking-wider block ${
                              comp.missingRequired.length > 0 ? 'text-amber-800' : 'text-slate-600'
                            }`}>
                              Required Remaining
                            </span>
                            <span className={`text-xl font-black mt-1 block ${
                              comp.missingRequired.length > 0 ? 'text-amber-950' : 'text-slate-900'
                            }`}>
                              {comp.missingRequired.length}
                            </span>
                            <span className={`text-[11px] ${
                              comp.missingRequired.length > 0 ? 'text-amber-700' : 'text-slate-500'
                            }`}>
                              {comp.missingRequired.length > 0 ? 'Action required for complete registration' : 'All required fields captured'}
                            </span>
                          </div>
                          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">Optional / Skipped</span>
                            <span className="text-xl font-black text-slate-900 mt-1 block">{comp.skippedOptional.length}</span>
                            <span className="text-[11px] text-slate-500">Optional items skipped or none</span>
                          </div>
                        </div>

                        {comp.missingRequired.length > 0 && (
                          <div className="p-4 bg-amber-50/90 border border-amber-200 rounded-2xl space-y-3">
                            <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
                              <AlertCircle size={15} className="text-amber-600" />
                              Required Registration Items Needing Attention ({comp.missingRequired.length})
                            </div>
                            <div className="space-y-2">
                              {comp.missingRequired.map(q => (
                                <div key={q.id} className="bg-white p-3 rounded-xl border border-amber-200 flex items-center justify-between gap-3 text-xs">
                                  <div>
                                    <span className="font-bold text-slate-900 block">{q.question}</span>
                                    <span className="text-[11px] text-slate-500">Section {q.sectionNumber}: {q.sectionTitle}</span>
                                  </div>
                                  <button
                                    onClick={() => {
                                      setCurrentQuestionId(q.id);
                                      setQaReviewMode(false);
                                      speakQuestion(q.question);
                                    }}
                                    className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold text-xs flex items-center gap-1 shadow-xs transition-all cursor-pointer whitespace-nowrap"
                                  >
                                    Complete Now <ArrowRight size={13} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Section-by-Section Review Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    {/* Section 1: Demographics */}
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                          <User size={14} className="text-teal-600" /> 1. Demographics
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-teal-700 font-semibold bg-teal-100 px-2 py-0.5 rounded-full">
                            {qaCollectedFields.firstName ? 'Populated' : 'Pending'}
                          </span>
                          <button
                            onClick={() => {
                              setCurrentQuestionId('name');
                              setQaReviewMode(false);
                              speakQuestion(VOICE_QA_CATALOG.find(q => q.id === 'name')?.question || '');
                            }}
                            className="text-[11px] text-teal-700 hover:text-teal-900 font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 size={11} /> Edit
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1 text-slate-800">
                        <p><span className="text-slate-400">Full Name:</span> <strong>{qaCollectedFields.firstName || ''} {qaCollectedFields.middleName || ''} {qaCollectedFields.lastName || 'Not provided'}</strong></p>
                        <p><span className="text-slate-400">Date of Birth:</span> <strong>{qaCollectedFields.dateOfBirth || 'Not provided'}</strong> {qaCollectedFields.age ? `(Age ${qaCollectedFields.age})` : ''}</p>
                        <p><span className="text-slate-400">Gender:</span> <strong>{qaCollectedFields.gender || 'Not specified'}</strong></p>
                        <p><span className="text-slate-400">Blood Group:</span> <strong className="text-rose-600">{qaCollectedFields.bloodGroup || 'Unknown'}</strong></p>
                        <p><span className="text-slate-400">Marital / Lang:</span> <strong>{qaCollectedFields.maritalStatus || 'N/A'}</strong> • <strong>{qaCollectedFields.preferredLanguage || 'English'}</strong></p>
                        {qaCollectedFields.occupation && <p><span className="text-slate-400">Occupation:</span> <strong>{qaCollectedFields.occupation}</strong></p>}
                        {qaCollectedFields.nationalId && <p><span className="text-slate-400">National ID:</span> <strong>{qaCollectedFields.nationalId}</strong></p>}
                      </div>
                    </div>

                    {/* Section 2: Contact Information */}
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                          <Shield size={14} className="text-teal-600" /> 2. Contact Information
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-teal-700 font-semibold bg-teal-100 px-2 py-0.5 rounded-full">
                            {qaCollectedFields.phone ? 'Populated' : 'Pending'}
                          </span>
                          <button
                            onClick={() => {
                              setCurrentQuestionId('phone');
                              setQaReviewMode(false);
                              speakQuestion(VOICE_QA_CATALOG.find(q => q.id === 'phone')?.question || '');
                            }}
                            className="text-[11px] text-teal-700 hover:text-teal-900 font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 size={11} /> Edit
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1 text-slate-800">
                        <p><span className="text-slate-400">Primary Phone:</span> <strong>{qaCollectedFields.phone || 'Not provided'}</strong></p>
                        <p><span className="text-slate-400">Email Address:</span> <strong>{qaCollectedFields.email || 'Not provided'}</strong></p>
                        <p><span className="text-slate-400">Mailing Address:</span> <strong>{[qaCollectedFields.addressLine1, qaCollectedFields.addressLine2, qaCollectedFields.city, qaCollectedFields.state, qaCollectedFields.postalCode].filter(Boolean).join(', ') || 'Not provided'}</strong></p>
                      </div>
                    </div>

                    {/* Section 3: Emergency Contact */}
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                          <Heart size={14} className="text-rose-500" /> 3. Emergency Contact
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-teal-700 font-semibold bg-teal-100 px-2 py-0.5 rounded-full">
                            {qaCollectedFields.emergencyContactName ? 'Populated' : 'Pending'}
                          </span>
                          <button
                            onClick={() => {
                              setCurrentQuestionId('emergencyContact');
                              setQaReviewMode(false);
                              speakQuestion(VOICE_QA_CATALOG.find(q => q.id === 'emergencyContact')?.question || '');
                            }}
                            className="text-[11px] text-teal-700 hover:text-teal-900 font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 size={11} /> Edit
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1 text-slate-800">
                        <p><span className="text-slate-400">Name:</span> <strong>{qaCollectedFields.emergencyContactName || 'Not provided'}</strong></p>
                        <p><span className="text-slate-400">Relationship:</span> <strong>{qaCollectedFields.emergencyContactRelation || 'Not specified'}</strong></p>
                        <p><span className="text-slate-400">Phone:</span> <strong>{qaCollectedFields.emergencyContactPhone || 'Not provided'}</strong></p>
                        {qaCollectedFields.emergencyContactAltPhone && (
                          <p><span className="text-slate-400">Alt Phone:</span> <strong>{qaCollectedFields.emergencyContactAltPhone}</strong></p>
                        )}
                      </div>
                    </div>

                    {/* Section 4: Clinical History & Safety */}
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                          <Activity size={14} className="text-teal-600" /> 4. Clinical History & Safety
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-teal-700 font-semibold bg-teal-100 px-2 py-0.5 rounded-full">
                            {qaCollectedFields.hasAllergies !== undefined ? 'Confirmed' : 'Pending'}
                          </span>
                          <button
                            onClick={() => {
                              setCurrentQuestionId('allergies');
                              setQaReviewMode(false);
                              speakQuestion(VOICE_QA_CATALOG.find(q => q.id === 'allergies')?.question || '');
                            }}
                            className="text-[11px] text-teal-700 hover:text-teal-900 font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 size={11} /> Edit
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1 text-slate-800">
                        <p>
                          <span className="text-slate-400">Allergies:</span>{' '}
                          {qaCollectedFields.hasAllergies && qaCollectedFields.allergies?.length > 0 ? (
                            <strong className="text-rose-600">
                              {qaCollectedFields.allergies.map(a => `${a.allergen} (${a.reaction || 'Active'})`).join(', ')}
                            </strong>
                          ) : (
                            <strong className="text-emerald-700">No Known Drug Allergies (NKDA)</strong>
                          )}
                        </p>
                        <p>
                          <span className="text-slate-400">Conditions:</span>{' '}
                          <strong>{qaCollectedFields.chronicConditions?.join(', ') || 'None reported'}</strong>
                        </p>
                        <p>
                          <span className="text-slate-400">Medications:</span>{' '}
                          <strong>
                            {qaCollectedFields.currentMedications?.length > 0
                              ? qaCollectedFields.currentMedications.map(m => `${m.name} ${m.dosage || ''}`).join(', ')
                              : 'None reported'}
                          </strong>
                        </p>
                        {qaCollectedFields.pastSurgeries && (
                          <p><span className="text-slate-400">Past Surgeries:</span> <strong>{qaCollectedFields.pastSurgeries}</strong></p>
                        )}
                        {qaCollectedFields.familyMedicalHistory && (
                          <p><span className="text-slate-400">Family History:</span> <strong>{qaCollectedFields.familyMedicalHistory}</strong></p>
                        )}
                      </div>
                    </div>

                    {/* Section 5: Health Insurance */}
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                          <Shield size={14} className="text-teal-600" /> 5. Health Insurance
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-teal-700 font-semibold bg-teal-100 px-2 py-0.5 rounded-full">
                            {qaCollectedFields.hasInsurance !== undefined ? 'Populated' : 'Pending'}
                          </span>
                          <button
                            onClick={() => {
                              setCurrentQuestionId('hasInsurance');
                              setQaReviewMode(false);
                              speakQuestion(VOICE_QA_CATALOG.find(q => q.id === 'hasInsurance')?.question || '');
                            }}
                            className="text-[11px] text-teal-700 hover:text-teal-900 font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 size={11} /> Edit
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1 text-slate-800">
                        <p>
                          <span className="text-slate-400">Status:</span>{' '}
                          <strong>{qaCollectedFields.hasInsurance ? 'Active Health Insurance' : 'Self-Pay / None'}</strong>
                        </p>
                        {qaCollectedFields.hasInsurance && (
                          <>
                            <p><span className="text-slate-400">Provider:</span> <strong>{qaCollectedFields.insuranceProvider || 'Pending'}</strong></p>
                            <p><span className="text-slate-400">Policy #:</span> <strong>{qaCollectedFields.policyNumber || 'Pending'}</strong></p>
                            {qaCollectedFields.groupNumber && <p><span className="text-slate-400">Group #:</span> <strong>{qaCollectedFields.groupNumber}</strong></p>}
                            {qaCollectedFields.policyHolderName && (
                              <p><span className="text-slate-400">Subscriber:</span> <strong>{qaCollectedFields.policyHolderName} ({qaCollectedFields.relationshipToPolicyHolder || 'Self'})</strong></p>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Section 6: Visit Reason & Vitals */}
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                          <Stethoscope size={14} className="text-teal-600" /> 6. Visit Reason & Vitals
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-teal-700 font-semibold bg-teal-100 px-2 py-0.5 rounded-full">
                            {qaCollectedFields.chiefComplaint ? 'Populated' : 'Pending'}
                          </span>
                          <button
                            onClick={() => {
                              setCurrentQuestionId('department');
                              setQaReviewMode(false);
                              speakQuestion(VOICE_QA_CATALOG.find(q => q.id === 'department')?.question || '');
                            }}
                            className="text-[11px] text-teal-700 hover:text-teal-900 font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 size={11} /> Edit
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1 text-slate-800">
                        <p><span className="text-slate-400">Department:</span> <strong>{qaCollectedFields.department || 'General Medicine'}</strong></p>
                        <p><span className="text-slate-400">Physician:</span> <strong>{qaCollectedFields.consultingDoctor || 'Admissions Pool'}</strong></p>
                        <p><span className="text-slate-400">Chief Complaint:</span> <strong>{qaCollectedFields.chiefComplaint || 'Pending'}</strong> {qaCollectedFields.symptomDuration ? `(${qaCollectedFields.symptomDuration})` : ''}</p>
                        {qaCollectedFields.vitals && Object.values(qaCollectedFields.vitals).some(Boolean) && (
                          <p><span className="text-slate-400">Vitals:</span> <strong>
                            {[
                              qaCollectedFields.vitals.bloodPressureSystolic && `BP: ${qaCollectedFields.vitals.bloodPressureSystolic}/${qaCollectedFields.vitals.bloodPressureDiastolic || ''}`,
                              qaCollectedFields.vitals.heartRate && `HR: ${qaCollectedFields.vitals.heartRate} bpm`,
                              qaCollectedFields.vitals.temperature && `Temp: ${qaCollectedFields.vitals.temperature}°F`,
                              qaCollectedFields.vitals.respiratoryRate && `RR: ${qaCollectedFields.vitals.respiratoryRate} bpm`,
                              qaCollectedFields.vitals.oxygenSaturation && `SpO2: ${qaCollectedFields.vitals.oxygenSaturation}%`,
                              qaCollectedFields.vitals.heightCm && `Ht: ${qaCollectedFields.vitals.heightCm}cm`,
                              qaCollectedFields.vitals.weightKg && `Wt: ${qaCollectedFields.vitals.weightKg}kg`,
                              qaCollectedFields.vitals.bmi && `BMI: ${qaCollectedFields.vitals.bmi}`
                            ].filter(Boolean).join(' • ')}
                          </strong></p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Section 7 Notice */}
                  <div className="p-3.5 bg-slate-100 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                    <FileText size={16} className="text-slate-500 flex-shrink-0" />
                    <span>
                      <strong>Section 7: System-Generated Information</strong> (Registration ID, MRN, intake timestamps, and cryptographic audit hash) will be issued automatically upon official registration submission.
                    </span>
                  </div>
                </div>
              ) : !qaSessionStarted ? (
                /* Welcoming Hero Card */
                <div className="py-8 px-6 bg-gradient-to-b from-teal-50/50 via-white to-slate-50 border border-teal-200/80 rounded-3xl shadow-sm text-center space-y-6">
                  <div className="w-16 h-16 mx-auto rounded-3xl bg-gradient-to-tr from-teal-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-teal-600/30">
                    <Volume2 size={32} />
                  </div>

                  <div className="max-w-xl mx-auto space-y-2">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-100 text-teal-800 text-[11px] font-bold tracking-wide uppercase">
                      <Sparkles size={13} className="text-teal-600" />
                      Interactive Clinical Intake Flow
                    </div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">
                      Guided Step-by-Step Voice Registration
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      The assistant will ask one clear question at a time across each registration section, dynamically extracting your answers with Groq 20B AI and validating fields in real time.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto text-left text-xs">
                    <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-start gap-2.5 shadow-2xs">
                      <CheckCircle2 size={16} className="text-teal-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-slate-800 block">Complete 6-Section Intake</span>
                        <span className="text-slate-500 text-[11px]">Demographics, Contact, Emergency, History, Insurance, and Vitals.</span>
                      </div>
                    </div>
                    <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-start gap-2.5 shadow-2xs">
                      <Mic size={16} className="text-teal-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-slate-800 block">Voice or Typed Response</span>
                        <span className="text-slate-500 text-[11px]">Speak naturally or type answers directly into the active field.</span>
                      </div>
                    </div>
                    <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-start gap-2.5 shadow-2xs">
                      <SkipForward size={16} className="text-teal-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-slate-800 block">Skippable & Smart</span>
                        <span className="text-slate-500 text-[11px]">Say "skip", "none", or "I don't know" for any optional details.</span>
                      </div>
                    </div>
                    <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-start gap-2.5 shadow-2xs">
                      <FileText size={16} className="text-teal-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-slate-800 block">Review Before Applying</span>
                        <span className="text-slate-500 text-[11px]">Inspect and verify all captured fields before writing to the form.</span>
                      </div>
                    </div>
                  </div>

                  {guidedPopulatedCount > 0 && (
                    <div className="max-w-md mx-auto p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-600" />
                      <span>
                        <strong>{guidedPopulatedCount} field(s)</strong> already populated in form. Session will resume from the first missing item.
                      </span>
                    </div>
                  )}

                  <div className="pt-2">
                    <button
                      onClick={handleStartGuidedSession}
                      className="px-8 py-3.5 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl font-black text-sm shadow-xl shadow-teal-600/30 flex items-center gap-2.5 mx-auto transition-all transform hover:-translate-y-0.5 active:scale-95 cursor-pointer"
                    >
                      <Play size={18} fill="currentColor" /> Start Guided Voice Q&A
                    </button>
                  </div>
                </div>
              ) : (
                /* Interactive Step Question Flow */
                <div className="space-y-4">
                  {/* Progress Header */}
                  <div className="space-y-2 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900 tracking-tight">
                          Question {currentQuestionIndex + 1} of {totalApplicableQuestions}
                        </span>
                        <span className="bg-teal-100 text-teal-800 font-bold px-2.5 py-0.5 rounded-full text-[11px]">
                          Section {currentGuidedQuestion?.sectionNumber}: {currentGuidedQuestion?.sectionTitle}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                          <CheckCircle2 size={12} className="text-teal-600" />
                          {guidedPopulatedCount} Fields Captured
                        </span>
                        <button
                          onClick={() => setQaReviewMode(true)}
                          className="text-xs font-semibold text-slate-600 hover:text-teal-700 underline cursor-pointer px-1"
                        >
                          Review Summary
                        </button>
                        <button
                          onClick={handleResetGuidedSession}
                          className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                          title="Reset current voice session"
                        >
                          <RefreshCw size={12} /> Reset Session
                        </button>
                      </div>
                    </div>

                    {/* Sequential Progress Bar */}
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-teal-600 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.round(((currentQuestionIndex + 1) / totalApplicableQuestions) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Question Card */}
                  <div className="p-6 bg-gradient-to-b from-teal-50/40 via-white to-slate-50/50 border border-teal-200 rounded-2xl shadow-sm space-y-3 text-center">
                    <div className="flex items-center justify-center gap-2 text-teal-700">
                      <Volume2 size={20} className={isAssistantSpeaking ? 'animate-bounce text-teal-600' : ''} />
                      <span className="text-xs font-bold uppercase tracking-wider">AI Form Clinical Voice Guide:</span>
                    </div>

                    <h3 className="text-lg font-black text-slate-900 max-w-xl mx-auto leading-snug">
                      "{currentGuidedQuestion?.question}"
                    </h3>

                    <p className="text-xs text-slate-500 italic max-w-lg mx-auto">
                      {currentGuidedQuestion?.hint}
                    </p>

                    {/* Question audio repeat button & badges */}
                    <div className="pt-2 flex items-center justify-center gap-2">
                      <button
                        onClick={() => currentGuidedQuestion && speakQuestion(currentGuidedQuestion.question)}
                        className="px-3.5 py-1.5 bg-white border border-slate-200 hover:border-teal-300 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                      >
                        <Volume2 size={14} className="text-teal-600" /> Repeat Question
                      </button>
                      {currentGuidedQuestion?.isOptional && (
                        <span className="text-[11px] text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md font-medium">
                          Optional Question
                        </span>
                      )}
                      {currentGuidedQuestion?.isConditional && (
                        <span className="text-[11px] text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-md font-medium">
                          Conditional Question
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Extraction & Validation Feedback Notice */}
                  {qaNotice && (
                    <div className={`p-4 rounded-2xl border text-xs space-y-2 ${
                      qaNotice.type === 'success' ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900' :
                      qaNotice.type === 'warning' ? 'bg-amber-50/80 border-amber-200 text-amber-900' :
                      'bg-slate-50 border-slate-200 text-slate-800'
                    }`}>
                      <div className="flex items-start gap-2.5">
                        {qaNotice.type === 'success' && <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />}
                        {qaNotice.type === 'warning' && <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />}
                        {qaNotice.type === 'info' && <HelpCircle size={16} className="text-slate-500 flex-shrink-0 mt-0.5" />}
                        <div className="flex-1">
                          <p className="font-semibold leading-relaxed">{qaNotice.message}</p>
                        </div>
                      </div>

                      {/* Fields needing clarification with acceptable example guidance */}
                      {qaNotice.invalidFields && qaNotice.invalidFields.length > 0 && (
                        <div className="pl-6 pt-1 space-y-1.5">
                          <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider block">
                            Field Clarification Needed:
                          </span>
                          {qaNotice.invalidFields.map((inv, idx) => (
                            <div key={idx} className="bg-white/90 p-2.5 rounded-xl border border-amber-200 text-[11px] space-y-0.5">
                              <div className="font-bold text-slate-900 flex items-center justify-between">
                                <span>{inv.label}</span>
                                <span className="text-rose-600 font-semibold">{inv.error}</span>
                              </div>
                              <div className="text-slate-600 italic">
                                Acceptable format: <strong>{inv.example}</strong>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Successfully extracted field tags */}
                      {qaNotice.validFields && qaNotice.validFields.length > 0 && (
                        <div className="pl-6 pt-1 flex flex-wrap gap-1.5">
                          {qaNotice.validFields.map((vf, idx) => (
                            <span key={idx} className="bg-white text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-lg text-[10px] font-bold shadow-2xs">
                              ✓ {vf.key}: {String(typeof vf.value === 'object' ? JSON.stringify(vf.value) : vf.value)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Spoken Transcript Review & Keyboard Input Box */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label htmlFor="voice-qa-answer-input" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Your Spoken or Typed Response:
                      </label>
                      <span className="text-[11px] text-slate-500 font-medium">
                        {isListening ? (
                          <span className="text-rose-600 font-bold flex items-center gap-1 animate-pulse">
                            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block animate-ping"></span> Live Listening
                          </span>
                        ) : isSTTSupported ? (
                          'Editable transcript — speak or type'
                        ) : (
                          'Keyboard Entry Mode (Speech unconfigured)'
                        )}
                      </span>
                    </div>

                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                      <textarea
                        id="voice-qa-answer-input"
                        aria-label="Spoken or typed response for guided question"
                        rows={2}
                        value={qaTextInput || transcript || interimTranscript}
                        onChange={(e) => {
                          setQaTextInput(e.target.value);
                          if (transcript) setTranscript('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleProcessGuidedAnswer();
                          }
                        }}
                        placeholder="Click 'Start Microphone' and speak, or type your answer here (e.g. '120 over 80, pulse 72'). Press Enter to process."
                        className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30 font-medium transition-all"
                      />

                      {/* Microphone Controls & Action Buttons */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {!isListening ? (
                            <button
                              onClick={startListening}
                              aria-label="Start microphone recording"
                              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer focus:ring-2 focus:ring-teal-500"
                            >
                              <Mic size={15} /> Start Microphone
                            </button>
                          ) : (
                            <button
                              onClick={stopListening}
                              aria-label="Stop microphone recording"
                              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 animate-pulse shadow-xs cursor-pointer focus:ring-2 focus:ring-rose-500"
                            >
                              <Square size={15} /> Stop Recording
                            </button>
                          )}

                          <button
                            onClick={() => handleProcessGuidedAnswer()}
                            disabled={isProcessingQA || !(qaTextInput || transcript || interimTranscript).trim()}
                            aria-label="Process and validate answer"
                            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer focus:ring-2 focus:ring-teal-500 ${
                              (qaTextInput || transcript || interimTranscript).trim() && !isProcessingQA
                                ? 'bg-teal-700 hover:bg-teal-800 text-white shadow-xs'
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            {isProcessingQA ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                            Process Answer
                          </button>

                          {(qaTextInput || transcript || interimTranscript) && (
                            <>
                              <button
                                onClick={() => {
                                  setQaTextInput('');
                                  setTranscript('');
                                  setInterimTranscript('');
                                  startListening();
                                }}
                                title="Clear transcript and record again"
                                className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer focus:ring-2 focus:ring-slate-400"
                              >
                                <RotateCcw size={13} /> Record Again
                              </button>
                              <button
                                onClick={() => {
                                  setQaTextInput('');
                                  setTranscript('');
                                  setInterimTranscript('');
                                }}
                                title="Clear current input"
                                className="px-3 py-2 text-slate-500 hover:text-slate-800 text-xs font-semibold cursor-pointer"
                              >
                                Clear
                              </button>
                            </>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {currentQuestionIndex > 0 && (
                            <button
                              onClick={() => {
                                stopListening();
                                const prevQ = applicableQuestions[currentQuestionIndex - 1];
                                if (prevQ) {
                                  setPreviousQuestionId(currentGuidedQuestion?.id || null);
                                  setCurrentQuestionId(prevQ.id);
                                  speakQuestion(prevQ.question);
                                }
                              }}
                              className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer focus:ring-2 focus:ring-slate-400"
                            >
                              <ArrowLeft size={13} /> Prev
                            </button>
                          )}

                          <button
                            onClick={handleSkipCurrentQuestion}
                            className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer focus:ring-2 focus:ring-slate-400"
                          >
                            <SkipForward size={13} /> Skip
                          </button>
                        </div>
                      </div>

                      {/* Natural Correction & Repeat Quick Actions */}
                      <div className="pt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 border-t border-slate-200/70">
                        <span className="font-semibold text-slate-400">Quick Voice Commands:</span>
                        <button
                          onClick={() => currentGuidedQuestion && speakQuestion(currentGuidedQuestion.question)}
                          className="px-2 py-0.5 rounded-md bg-white border border-slate-200 hover:border-teal-300 text-slate-700 hover:text-teal-700 cursor-pointer"
                        >
                          "Repeat the question"
                        </button>
                        {previousQuestionId && (
                          <button
                            onClick={() => {
                              const prevQ = VOICE_QA_CATALOG.find(q => q.id === previousQuestionId);
                              if (prevQ) {
                                setQaTextInput(`Actually, `);
                              }
                            }}
                            className="px-2 py-0.5 rounded-md bg-white border border-slate-200 hover:border-purple-300 text-purple-700 hover:text-purple-900 cursor-pointer"
                          >
                            "Actually, change previous answer"
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                </div>
              )}

            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 2: FREEFORM VOICE INTAKE                                      */}
          {/* ================================================================= */}
          {activeTab === 'freeform' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col items-center justify-center text-center space-y-3">
                {/* Visual Audio Wave */}
                <div className="flex items-center gap-1.5 h-10">
                  {[...Array(9)].map((_, i) => (
                    <span
                      key={i}
                      className={`w-1 rounded-full transition-all duration-200 ${
                        isListening
                          ? 'bg-teal-500 animate-pulse'
                          : 'bg-slate-300'
                      }`}
                      style={{
                        height: isListening ? `${12 + ((i * 7) % 24)}px` : '8px',
                        animationDelay: `${i * 120}ms`
                      }}
                    />
                  ))}
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    {isListening ? 'Listening to your voice...' : 'Click the microphone to start speaking'}
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mt-1">
                    Speak naturally. Mention your full name, date of birth, allergies, current medications, phone number, and reason for visit in a single dictation.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {!isListening ? (
                    <button
                      onClick={startListening}
                      className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-semibold text-xs shadow-md shadow-teal-600/20 flex items-center gap-2 transition-transform active:scale-95 cursor-pointer"
                    >
                      <Mic size={16} /> Start Microphone
                    </button>
                  ) : (
                    <button
                      onClick={stopListening}
                      className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-semibold text-xs shadow-md shadow-rose-600/20 flex items-center gap-2 transition-transform active:scale-95 animate-pulse cursor-pointer"
                    >
                      <Square size={16} /> Stop Recording
                    </button>
                  )}

                  {transcript && (
                    <button
                      onClick={() => { setTranscript(''); setInterimTranscript(''); setExtractedData(null); }}
                      className="px-3 py-2 text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw size={13} /> Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Transcript Display Box */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Live Voice Transcription:
                </label>
                <div className="min-h-[100px] p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-mono leading-relaxed relative">
                  {transcript || interimTranscript ? (
                    <>
                      <span>{transcript}</span>
                      <span className="text-teal-600 italic font-semibold"> {interimTranscript}</span>
                    </>
                  ) : (
                    <span className="text-slate-400 italic">
                      Transcribed words will appear here as you speak...
                    </span>
                  )}
                </div>
              </div>

              {/* Real-time Extracted Entities */}
              {extractedData && Object.keys(extractedData.mappedFields || {}).length > 0 && (
                <div className="p-4 bg-teal-50/70 border border-teal-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                      <Sparkles size={14} className="text-teal-600" />
                      Detected {freeformCount} Medical Field(s) from Speech:
                    </span>
                    <div className="flex items-center gap-2">
                      {isExtractingAI && (
                        <span className="text-[11px] font-semibold text-purple-700 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                          <Loader2 size={11} className="animate-spin" /> Groq AI Enhancing...
                        </span>
                      )}
                      <span className="text-[11px] font-semibold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full">
                        {extractedData.stats?.highConfidenceCount || freeformCount} High Confidence
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {extractedData.mappedFields.firstName && (
                      <div className="bg-white p-2 rounded-lg border border-teal-100 text-xs">
                        <span className="text-[10px] text-slate-400 block font-semibold">NAME</span>
                        <span className="font-bold text-slate-800">{extractedData.mappedFields.firstName} {extractedData.mappedFields.lastName || ''}</span>
                      </div>
                    )}
                    {extractedData.mappedFields.dateOfBirth && (
                      <div className="bg-white p-2 rounded-lg border border-teal-100 text-xs">
                        <span className="text-[10px] text-slate-400 block font-semibold">DOB / AGE</span>
                        <span className="font-bold text-slate-800">{extractedData.mappedFields.dateOfBirth} {extractedData.mappedFields.age ? `(${extractedData.mappedFields.age} yrs)` : ''}</span>
                      </div>
                    )}
                    {extractedData.mappedFields.bloodGroup && (
                      <div className="bg-white p-2 rounded-lg border border-teal-100 text-xs">
                        <span className="text-[10px] text-slate-400 block font-semibold">BLOOD GROUP</span>
                        <span className="font-bold text-rose-600">{extractedData.mappedFields.bloodGroup}</span>
                      </div>
                    )}
                    {extractedData.mappedFields.phone && (
                      <div className="bg-white p-2 rounded-lg border border-teal-100 text-xs">
                        <span className="text-[10px] text-slate-400 block font-semibold">PHONE</span>
                        <span className="font-bold text-slate-800">{extractedData.mappedFields.phone}</span>
                      </div>
                    )}
                    {extractedData.mappedFields.emergencyContactName && (
                      <div className="bg-white p-2 rounded-lg border border-teal-100 text-xs">
                        <span className="text-[10px] text-slate-400 block font-semibold">EMERGENCY CONTACT</span>
                        <span className="font-bold text-slate-800">{extractedData.mappedFields.emergencyContactName} {extractedData.mappedFields.emergencyContactRelation ? `(${extractedData.mappedFields.emergencyContactRelation})` : ''}</span>
                      </div>
                    )}
                    {extractedData.mappedFields.hasAllergies && extractedData.mappedFields.allergies?.length > 0 && (
                      <div className="bg-white p-2 rounded-lg border border-rose-200 text-xs col-span-2">
                        <span className="text-[10px] text-rose-500 block font-bold">ALLERGIES</span>
                        <span className="font-bold text-rose-700">{extractedData.mappedFields.allergies.map(a => typeof a === 'string' ? a : a.allergen).join(', ')}</span>
                      </div>
                    )}
                    {extractedData.mappedFields.chronicConditions && extractedData.mappedFields.chronicConditions.length > 0 && (
                      <div className="bg-white p-2 rounded-lg border border-teal-100 text-xs col-span-2">
                        <span className="text-[10px] text-slate-400 block font-semibold">CONDITIONS</span>
                        <span className="font-medium text-slate-800">{extractedData.mappedFields.chronicConditions.join(', ')}</span>
                      </div>
                    )}
                    {extractedData.mappedFields.currentMedications && extractedData.mappedFields.currentMedications.length > 0 && (
                      <div className="bg-white p-2 rounded-lg border border-teal-100 text-xs col-span-2">
                        <span className="text-[10px] text-slate-400 block font-semibold">MEDICATIONS</span>
                        <span className="font-medium text-slate-800">
                          {extractedData.mappedFields.currentMedications.map(m => typeof m === 'string' ? m : `${m.name} ${m.dosage || ''}`).join(', ')}
                        </span>
                      </div>
                    )}
                    {extractedData.mappedFields.insuranceProvider && (
                      <div className="bg-white p-2 rounded-lg border border-teal-100 text-xs">
                        <span className="text-[10px] text-slate-400 block font-semibold">INSURANCE</span>
                        <span className="font-bold text-slate-800">{extractedData.mappedFields.insuranceProvider}</span>
                      </div>
                    )}
                    {extractedData.mappedFields.department && (
                      <div className="bg-white p-2 rounded-lg border border-teal-100 text-xs">
                        <span className="text-[10px] text-slate-400 block font-semibold">DEPARTMENT</span>
                        <span className="font-bold text-teal-800">{extractedData.mappedFields.department}</span>
                      </div>
                    )}
                    {extractedData.mappedFields.chiefComplaint && (
                      <div className="bg-white p-2 rounded-lg border border-teal-100 text-xs col-span-2 sm:col-span-3">
                        <span className="text-[10px] text-slate-400 block font-semibold">REASON / CHIEF COMPLAINT</span>
                        <span className="font-medium text-slate-800">{extractedData.mappedFields.chiefComplaint}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 3: PRE-RECORDED VOICE SAMPLES                                 */}
          {/* ================================================================= */}
          {activeTab === 'samples' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                Click any pre-recorded voice transcript below to instantly simulate speech-to-text input and test the AI extraction pipeline:
              </p>

              <div className="space-y-3">
                {SAMPLE_VOICE_INTAKES.map((s, idx) => (
                  <div
                    key={idx}
                    className="p-4 bg-slate-50 hover:bg-teal-50/50 border border-slate-200 hover:border-teal-300 rounded-xl transition-all cursor-pointer group"
                    onClick={() => {
                      loadSampleTranscript(s);
                      setActiveTab('freeform');
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-900 group-hover:text-teal-700 flex items-center gap-2">
                        <Play size={13} className="text-teal-600" />
                        {s.title}
                      </span>
                      <span className="text-[11px] font-semibold text-teal-600 bg-teal-100 px-2 py-0.5 rounded-full">
                        Test This Voice Sample
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 font-mono bg-white p-2.5 rounded-lg border border-slate-200">
                      "{s.transcript}"
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            Cancel
          </button>

          {activeTab === 'guided' ? (
            <button
              onClick={handleApplyGuidedToForm}
              disabled={guidedPopulatedCount === 0}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                guidedPopulatedCount > 0
                  ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-md shadow-teal-600/20'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <CheckCircle2 size={16} />
              Apply Information to Form ({guidedPopulatedCount} fields)
            </button>
          ) : (
            <button
              onClick={handleApplyFreeformToForm}
              disabled={freeformCount === 0}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                freeformCount > 0
                  ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-md shadow-teal-600/20'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <CheckCircle2 size={16} />
              Apply Detected Information to Form ({freeformCount} fields)
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
