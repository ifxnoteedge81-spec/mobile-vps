import React, { useCallback, useEffect, useState } from "react";
import {
  EnvSlotStatus,
  EnvTestResult,
  GeminiAccountSlot,
  RouterEventRecord,
  SkillPolicyConfig,
  UniversalProviderId,
  VirtualMobileProfile,
} from "../types/agent";
import { OPENROUTER_FREE_MODEL_CASCADE } from "../data/initialEnvironment";
import {
  Cpu,
  KeyRound,
  ShieldCheck,
  Sliders,
  ArrowRightLeft,
  CheckCircle2,
  Lock,
  Server,
  RefreshCw,
  Copy,
  Zap,
  XCircle,
} from "lucide-react";

interface SettingsTabProps {
  virtualProfile: VirtualMobileProfile;
  onUpdateVirtualProfile: (profile: VirtualMobileProfile) => void;
  geminiSlots: GeminiAccountSlot[];
  onUpdateGeminiSlots: (slots: GeminiAccountSlot[]) => void;
  preferredProvider: UniversalProviderId;
  onChangePreferredProvider: (provider: UniversalProviderId) => void;
  preferredModel: string;
  onChangePreferredModel: (model: string) => void;
  openRouterFallbackModel: string;
  onChangeOpenRouterFallback: (model: string) => void;
  simulateRateLimit: boolean;
  onToggleSimulateRateLimit: (val: boolean) => void;
  routerEvents: RouterEventRecord[];
  skillPolicy: SkillPolicyConfig;
  onUpdateSkillPolicy: (policy: SkillPolicyConfig) => void;
  hasPrivacyPin: boolean;
  onSetPrivacyPin: (pin: string) => void;
}

const RAM_TIERS_GB = [1, 2, 4, 6, 8, 12, 16];

const PROVIDER_OPTIONS: Array<{ id: UniversalProviderId; label: string }> = [
  { id: "AUTO", label: "AUTO (Rotate Gemini -> Failover All Configured)" },
  { id: "GEMINI", label: "Gemini Priority (GEMINI_API_KEY + 1..5)" },
  { id: "OPENROUTER", label: "OpenRouter Priority (Free Model Cascade)" },
  { id: "OPENAI", label: "OpenAI Priority (GPT-4o / GPT-4o-mini)" },
  { id: "ANTHROPIC", label: "Anthropic Priority (Claude)" },
  { id: "GROQ", label: "Groq Priority (Llama 3.3 70B)" },
  { id: "DEEPSEEK", label: "DeepSeek Priority" },
  { id: "MISTRAL", label: "Mistral AI Priority" },
  { id: "CUSTOM", label: "Custom OpenAI-Compatible Server (Ollama / vLLM / xAI)" },
];

const SERVER_ENV_TEMPLATE = `# KaryoOS Universal Multi-AI Server Environment Variables
GEMINI_API_KEY=
GEMINI_API_KEY_1=
GEMINI_API_KEY_2=
GEMINI_API_KEY_3=
GEMINI_API_KEY_4=
GEMINI_API_KEY_5=
GEMINI_MODEL=gemini-4-hydrogen

OPENROUTER_API_KEY=
OPENROUTER_MODELS=google/gemini-2.0-flash-exp:free,meta-llama/llama-3.3-70b-instruct:free,deepseek/deepseek-chat-v3-0324:free

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-3-5-haiku-latest

GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile

DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat

MISTRAL_API_KEY=
MISTRAL_MODEL=mistral-small-latest

# Any Custom OpenAI-compatible AI (xAI Grok, Together, Fireworks, Ollama, LocalAI, vLLM)
CUSTOM_AI_NAME=Custom AI Server
CUSTOM_AI_BASE_URL=
CUSTOM_AI_API_KEY=
CUSTOM_AI_MODEL=

AI_PROVIDER_PRIORITY=AUTO
`;

