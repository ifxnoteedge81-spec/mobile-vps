import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityNode,
  AgentRunStatus,
  ExecutionLogEntry,
  GuardrailRequest,
  VideoStudioState,
  VirtualAppItem,
  VirtualBrowserState,
  VirtualMobileProfile,
} from "../types/agent";
import { AndroidDevicePreview, VirtualLimbView } from "./AndroidDevicePreview";
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Mic,
  MicOff,
  Trash2,
  Film,
  Settings,
} from "lucide-react";

interface ConsoleTabProps {
  commandInput: string;
  onChangeCommand: (val: string) => void;
  status: AgentRunStatus;
  stepNumber: number;
  virtualProfile: VirtualMobileProfile;
  logs: ExecutionLogEntry[];
  onStart: (prompt?: string) => void;
  onPauseResume: () => void;
  onStop: () => void;
  onClearLogs: () => void;
  onVoiceLog: (title: string, detail: string) => void;
  onOpenSettings: () => void;
  browserState: VirtualBrowserState;
  activeLimbView: VirtualLimbView;
  onChangeLimbView: (view: VirtualLimbView) => void;
  activeAppKey: string;
  accessibilityNodes: AccessibilityNode[];
  highlightedNodeId: string;
  videoState: VideoStudioState;
  onAttachVideo: (file: File) => void;
  virtualApps: VirtualAppItem[];
  activeVirtualApp: VirtualAppItem | null;
  onInstallApp: (packageId: string) => void;
  onOpenVirtualApp: (app: VirtualAppItem) => void;
  onCloseVirtualApp: () => void;
  pendingGuardrail: GuardrailRequest | null;
  onResolveGuardrail: (approved: boolean) => void;
  onManualNavigate: (url: string) => void;
  isPhoneMinimized: boolean;
  onToggleMinimizePhone: () => void;
  isPhoneLocked: boolean;
  hasPrivacyPin: boolean;
  onLockPhone: () => void;
  onUnlockWithPin: (pin: string) => boolean;
}

const PHASE_TEXT_COLOR: Record<string, string> = {
  OBSERVE: "text-sky-400",
  PLAN: "text-teal-400",
  ACT: "text-emerald-400",
  VERIFY: "text-emerald-200",
  GUARDRAIL: "text-amber-400",
  ROUTER: "text-purple-400",
  VOICE: "text-pink-400",
  MEDIA: "text-cyan-400",
  STORE: "text-blue-400",
  MEMORY: "text-lime-400",
  SYSTEM: "text-slate-300",
  ERROR: "text-red-400",
};

