import React, { useState, useEffect } from 'react';
import { Volume2, Play, Pause, Square, FastForward, CheckCircle2, Mic, Sparkles } from 'lucide-react';
import { ttsController, generateVerificationScript, isSpeechSynthesisSupported, createSpeechRecognizer, isSpeechRecognitionSupported } from '../services/speechService';

export default function TTSVerificationBar({
  patientData,
  onActiveSectionChange = () => {},
  onConfirmVerification = () => {}
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [activeSection, setActiveSection] = useState(null);
  const [currentSpokenText, setCurrentSpokenText] = useState('');
  const [rate, setRate] = useState(1.0);
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [isAwaitingVoiceConfirm, setIsAwaitingVoiceConfirm] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState('');

  const supported = isSpeechSynthesisSupported();

  useEffect(() => {
    if (supported && typeof window !== 'undefined' && window.speechSynthesis) {
      const updateVoices = () => {
        const vList = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
        setVoices(vList);
        if (vList.length > 0 && !selectedVoice) {
          // Prefer natural or high quality English voice
          const preferred = vList.find(v => /google|natural|samantha|karen|daniel/i.test(v.name)) || vList[0];
          setSelectedVoice(preferred);
        }
      };

      updateVoices();
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }

    return () => {
      ttsController.stop();
    };
  }, []);

  const startReadout = () => {
    if (!supported) {
      alert('Text-to-speech synthesis is not supported in this browser.');
      return;
    }

    const sections = generateVerificationScript(patientData);
    setIsPlaying(true);
    setIsPaused(false);
    setIsAwaitingVoiceConfirm(false);
    setConfirmStatus('');

    ttsController.speakSections(sections, {
      voice: selectedVoice,
      rate,
      pitch: 1.0,
      onSectionChange: (id, label, text) => {
        setActiveSection({ id, label });
        setCurrentSpokenText(text);
        onActiveSectionChange(id);
      },
      onEnd: () => {
        setIsPlaying(false);
        setIsPaused(false);
        setActiveSection(null);
        setCurrentSpokenText('Form read-out complete. Please confirm your registration.');
        
        // Prompt for voice confirmation
        promptVoiceConfirmation();
      },
      onError: (err) => {
        console.warn('TTS error:', err);
        setIsPlaying(false);
        setIsPaused(false);
      }
    });
  };

  const pauseReadout = () => {
    ttsController.pause();
    setIsPaused(true);
  };

  const resumeReadout = () => {
    ttsController.resume();
    setIsPaused(false);
  };

  const stopReadout = () => {
    ttsController.stop();
    setIsPlaying(false);
    setIsPaused(false);
    setActiveSection(null);
    setCurrentSpokenText('');
  };

  // Listen for voice confirmation: "Confirm" or "Yes"
  const promptVoiceConfirmation = () => {
    if (!isSpeechRecognitionSupported()) return;

    setIsAwaitingVoiceConfirm(true);
    setConfirmStatus('Listening for voice confirmation ("Confirm" or "Yes")...');

    const recognizer = createSpeechRecognizer({
      continuous: false,
      onResult: (text) => {
        const lower = text.toLowerCase();
        if (/confirm|yes|correct|agree|looks good|proceed|submit/i.test(lower)) {
          setConfirmStatus('Voice confirmation detected! Advancing to submission.');
          setIsAwaitingVoiceConfirm(false);
          onConfirmVerification();
        } else {
          setConfirmStatus(`Heard: "${text}". You can also click the Submit button below.`);
        }
      },
      onEnd: () => {
        setIsAwaitingVoiceConfirm(false);
      },
      onError: () => {
        setIsAwaitingVoiceConfirm(false);
      }
    });

    if (recognizer) {
      try {
        recognizer.start();
      } catch (e) {}
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 text-white p-5 rounded-3xl shadow-sm space-y-3">
      
      {/* Top Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
            isPlaying && !isPaused
              ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/40 animate-pulse'
              : 'bg-teal-800/60 text-teal-300'
          }`}>
            <Volume2 size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">Audio Form Verification</h3>
              <span className="text-[10px] font-semibold bg-teal-500/30 text-teal-200 border border-teal-400/30 px-2 py-0.5 rounded-full">
                Text-to-Speech
              </span>
            </div>
            <p className="text-xs text-teal-200/80">
              Listen to the complete clinical intake read aloud before final authorization.
            </p>
          </div>
        </div>

        {/* Audio Action Buttons */}
        <div className="flex items-center gap-2">
          {!isPlaying ? (
            <button
              onClick={startReadout}
              className="px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-xl font-bold text-xs shadow-md shadow-teal-500/20 flex items-center gap-1.5 transition-all transform active:scale-95"
            >
              <Play size={14} className="fill-current" /> Read Form Aloud
            </button>
          ) : (
            <>
              {isPaused ? (
                <button
                  onClick={resumeReadout}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold text-xs flex items-center gap-1.5"
                >
                  <Play size={14} className="fill-current" /> Resume
                </button>
              ) : (
                <button
                  onClick={pauseReadout}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold text-xs flex items-center gap-1.5"
                >
                  <Pause size={14} className="fill-current" /> Pause
                </button>
              )}

              <button
                onClick={stopReadout}
                className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold text-xs flex items-center gap-1.5"
              >
                <Square size={13} className="fill-current" /> Stop
              </button>
            </>
          )}

          {/* Speed Rate Toggle */}
          <div className="flex items-center bg-slate-800/80 rounded-xl p-1 text-xs border border-teal-800/50">
            {[1.0, 1.25].map((r) => (
              <button
                key={r}
                onClick={() => setRate(r)}
                className={`px-2 py-1 rounded-lg font-semibold transition-all ${
                  rate === r ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                {r}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Spoken subtitle ticker & Section indicator */}
      {(isPlaying || currentSpokenText) && (
        <div className="bg-slate-950/70 border border-teal-500/30 rounded-xl p-3 text-xs space-y-1.5 backdrop-blur-md">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-teal-400 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping inline-block" />
              READING SECTION: {activeSection ? activeSection.label.toUpperCase() : 'VERIFICATION SUMMARY'}
            </span>
            <span className="text-slate-400 font-mono text-[10px]">
              {selectedVoice ? selectedVoice.name.slice(0, 24) : 'Natural Voice Engine'}
            </span>
          </div>

          <p className="text-teal-50 font-medium text-xs leading-relaxed italic">
            "{currentSpokenText}"
          </p>
        </div>
      )}

      {/* Voice Confirmation status */}
      {isAwaitingVoiceConfirm && (
        <div className="bg-amber-500/20 border border-amber-400/40 rounded-xl p-3 flex items-center gap-2.5 text-xs text-amber-200">
          <Mic size={16} className="text-amber-400 animate-pulse flex-shrink-0" />
          <div className="flex-1">
            <span className="font-bold text-amber-300">Voice Confirmation Active: </span>
            <span>{confirmStatus || 'Say "Confirm" or "Yes" into your microphone to verify.'}</span>
          </div>
        </div>
      )}

    </div>
  );
}

