export type AgentRunStatus =
  | "IDLE"
  | "RUNNING"
  | "PAUSED"
  | "AWAITING_CONFIRMATION"
  | "COMPLETED"
  | "FAILED"
  | "STOPPED";

export type AgentPhase =
  | "OBSERVE"
  | "PLAN"
  | "ACT"
  | "VERIFY"
  | "GUARDRAIL"
  | "ROUTER"
  | "VOICE"
  | "MEDIA"
  | "STORE"
  | "MEMORY"
  | "SYSTEM"
  | "ERROR";

export type AgentActionType =
  | "PLAY_STORE_SEARCH"
  | "PLAY_STORE_INSTALL"
  | "OPEN_VIRTUAL_APP"
  | "CREDENTIAL_SAVE"
  | "CREDENTIAL_GENERATE_AND_SAVE"
  | "PAYMENT_METHOD_SAVE"
  | "MEMORY_SAVE"
  | "WEB_NAVIGATE"
  | "WEB_EXTRACT_DOM"
  | "WEB_FILL_INPUT"
  | "WEB_CLICK_ELEMENT"
  | "WEB_SCROLL"
  | "WORKSPACE_WRITE_FILE"
  | "WORKSPACE_READ_FILE"
  | "WORKSPACE_LIST_FILES"
  | "WORKSPACE_DELETE_FILE"
  | "ACCESSIBILITY_READ_SCREEN"
  | "ACCESSIBILITY_CLICK_NODE"
  | "ACCESSIBILITY_TYPE_TEXT"
  | "ACCESSIBILITY_SCROLL"
  | "ACCESSIBILITY_GLOBAL_BACK"
  | "LAUNCH_APP"
  | "CLIPBOARD_SET"
  | "SEND_SHARE_INTENT"
  | "VIDEO_TRIM"
  | "VIDEO_RESIZE_COMPRESS"
  | "VIDEO_MUTE"
  | "VIDEO_WATERMARK"
  | "SUBMIT_SENSITIVE_FORM"
  | "ACCOUNT_LOGIN_OR_SIGNUP"
  | "PAYMENT_ACTION"
  | "FINISH_TASK";

export interface AgentStepPlan {
  thought: string;
  phaseNote: string;
  plannedSteps: string[];
  action: AgentActionType;
  target: string;
  value: string;
  requiresConfirmation: boolean;
  riskReason: string;
  isDone: boolean;
  finalSummary: string;
}

export interface ExecutionLogEntry {
  id: string;
  timestamp: string;
  phase: AgentPhase;
  title: string;
  detail: string;
  providerMeta?: string;
}

export interface GuardrailRequest {
  id: string;
  action: AgentActionType;
  target: string;
  proposedValue: string;
  reason: string;
  riskLevel: "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface VirtualMobileProfile {
  envName: string;
  hostTotalRamGb: number;
  allocatedRamGb: number;
  maxConcurrentTasks: number;
  maxLogEntries: number;
  maxDomChars: number;
  webViewImagesEnabled: boolean;
}

export interface SkillPolicyConfig {
  playStoreInstallEnabled: boolean;
  autoMemoryLearningEnabled: boolean;
  webAutomationEnabled: boolean;
  accessibilityControlEnabled: boolean;
  videoEditingEnabled: boolean;
  fileWorkspaceEnabled: boolean;
  voiceCommandsEnabled: boolean;
  clipboardAndShareEnabled: boolean;
  requireConfirmOnSubmit: boolean;
  requireConfirmOnDelete: boolean;
  requireConfirmOnShare: boolean;
}

export interface VideoStudioState {
  attachedFileName: string;
  attachedSizeMb: number;
  lastOperation: string;
  outputFilePath: string;
  watermarkText: string;
  targetResolution: string;
  muted: boolean;
}

export interface VirtualAppItem {
  packageId: string;
  appName: string;
  category: string;
  webUrl: string;
  version: string;
  installed: boolean;
  installedAt?: string;
}

export interface CredentialEntry {
  id: string;
  serviceName: string;
  category: "APP_ACCOUNT" | "EMAIL" | "SOCIAL_MEDIA" | "WEBSITE" | "OTHER";
  usernameOrEmail: string;
  secretValue: string;
  savedLocationPath: string;
  notes: string;
  updatedAt: string;
}

export interface PaymentMethodEntry {
  id: string;
  label: string;
  provider: string;
  maskedIdentifier: string;
  billingAddress: string;
  savedLocationPath: string;
  notes: string;
  updatedAt: string;
}

export interface MemoryNoteEntry {
  id: string;
  category: "ADDRESS" | "PREFERENCE" | "IMPORTANT_NOTE" | "SKILL_EVOLUTION" | "FACT";
  title: string;
  content: string;
  savedLocationPath: string;
  updatedAt: string;
}

export interface GeminiAccountSlot {
  id: string;
  accountLabel: string;
  enabled: boolean;
  status: "READY" | "COOLDOWN";
  requestsServed: number;
}

export interface UserProfileVault {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  education: string;
  workExperience: string;
  skills: string;
  portfolioUrl: string;
  customInstructions: string;
}

export interface WorkspaceFile {
  path: string;
  folder: string;
  content: string;
  updatedAt: string;
}

export interface ScheduledTask {
  id: string;
  title: string;
  prompt: string;
  isRecurring: boolean;
  intervalHours: number;
  requiresWifi: boolean;
  requiresBatteryNotLow: boolean;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  lastRunAt?: string;
  lastResult?: string;
}

export interface AccessibilityNode {
  id: string;
  className: string;
  resourceId: string;
  text: string;
  clickable: boolean;
  editable: boolean;
  scrollable: boolean;
  bounds: string;
}

export interface WebFormFields {
  fullName: string;
  email: string;
  phone: string;
  portfolio: string;
  coverNote: string;
  submitted: boolean;
}

export interface VirtualBrowserState {
  url: string;
  title: string;
  activeSelector: string;
  scrollY: number;
  formFields: WebFormFields;
}

export interface AndroidSourceFile {
  path: string;
  name: string;
  folder: string;
  language: string;
  size: number;
  content: string;
}

export interface RouterEventRecord {
  id: string;
  timestamp: string;
  from: string;
  to: string;
  reason: string;
}