export const ConsoleTab: React.FC<ConsoleTabProps> = ({
  commandInput,
  onChangeCommand,
  status,
  stepNumber,
  virtualProfile,
  logs,
  onStart,
  onPauseResume,
  onStop,
  onClearLogs,
  onVoiceLog,
  onOpenSettings,
  browserState,
  activeLimbView,
  onChangeLimbView,
  activeAppKey,
  accessibilityNodes,
  highlightedNodeId,
  videoState,
  onAttachVideo,
  virtualApps,
  activeVirtualApp,
  onInstallApp,
  onOpenVirtualApp,
  onCloseVirtualApp,
  pendingGuardrail,
  onResolveGuardrail,
  onManualNavigate,
  isPhoneMinimized,
  onToggleMinimizePhone,
  isPhoneLocked,
  hasPrivacyPin,
  onLockPhone,
  onUnlockWithPin,
}) => {
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const [voiceLang, setVoiceLang] = useState<"bn-BD" | "en-US">("bn-BD");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [autoRunVoice, setAutoRunVoice] = useState(true);
  const [voiceStatusText, setVoiceStatusText] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechRecRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  const isRunning = status === "RUNNING" || status === "AWAITING_CONFIRMATION";
  const isPaused = status === "PAUSED";

  const handleStartVoice = async () => {
    if (isRecording) {
      stopVoiceCapture();
      return;
    }

    setVoiceStatusText(
      voiceLang === "bn-BD" ? "মাইক্রোফোন চালু হচ্ছে..." : "Starting microphone..."
    );

    const win = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        continuous: boolean;
        onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
        onerror: (() => void) | null;
        onend: (() => void) | null;
        start: () => void;
        stop: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        continuous: boolean;
        onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
        onerror: (() => void) | null;
        onend: (() => void) | null;
        start: () => void;
        stop: () => void;
      };
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      let liveSpeechTranscript = "";
      const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          const rec = new SpeechRec();
          rec.lang = voiceLang;
          rec.interimResults = true;
          rec.continuous = true;
          rec.onresult = (event) => {
            let combined = "";
            for (let i = 0; i < event.results.length; i++) {
              combined += event.results[i][0]?.transcript ?? "";
            }
            liveSpeechTranscript = combined.trim();
            if (liveSpeechTranscript) {
              onChangeCommand(liveSpeechTranscript);
              setVoiceStatusText(`Live (${voiceLang}): ${liveSpeechTranscript}`);
            }
          };
          rec.onerror = () => {};
          rec.start();
          speechRecRef.current = rec;
        } catch {
          speechRecRef.current = null;
        }
      }

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        speechRecRef.current?.stop();
        speechRecRef.current = null;

        if (liveSpeechTranscript.trim()) {
          onVoiceLog(`Voice Transcript (${voiceLang})`, liveSpeechTranscript.trim());
          setVoiceStatusText(`Captured: ${liveSpeechTranscript.trim()}`);
          if (autoRunVoice) {
            onStart(liveSpeechTranscript.trim());
          }
          return;
        }

        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (blob.size < 200) {
          setVoiceStatusText("Recording too short.");
          return;
        }

        setIsTranscribing(true);
        setVoiceStatusText("Transcribing voice via Gemini...");

        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = String(reader.result || "");
              resolve(result.split(",")[1] || "");
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          const res = await fetch("/api/voice/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audioBase64: base64,
              mimeType,
              language: voiceLang,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Transcription failed");

          const text = (data.transcript || "").trim();
          if (text) {
            onChangeCommand(text);
            onVoiceLog(`Voice Transcript (${voiceLang})`, text);
            setVoiceStatusText(`Transcribed: ${text}`);
            if (autoRunVoice) {
              onStart(text);
            }
          } else {
            setVoiceStatusText("No speech detected in audio.");
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Voice transcription failed";
          setVoiceStatusText(msg);
          onVoiceLog("Voice Error", msg);
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start();
      setIsRecording(true);
      setVoiceStatusText(
        voiceLang === "bn-BD"
          ? "শুনছি... বাংলায় বা ইংরেজিতে বলুন, তারপর Stop Mic চাপুন"
          : "Listening... Speak your command, then press Stop Mic"
      );
    } catch {
      setVoiceStatusText("Microphone permission denied or unavailable.");
    }
  };

  const stopVoiceCapture = () => {
    setIsRecording(false);
    speechRecRef.current?.stop();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      <div className="lg:col-span-7 flex flex-col gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Autonomous Mobile Command Center
              </h2>
              <p className="text-xs text-slate-500 tabular-nums mt-0.5">
                {virtualProfile.envName} · {virtualProfile.allocatedRamGb} GB RAM · {status} · Step {stepNumber}
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenSettings}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Settings className="w-3.5 h-3.5" />
              Settings
            </button>
          </div>

          {/* Voice + Video Attach Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={voiceLang}
                onChange={(e) => setVoiceLang(e.target.value as "bn-BD" | "en-US")}
                aria-label="Voice Recognition Language"
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium"
              >
                <option value="bn-BD">বাংলা (bn-BD)</option>
                <option value="en-US">English (en-US)</option>
              </select>

              <button
                type="button"
                onClick={handleStartVoice}
                disabled={isTranscribing}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  isRecording
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-slate-900 hover:bg-slate-800 text-white"
                }`}
              >
                {isRecording ? (
                  <>
                    <MicOff className="w-3.5 h-3.5" />
                    Stop Mic
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5" />
                    {isTranscribing ? "Transcribing..." : "Voice Mic"}
                  </>
                )}
              </button>

              <label className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0">
                <Film className="w-3.5 h-3.5 text-teal-700" />
                <span>{videoState.attachedFileName ? "Video Attached" : "Attach Video"}</span>
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onAttachVideo(file);
                  }}
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRunVoice}
                onChange={(e) => setAutoRunVoice(e.target.checked)}
                className="rounded border-slate-300 text-teal-700"
              />
              Auto-run voice
            </label>
          </div>

          {videoState.attachedFileName && (
            <div className="text-xs font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
              <span className="truncate">
                Attached Video: {videoState.attachedFileName} ({videoState.attachedSizeMb.toFixed(2)} MB)
              </span>
              <span className="text-teal-800 shrink-0">{videoState.targetResolution}</span>
            </div>
          )}

          {voiceStatusText && (
            <div className="text-xs font-mono text-teal-800 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
              {voiceStatusText}
            </div>
          )}

          <textarea
            value={commandInput}
            onChange={(e) => onChangeCommand(e.target.value)}
            rows={3}
            placeholder="বাংলা বা ইংরেজিতে বলুন: যেমন 'Play Store থেকে WhatsApp ডাউনলোড করে দাও', 'আমার ঠিকানা মিরপুর-১০ সেভ করে রাখো', অথবা 'ভিডিওটা 720p এডিট করো'..."
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onStart()}
              disabled={!commandInput.trim() || isRunning || isPaused}
              className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              Run Command
            </button>

            <button
              type="button"
              onClick={onPauseResume}
              disabled={!isRunning && !isPaused}
              className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-800 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Pause className="w-3.5 h-3.5" />
              {isPaused ? "Resume" : "Pause"}
            </button>

            <button
              type="button"
              onClick={onStop}
              disabled={!isRunning && !isPaused}
              className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-red-50 disabled:opacity-40 text-red-700 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Square className="w-3.5 h-3.5" />
              Stop
            </button>

            <button
              type="button"
              onClick={() => onChangeCommand("")}
              disabled={!commandInput}
              className="px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 text-slate-700 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove Command
            </button>

            <button
              type="button"
              onClick={onClearLogs}
              className="px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Clear Log
            </button>
          </div>
        </div>

        {/* Live Scrolling Execution Console */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex-1 flex flex-col min-h-[380px] max-h-[480px]">
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-800 text-xs text-slate-400">
            <span className="font-semibold text-slate-200">
              Execution Console (Observe · Plan · Act · Store · Memory · Verify)
            </span>
            <span className="font-mono tabular-nums">
              {logs.length} / {virtualProfile.maxLogEntries} entries
            </span>
          </div>

          <div className="overflow-y-auto flex-1 space-y-2.5 pr-1 font-mono text-xs">
            {logs.length === 0 ? (
              <div className="text-slate-400 py-10 text-center leading-relaxed">
                Type or speak any command in বাংলা or English to control your isolated Virtual Mobile.
                <div className="text-[11px] text-slate-500 mt-1">
                  Try installing WhatsApp or imo from the built-in Play Store, saving accounts/passwords, or storing personal memory notes.
                </div>
              </div>
            ) : (
              logs.map((entry) => (
                <div
                  key={entry.id}
                  className="pb-2.5 border-b border-slate-900 last:border-b-0 space-y-1"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-500 tabular-nums">{entry.timestamp}</span>
                    <span
                      className={`font-semibold ${
                        PHASE_TEXT_COLOR[entry.phase] ?? "text-slate-300"
                      }`}
                    >
                      {entry.phase}
                    </span>
                    <span className="text-slate-100 font-medium">{entry.title}</span>
                  </div>
                  {entry.detail && (
                    <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-300 font-mono">
                      {entry.detail}
                    </pre>
                  )}
                  {entry.providerMeta && (
                    <div className="text-[11px] text-slate-500 tabular-nums">
                      Route: {entry.providerMeta}
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>

      {/* Right Column: Isolated Virtual Mobile Screen */}
      <div className="lg:col-span-5">
        <AndroidDevicePreview
          browserState={browserState}
          activeLimbView={activeLimbView}
          onChangeLimbView={onChangeLimbView}
          activeAppKey={activeAppKey}
          accessibilityNodes={accessibilityNodes}
          highlightedNodeId={highlightedNodeId}
          videoState={videoState}
          onAttachVideo={onAttachVideo}
          virtualApps={virtualApps}
          activeVirtualApp={activeVirtualApp}
          onInstallApp={onInstallApp}
          onOpenVirtualApp={onOpenVirtualApp}
          onCloseVirtualApp={onCloseVirtualApp}
          allocatedRamGb={virtualProfile.allocatedRamGb}
          status={status}
          pendingGuardrail={pendingGuardrail}
          onResolveGuardrail={onResolveGuardrail}
          onManualNavigate={onManualNavigate}
          isMinimized={isPhoneMinimized}
          onToggleMinimize={onToggleMinimizePhone}
          isLocked={isPhoneLocked}
          hasPrivacyPin={hasPrivacyPin}
          onLockPhone={onLockPhone}
          onUnlockWithPin={onUnlockWithPin}
        />
      </div>
    </div>
  );
};
