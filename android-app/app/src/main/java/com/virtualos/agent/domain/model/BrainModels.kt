package com.virtualos.agent.domain.model

import kotlinx.serialization.Serializable

@Serializable
enum class AiProvider(
    val displayName: String,
    val envVarName: String,
    val defaultBaseUrl: String,
    val defaultModel: String
) {
    GEMINI(
        displayName = "Google Gemini",
        envVarName = "GEMINI_API_KEY",
        defaultBaseUrl = "https://generativelanguage.googleapis.com",
        defaultModel = "gemini-2.5-flash"
    ),
    OPENROUTER(
        displayName = "OpenRouter",
        envVarName = "OPENROUTER_API_KEY",
        defaultBaseUrl = "https://openrouter.ai/api/v1",
        defaultModel = "google/gemini-2.0-flash-exp:free"
    ),
    OPENAI(
        displayName = "OpenAI (GPT)",
        envVarName = "OPENAI_API_KEY",
        defaultBaseUrl = "https://api.openai.com/v1",
        defaultModel = "gpt-4o-mini"
    ),
    ANTHROPIC(
        displayName = "Anthropic (Claude)",
        envVarName = "ANTHROPIC_API_KEY",
        defaultBaseUrl = "https://api.anthropic.com/v1",
        defaultModel = "claude-3-5-haiku-latest"
    ),
    GROQ(
        displayName = "Groq Cloud",
        envVarName = "GROQ_API_KEY",
        defaultBaseUrl = "https://api.groq.com/openai/v1",
        defaultModel = "llama-3.3-70b-versatile"
    ),
    DEEPSEEK(
        displayName = "DeepSeek",
        envVarName = "DEEPSEEK_API_KEY",
        defaultBaseUrl = "https://api.deepseek.com",
        defaultModel = "deepseek-chat"
    ),
    MISTRAL(
        displayName = "Mistral AI",
        envVarName = "MISTRAL_API_KEY",
        defaultBaseUrl = "https://api.mistral.ai/v1",
        defaultModel = "mistral-small-latest"
    ),
    CUSTOM_OPENAI(
        displayName = "Custom AI (OpenAI Compatible)",
        envVarName = "CUSTOM_AI_API_KEY",
        defaultBaseUrl = "",
        defaultModel = "default"
    )
}

@Serializable
enum class KeyHealthStatus {
    READY,
    COOLDOWN,
    AUTH_INVALID
}

@Serializable
data class ApiKeyEntry(
    val id: String,
    val label: String,
    val provider: AiProvider,
    val apiKey: String,
    val accountHint: String = "",
    val customBaseUrl: String = "",
    val modelOverride: String = "",
    val enabled: Boolean = true,
    val cooldownUntilEpochMs: Long = 0L,
    val failureCount: Int = 0,
    val successCount: Int = 0,
    val lastUsedEpochMs: Long = 0L,
    val lastError: String? = null,
    val healthStatus: KeyHealthStatus = KeyHealthStatus.READY
)

@Serializable
data class BrainRouterConfig(
    val primaryProvider: AiProvider = AiProvider.GEMINI,
    val geminiModels: List<String> = listOf(
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-2.0-flash"
    ),
    val openRouterFreeModels: List<String> = listOf(
        "google/gemini-2.0-flash-exp:free",
        "meta-llama/llama-3.3-70b-instruct:free",
        "deepseek/deepseek-chat-v3-0324:free",
        "qwen/qwen-2.5-72b-instruct:free",
        "mistralai/mistral-small-3.1-24b-instruct:free"
    ),
    val maxAttemptsPerCall: Int = 16,
    val keyCooldownSeconds: Int = 65,
    val modelCooldownSeconds: Int = 90
)

data class BrainRequest(
    val systemInstruction: String,
    val userPrompt: String,
    val jsonMode: Boolean = true,
    val maxTokens: Int = 1200
)

data class BrainResponse(
    val rawText: String,
    val provider: AiProvider,
    val modelId: String,
    val keyLabel: String,
    val latencyMs: Long,
    val rotationCount: Int
)

data class KeyRotationEvent(
    val timestampMs: Long,
    val fromRoute: String,
    val toRoute: String,
    val reason: String
)

data class RouteDiagnosticResult(
    val provider: AiProvider,
    val keyLabel: String,
    val modelId: String,
    val ok: Boolean,
    val latencyMs: Long,
    val message: String,
    val keyId: String = "",
    val envVarName: String = provider.envVarName
)
