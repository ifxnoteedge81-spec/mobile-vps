package com.virtualos.agent.domain.model

import kotlinx.serialization.Serializable

enum class AgentRunStatus {
    IDLE,
    RUNNING,
    PAUSED,
    AWAITING_CONFIRMATION,
    COMPLETED,
    FAILED,
    STOPPED
}

enum class AgentPhase {
    OBSERVE,
    PLAN,
    ACT,
    VERIFY,
    GUARDRAIL,
    ROUTER,
    VOICE,
    MEDIA,
    STORE,
    MEMORY,
    SYSTEM,
    ERROR
}

enum class AgentActionType {
    WEB_NAVIGATE,
    WEB_EXTRACT_DOM,
    WEB_FILL_INPUT,
    WEB_CLICK_ELEMENT,
    WEB_SCROLL,
    WORKSPACE_WRITE_FILE,
    WORKSPACE_READ_FILE,
    WORKSPACE_LIST_FILES,
    WORKSPACE_DELETE_FILE,
    ACCESSIBILITY_READ_SCREEN,
    ACCESSIBILITY_CLICK_NODE,
    ACCESSIBILITY_TYPE_TEXT,
    ACCESSIBILITY_SCROLL,
    ACCESSIBILITY_GLOBAL_BACK,
    LAUNCH_APP,
    PLAY_STORE_SEARCH,
    PLAY_STORE_INSTALL,
    OPEN_VIRTUAL_APP,
    CREDENTIAL_SAVE,
    CREDENTIAL_GENERATE_AND_SAVE,
    PAYMENT_METHOD_SAVE,
    MEMORY_SAVE,
    CLIPBOARD_SET,
    SEND_SHARE_INTENT,
    VIDEO_TRIM,
    VIDEO_RESIZE_COMPRESS,
    VIDEO_MUTE,
    VIDEO_WATERMARK,
    SUBMIT_SENSITIVE_FORM,
    ACCOUNT_LOGIN_OR_SIGNUP,
    PAYMENT_ACTION,
    FINISH_TASK
}

@Serializable
data class AgentStepPlan(
    val thought: String,
    val phaseNote: String,
    val plannedSteps: List<String> = emptyList(),
    val action: AgentActionType,
    val target: String = "",
    val value: String = "",
    val requiresConfirmation: Boolean = false,
    val riskReason: String = "",
    val isDone: Boolean = false,
    val finalSummary: String = ""
)

data class ExecutionLogEntry(
    val id: String,
    val timestampMs: Long,
    val phase: AgentPhase,
    val title: String,
    val detail: String,
    val providerUsed: String? = null
)

data class GuardrailRequest(
    val stepId: String,
    val action: AgentActionType,
    val target: String,
    val proposedValue: String,
    val reason: String,
    val riskLevel: RiskLevel
)

enum class RiskLevel {
    MEDIUM,
    HIGH,
    CRITICAL
}

@Serializable
data class VirtualEnvironmentConfig(
    val envId: String = "virtual-phone-1",
    val envName: String = "Virtual Mobile #1",
    val allocatedRamGb: Float = 4.0f,
    val lowMemoryOptimizationEnabled: Boolean = true,
    val isolateWebStorage: Boolean = true,
    val stayInsideSandboxMode: Boolean = true
)

@Serializable
data class SkillSettingsConfig(
    val webAutomationEnabled: Boolean = true,
    val accessibilityControlEnabled: Boolean = true,
    val playStoreInstallEnabled: Boolean = true,
    val videoEditingEnabled: Boolean = true,
    val fileWorkspaceEnabled: Boolean = true,
    val voiceCommandsEnabled: Boolean = true,
    val clipboardAndShareEnabled: Boolean = true,
    val autoMemoryLearningEnabled: Boolean = true,
    val requireConfirmOnSubmit: Boolean = true,
    val requireConfirmOnDelete: Boolean = true,
    val requireConfirmOnExternalShare: Boolean = true
)

data class MemoryProfile(
    val envName: String = "Virtual Mobile #1",
    val allocatedRamMb: Long = 4096L,
    val lowMemoryModeEnabled: Boolean = true,
    val totalHostRamMb: Long = 8192L,
    val availableHostRamMb: Long = 3200L,
    val hostReservedRamMb: Long = 4096L,
    val maxConcurrentTasks: Int = 1,
    val maxLogEntries: Int = 150,
    val maxDomCharacters: Int = 6000,
    val maxAccessibilityNodes: Int = 55,
    val webViewImagesEnabled: Boolean = false,
    val workspaceQuotaMb: Int = 256
)
