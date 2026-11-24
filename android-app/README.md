# KaryoOS — Autonomous Android Virtual Workspace & OS Agent

Complete, production-ready Kotlin + Jetpack Compose Android application implementing a local sandboxed Virtual Workspace ("হাত-পা" / Limbs) paired with a Multi-Key / Multi-Provider Gemini + OpenRouter AI Brain Router ("মস্তিষ্ক" / Brain).

## Architecture Overview

- `domain/model/`: Strongly typed `AgentStepPlan`, `BrainRouterConfig`, `UserProfileVault`, `ScheduledTask`, and `MemoryProfile` models.
- `data/security/EncryptedVaultStore.kt`: Android Keystore AES-256-GCM `EncryptedSharedPreferences` for storing multiple Gemini & OpenRouter API keys, routing rules, and personal profile data.
- `data/workspace/SandboxedWorkspaceManager.kt`: Canonical-path-confined virtual filesystem inside `filesDir/agent_workspace/` (`research/`, `drafts/`, `scripts/`, `history/`).
- `data/queue/TaskQueueDatabase.kt`: Room database persisting scheduled and recurring tasks.
- `brain/BrainRouter.kt`: Thread-safe multi-key rotation and automatic fallback across Gemini (`gemini-2.5-flash` / `gemini-2.5-pro`) and OpenRouter (`google/gemini-2.5-flash` / `anthropic/claude-3.5-sonnet`). Automatically rotates on HTTP 429 rate limits, quota exhaustion, auth rejection, or transient network errors.
- `limbs/webview/WebViewAutomationController.kt`: Controlled WebView automation with JS DOM snapshot extraction, CSS selector filling/clicking, and memory trimming.
- `limbs/accessibility/AgentAccessibilityService.kt` + `AccessibilityBridge.kt`: OS-level `AccessibilityService` capable of reading active window UI nodes, performing clicks/gestures, typing text, scrolling, and launching apps safely.
- `agent/AgentOrchestrator.kt` + `GuardrailEngine.kt` + `LowMemoryMonitor.kt`: Structured `Observe -> Plan -> Act -> Verify` loop supporting Bengali (`বাংলা`) and English commands, 4 GB RAM optimization mode (`maxConcurrentTasks = 1`, trimmed DOM & log caps), and mandatory Human-in-the-Loop confirmation before sensitive actions (`SUBMIT_SENSITIVE_FORM`, `ACCOUNT_LOGIN_OR_SIGNUP`, `PAYMENT_ACTION`, `WORKSPACE_DELETE_FILE`).
- `scheduler/AgentWorker.kt` + `AgentTaskScheduler.kt`: WorkManager `CoroutineWorker` with network/battery constraints and Android 14+ `FOREGROUND_SERVICE_DATA_SYNC` support.

## Opening & Building in Android Studio

1. Open `/android-app` in Android Studio Ladybug (or newer) with JDK 17.
2. Sync Gradle and run on an Android 8.0+ (API 26+) device or emulator.
3. Open the **Brain** tab inside the app to add one or more Gemini / OpenRouter API keys and optionally enable **KaryoOS Virtual Limbs Service** in Android Accessibility Settings.
4. Open the **Vault** tab to store your profile details for automated form filling and to schedule recurring WorkManager routines.
