import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, RotateCcw, Volume2, CheckCircle2, AlertCircle } from 'lucide-react';

interface AudioVoiceRecorderProps {
  onAudioRecorded: (audioBlob: Blob, audioBase64: string) => void;
  onAudioCleared?: () => void;
  existingAudioUrl?: string | null;
  label?: string;
  helperText?: string;
}

export const AudioVoiceRecorder: React.FC<AudioVoiceRecorderProps> = ({
  onAudioRecorded,
  onAudioCleared,
  existingAudioUrl,
  label = 'Voice Note Recording (Hands-Free Dictation)',
  helperText = 'Speak patient dental history, past root canals, or allergies instead of typing.',
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(existingAudioUrl || null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (existingAudioUrl) {
      setAudioUrl(existingAudioUrl);
    }
  }, [existingAudioUrl]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    setPermissionError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);

        // Convert blob to base64 for submission
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64data = reader.result as string;
          onAudioRecorded(audioBlob, base64data);
        };

        // Stop all media tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start(250); // Collect slices every 250ms
      setIsRecording(true);
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Microphone access denied:', err);
      setPermissionError(
        err?.message?.includes('Permission denied') || err?.name === 'NotAllowedError'
          ? 'Microphone permission blocked. Please allow mic access in your browser bar.'
          : 'Could not access microphone on this device.'
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
  };

  const clearAudio = () => {
    if (audioUrl && audioUrl.startsWith('blob:')) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
    setIsPlaying(false);
    setRecordingDuration(0);
    if (onAudioCleared) onAudioCleared();
  };

  const togglePlayback = () => {
    if (!audioElementRef.current) return;
    if (isPlaying) {
      audioElementRef.current.pause();
      setIsPlaying(false);
    } else {
      audioElementRef.current.play();
      setIsPlaying(true);
    }
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainder = Math.floor(sec % 60);
    return `${mins.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  };

  return (
    <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-amber-100 text-amber-900">
            <Mic className="w-4 h-4 text-amber-800" />
          </div>
          <div>
            <h4 className="text-xs font-black text-slate-900">{label}</h4>
            <p className="text-[11px] text-slate-600 font-medium">{helperText}</p>
          </div>
        </div>

        {audioUrl && !isRecording && (
          <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-800 bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-full">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Voice Note Ready
          </span>
        )}
      </div>

      {permissionError && (
        <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{permissionError}</span>
        </div>
      )}

      {/* Recording in progress */}
      {isRecording && (
        <div className="flex items-center justify-between bg-white border border-rose-300 rounded-xl p-3 shadow-xs animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-rose-600 animate-ping" />
            <div>
              <span className="text-xs font-black text-rose-950">Recording Doctor Voice Note...</span>
              <p className="text-[10px] text-rose-700 font-mono font-bold">
                Time: {formatSeconds(recordingDuration)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={stopRecording}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-black text-xs cursor-pointer shadow-xs"
          >
            <Square className="w-3.5 h-3.5 fill-white" />
            <span>Done / Stop</span>
          </button>
        </div>
      )}

      {/* Has recorded audio */}
      {audioUrl && !isRecording && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={togglePlayback}
                className="w-8 h-8 rounded-full bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center cursor-pointer shadow-xs transition-all active:scale-95"
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
              </button>

              <div>
                <span className="text-xs font-bold text-slate-800">
                  {isPlaying ? 'Playing Audio Recording' : 'Doctor Audio Note'}
                </span>
                <p className="text-[10px] text-slate-500 font-mono">
                  {formatSeconds(playbackTime)} / {formatSeconds(audioDuration || recordingDuration)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={startRecording}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-lg cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Re-record</span>
              </button>

              <button
                type="button"
                onClick={clearAudio}
                className="px-2 py-1 text-[11px] font-bold text-slate-500 hover:text-rose-600 cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>

          <audio
            ref={audioElementRef}
            src={audioUrl}
            onTimeUpdate={() => {
              if (audioElementRef.current) {
                setPlaybackTime(audioElementRef.current.currentTime);
              }
            }}
            onLoadedMetadata={() => {
              if (audioElementRef.current) {
                setAudioDuration(audioElementRef.current.duration);
              }
            }}
            onEnded={() => {
              setIsPlaying(false);
              setPlaybackTime(0);
            }}
            className="hidden"
          />
        </div>
      )}

      {/* Idle - Ready to record */}
      {!audioUrl && !isRecording && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-600 font-medium">
            Click record to dictate past treatments, tooth numbers, or remarks:
          </span>

          <button
            type="button"
            onClick={startRecording}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-black text-xs rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
          >
            <Mic className="w-4 h-4" />
            <span>🎙️ Record Voice Note</span>
          </button>
        </div>
      )}
    </div>
  );
};
