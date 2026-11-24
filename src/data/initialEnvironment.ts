import {
  AccessibilityNode,
  CredentialEntry,
  GeminiAccountSlot,
  MemoryNoteEntry,
  PaymentMethodEntry,
  ScheduledTask,
  SkillPolicyConfig,
  UserProfileVault,
  VideoStudioState,
  VirtualAppItem,
  VirtualBrowserState,
  VirtualMobileProfile,
  WorkspaceFile,
} from "../types/agent";

export const INITIAL_VIRTUAL_PROFILE: VirtualMobileProfile = {
  envName: "Virtual Mobile #1",
  hostTotalRamGb: 8,
  allocatedRamGb: 4,
  maxConcurrentTasks: 1,
  maxLogEntries: 150,
  maxDomChars: 5500,
  webViewImagesEnabled: false,
};

export const INITIAL_SKILL_POLICY: SkillPolicyConfig = {
  playStoreInstallEnabled: true,
  autoMemoryLearningEnabled: true,
  webAutomationEnabled: true,
  accessibilityControlEnabled: true,
  videoEditingEnabled: true,
  fileWorkspaceEnabled: true,
  voiceCommandsEnabled: true,
  clipboardAndShareEnabled: true,
  requireConfirmOnSubmit: true,
  requireConfirmOnDelete: true,
  requireConfirmOnShare: true,
};

export const INITIAL_VIDEO_STATE: VideoStudioState = {
  attachedFileName: "",
  attachedSizeMb: 0,
  lastOperation: "No video attached yet",
  outputFilePath: "",
  watermarkText: "",
  targetResolution: "Original",
  muted: false,
};

export const INITIAL_PLAY_STORE_CATALOG: VirtualAppItem[] = [
  {
    packageId: "com.whatsapp",
    appName: "WhatsApp",
    category: "Messaging & Calling",
    webUrl: "https://web.whatsapp.com",
    version: "2.24.22",
    installed: false,
  },
  {
    packageId: "com.imo.android.imoim",
    appName: "imo HD Video Calls",
    category: "Calling & Chat",
    webUrl: "https://imo.im",
    version: "2025.02",
    installed: false,
  },
  {
    packageId: "org.telegram.messenger",
    appName: "Telegram",
    category: "Messaging",
    webUrl: "https://web.telegram.org",
    version: "11.5.0",
    installed: false,
  },
  {
    packageId: "com.facebook.orca",
    appName: "Messenger",
    category: "Social & Calling",
    webUrl: "https://www.messenger.com",
    version: "485.0",
    installed: false,
  },
  {
    packageId: "com.facebook.katana",
    appName: "Facebook",
    category: "Social Media",
    webUrl: "https://m.facebook.com",
    version: "490.0",
    installed: false,
  },
  {
    packageId: "com.google.android.dialer",
    appName: "Virtual Phone & Calling",
    category: "Calling",
    webUrl: "https://voice.google.com",
    version: "152.0",
    installed: true,
    installedAt: "Built-in",
  },
  {
    packageId: "com.google.android.gm",
    appName: "Gmail",
    category: "Email",
    webUrl: "https://mail.google.com",
    version: "2025.01",
    installed: true,
    installedAt: "Built-in",
  },
  {
    packageId: "com.google.android.youtube",
    appName: "YouTube",
    category: "Media",
    webUrl: "https://m.youtube.com",
    version: "19.45",
    installed: false,
  },
  {
    packageId: "com.lemon.lvoverseas",
    appName: "CapCut Video Editor",
    category: "Video Editing",
    webUrl: "https://www.capcut.com/editor",
    version: "13.2",
    installed: false,
  },
];

export const INITIAL_CREDENTIALS: CredentialEntry[] = [];
export const INITIAL_PAYMENT_METHODS: PaymentMethodEntry[] = [];
export const INITIAL_MEMORIES: MemoryNoteEntry[] = [
  {
    id: "mem-1",
    category: "PREFERENCE",
    title: "Response Language & Reporting",
    content: "Always report exact Vault save paths after storing passwords, accounts, or addresses.",
    savedLocationPath: "Vault -> Memory -> Response Language & Reporting",
    updatedAt: "Initial",
  },
];

export const INITIAL_GEMINI_SLOTS: GeminiAccountSlot[] = [
  { id: "gem-1", accountLabel: "Gmail #1 (Primary)", enabled: true, status: "READY", requestsServed: 0 },
  { id: "gem-2", accountLabel: "Gmail #2 (Free Key)", enabled: true, status: "READY", requestsServed: 0 },
  { id: "gem-3", accountLabel: "Gmail #3 (Free Key)", enabled: true, status: "READY", requestsServed: 0 },
  { id: "gem-4", accountLabel: "Gmail #4 (Free Key)", enabled: true, status: "READY", requestsServed: 0 },
  { id: "gem-5", accountLabel: "Gmail #5 (Free Key)", enabled: true, status: "READY", requestsServed: 0 },
];

export const OPENROUTER_FREE_MODEL_CASCADE: string[] = [
  "google/gemini-2.0-flash-exp:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-chat-v3-0324:free",
  "qwen/qwen-2.5-72b-instruct:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
];

