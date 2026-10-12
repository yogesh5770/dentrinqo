import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, RotateCcw, AlertCircle, Sparkles, Check } from 'lucide-react';

interface SpeechToTextDictationProps {
  value: string;
  onChange: (text: string) => void;
  label?: string;
  placeholder?: string;
  helperText?: string;
  minRows?: number;
}

export const SpeechToTextDictation: React.FC<SpeechToTextDictationProps> = ({
  value,
  onChange,
  label = 'Clinical Voice Dictation (Speech to Text)',
  placeholder = 'Click "Start Dictation" and speak into microphone, or type clinical notes here...',
  helperText = 'Converts speech to text directly in real time. No audio recordings are saved or stored.',
  minRows = 3,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [supported, setSupported] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const shouldListenRef = useRef(false);
  const baseTextRef = useRef(value);

  // Keep baseTextRef in sync when not listening
  useEffect(() => {
    if (!isListening) {
      baseTextRef.current = value;
    }
  }, [value, isListening]);

  useEffect(() => {
    const SpeechRecognition =
      typeof window !== 'undefined' &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

    if (!SpeechRecognition) {
      setSupported(false);
    }

    return () => {
      shouldListenRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, []);

  const startListening = () => {
    const SpeechRecognition =
      typeof window !== 'undefined' &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

    if (!SpeechRecognition) {
      setSupported(false);
      setErrorMessage('Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
      return;
    }

    setErrorMessage(null);
    baseTextRef.current = value;
    setInterimText('');

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-IN'; // Indian English pronunciation standard

      recognition.onstart = () => {
        setIsListening(true);
        shouldListenRef.current = true;
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let finalizedUtterances = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalizedUtterances += transcript + ' ';
          } else {
            interim += transcript;
          }
        }

        if (finalizedUtterances) {
          const currentBase = baseTextRef.current.trim();
          const separator = currentBase ? (currentBase.endsWith('.') || currentBase.endsWith('\n') ? ' ' : '. ') : '';
          const newBase = currentBase ? `${currentBase}${separator}${finalizedUtterances.trim()}` : finalizedUtterances.trim();
          baseTextRef.current = newBase;
          onChange(newBase);
        }

        setInterimText(interim);
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setErrorMessage('Microphone access blocked. Please allow microphone permission in your browser address bar.');
          stopListening();
        } else if (event.error === 'network') {
          setErrorMessage('Speech service network issue. You can continue typing directly.');
        }
      };

      recognition.onend = () => {
        // If user didn't intentionally stop and wants to keep dictating, auto-reconnect
        if (shouldListenRef.current) {
          try {
            recognition.start();
          } catch {
            setIsListening(false);
            shouldListenRef.current = false;
          }
        } else {
          setIsListening(false);
          setInterimText('');
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.error('Failed to start speech recognition:', err);
      setErrorMessage('Could not initialize microphone. Please check your browser audio settings.');
      setIsListening(false);
      shouldListenRef.current = false;
    }
  };

  const stopListening = () => {
    shouldListenRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    setIsListening(false);
    setInterimText('');
  };

  const handleClear = () => {
    stopListening();
    onChange('');
    baseTextRef.current = '';
    setInterimText('');
  };

  return (
    <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-3 transition-all focus-within:border-teal-500 shadow-2xs">
      {/* Top Header & Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <label className="text-xs font-black text-slate-900 block flex items-center gap-1.5">
            <span>{label}</span>
            {isListening && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black animate-pulse">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                Listening...
              </span>
            )}
          </label>
          <p className="text-[11px] text-slate-500 font-medium mt-0.5">
            {helperText}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              title="Clear notes"
            >
              Clear
            </button>
          )}

          {isListening ? (
            <button
              type="button"
              onClick={stopListening}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs cursor-pointer shadow-xs transition active:scale-95 animate-pulse"
            >
              <MicOff className="w-3.5 h-3.5" />
              <span>Stop Dictation</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={startListening}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs cursor-pointer shadow-xs transition active:scale-95"
              title="Convert your voice speech into text"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Start Dictation</span>
            </button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Text Area for Live Transcribed Content & Manual Editing */}
      <div className="relative">
        <textarea
          rows={minRows}
          value={value}
          onChange={e => {
            onChange(e.target.value);
            baseTextRef.current = e.target.value;
          }}
          placeholder={placeholder}
          className="w-full text-xs font-bold text-slate-900 bg-slate-50/60 border border-slate-300 rounded-xl p-3 focus:border-teal-600 focus:bg-white focus:outline-none placeholder-slate-400 leading-relaxed font-sans"
        />

        {/* Live Interim Transcript overlay if speaking */}
        {isListening && interimText && (
          <div className="mt-1 px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-900 text-xs font-semibold italic flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-black text-teal-700 not-italic">Hearing:</span>
            <span>"{interimText}"</span>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium pt-0.5">
        <span>
          {value ? `${value.trim().split(/\s+/).filter(Boolean).length} words transcribed` : 'No text entered yet'}
        </span>
        <span className="text-[10px] text-slate-500 font-semibold">
          💡 You can speak or edit with keyboard anytime
        </span>
      </div>
    </div>
  );
};
