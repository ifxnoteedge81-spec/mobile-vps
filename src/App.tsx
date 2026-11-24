import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AgentActionType,
  AgentPhase,
  AgentRunStatus,
  AgentStepPlan,
  CredentialEntry,
  ExecutionLogEntry,
  GeminiAccountSlot,
  GuardrailRequest,
  MemoryNoteEntry,
  PaymentMethodEntry,
  RouterEventRecord,
  ScheduledTask,
  SkillPolicyConfig,
  UserProfileVault,
  VideoStudioState,
  VirtualAppItem,
  VirtualBrowserState,
  VirtualMobileProfile,
  WorkspaceFile,
} from "./types/agent";
import {
  INITIAL_BROWSER_STATE,
  INITIAL_CREDENTIALS,
  INITIAL_GEMINI_SLOTS,
  INITIAL_MEMORIES,
  INITIAL_PAYMENT_METHODS,
  INITIAL_PLAY_STORE_CATALOG,
  INITIAL_SCHEDULED_TASKS,
  INITIAL_SKILL_POLICY,
  INITIAL_USER_PROFILE,
  INITIAL_VIDEO_STATE,
  INITIAL_VIRTUAL_PROFILE,
  INITIAL_WORKSPACE_FILES,
  OPENROUTER_FREE_MODEL_CASCADE,
  SIMULATED_ACCESSIBILITY_SCREENS,
} from "./data/initialEnvironment";
import { ConsoleTab } from "./components/ConsoleTab";
import { VirtualLimbView } from "./components/AndroidDevicePreview";
import { WorkspaceAndRouterTab } from "./components/WorkspaceAndRouterTab";
import { VaultAndQueueTab } from "./components/VaultAndQueueTab";
import { SettingsTab } from "./components/SettingsTab";
import { ApkDownloadPage } from "./components/ApkDownloadPage";
import { Settings } from "lucide-react";

type MainTab = "console" | "workspace" | "vault" | "settings";