export const INITIAL_USER_PROFILE: UserProfileVault = {
  fullName: "Tariqul Islam",
  email: "tariqul.dev@example.com",
  phone: "+880 1711-004821",
  location: "Dhaka, Bangladesh",
  headline: "Android & AI Automation Engineer",
  education: "B.Sc. in Computer Science & Engineering, BUET",
  workExperience: "3 years building Kotlin Jetpack Compose apps and REST integrations",
  skills: "Kotlin, Jetpack Compose, Android AccessibilityService, WorkManager, Python, Gemini API",
  portfolioUrl: "https://github.com/tariqul-android",
  customInstructions:
    "Always verify sensitive submissions before confirming. Prefer concise Bengali or English summaries.",
};

export const INITIAL_WORKSPACE_FILES: WorkspaceFile[] = [
  {
    path: "research/4gb_ram_constraints.md",
    folder: "research",
    content: `# Android Virtual Mobile RAM Allocation Notes
- When Host Device has 8 GB RAM and Virtual Mobile is set to 4 GB:
  - 4 GB is reserved for the Host OS & foreground apps.
  - 4 GB virtual profile caps concurrent coroutines to 1, Accessibility nodes to 45, and log buffer to 150 lines.
- When set to 8 GB - 16 GB, WebView images & multi-tasking unlock automatically.`,
    updatedAt: "2026-11-24 09:15",
  },
  {
    path: "drafts/intro_pitch.txt",
    folder: "drafts",
    content:
      "Hello Hiring Team,\nI specialize in resilient Kotlin Android architectures, Accessibility automation, and edge-efficient AI workflows.",
    updatedAt: "2026-11-24 09:30",
  },
];

export const INITIAL_SCHEDULED_TASKS: ScheduledTask[] = [
  {
    id: "task-morning-brief",
    title: "Daily Android AI Research Digest",
    prompt:
      "https://research.karyo.local/android-4gb পেজটি ভিজিট করে মূল পয়েন্টগুলো পড়ে research/daily_digest.md ফাইলে বাংলায় সংক্ষেপে সেভ করো।",
    isRecurring: true,
    intervalHours: 24,
    requiresWifi: true,
    requiresBatteryNotLow: true,
    status: "QUEUED",
  },
  {
    id: "task-job-autofill",
    title: "Pre-fill Android Engineer Application",
    prompt:
      "Navigate to https://jobs.karyo.local/apply, inspect the DOM form, fill all applicant fields using my User Profile Vault, and stop for confirmation before clicking submit.",
    isRecurring: false,
    intervalHours: 12,
    requiresWifi: false,
    requiresBatteryNotLow: true,
    status: "QUEUED",
  },
];

export const INITIAL_BROWSER_STATE: VirtualBrowserState = {
  url: "https://jobs.karyo.local/apply",
  title: "KaryoTech Careers — Android Engineer Application",
  activeSelector: "",
  scrollY: 0,
  formFields: {
    fullName: "",
    email: "",
    phone: "",
    portfolio: "",
    coverNote: "",
    submitted: false,
  },
};

export const SIMULATED_ACCESSIBILITY_SCREENS: Record<
  string,
  { packageName: string; screenTitle: string; nodes: AccessibilityNode[] }
> = {
  Settings: {
    packageName: "com.android.settings",
    screenTitle: "Android Settings — Accessibility & Memory",
    nodes: [
      {
        id: "node-1",
        className: "TextView",
        resourceId: "action_bar_title",
        text: "Accessibility & System Services",
        clickable: false,
        editable: false,
        scrollable: false,
        bounds: "[48,112][680,176]",
      },
      {
        id: "node-2",
        className: "LinearLayout",
        resourceId: "karyo_service_row",
        text: "KaryoOS Virtual Limbs Service · Enabled",
        clickable: true,
        editable: false,
        scrollable: false,
        bounds: "[32,210][1048,340]",
      },
      {
        id: "node-3",
        className: "Switch",
        resourceId: "low_ram_profile_switch",
        text: "Virtual Mobile RAM Sandbox",
        clickable: true,
        editable: false,
        scrollable: false,
        bounds: "[32,356][1048,476]",
      },
      {
        id: "node-4",
        className: "EditText",
        resourceId: "settings_search_box",
        text: "Search settings...",
        clickable: true,
        editable: true,
        scrollable: false,
        bounds: "[32,500][1048,608]",
      },
    ],
  },
  JobPortal: {
    packageName: "com.virtualos.agent.webview",
    screenTitle: "WebView Container — jobs.karyo.local",
    nodes: [
      {
        id: "node-w1",
        className: "WebView",
        resourceId: "agent_webview_host",
        text: "KaryoTech Careers Application Form",
        clickable: false,
        editable: false,
        scrollable: true,
        bounds: "[0,140][1080,1920]",
      },
      {
        id: "node-w2",
        className: "EditText",
        resourceId: "fullName",
        text: "Applicant Full Name",
        clickable: true,
        editable: true,
        scrollable: false,
        bounds: "[48,380][1032,480]",
      },
      {
        id: "node-w3",
        className: "Button",
        resourceId: "submitApplication",
        text: "Submit Application",
        clickable: true,
        editable: false,
        scrollable: false,
        bounds: "[48,1540][1032,1660]",
      },
    ],
  },
};
