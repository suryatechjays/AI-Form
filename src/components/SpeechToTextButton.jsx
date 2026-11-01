import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { createSpeechRecognizer, isSpeechRecognitionSupported } from '../services/speechService';

/**
 * Inline Speech-to-Text Button for any individual input field
 * @param {Function} onTranscript - Callback with captured transcript (string)
 * @param {string} fieldName - Human friendly field name for tooltips/alerts
 * @param {string} size - 'sm' | 'md'
 * @param {boolean} append - If true, appends to existing text instead of replacing
 */
export default function SpeechToTextButton({
  onTranscript,
  fieldName = 'field',
  size = 'sm',
  className = ''
}) {
  const [isListening, setIsListening] = useState(false);
  const [hasInterim, setHasInterim] = useState(false);
  const recognizerRef = useRef(null);

  const supported = isSpeechRecognitionSupported();

  useEffect(() => {
    return () => {
      if (recognizerRef.current) {
        recognizerRef.current.abort();
      }
    };
  }, []);

  const toggleListening = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!supported) {
      alert('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    if (isListening) {
      if (recognizerRef.current) {
        recognizerRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const recognizer = createSpeechRecognizer({
      onStart: () => {
        setIsListening(true);
        setHasInterim(false);
      },
      onInterim: (text) => {
        setHasInterim(true);
      },
      onResult: (finalText) => {
        if (finalText && onTranscript) {
          onTranscript(finalText);
        }
      },
      onError: (err) => {
        console.warn('Microphone error:', err);
        setIsListening(false);
      },
      onEnd: () => {
        setIsListening(false);
        setHasInterim(false);
      },
      continuous: false
    });

    if (recognizer) {
      recognizerRef.current = recognizer;
      try {
        recognizer.start();
      } catch (err) {
        console.warn('Could not start recognition:', err);
        setIsListening(false);
      }
    }
  };

  const btnSize = size === 'sm' ? 'p-1.5 text-xs' : 'p-2 text-sm';
  const iconSize = size === 'sm' ? 14 : 16;

  return (
    <button
      type="button"
      onClick={toggleListening}
      title={isListening ? `Listening for ${fieldName}... Click to stop` : `Dictate ${fieldName} by voice`}
      className={`relative inline-flex items-center justify-center rounded-lg transition-all duration-200 ${btnSize} ${
        isListening
          ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30 ring-2 ring-rose-400 ring-offset-1 animate-pulse'
          : 'text-slate-400 hover:text-teal-600 hover:bg-teal-50'
      } ${className}`}
    >
      {isListening ? (
        <span className="flex items-center gap-1">
          <Mic size={iconSize} className="animate-bounce" />
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
        </span>
      ) : (
        <Mic size={iconSize} />
      )}
    </button>
  );
}