function nowTime(): string {
  return new Date().toLocaleTimeString([], {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function loadStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function generateStrongSecret(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
  const arr = new Uint32Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (x) => chars[x % chars.length]).join("");
}

function hashPin(pin: string): string {
  let h = 2166136261;
  for (let i = 0; i < pin.length; i++) {
    h ^= pin.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export default function App() {
  const isDownloadPortal =
    import.meta.env.VITE_SITE_MODE === "download" ||
    (typeof window !== "undefined" &&
      (window.location.pathname === "/download" ||
        window.location.pathname === "/apk" ||
        window.location.pathname === "/download.html"));

  if (isDownloadPortal) {
    return <ApkDownloadPage />;
  }

  return <WorkbenchApp />;
}

function WorkbenchApp() {
  const [activeTab, setActiveTab] = useState<MainTab>("console");
  const [commandInput, setCommandInput] = useState<string>("");

  // Agent State
  const [status, setStatus] = useState<AgentRunStatus>("IDLE");
  const [stepNumber, setStepNumber] = useState<number>(0);
  const [virtualProfile, setVirtualProfile] = useState<VirtualMobileProfile>(() =>
    loadStored("karyo_virtual_profile", INITIAL_VIRTUAL_PROFILE)
  );
  const [skillPolicy, setSkillPolicy] = useState<SkillPolicyConfig>(() =>
    loadStored("karyo_skill_policy", INITIAL_SKILL_POLICY)
  );
  const [geminiSlots, setGeminiSlots] = useState<GeminiAccountSlot[]>(() =>
    loadStored("karyo_gemini_slots", INITIAL_GEMINI_SLOTS)
  );
  const [preferredModel, setPreferredModel] = useState<string>("gemini-4-hydrogen");
  const [openRouterFallbackModel, setOpenRouterFallbackModel] = useState<string>(
    OPENROUTER_FREE_MODEL_CASCADE[0]
  );
  const [simulateRateLimit, setSimulateRateLimit] = useState<boolean>(false);
  const [logs, setLogs] = useState<ExecutionLogEntry[]>([]);
  const [routerEvents, setRouterEvents] = useState<RouterEventRecord[]>([]);
  const [pendingGuardrail, setPendingGuardrail] = useState<GuardrailRequest | null>(null);

  // Virtual Phone & Privacy State
  const [isPhoneMinimized, setIsPhoneMinimized] = useState<boolean>(false);
  const [privacyPinHash, setPrivacyPinHash] = useState<string>(
    () => localStorage.getItem("karyo_privacy_pin_hash") || ""
  );
  const [isPhoneLocked, setIsPhoneLocked] = useState<boolean>(
    () => Boolean(localStorage.getItem("karyo_privacy_pin_hash"))
  );

  // Limbs State
  const [browserState, setBrowserState] = useState<VirtualBrowserState>(INITIAL_BROWSER_STATE);
  const [activeLimbView, setActiveLimbView] = useState<VirtualLimbView>("apps");
  const [activeAppKey, setActiveAppKey] = useState<string>("Settings");
  const [highlightedNodeId, setHighlightedNodeId] = useState<string>("");
  const [videoState, setVideoState] = useState<VideoStudioState>(INITIAL_VIDEO_STATE);
  const [virtualApps, setVirtualApps] = useState<VirtualAppItem[]>(() =>
    loadStored("karyo_virtual_apps", INITIAL_PLAY_STORE_CATALOG)
  );
  const [activeVirtualApp, setActiveVirtualApp] = useState<VirtualAppItem | null>(null);

  // Persisted Workspace, Profile Vault, Credentials, Payments, Memory & Task Queue
  const [userProfile, setUserProfile] = useState<UserProfileVault>(() =>
    loadStored("karyo_profile_vault", INITIAL_USER_PROFILE)
  );
  const [credentials, setCredentials] = useState<CredentialEntry[]>(() =>
    loadStored("karyo_credentials_vault", INITIAL_CREDENTIALS)
  );
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodEntry[]>(() =>
    loadStored("karyo_payment_methods", INITIAL_PAYMENT_METHODS)
  );
  const [memories, setMemories] = useState<MemoryNoteEntry[]>(() =>
    loadStored("karyo_ai_memories", INITIAL_MEMORIES)
  );
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>(() =>
    loadStored("karyo_workspace_files", INITIAL_WORKSPACE_FILES)
  );
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>(() =>
    loadStored("karyo_scheduled_tasks", INITIAL_SCHEDULED_TASKS)
  );

  // Refs for async loop coordination
  const statusRef = useRef<AgentRunStatus>("IDLE");
  const browserRef = useRef<VirtualBrowserState>(browserState);
  const filesRef = useRef<WorkspaceFile[]>(workspaceFiles);
  const profileRef = useRef<UserProfileVault>(userProfile);
  const credentialsRef = useRef<CredentialEntry[]>(credentials);
  const paymentsRef = useRef<PaymentMethodEntry[]>(paymentMethods);
  const memoriesRef = useRef<MemoryNoteEntry[]>(memories);
  const virtualAppsRef = useRef<VirtualAppItem[]>(virtualApps);
  const virtualProfileRef = useRef<VirtualMobileProfile>(virtualProfile);
  const skillPolicyRef = useRef<SkillPolicyConfig>(skillPolicy);
  const videoRef = useRef<VideoStudioState>(videoState);
  const activeAppRef = useRef<string>(activeAppKey);
  const guardrailResolverRef = useRef<((approved: boolean) => void) | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    browserRef.current = browserState;
  }, [browserState]);
  useEffect(() => {
    filesRef.current = workspaceFiles;
    localStorage.setItem("karyo_workspace_files", JSON.stringify(workspaceFiles));
  }, [workspaceFiles]);
  useEffect(() => {
    profileRef.current = userProfile;
    localStorage.setItem("karyo_profile_vault", JSON.stringify(userProfile));
  }, [userProfile]);
  useEffect(() => {
    credentialsRef.current = credentials;
    localStorage.setItem("karyo_credentials_vault", JSON.stringify(credentials));
  }, [credentials]);
  useEffect(() => {
    paymentsRef.current = paymentMethods;
    localStorage.setItem("karyo_payment_methods", JSON.stringify(paymentMethods));
  }, [paymentMethods]);
  useEffect(() => {
    memoriesRef.current = memories;
    localStorage.setItem("karyo_ai_memories", JSON.stringify(memories));
  }, [memories]);
  useEffect(() => {
    virtualAppsRef.current = virtualApps;
    localStorage.setItem("karyo_virtual_apps", JSON.stringify(virtualApps));
  }, [virtualApps]);
  useEffect(() => {
    virtualProfileRef.current = virtualProfile;
    localStorage.setItem("karyo_virtual_profile", JSON.stringify(virtualProfile));
  }, [virtualProfile]);
  useEffect(() => {
    skillPolicyRef.current = skillPolicy;
    localStorage.setItem("karyo_skill_policy", JSON.stringify(skillPolicy));
  }, [skillPolicy]);
  useEffect(() => {
    videoRef.current = videoState;
  }, [videoState]);
  useEffect(() => {
    localStorage.setItem("karyo_gemini_slots", JSON.stringify(geminiSlots));
  }, [geminiSlots]);
  useEffect(() => {
    localStorage.setItem("karyo_scheduled_tasks", JSON.stringify(scheduledTasks));
  }, [scheduledTasks]);
  useEffect(() => {
    activeAppRef.current = activeAppKey;
  }, [activeAppKey]);

  const appendLog = useCallback(
    (phase: AgentPhase, title: string, detail: string, providerMeta?: string) => {
      const maxEntries = virtualProfileRef.current.maxLogEntries;
      setLogs((prev) => [
        ...prev.slice(-(maxEntries - 1)),
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: nowTime(),
          phase,
          title,
          detail,
          providerMeta,
        },
      ]);
    },
    []
  );

  const handleSetPrivacyPin = (pin: string) => {
    const trimmed = pin.trim();
    if (!trimmed) {
      localStorage.removeItem("karyo_privacy_pin_hash");
      setPrivacyPinHash("");
      setIsPhoneLocked(false);
      return;
    }
    const hashed = hashPin(trimmed);
    localStorage.setItem("karyo_privacy_pin_hash", hashed);
    setPrivacyPinHash(hashed);
    setIsPhoneLocked(false);
  };

  const handleUnlockWithPin = (candidate: string): boolean => {
    if (!privacyPinHash) {
      setIsPhoneLocked(false);
      return true;
    }
    const ok = hashPin(candidate.trim()) === privacyPinHash;
    if (ok) setIsPhoneLocked(false);
    return ok;
  };

  const installVirtualAppByQuery = (queryOrPkg: string): VirtualAppItem => {
    const q = queryOrPkg.trim().toLowerCase();
    const existing = virtualAppsRef.current.find(
      (a) =>
        a.packageId.toLowerCase() === q ||
        a.appName.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
    );
    if (existing) {
      const updatedItem: VirtualAppItem = {
        ...existing,
        installed: true,
        installedAt: nowTime(),
      };
      const updatedList = virtualAppsRef.current.map((a) =>
        a.packageId === existing.packageId ? updatedItem : a
      );
      virtualAppsRef.current = updatedList;
      setVirtualApps(updatedList);
      return updatedItem;
    }
    const cleanName = queryOrPkg.trim() || "Custom App";
    const newApp: VirtualAppItem = {
      packageId: `com.virtualos.app.${cleanName.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
      appName: cleanName,
      category: "Play Store Download",
      webUrl: `https://play.google.com/store/search?q=${encodeURIComponent(cleanName)}&c=apps`,
      version: "1.0.0",
      installed: true,
      installedAt: nowTime(),
    };
    const updatedList = [newApp, ...virtualAppsRef.current];
    virtualAppsRef.current = updatedList;
    setVirtualApps(updatedList);
    return newApp;
  };

  const handleAttachVideo = (file: File) => {
    const sizeMb = file.size / (1024 * 1024);
    const nextVideo: VideoStudioState = {
      attachedFileName: file.name,
      attachedSizeMb: sizeMb,
      lastOperation: `Loaded ${file.name} (${sizeMb.toFixed(2)} MB) into Media3 Video Studio`,
      outputFilePath: "",
      watermarkText: "",
      targetResolution: "Original",
      muted: false,
    };
    videoRef.current = nextVideo;
    setVideoState(nextVideo);
    setActiveLimbView("video");
    appendLog("MEDIA", "Video Attached", `${file.name} (${sizeMb.toFixed(2)} MB) ready for Media3 edits.`);
  };

  const requestGuardrailApproval = (request: GuardrailRequest): Promise<boolean> => {
    return new Promise((resolve) => {
      guardrailResolverRef.current = resolve;
      setPendingGuardrail(request);
      setStatus("AWAITING_CONFIRMATION");
      statusRef.current = "AWAITING_CONFIRMATION";
    });
  };

  const handleResolveGuardrail = (approved: boolean) => {
    setPendingGuardrail(null);
    const resolver = guardrailResolverRef.current;
    guardrailResolverRef.current = null;
    if (resolver) {
      resolver(approved);
    }
  };

  const classifyGuardrail = (plan: AgentStepPlan): GuardrailRequest | null => {
    const policy = skillPolicyRef.current;
    const sensitiveText = `${plan.target} ${plan.value} ${plan.phaseNote}`.toLowerCase();

    if (plan.action === "WORKSPACE_DELETE_FILE" && !policy.requireConfirmOnDelete) {
      return null;
    }
    if (plan.action === "SEND_SHARE_INTENT" && !policy.requireConfirmOnShare) {
      return null;
    }

    const isSensitiveAction =
      ((plan.action === "SUBMIT_SENSITIVE_FORM" || plan.action === "ACCOUNT_LOGIN_OR_SIGNUP") &&
        policy.requireConfirmOnSubmit) ||
      plan.action === "PAYMENT_ACTION" ||
      (plan.action === "WORKSPACE_DELETE_FILE" && policy.requireConfirmOnDelete) ||
      (plan.action === "SEND_SHARE_INTENT" && policy.requireConfirmOnShare) ||
      (plan.requiresConfirmation && policy.requireConfirmOnSubmit) ||
      ((plan.action === "WEB_CLICK_ELEMENT" || plan.action === "ACCESSIBILITY_CLICK_NODE") &&
        policy.requireConfirmOnSubmit &&
        (sensitiveText.includes("submit") ||
          sensitiveText.includes("apply") ||
          sensitiveText.includes("delete") ||
          sensitiveText.includes("pay")));

    if (!isSensitiveAction) return null;

    const riskLevel =
      plan.action === "PAYMENT_ACTION"
        ? "CRITICAL"
        : plan.action === "WORKSPACE_DELETE_FILE" || plan.action === "SEND_SHARE_INTENT"
        ? "MEDIUM"
        : "HIGH";

    return {
      id: `guard-${Date.now()}`,
      action: plan.action,
      target: plan.target,
      proposedValue: plan.value,
      reason:
        plan.riskReason ||
        `Sensitive action (${plan.action}) requires explicit operator confirmation before execution.`,
      riskLevel,
    };
  };

  const buildObservationSnapshot = () => {
    const browser = browserRef.current;
    const isResearch = browser.url.includes("research.karyo.local");
    const webDom = isResearch
      ? {
          url: browser.url,
          title: "Low-Memory AI Automation on Android Devices",
          textPreview:
            "1. Enforce single-coroutine execution locks. 2. Cap AccessibilityNodeInfo traversal at 45-55 nodes. 3. Disable automatic WebView image decoding when virtual RAM <= 4 GB. 4. Rotate across 5 free Gemini keys and cascade 1 OpenRouter key across :free models.",
          elements: [],
        }
      : {
          url: browser.url,
          title: browser.title,
          elements: [
            { selector: "#fullName", type: "text", currentValue: browser.formFields.fullName },
            { selector: "#email", type: "email", currentValue: browser.formFields.email },
            { selector: "#phone", type: "tel", currentValue: browser.formFields.phone },
            { selector: "#portfolio", type: "url", currentValue: browser.formFields.portfolio },
            { selector: "#coverNote", type: "textarea", currentValue: browser.formFields.coverNote },
            { selector: "#submitApplication", type: "submit", text: "Submit Application" },
          ],
          submitted: browser.formFields.submitted,
        };

    const accScreen =
      SIMULATED_ACCESSIBILITY_SCREENS[activeAppRef.current] ??
      SIMULATED_ACCESSIBILITY_SCREENS.Settings;

    return {
      virtualMobileEnvironment: {
        name: virtualProfileRef.current.envName,
        allocatedRamGb: virtualProfileRef.current.allocatedRamGb,
        hostTotalRamGb: virtualProfileRef.current.hostTotalRamGb,
        maxConcurrentTasks: virtualProfileRef.current.maxConcurrentTasks,
      },
      enabledSkills: skillPolicyRef.current,
      attachedVideo: videoRef.current.attachedFileName ? videoRef.current : null,
      playStoreInstalledApps: virtualAppsRef.current
        .filter((a) => a.installed)
        .map((a) => ({ appName: a.appName, packageId: a.packageId })),
      userProfileVault: profileRef.current,
      savedCredentialsIndex: credentialsRef.current.map((c) => ({
        serviceName: c.serviceName,
        usernameOrEmail: c.usernameOrEmail,
        savedLocationPath: c.savedLocationPath,
      })),
      savedPaymentMethods: paymentsRef.current.map((p) => ({
        label: p.label,
        provider: p.provider,
        maskedIdentifier: p.maskedIdentifier,
        savedLocationPath: p.savedLocationPath,
      })),
      persistentMemories: memoriesRef.current.map((m) => ({
        category: m.category,
        title: m.title,
        content: m.content,
        savedLocationPath: m.savedLocationPath,
      })),
      webView: webDom,
      accessibilityScreen: {
        packageName: accScreen.packageName,
        screenTitle: accScreen.screenTitle,
        nodes: accScreen.nodes,
      },
      sandboxedWorkspaceFiles: filesRef.current.map((f) => ({
        path: f.path,
        chars: f.content.length,
      })),
    };
  };

  const executePlanAction = (plan: AgentStepPlan): { ok: boolean; message: string } => {
    const action: AgentActionType = plan.action;
    const policy = skillPolicyRef.current;

    const saveMediaMetadataFile = (outPath: string, summary: string) => {
      const cleanPath = outPath.replace(/^\/+/, "");
      const newFile: WorkspaceFile = {
        path: cleanPath,
        folder: "media",
        content: summary,
        updatedAt: nowTime(),
      };
      const updated = [...filesRef.current.filter((f) => f.path !== cleanPath), newFile];
      filesRef.current = updated;
      setWorkspaceFiles(updated);
    };

    switch (action) {
      case "PLAY_STORE_SEARCH": {
        if (!policy.playStoreInstallEnabled) {
          return { ok: false, message: "Play Store skill is disabled in Settings." };
        }
        setActiveLimbView("playstore");
        const q = plan.target.trim().toLowerCase();
        const matches = virtualAppsRef.current.filter(
          (a) => a.appName.toLowerCase().includes(q) || a.packageId.toLowerCase().includes(q)
        );
        return {
          ok: true,
          message:
            matches.length > 0
              ? `Found in Play Store: ${matches.map((m) => `${m.appName} (${m.packageId})`).join(", ")}`
              : `Prepared custom Play Store install package for "${plan.target}"`,
        };
      }

      case "PLAY_STORE_INSTALL": {
        if (!policy.playStoreInstallEnabled) {
          return { ok: false, message: "Play Store skill is disabled in Settings." };
        }
        const installed = installVirtualAppByQuery(plan.target);
        setActiveVirtualApp(installed);
        setActiveLimbView("apps");
        return {
          ok: true,
          message: `Downloaded & installed ${installed.appName} (${installed.packageId}) inside Isolated Virtual Phone Drawer.`,
        };
      }

      case "OPEN_VIRTUAL_APP": {
        const installed = installVirtualAppByQuery(plan.target);
        setActiveVirtualApp(installed);
        setActiveLimbView("apps");
        return {
          ok: true,
          message: `Opened ${installed.appName} inside Virtual Phone viewport (${installed.webUrl}).`,
        };
      }

      case "CREDENTIAL_GENERATE_AND_SAVE": {
        const parts = plan.value.split("|");
        const service = plan.target.trim() || "Service";
        const username =
          parts[0]?.trim() || profileRef.current.email || "user@karyoos.local";
        const notes = parts[1]?.trim() || "Auto-generated secure password";
        const location = `Vault -> Credentials -> ${service}`;
        const entry: CredentialEntry = {
          id: `cred-${Date.now()}`,
          serviceName: service,
          category: "APP_ACCOUNT",
          usernameOrEmail: username,
          secretValue: generateStrongSecret(),
          savedLocationPath: location,
          notes,
          updatedAt: nowTime(),
        };
        const updated = [
          ...credentialsRef.current.filter(
            (c) => c.serviceName.toLowerCase() !== service.toLowerCase()
          ),
          entry,
        ];
        credentialsRef.current = updated;
        setCredentials(updated);
        return {
          ok: true,
          message: `Generated strong password & saved ${service} account (Username: ${username}) at ${location}`,
        };
      }

      case "CREDENTIAL_SAVE": {
        const parts = plan.value.split("|");
        const service = plan.target.trim() || "Service";
        const username = parts[0]?.trim() || profileRef.current.email || "user@karyoos.local";
        const secret = parts[1]?.trim() || generateStrongSecret();
        const notes = parts[2]?.trim() || "";
        const location = `Vault -> Credentials -> ${service}`;
        const entry: CredentialEntry = {
          id: `cred-${Date.now()}`,
          serviceName: service,
          category: "APP_ACCOUNT",
          usernameOrEmail: username,
          secretValue: secret,
          savedLocationPath: location,
          notes,
          updatedAt: nowTime(),
        };
        const updated = [
          ...credentialsRef.current.filter(
            (c) =>
              !(
                c.serviceName.toLowerCase() === service.toLowerCase() &&
                c.usernameOrEmail.toLowerCase() === username.toLowerCase()
              )
          ),
          entry,
        ];
        credentialsRef.current = updated;
        setCredentials(updated);
        return {
          ok: true,
          message: `Saved ${service} credentials (Username: ${username}) at ${location}`,
        };
      }

      case "PAYMENT_METHOD_SAVE": {
        const parts = plan.value.split("|");
        const label = plan.target.trim() || "Primary Payment";
        const provider = parts[0]?.trim() || "Wallet/Card";
        const masked = parts[1]?.trim() || "****";
        const billing = parts[2]?.trim() || profileRef.current.location;
        const location = `Vault -> Payments -> ${label}`;
        const entry: PaymentMethodEntry = {
          id: `pm-${Date.now()}`,
          label,
          provider,
          maskedIdentifier: masked,
          billingAddress: billing,
          savedLocationPath: location,
          notes: "Saved via autonomous agent",
          updatedAt: nowTime(),
        };
        const updated = [
          ...paymentsRef.current.filter((p) => p.label.toLowerCase() !== label.toLowerCase()),
          entry,
        ];
        paymentsRef.current = updated;
        setPaymentMethods(updated);
        return {
          ok: true,
          message: `Saved payment method (${provider} ${masked}) at ${location}`,
        };
      }

      case "MEMORY_SAVE": {
        const parts = plan.value.split("|");
        const rawCat = (parts[0] || "IMPORTANT_NOTE").trim().toUpperCase();
        const validCats = new Set(["ADDRESS", "PREFERENCE", "IMPORTANT_NOTE", "SKILL_EVOLUTION", "FACT"]);
        const category = (validCats.has(rawCat) ? rawCat : "IMPORTANT_NOTE") as MemoryNoteEntry["category"];
        const content = parts.length > 1 ? parts.slice(1).join("|").trim() : plan.value.trim();
        const title = plan.target.trim() || "Saved Note";
        const location = `Vault -> Memory -> ${title}`;
        const entry: MemoryNoteEntry = {
          id: `mem-${Date.now()}`,
          category,
          title,
          content,
          savedLocationPath: location,
          updatedAt: nowTime(),
        };
        const updated = [
          ...memoriesRef.current.filter((m) => m.title.toLowerCase() !== title.toLowerCase()),
          entry,
        ];
        memoriesRef.current = updated;
        setMemories(updated);
        return {
          ok: true,
          message: `Saved to permanent AI Memory at ${location}: "${content.slice(0, 80)}"`,
        };
      }

      case "WEB_NAVIGATE": {
        if (!policy.webAutomationEnabled) {
          return { ok: false, message: "WebView automation is disabled in Settings." };
        }
        setActiveLimbView("webview");
        const nextUrl = plan.target.trim() || "https://jobs.karyo.local/apply";
        const isRes = nextUrl.includes("research.karyo.local");
        const nextState: VirtualBrowserState = {
          ...browserRef.current,
          url: nextUrl,
          title: isRes
            ? "Low-Memory AI Automation on Android Devices"
            : "KaryoTech Careers — Android Engineer Application",
          activeSelector: "",
        };
        browserRef.current = nextState;
        setBrowserState(nextState);
        return { ok: true, message: `Navigated WebView to ${nextUrl}` };
      }

      case "WEB_EXTRACT_DOM": {
        if (!policy.webAutomationEnabled) {
          return { ok: false, message: "WebView automation is disabled in Settings." };
        }
        setActiveLimbView("webview");
        return { ok: true, message: `Extracted DOM from ${browserRef.current.url}` };
      }

      case "WEB_FILL_INPUT": {
        if (!policy.webAutomationEnabled) {
          return { ok: false, message: "WebView automation is disabled in Settings." };
        }
        setActiveLimbView("webview");
        const sel = plan.target.trim();
        const val = plan.value;
        const fields = { ...browserRef.current.formFields };
        if (sel.includes("fullName")) fields.fullName = val;
        else if (sel.includes("email")) fields.email = val;
        else if (sel.includes("phone")) fields.phone = val;
        else if (sel.includes("portfolio")) fields.portfolio = val;
        else if (sel.includes("coverNote")) fields.coverNote = val;
        else return { ok: false, message: `Selector ${sel} not found in current DOM` };

        const nextState = {
          ...browserRef.current,
          activeSelector: sel,
          formFields: fields,
        };
        browserRef.current = nextState;
        setBrowserState(nextState);
        return { ok: true, message: `Filled ${sel} with "${val.slice(0, 60)}"` };
      }

      case "WEB_CLICK_ELEMENT":
      case "SUBMIT_SENSITIVE_FORM": {
        if (!policy.webAutomationEnabled) {
          return { ok: false, message: "WebView automation is disabled in Settings." };
        }
        setActiveLimbView("webview");
        const sel = plan.target.trim();
        if (sel.includes("submit")) {
          const nextState = {
            ...browserRef.current,
            activeSelector: sel,
            formFields: { ...browserRef.current.formFields, submitted: true },
          };
          browserRef.current = nextState;
          setBrowserState(nextState);
          return { ok: true, message: `Clicked ${sel} — application submitted.` };
        }
        const nextState = { ...browserRef.current, activeSelector: sel };
        browserRef.current = nextState;
        setBrowserState(nextState);
        return { ok: true, message: `Clicked element ${sel}` };
      }

      case "WEB_SCROLL": {
        if (!policy.webAutomationEnabled) {
          return { ok: false, message: "WebView automation is disabled in Settings." };
        }
        setActiveLimbView("webview");
        return { ok: true, message: `Scrolled WebView ${plan.value || "down"}` };
      }

      case "WORKSPACE_WRITE_FILE": {
        if (!policy.fileWorkspaceEnabled) {
          return { ok: false, message: "Sandboxed File Workspace is disabled in Settings." };
        }
        const cleanPath = (plan.target || "drafts/output.txt").replace(/^\/+/, "");
        const folder = cleanPath.includes("/") ? cleanPath.split("/")[0] : "drafts";
        const newFile: WorkspaceFile = {
          path: cleanPath,
          folder,
          content: plan.value,
          updatedAt: nowTime(),
        };
        const updated = [...filesRef.current.filter((f) => f.path !== cleanPath), newFile];
        filesRef.current = updated;
        setWorkspaceFiles(updated);
        return { ok: true, message: `Saved ${cleanPath} (${plan.value.length} chars)` };
      }

      case "WORKSPACE_READ_FILE": {
        if (!policy.fileWorkspaceEnabled) {
          return { ok: false, message: "Sandboxed File Workspace is disabled in Settings." };
        }
        const found = filesRef.current.find((f) => f.path === plan.target.trim());
        if (!found) return { ok: false, message: `File not found: ${plan.target}` };
        return { ok: true, message: `Read ${found.path}: ${found.content.slice(0, 220)}` };
      }

      case "WORKSPACE_LIST_FILES": {
        return {
          ok: true,
          message: filesRef.current.map((f) => f.path).join(", ") || "Workspace empty",
        };
      }

      case "WORKSPACE_DELETE_FILE": {
        if (!policy.fileWorkspaceEnabled) {
          return { ok: false, message: "Sandboxed File Workspace is disabled in Settings." };
        }
        const clean = plan.target.trim();
        const exists = filesRef.current.some((f) => f.path === clean);
        if (!exists) return { ok: false, message: `Cannot delete missing file ${clean}` };
        const updated = filesRef.current.filter((f) => f.path !== clean);
        filesRef.current = updated;
        setWorkspaceFiles(updated);
        return { ok: true, message: `Deleted ${clean}` };
      }

      case "ACCESSIBILITY_READ_SCREEN": {
        if (!policy.accessibilityControlEnabled) {
          return { ok: false, message: "Accessibility Service is disabled in Settings." };
        }
        setActiveLimbView("accessibility");
        const screen =
          SIMULATED_ACCESSIBILITY_SCREENS[activeAppRef.current] ??
          SIMULATED_ACCESSIBILITY_SCREENS.Settings;
        return {
          ok: true,
          message: `Captured ${screen.nodes.length} nodes from ${screen.packageName}`,
        };
      }

      case "ACCESSIBILITY_CLICK_NODE": {
        if (!policy.accessibilityControlEnabled) {
          return { ok: false, message: "Accessibility Service is disabled in Settings." };
        }
        setActiveLimbView("accessibility");
        setHighlightedNodeId(plan.target);
        return { ok: true, message: `Dispatched Accessibility CLICK on "${plan.target}"` };
      }

      case "ACCESSIBILITY_TYPE_TEXT": {
        if (!policy.accessibilityControlEnabled) {
          return { ok: false, message: "Accessibility Service is disabled in Settings." };
        }
        setActiveLimbView("accessibility");
        setHighlightedNodeId(plan.target);
        return {
          ok: true,
          message: `Dispatched ACTION_SET_TEXT ("${plan.value}") on "${plan.target}"`,
        };
      }

      case "ACCESSIBILITY_SCROLL":
      case "ACCESSIBILITY_GLOBAL_BACK": {
        if (!policy.accessibilityControlEnabled) {
          return { ok: false, message: "Accessibility Service is disabled in Settings." };
        }
        setActiveLimbView("accessibility");
        return { ok: true, message: `Executed ${action}` };
      }

      case "LAUNCH_APP": {
        if (!policy.accessibilityControlEnabled) {
          return { ok: false, message: "Accessibility / App Launch is disabled in Settings." };
        }
        const appName = plan.target.toLowerCase().includes("job") ? "JobPortal" : "Settings";
        activeAppRef.current = appName;
        setActiveAppKey(appName);
        setActiveLimbView("accessibility");
        return { ok: true, message: `Launched ${appName}` };
      }

      case "CLIPBOARD_SET": {
        if (!policy.clipboardAndShareEnabled) {
          return { ok: false, message: "Clipboard & Share skill is disabled in Settings." };
        }
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(plan.value).catch(() => {});
        }
        return { ok: true, message: `Copied "${plan.value.slice(0, 60)}" to clipboard.` };
      }

      case "SEND_SHARE_INTENT": {
        if (!policy.clipboardAndShareEnabled) {
          return { ok: false, message: "Clipboard & Share skill is disabled in Settings." };
        }
        return {
          ok: true,
          message: `Dispatched Share Intent (${plan.target || "Share"}): ${plan.value.slice(0, 80)}`,
        };
      }

      case "VIDEO_TRIM":
      case "VIDEO_RESIZE_COMPRESS":
      case "VIDEO_MUTE":
      case "VIDEO_WATERMARK": {
        if (!policy.videoEditingEnabled) {
          return { ok: false, message: "Media3 Video Editing is disabled in Settings." };
        }
        setActiveLimbView("video");
        const sourceName =
          videoRef.current.attachedFileName || plan.target.trim() || "sample_clip.mp4";
        const outPath = `media/edited_${action.toLowerCase()}_${sourceName.replace(/\.[^.]+$/, "")}.mp4.json`;
        const nextVideo: VideoStudioState = {
          ...videoRef.current,
          attachedFileName: sourceName,
          attachedSizeMb: videoRef.current.attachedSizeMb || 4.8,
          lastOperation: `${action} (${plan.value || "default"}) on ${sourceName}`,
          outputFilePath: outPath,
          targetResolution:
            action === "VIDEO_RESIZE_COMPRESS"
              ? `${plan.value || "720"}p`
              : videoRef.current.targetResolution,
          muted: action === "VIDEO_MUTE" ? true : videoRef.current.muted,
          watermarkText:
            action === "VIDEO_WATERMARK"
              ? plan.value || "KaryoOS"
              : videoRef.current.watermarkText,
        };
        videoRef.current = nextVideo;
        setVideoState(nextVideo);
        saveMediaMetadataFile(
          outPath,
          JSON.stringify(
            {
              engine: "Android Jetpack Media3 Transformer 1.5.1",
              operation: action,
              source: sourceName,
              parameter: plan.value,
              virtualRamGb: virtualProfileRef.current.allocatedRamGb,
              completedAt: nowTime(),
            },
            null,
            2
          )
        );
        return {
          ok: true,
          message: `Media3 Transformer completed ${action} (${plan.value || "default"}) -> ${outPath}`,
        };
      }

      case "ACCOUNT_LOGIN_OR_SIGNUP":
      case "PAYMENT_ACTION": {
        return { ok: true, message: `Executed approved ${action} on ${plan.target}` };
      }

      case "FINISH_TASK": {
        return { ok: true, message: plan.finalSummary || "Completed" };
      }

      default:
        return { ok: false, message: `Unsupported action ${action}` };
    }
  };

  const runAgentLoop = async (goalOverride?: string, taskIdToUpdate?: string) => {
    const goal = (goalOverride ?? commandInput).trim();
    if (!goal) return;

    if (
      statusRef.current === "RUNNING" ||
      statusRef.current === "AWAITING_CONFIRMATION"
    ) {
      appendLog(
        "SYSTEM",
        "Concurrency Lock",
        `Virtual Mobile (${virtualProfileRef.current.allocatedRamGb} GB RAM) already has an active session.`
      );
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setActiveTab("console");
    setStatus("RUNNING");
    statusRef.current = "RUNNING";
    setStepNumber(0);
    appendLog(
      "SYSTEM",
      `Session Started (${virtualProfileRef.current.allocatedRamGb} GB Virtual RAM)`,
      `Goal: ${goal}`
    );

    const recentHistory: string[] = [];
    const maxSteps = 10;
    const getLiveStatus = (): AgentRunStatus => statusRef.current;
    const enabledGeminiCount = geminiSlots.filter((s) => s.enabled).length || 5;

    try {
      for (let step = 1; step <= maxSteps; step++) {
        while (getLiveStatus() === "PAUSED") {
          await new Promise((r) => setTimeout(r, 250));
        }
        if (controller.signal.aborted || getLiveStatus() === "STOPPED") {
          return;
        }

        setStepNumber(step);
        const obs = buildObservationSnapshot();
        appendLog(
          "OBSERVE",
          `Step ${step} Observation`,
          `Virtual RAM: ${virtualProfileRef.current.allocatedRamGb}GB · Apps: ${obs.playStoreInstalledApps.length} · Memories: ${obs.persistentMemories.length}`
        );

        const res = await fetch("/api/agent/step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            goal,
            stepIndex: step,
            observation: obs,
            recentHistory,
            preferredModel,
            simulateRateLimit,
            activeGeminiSlotCount: enabledGeminiCount,
            openRouterFallbackModel,
          }),
        });

        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload.error || `Server error HTTP ${res.status}`);
        }

        const plan = payload.plan as AgentStepPlan;
        const meta = payload.routerMeta as {
          provider: string;
          modelId: string;
          keyLabel: string;
          latencyMs: number;
          rotationEvents: Array<{ from: string; to: string; reason: string }>;
        };

        const activeIdx = (step - 1) % Math.max(1, enabledGeminiCount);
        setGeminiSlots((prev) =>
          prev.map((slot, i) =>
            i === activeIdx
              ? { ...slot, requestsServed: slot.requestsServed + 1 }
              : slot
          )
        );

        if (meta.rotationEvents && meta.rotationEvents.length > 0) {
          meta.rotationEvents.forEach((ev) => {
            appendLog("ROUTER", "Automatic Key Rotation", `${ev.from} -> ${ev.to} (${ev.reason})`);
            setRouterEvents((prev) => [
              {
                id: `${Date.now()}-${Math.random()}`,
                timestamp: nowTime(),
                from: ev.from,
                to: ev.to,
                reason: ev.reason,
              },
              ...prev.slice(0, 19),
            ]);
          });
        }

        const routeText = `${meta.provider}:${meta.modelId} · ${meta.keyLabel} · ${meta.latencyMs}ms`;
        appendLog(
          "PLAN",
          `${plan.action}${plan.target ? ` -> ${plan.target}` : ""}`,
          `${plan.phaseNote}\nThought: ${plan.thought}\nSteps: ${plan.plannedSteps.join(" -> ")}`,
          routeText
        );

        if (plan.isDone || plan.action === "FINISH_TASK") {
          const summary = plan.finalSummary || plan.phaseNote || "Task completed successfully.";
          appendLog("VERIFY", "Task Completed", summary);
          setStatus("COMPLETED");
          statusRef.current = "COMPLETED";
          if (taskIdToUpdate) {
            setScheduledTasks((prev) =>
              prev.map((t) =>
                t.id === taskIdToUpdate
                  ? { ...t, status: "SUCCEEDED", lastRunAt: nowTime(), lastResult: summary }
                  : t
              )
            );
          }
          return;
        }

        const guardrail = classifyGuardrail(plan);
        if (guardrail) {
          appendLog(
            "GUARDRAIL",
            `Approval Required (${guardrail.riskLevel})`,
            `${guardrail.reason} Target: ${guardrail.target}`
          );
          const approved = await requestGuardrailApproval(guardrail);
          if (!approved) {
            appendLog(
              "GUARDRAIL",
              "Action Denied",
              `Operator denied ${plan.action}. Execution stopped safely.`
            );
            setStatus("STOPPED");
            statusRef.current = "STOPPED";
            return;
          }
          appendLog("GUARDRAIL", "Action Approved", `Operator authorized ${plan.action}.`);
          setStatus("RUNNING");
          statusRef.current = "RUNNING";
        }

        const outcome = executePlanAction(plan);
        const phaseForAct: AgentPhase = plan.action.startsWith("VIDEO_")
          ? "MEDIA"
          : plan.action.startsWith("PLAY_STORE_") || plan.action === "OPEN_VIRTUAL_APP"
          ? "STORE"
          : plan.action.startsWith("CREDENTIAL_") ||
            plan.action === "MEMORY_SAVE" ||
            plan.action === "PAYMENT_METHOD_SAVE"
          ? "MEMORY"
          : "ACT";
        if (outcome.ok) {
          appendLog(phaseForAct, `Executed ${plan.action}`, outcome.message);
          recentHistory.push(`Step ${step} OK (${plan.action}): ${outcome.message}`);
        } else {
          appendLog("VERIFY", "Recovered Step Error", outcome.message);
          recentHistory.push(`Step ${step} RECOVERED (${plan.action}): ${outcome.message}`);
        }

        await new Promise((r) => setTimeout(r, 300));
      }

      appendLog("VERIFY", "Step Budget Reached", "Stopped safely after 10 steps.");
      setStatus("COMPLETED");
      statusRef.current = "COMPLETED";
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        return;
      }
      const msg = err instanceof Error ? err.message : "Agent execution error";
      appendLog("ERROR", "Execution Failed", msg);
      setStatus("FAILED");
      statusRef.current = "FAILED";
      if (taskIdToUpdate) {
        setScheduledTasks((prev) =>
          prev.map((t) =>
            t.id === taskIdToUpdate
              ? { ...t, status: "FAILED", lastRunAt: nowTime(), lastResult: msg }
              : t
          )
        );
      }
    }
  };

  const handlePauseResume = () => {
    if (status === "RUNNING") {
      setStatus("PAUSED");
      statusRef.current = "PAUSED";
      appendLog("SYSTEM", "Paused", "Execution paused by operator.");
    } else if (status === "PAUSED") {
      setStatus("RUNNING");
      statusRef.current = "RUNNING";
      appendLog("SYSTEM", "Resumed", "Resuming execution loop.");
    }
  };

  const handleStop = () => {
    if (guardrailResolverRef.current) {
      handleResolveGuardrail(false);
    }
    abortControllerRef.current?.abort();
    setStatus("STOPPED");
    statusRef.current = "STOPPED";
    appendLog("SYSTEM", "Stopped", "Agent execution halted cleanly.");
  };

  const handleSaveWorkspaceFile = (path: string, content: string) => {
    const clean = path.replace(/^\/+/, "");
    const folder = clean.includes("/") ? clean.split("/")[0] : "drafts";
    setWorkspaceFiles((prev) => [
      ...prev.filter((f) => f.path !== clean),
      { path: clean, folder, content, updatedAt: nowTime() },
    ]);
  };

  const handleDeleteWorkspaceFile = async (path: string) => {
    let approved = true;
    if (skillPolicyRef.current.requireConfirmOnDelete) {
      approved = await requestGuardrailApproval({
        id: `del-${Date.now()}`,
        action: "WORKSPACE_DELETE_FILE",
        target: path,
        proposedValue: "",
        reason: `Deleting workspace file "${path}" is irreversible.`,
        riskLevel: "MEDIUM",
      });
      setStatus("IDLE");
      statusRef.current = "IDLE";
    }
    if (approved) {
      setWorkspaceFiles((prev) => prev.filter((f) => f.path !== path));
      appendLog("GUARDRAIL", "Workspace File Deleted", `Deleted ${path}.`);
    }
  };

  const handleManualNavigate = (url: string) => {
    const isRes = url.includes("research.karyo.local");
    setBrowserState((prev) => ({
      ...prev,
      url,
      title: isRes
        ? "Low-Memory AI Automation on Android Devices"
        : url.includes("jobs.karyo.local")
        ? "KaryoTech Careers — Android Engineer Application"
        : `Virtual App Container — ${url}`,
      activeSelector: "",
    }));
  };

  const activeAccScreen =
    SIMULATED_ACCESSIBILITY_SCREENS[activeAppKey] ??
    SIMULATED_ACCESSIBILITY_SCREENS.Settings;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Strict 3-Zone Top Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#console"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab("console");
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            KaryoOS
          </a>

          <nav className="flex items-center gap-6 text-sm font-medium overflow-x-auto">
            {[
              { id: "console", label: "Console" },
              { id: "workspace", label: "Workspace" },
              { id: "vault", label: "Vault & Memory" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id as MainTab)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  activeTab === item.id
                    ? "text-teal-800 border-teal-700 font-semibold"
                    : "text-slate-600 border-transparent hover:text-slate-900"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab("settings")}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === "settings"
                  ? "bg-teal-700 text-white"
                  : "bg-slate-900 hover:bg-slate-800 text-white"
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              Settings
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] w-full mx-auto px-6 py-6 flex-1">
        {activeTab === "console" && (
          <ConsoleTab
            commandInput={commandInput}
            onChangeCommand={setCommandInput}
            status={status}
            stepNumber={stepNumber}
            virtualProfile={virtualProfile}
            logs={logs}
            onStart={(p) => runAgentLoop(p)}
            onPauseResume={handlePauseResume}
            onStop={handleStop}
            onClearLogs={() => setLogs([])}
            onVoiceLog={(title, detail) => appendLog("VOICE", title, detail)}
            onOpenSettings={() => setActiveTab("settings")}
            browserState={browserState}
            activeLimbView={activeLimbView}
            onChangeLimbView={setActiveLimbView}
            activeAppKey={activeAppKey}
            accessibilityNodes={activeAccScreen.nodes}
            highlightedNodeId={highlightedNodeId}
            videoState={videoState}
            onAttachVideo={handleAttachVideo}
            virtualApps={virtualApps}
            activeVirtualApp={activeVirtualApp}
            onInstallApp={(pkg) => {
              const app = installVirtualAppByQuery(pkg);
              appendLog("STORE", "App Installed", `${app.appName} (${app.packageId}) added to Virtual Phone Drawer.`);
            }}
            onOpenVirtualApp={(app) => {
              setActiveVirtualApp(app);
              setActiveLimbView("apps");
            }}
            onCloseVirtualApp={() => setActiveVirtualApp(null)}
            pendingGuardrail={pendingGuardrail}
            onResolveGuardrail={handleResolveGuardrail}
            onManualNavigate={handleManualNavigate}
            isPhoneMinimized={isPhoneMinimized}
            onToggleMinimizePhone={() => setIsPhoneMinimized((v) => !v)}
            isPhoneLocked={isPhoneLocked}
            hasPrivacyPin={Boolean(privacyPinHash)}
            onLockPhone={() => setIsPhoneLocked(true)}
            onUnlockWithPin={handleUnlockWithPin}
          />
        )}

        {activeTab === "workspace" && (
          <WorkspaceAndRouterTab
            files={workspaceFiles}
            onSaveFile={handleSaveWorkspaceFile}
            onDeleteFile={handleDeleteWorkspaceFile}
          />
        )}

        {activeTab === "vault" && (
          <VaultAndQueueTab
            profile={userProfile}
            onSaveProfile={setUserProfile}
            credentials={credentials}
            onSaveCredential={(cred) => {
              const location = `Vault -> Credentials -> ${cred.serviceName}`;
              setCredentials((prev) => [
                {
                  ...cred,
                  id: `cred-${Date.now()}`,
                  savedLocationPath: location,
                  updatedAt: nowTime(),
                },
                ...prev,
              ]);
            }}
            onDeleteCredential={(id) =>
              setCredentials((prev) => prev.filter((c) => c.id !== id))
            }
            paymentMethods={paymentMethods}
            onSavePaymentMethod={(pm) => {
              const location = `Vault -> Payments -> ${pm.label}`;
              setPaymentMethods((prev) => [
                {
                  ...pm,
                  id: `pm-${Date.now()}`,
                  savedLocationPath: location,
                  updatedAt: nowTime(),
                },
                ...prev,
              ]);
            }}
            onDeletePaymentMethod={(id) =>
              setPaymentMethods((prev) => prev.filter((p) => p.id !== id))
            }
            memories={memories}
            onSaveMemory={(mem) => {
              const location = `Vault -> Memory -> ${mem.title}`;
              setMemories((prev) => [
                {
                  ...mem,
                  id: `mem-${Date.now()}`,
                  savedLocationPath: location,
                  updatedAt: nowTime(),
                },
                ...prev,
              ]);
            }}
            onDeleteMemory={(id) =>
              setMemories((prev) => prev.filter((m) => m.id !== id))
            }
            tasks={scheduledTasks}
            onAddTask={(task) =>
              setScheduledTasks((prev) => [
                { ...task, id: `task-${Date.now()}`, status: "QUEUED" },
                ...prev,
              ])
            }
            onDeleteTask={(id) =>
              setScheduledTasks((prev) => prev.filter((t) => t.id !== id))
            }
            onRunTaskNow={(task) => {
              setCommandInput(task.prompt);
              runAgentLoop(task.prompt, task.id);
            }}
          />
        )}

        {activeTab === "settings" && (
          <SettingsTab
            virtualProfile={virtualProfile}
            onUpdateVirtualProfile={setVirtualProfile}
            geminiSlots={geminiSlots}
            onUpdateGeminiSlots={setGeminiSlots}
            preferredModel={preferredModel}
            onChangePreferredModel={setPreferredModel}
            openRouterFallbackModel={openRouterFallbackModel}
            onChangeOpenRouterFallback={setOpenRouterFallbackModel}
            simulateRateLimit={simulateRateLimit}
            onToggleSimulateRateLimit={setSimulateRateLimit}
            routerEvents={routerEvents}
            skillPolicy={skillPolicy}
            onUpdateSkillPolicy={setSkillPolicy}
            hasPrivacyPin={Boolean(privacyPinHash)}
            onSetPrivacyPin={handleSetPrivacyPin}
          />
        )}
      </main>

      {pendingGuardrail && activeTab !== "console" && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-xl border border-slate-200 p-5 space-y-4 shadow-xl">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Guardrail Confirmation · {pendingGuardrail.riskLevel}
              </h3>
              <p className="text-xs text-slate-600 mt-1">{pendingGuardrail.reason}</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-mono space-y-1 text-slate-700">
              <div>Action: {pendingGuardrail.action}</div>
              <div>Target: {pendingGuardrail.target}</div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleResolveGuardrail(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Deny
              </button>
              <button
                type="button"
                onClick={() => handleResolveGuardrail(true)}
                className="px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