export const SettingsTab: React.FC<SettingsTabProps> = ({
  virtualProfile,
  onUpdateVirtualProfile,
  geminiSlots,
  onUpdateGeminiSlots,
  preferredProvider,
  onChangePreferredProvider,
  preferredModel,
  onChangePreferredModel,
  openRouterFallbackModel,
  onChangeOpenRouterFallback,
  simulateRateLimit,
  onToggleSimulateRateLimit,
  routerEvents,
  skillPolicy,
  onUpdateSkillPolicy,
  hasPrivacyPin,
  onSetPrivacyPin,
}) => {
  const [pinInput, setPinInput] = useState("");
  const [pinNotice, setPinNotice] = useState("");
  const [envSlots, setEnvSlots] = useState<EnvSlotStatus[]>([]);
  const [envPriorityMode, setEnvPriorityMode] = useState<string>("AUTO");
  const [envLoading, setEnvLoading] = useState<boolean>(false);
  const [testingSlotId, setTestingSlotId] = useState<string | null>(null);
  const [testingAll, setTestingAll] = useState<boolean>(false);
  const [testResults, setTestResults] = useState<Record<string, EnvTestResult>>({});
  const [copyNotice, setCopyNotice] = useState<string>("");

  const fetchEnvStatus = useCallback(async () => {
    setEnvLoading(true);
    try {
      const res = await fetch("/api/brain/env-status");
      if (res.ok) {
        const data = (await res.json()) as {
          priorityMode: string;
          slots: EnvSlotStatus[];
        };
        setEnvSlots(data.slots || []);
        setEnvPriorityMode(data.priorityMode || "AUTO");
      }
    } catch {
      // ignore transient offline error
    } finally {
      setEnvLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEnvStatus();
  }, [fetchEnvStatus]);

  const handleTestEnvSlot = async (slotId: string) => {
    setTestingSlotId(slotId);
    try {
      const res = await fetch("/api/brain/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId }),
      });
      const result = (await res.json()) as EnvTestResult;
      setTestResults((prev) => ({ ...prev, [slotId]: result }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [slotId]: {
          ok: false,
          slotId,
          envVarName: slotId,
          modelId: "-",
          latencyMs: 0,
          message: err instanceof Error ? err.message : "Network error",
        },
      }));
    } finally {
      setTestingSlotId(null);
    }
  };

  const handleTestAllConfigured = async () => {
    const active = envSlots.filter((s) => s.configured);
    if (active.length === 0) return;
    setTestingAll(true);
    for (const slot of active) {
      await handleTestEnvSlot(slot.slotId);
    }
    setTestingAll(false);
  };

  const handleCopyEnvTemplate = () => {
    navigator.clipboard?.writeText(SERVER_ENV_TEMPLATE).catch(() => {});
    setCopyNotice("Copied .env template");
    setTimeout(() => setCopyNotice(""), 2200);
  };

  const applyRamSelection = (ramGb: number, hostGb = virtualProfile.hostTotalRamGb) => {
    const clamped = Math.max(1, Math.min(16, ramGb));
    const lowMode = clamped <= 4;
    onUpdateVirtualProfile({
      ...virtualProfile,
      hostTotalRamGb: hostGb,
      allocatedRamGb: clamped,
      maxConcurrentTasks: clamped <= 4 ? 1 : clamped <= 8 ? 2 : 3,
      maxLogEntries: clamped <= 2 ? 80 : clamped <= 4 ? 150 : clamped <= 8 ? 300 : 500,
      maxDomChars: clamped <= 2 ? 3500 : clamped <= 4 ? 5500 : 9000,
      webViewImagesEnabled: !lowMode,
    });
  };

  const toggleSlot = (id: string) => {
    onUpdateGeminiSlots(
      geminiSlots.map((slot) =>
        slot.id === id ? { ...slot, enabled: !slot.enabled } : slot
      )
    );
  };

  const updateSlotLabel = (id: string, label: string) => {
    onUpdateGeminiSlots(
      geminiSlots.map((slot) =>
        slot.id === id ? { ...slot, accountLabel: label } : slot
      )
    );
  };

  const toggleSkill = (key: keyof SkillPolicyConfig) => {
    onUpdateSkillPolicy({
      ...skillPolicy,
      [key]: !skillPolicy[key],
    });
  };

  const handleSavePin = () => {
    onSetPrivacyPin(pinInput);
    setPinNotice(pinInput.trim() ? "Privacy PIN updated." : "Privacy PIN removed.");
    setPinInput("");
    setTimeout(() => setPinNotice(""), 2000);
  };

  const hostReservedGb = Math.max(0, virtualProfile.hostTotalRamGb - virtualProfile.allocatedRamGb);

  const skillItems: Array<{
    key: keyof SkillPolicyConfig;
    title: string;
    detail: string;
  }> = [
    {
      key: "playStoreInstallEnabled",
      title: "Built-in Virtual Play Store & App Installer",
      detail: "Search and install WhatsApp, imo, Telegram, Calling & other apps directly inside the Virtual Phone",
    },
    {
      key: "autoMemoryLearningEnabled",
      title: "Autonomous Credential Vault & Self-Improving Memory",
      detail: "Save accounts, passwords, payment metadata, addresses & user preferences permanently across tasks",
    },
    {
      key: "videoEditingEnabled",
      title: "Media3 Video Editing Studio",
      detail: "Hardware-accelerated trim, 480p/720p/1080p compress, audio mute, and watermark overlay",
    },
    {
      key: "webAutomationEnabled",
      title: "WebView Browser Automation",
      detail: "DOM inspection, automated form fill, scrolling, and extraction inside sandboxed WebView",
    },
    {
      key: "accessibilityControlEnabled",
      title: "OS Accessibility Service Control",
      detail: "Inspect screen UI nodes, click buttons, type text, scroll, and launch apps",
    },
    {
      key: "fileWorkspaceEnabled",
      title: "Sandboxed File Workspace",
      detail: "Read/write research/, drafts/, scripts/, media/, and history/ inside isolated app storage",
    },
    {
      key: "voiceCommandsEnabled",
      title: "Bengali & English Voice Commands",
      detail: "Live bn-BD / en-US speech capture and audio command transcription",
    },
    {
      key: "clipboardAndShareEnabled",
      title: "Clipboard & Android Share Sheet",
      detail: "Copy outputs to Android clipboard and dispatch Android Share Intents",
    },
  ];

  const guardrailItems: Array<{
    key: keyof SkillPolicyConfig;
    title: string;
    detail: string;
  }> = [
    {
      key: "requireConfirmOnSubmit",
      title: "Confirm Final Submissions, Logins & Payments",
      detail: "Pause execution for human approval before SUBMIT_SENSITIVE_FORM, ACCOUNT_LOGIN_OR_SIGNUP, or PAYMENT_ACTION",
    },
    {
      key: "requireConfirmOnDelete",
      title: "Confirm File Deletions",
      detail: "Require operator approval before WORKSPACE_DELETE_FILE",
    },
    {
      key: "requireConfirmOnShare",
      title: "Confirm External Share Intents",
      detail: "Require approval before dispatching SEND_SHARE_INTENT outside the sandbox",
    },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: Virtual Mobile RAM + Privacy PIN + AI Brain */}
      <div className="lg:col-span-6 space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-teal-700" />
                Virtual Mobile RAM & Privacy Lock
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {virtualProfile.envName} · Host {virtualProfile.hostTotalRamGb} GB {"->"}{" "}
                {virtualProfile.allocatedRamGb} GB Virtual / {hostReservedGb} GB Host OS
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1 text-xs">
              <span className="font-medium text-slate-700 block">Virtual Mobile Name</span>
              <input
                type="text"
                value={virtualProfile.envName}
                onChange={(e) =>
                  onUpdateVirtualProfile({ ...virtualProfile, envName: e.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </label>

            <label className="space-y-1 text-xs">
              <span className="font-medium text-slate-700 block">Host Phone Total RAM</span>
              <select
                value={virtualProfile.hostTotalRamGb}
                onChange={(e) =>
                  applyRamSelection(virtualProfile.allocatedRamGb, Number(e.target.value))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs bg-white font-mono"
              >
                {[4, 6, 8, 12, 16, 24].map((gb) => (
                  <option key={gb} value={gb}>
                    {gb} GB Host RAM
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">
                Allocate Virtual Phone RAM (1 GB – 16 GB)
              </span>
              <span className="font-mono text-slate-500 tabular-nums">
                Tasks: {virtualProfile.maxConcurrentTasks} · Logs: {virtualProfile.maxLogEntries} · Images:{" "}
                {virtualProfile.webViewImagesEnabled ? "ON" : "OFF"}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {RAM_TIERS_GB.map((gb) => {
                const active = virtualProfile.allocatedRamGb === gb;
                return (
                  <button
                    key={gb}
                    type="button"
                    onClick={() => applyRamSelection(gb)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors whitespace-nowrap shrink-0 border ${
                      active
                        ? "bg-teal-700 text-white border-teal-700"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {gb} GB
                  </button>
                );
              })}

              <input
                type="number"
                min={1}
                max={16}
                value={virtualProfile.allocatedRamGb}
                onChange={(e) => applyRamSelection(Number(e.target.value) || 1)}
                aria-label="Custom Virtual RAM GB"
                className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-mono text-center"
              />
            </div>
          </div>

          {/* Privacy PIN Lock */}
          <div className="pt-3 border-t border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-teal-700" />
                Private Sandbox PIN Lock ({hasPrivacyPin ? "Enabled" : "Off"})
              </span>
              {pinNotice && <span className="text-emerald-700 font-medium">{pinNotice}</span>}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="4-6 digit PIN (leave empty to disable)"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono"
              />
              <button
                type="button"
                onClick={handleSavePin}
                className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap shrink-0"
              >
                {pinInput ? "Set PIN" : hasPrivacyPin ? "Disable PIN" : "Set PIN"}
              </button>
            </div>
          </div>
        </div>

        {/* Server Environment Variables & Universal AI Check */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Server className="w-4 h-4 text-teal-700" />
                Universal AI Environment Variables & Server Check
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Inspect server <code className="font-mono">process.env</code> keys across Gemini, OpenRouter, OpenAI, Claude, Groq, DeepSeek, Mistral & Custom AI
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={fetchEnvStatus}
                disabled={envLoading}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${envLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={handleTestAllConfigured}
                disabled={testingAll || envSlots.every((s) => !s.configured)}
                className="px-2.5 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Zap className="w-3.5 h-3.5" />
                {testingAll ? "Testing..." : "Test Configured"}
              </button>
              <button
                type="button"
                onClick={handleCopyEnvTemplate}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Copy className="w-3.5 h-3.5" />
                {copyNotice || "Copy .env Template"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <label className="space-y-1 text-xs sm:col-span-2">
              <span className="font-semibold text-slate-800 block">
                Active AI Provider Priority (Server Default: {envPriorityMode})
              </span>
              <select
                value={preferredProvider}
                onChange={(e) => onChangePreferredProvider(e.target.value as UniversalProviderId)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white font-medium text-slate-800"
              >
                {PROVIDER_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[340px] overflow-y-auto">
            {envSlots.length === 0 ? (
              <div className="p-4 text-xs text-slate-500">Loading server environment variable status...</div>
            ) : (
              envSlots.map((slot) => {
                const result = testResults[slot.slotId];
                const isTesting = testingSlotId === slot.slotId;
                return (
                  <div key={slot.slotId} className="p-3 space-y-1.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="font-mono font-semibold text-slate-900 text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">
                            {slot.envVarName}
                          </code>
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                              slot.configured
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-slate-100 text-slate-500 border border-slate-200"
                            }`}
                          >
                            {slot.configured ? "Configured" : "Not Set"}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                          {slot.label} · {slot.endpointHost} · Model:{" "}
                          <span className="font-mono text-slate-700">{slot.defaultModel}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTestEnvSlot(slot.slotId)}
                        disabled={isTesting}
                        className="px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 whitespace-nowrap shrink-0"
                      >
                        {isTesting ? "Testing..." : "Test"}
                      </button>
                    </div>
                    {result && (
                      <div
                        className={`flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1.5 rounded ${
                          result.ok
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : "bg-rose-50 text-rose-800 border border-rose-200"
                        }`}
                      >
                        {result.ok ? (
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-700" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 shrink-0 text-rose-700" />
                        )}
                        <span className="truncate">
                          {result.ok ? `OK (${result.latencyMs}ms)` : "ERROR"} · {result.message}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed">
            Server API secrets are read exclusively from server <code className="font-mono text-slate-900">.env</code> / hosting Secrets (Cloud Run, Render, Railway, VPS, or Netlify) and are never exposed to browser inputs. On your Android device after installing the APK, open{" "}
            <strong className="text-slate-900">Settings</strong> (<code className="font-mono text-slate-900">BrainSettingsScreen.kt</code>) to enter any AI key & endpoint locally in AES-256 encrypted storage.
          </div>
        </div>

        {/* AI Brain & Multi-Key Rotation */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="pb-3 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-teal-700" />
              AI Brain & Multi-Key Rotation
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {"5 Gmail Gemini free keys rotate first, then OpenRouter :free models & any configured AI fallback"}
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-800">5 Free Gemini Account Slots</div>
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
              {geminiSlots.map((slot, idx) => (
                <div
                  key={slot.id}
                  className="px-3 py-2 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-mono text-slate-400 tabular-nums">#{idx + 1}</span>
                    <input
                      type="text"
                      value={slot.accountLabel}
                      onChange={(e) => updateSlotLabel(slot.id, e.target.value)}
                      className="flex-1 min-w-0 rounded border border-slate-200 px-2 py-1 text-xs text-slate-800"
                    />
                  </div>
                  <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                    {slot.requestsServed} reqs
                  </span>
                  <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={slot.enabled}
                      onChange={() => toggleSlot(slot.id)}
                      className="rounded border-slate-300 text-teal-700"
                    />
                    Active
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800">
                1 OpenRouter Key · Free-Model Cascade
              </span>
              <select
                value={openRouterFallbackModel}
                onChange={(e) => onChangeOpenRouterFallback(e.target.value)}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-mono bg-white max-w-[240px]"
              >
                {OPENROUTER_FREE_MODEL_CASCADE.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs">
              {OPENROUTER_FREE_MODEL_CASCADE.map((modelId, i) => (
                <div key={modelId} className="px-3 py-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-slate-800 truncate">
                    {i + 1}. {modelId}
                  </span>
                  <span className="text-[11px] text-emerald-700 font-medium whitespace-nowrap shrink-0">
                    Per-model cooldown
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Live Web Model</label>
              <select
                value={preferredModel}
                onChange={(e) => onChangePreferredModel(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono bg-white"
              >
                <option value="gemini-4-hydrogen">gemini-4-hydrogen</option>
                <option value="gemini-4-neon">gemini-4-neon</option>
              </select>
            </div>

            <label className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer">
              <div>
                <div className="text-xs font-semibold text-slate-900">Simulate 429 Cascade</div>
                <div className="text-[11px] text-slate-500">
                  Rotate 5 Gmail keys {"->"} OpenRouter
                </div>
              </div>
              <input
                type="checkbox"
                checked={simulateRateLimit}
                onChange={(e) => onToggleSimulateRateLimit(e.target.checked)}
                className="rounded border-slate-300 text-teal-700"
              />
            </label>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
              <ArrowRightLeft className="w-3.5 h-3.5 text-slate-500" />
              Rotation Events
            </div>
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 min-h-[80px] max-h-[140px] overflow-y-auto space-y-2 text-[11px] font-mono">
              {routerEvents.length === 0 ? (
                <div className="text-slate-500">
                  No failover rotations yet. Enable "Simulate 429 Cascade" and run a command in Console to inspect rotation.
                </div>
              ) : (
                routerEvents.map((ev) => (
                  <div key={ev.id} className="pb-1.5 border-b border-slate-200 last:border-b-0">
                    <div className="text-slate-800 font-semibold">
                      {ev.timestamp} · {ev.from} {"->"} {ev.to}
                    </div>
                    <div className="text-slate-600">{ev.reason}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Virtual Mobile Skills + Guardrails + Permissions */}
      <div className="lg:col-span-6 space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="pb-3 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-teal-700" />
              Virtual Mobile Skills & Limbs
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enable or restrict which capabilities the autonomous Virtual Phone can execute
            </p>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {skillItems.map((item) => (
              <label
                key={item.key}
                className="p-3.5 flex items-start justify-between gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
              >
                <div>
                  <div className="text-xs font-semibold text-slate-900">{item.title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{item.detail}</div>
                </div>
                <input
                  type="checkbox"
                  checked={skillPolicy[item.key]}
                  onChange={() => toggleSkill(item.key)}
                  className="mt-1 rounded border-slate-300 text-teal-700"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="pb-3 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-700" />
              Guardrails & Android Permissions
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Human-in-the-loop safety locks and post-install OS permission checklist
            </p>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {guardrailItems.map((item) => (
              <label
                key={item.key}
                className="p-3.5 flex items-start justify-between gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
              >
                <div>
                  <div className="text-xs font-semibold text-slate-900">{item.title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{item.detail}</div>
                </div>
                <input
                  type="checkbox"
                  checked={skillPolicy[item.key]}
                  onChange={() => toggleSkill(item.key)}
                  className="mt-1 rounded border-slate-300 text-teal-700"
                />
              </label>
            ))}
          </div>

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-xs text-slate-700">
            <div className="font-semibold text-slate-900">
              Android Device Permissions Required After APK Install
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-700 shrink-0" />
              <span>Accessibility Service: Enable "KaryoOS Virtual Limbs Service"</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-700 shrink-0" />
              <span>Microphone (RECORD_AUDIO): Required for বাংলা / English voice commands</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-700 shrink-0" />
              <span>Media / Videos (READ_MEDIA_VIDEO): Required for Media3 Video Editing</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-700 shrink-0" />
              <span>Battery Optimization: Set to "Unrestricted" for background & minimized operation</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
