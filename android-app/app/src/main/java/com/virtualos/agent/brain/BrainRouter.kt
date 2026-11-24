package com.virtualos.agent.brain

import com.virtualos.agent.data.security.EncryptedVaultStore
import com.virtualos.agent.domain.model.AiProvider
import com.virtualos.agent.domain.model.ApiKeyEntry
import com.virtualos.agent.domain.model.BrainRequest
import com.virtualos.agent.domain.model.BrainResponse
import com.virtualos.agent.domain.model.BrainRouterConfig
import com.virtualos.agent.domain.model.KeyRotationEvent
import com.virtualos.agent.domain.model.RouteDiagnosticResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * Universal Multi-Provider Cascade Router:
 * - Rotates across 5+ Free Gemini API keys (separate Gmail accounts) using LRU + round-robin.
 * - Cascades OpenRouter across all configured `:free` models with per-model cooldowns.
 * - Seamlessly supports & fails over across OpenAI, Anthropic Claude, Groq, DeepSeek, Mistral,
 *   and ANY Custom OpenAI-Compatible endpoint (xAI, Ollama, vLLM, Together, etc.).
 */
class BrainRouter(
    private val vaultStore: EncryptedVaultStore,
    private val geminiClient: GeminiClient,
    private val openRouterClient: OpenRouterClient,
    private val universalOpenAiClient: UniversalOpenAiClient,
    private val anthropicClient: AnthropicClient
) {
    private val routeMutex = Mutex()
    private val geminiRoundRobinCursor = AtomicInteger(0)

    // Keyed by "${key.id}::${modelId}" -> cooldown expiry epoch ms
    private val routeCooldownMap = ConcurrentHashMap<String, Long>()

    private val _rotationHistory = MutableStateFlow<List<KeyRotationEvent>>(emptyList())
    val rotationHistory: StateFlow<List<KeyRotationEvent>> = _rotationHistory.asStateFlow()

    suspend fun routeGenerate(request: BrainRequest): Result<BrainResponse> = routeMutex.withLock {
        val now = System.currentTimeMillis()
        val config = vaultStore.routerConfig.value
        val allKeys = vaultStore.apiKeys.value.filter { it.enabled && it.apiKey.isNotBlank() }

        if (allKeys.isEmpty()) {
            return Result.failure(
                IllegalStateException("No API keys configured. Open Settings to add Gemini, OpenRouter, OpenAI, Claude, Groq, DeepSeek, Mistral, or Custom AI keys.")
            )
        }

        val candidates = buildCandidateChain(allKeys, config, now)
        if (candidates.isEmpty()) {
            return Result.failure(
                IllegalStateException("All configured AI routes are currently cooling down. Reset cooldowns or wait.")
            )
        }

        var rotationCount = 0
        var lastError = "All provider routes exhausted"
        var previousRouteLabel: String? = null

        for (candidate in candidates) {
            val currentRouteLabel = "${candidate.key.label} [${candidate.modelId}]"
            if (previousRouteLabel != null && previousRouteLabel != currentRouteLabel) {
                rotationCount++
                recordRotation(
                    from = previousRouteLabel,
                    to = currentRouteLabel,
                    reason = lastError
                )
            }
            previousRouteLabel = currentRouteLabel

            val result = invokeCandidate(candidate.provider, candidate.key, candidate.modelId, request)

            when (result) {
                is BrainCallResult.Success -> {
                    routeCooldownMap.remove(routeKey(candidate.key.id, candidate.modelId))
                    vaultStore.markKeySuccess(candidate.key.id)
                    return Result.success(
                        BrainResponse(
                            rawText = result.text,
                            provider = candidate.provider,
                            modelId = candidate.modelId,
                            keyLabel = candidate.key.label,
                            latencyMs = result.latencyMs,
                            rotationCount = rotationCount
                        )
                    )
                }

                is BrainCallResult.Failure -> {
                    lastError = result.message
                    val nowErr = System.currentTimeMillis()
                    val rKey = routeKey(candidate.key.id, candidate.modelId)

                    if (candidate.provider == AiProvider.OPENROUTER && !result.isAuthError) {
                        val modelCooldownMs = if (result.isRateLimitOrQuota) {
                            config.modelCooldownSeconds * 1000L
                        } else {
                            20_000L
                        }
                        routeCooldownMap[rKey] = nowErr + modelCooldownMs
                    } else {
                        val keyCooldownMs = when {
                            result.isAuthError -> 3600_000L
                            result.isRateLimitOrQuota -> config.keyCooldownSeconds * 1000L
                            result.isTransientNetwork -> 15_000L
                            else -> 30_000L
                        }
                        routeCooldownMap[rKey] = nowErr + keyCooldownMs
                        vaultStore.markKeyCooldown(
                            id = candidate.key.id,
                            cooldownUntilMs = nowErr + keyCooldownMs,
                            errorMessage = result.message,
                            isAuthInvalid = result.isAuthError
                        )
                    }
                }
            }
        }

        Result.failure(RuntimeException("BrainRouter exhausted ${candidates.size} routes. Last error: $lastError"))
    }

    suspend fun testSingleKey(keyId: String): RouteDiagnosticResult {
        val key = vaultStore.apiKeys.value.firstOrNull { it.id == keyId }
            ?: return RouteDiagnosticResult(
                provider = AiProvider.GEMINI,
                keyLabel = "Missing Key",
                modelId = "-",
                ok = false,
                latencyMs = 0L,
                message = "Connector not found in EncryptedVaultStore."
            )
        val config = vaultStore.routerConfig.value
        val modelId = resolveModelForKey(key, config)
        val probeReq = BrainRequest(
            systemInstruction = "Reply with JSON {\"ok\":true}",
            userPrompt = "Ping",
            jsonMode = true,
            maxTokens = 32
        )
        return when (val res = invokeCandidate(key.provider, key, modelId, probeReq)) {
            is BrainCallResult.Success -> {
                vaultStore.markKeySuccess(key.id)
                RouteDiagnosticResult(
                    provider = key.provider,
                    keyLabel = key.label,
                    modelId = modelId,
                    ok = true,
                    latencyMs = res.latencyMs,
                    message = "Connected cleanly (${key.provider.envVarName})",
                    keyId = key.id,
                    envVarName = key.provider.envVarName
                )
            }
            is BrainCallResult.Failure -> RouteDiagnosticResult(
                provider = key.provider,
                keyLabel = key.label,
                modelId = modelId,
                ok = false,
                latencyMs = 0L,
                message = res.message,
                keyId = key.id,
                envVarName = key.provider.envVarName
            )
        }
    }

    suspend fun testAllConfiguredRoutes(): List<RouteDiagnosticResult> {
        val allKeys = vaultStore.apiKeys.value.filter { it.enabled && it.apiKey.isNotBlank() }
        val config = vaultStore.routerConfig.value
        val probeReq = BrainRequest(
            systemInstruction = "Reply with JSON {\"ok\":true}",
            userPrompt = "Ping",
            jsonMode = true,
            maxTokens = 32
        )
        val diagnostics = mutableListOf<RouteDiagnosticResult>()

        val primaryGeminiModel = config.geminiModels.firstOrNull() ?: "gemini-2.5-flash"
        allKeys.filter { it.provider == AiProvider.GEMINI }.forEach { key ->
            val modelId = key.modelOverride.ifBlank { primaryGeminiModel }
            val res = geminiClient.generate(key.apiKey, modelId, probeReq)
            diagnostics.add(
                when (res) {
                    is BrainCallResult.Success -> RouteDiagnosticResult(
                        AiProvider.GEMINI, key.label, modelId, true, res.latencyMs, "Healthy",
                        keyId = key.id, envVarName = "GEMINI_API_KEY"
                    )
                    is BrainCallResult.Failure -> RouteDiagnosticResult(
                        AiProvider.GEMINI, key.label, modelId, false, 0L, res.message,
                        keyId = key.id, envVarName = "GEMINI_API_KEY"
                    )
                }
            )
        }

        val orKeys = allKeys.filter { it.provider == AiProvider.OPENROUTER }
        if (orKeys.isNotEmpty()) {
            val primaryOrKey = orKeys.first()
            config.openRouterFreeModels.forEach { freeModel ->
                val res = openRouterClient.generate(primaryOrKey.apiKey, freeModel, probeReq)
                diagnostics.add(
                    when (res) {
                        is BrainCallResult.Success -> RouteDiagnosticResult(
                            AiProvider.OPENROUTER, primaryOrKey.label, freeModel, true, res.latencyMs, "Healthy",
                            keyId = primaryOrKey.id, envVarName = "OPENROUTER_API_KEY"
                        )
                        is BrainCallResult.Failure -> RouteDiagnosticResult(
                            AiProvider.OPENROUTER, primaryOrKey.label, freeModel, false, 0L, res.message,
                            keyId = primaryOrKey.id, envVarName = "OPENROUTER_API_KEY"
                        )
                    }
                )
            }
        }

        allKeys.filter { it.provider != AiProvider.GEMINI && it.provider != AiProvider.OPENROUTER }
            .forEach { key ->
                val modelId = resolveModelForKey(key, config)
                val res = invokeCandidate(key.provider, key, modelId, probeReq)
                diagnostics.add(
                    when (res) {
                        is BrainCallResult.Success -> RouteDiagnosticResult(
                            key.provider, key.label, modelId, true, res.latencyMs, "Healthy",
                            keyId = key.id, envVarName = key.provider.envVarName
                        )
                        is BrainCallResult.Failure -> RouteDiagnosticResult(
                            key.provider, key.label, modelId, false, 0L, res.message,
                            keyId = key.id, envVarName = key.provider.envVarName
                        )
                    }
                )
            }

        return diagnostics
    }

    fun clearRouteCooldowns() {
        routeCooldownMap.clear()
        vaultStore.resetAllCooldowns()
    }

    private suspend fun invokeCandidate(
        provider: AiProvider,
        key: ApiKeyEntry,
        modelId: String,
        request: BrainRequest
    ): BrainCallResult {
        return when (provider) {
            AiProvider.GEMINI -> geminiClient.generate(key.apiKey, modelId, request)
            AiProvider.OPENROUTER -> openRouterClient.generate(key.apiKey, modelId, request)
            AiProvider.ANTHROPIC -> anthropicClient.generate(key.apiKey, modelId, request)
            AiProvider.OPENAI,
            AiProvider.GROQ,
            AiProvider.DEEPSEEK,
            AiProvider.MISTRAL,
            AiProvider.CUSTOM_OPENAI -> universalOpenAiClient.generate(
                provider = provider,
                apiKey = key.apiKey,
                baseUrl = key.customBaseUrl.ifBlank { provider.defaultBaseUrl },
                modelId = modelId,
                request = request
            )
        }
    }

    private fun resolveModelForKey(key: ApiKeyEntry, config: BrainRouterConfig): String {
        if (key.modelOverride.isNotBlank()) return key.modelOverride
        return when (key.provider) {
            AiProvider.GEMINI -> config.geminiModels.firstOrNull() ?: AiProvider.GEMINI.defaultModel
            AiProvider.OPENROUTER -> config.openRouterFreeModels.firstOrNull() ?: AiProvider.OPENROUTER.defaultModel
            else -> key.provider.defaultModel
        }
    }

    private fun buildCandidateChain(
        allKeys: List<ApiKeyEntry>,
        config: BrainRouterConfig,
        nowMs: Long
    ): List<RouteCandidate> {
        val geminiKeys = orderGeminiKeysLru(allKeys.filter { it.provider == AiProvider.GEMINI }, nowMs)
        val openRouterKeys = allKeys.filter { it.provider == AiProvider.OPENROUTER }
        val universalKeys = allKeys.filter {
            it.provider != AiProvider.GEMINI && it.provider != AiProvider.OPENROUTER
        }

        val geminiModels = config.geminiModels.ifEmpty { listOf("gemini-2.5-flash") }
        val openRouterModels = config.openRouterFreeModels.ifEmpty { listOf("google/gemini-2.0-flash-exp:free") }

        val geminiCandidates = mutableListOf<RouteCandidate>()
        for (modelId in geminiModels) {
            for (key in geminiKeys) {
                val effectiveModel = key.modelOverride.ifBlank { modelId }
                val rKey = routeKey(key.id, effectiveModel)
                val modelWait = routeCooldownMap[rKey] ?: 0L
                if (key.cooldownUntilEpochMs <= nowMs && modelWait <= nowMs) {
                    geminiCandidates.add(RouteCandidate(AiProvider.GEMINI, effectiveModel, key))
                }
            }
        }

        val openRouterCandidates = mutableListOf<RouteCandidate>()
        for (key in openRouterKeys) {
            for (freeModel in openRouterModels) {
                val rKey = routeKey(key.id, freeModel)
                val modelWait = routeCooldownMap[rKey] ?: 0L
                if (modelWait <= nowMs) {
                    openRouterCandidates.add(RouteCandidate(AiProvider.OPENROUTER, freeModel, key))
                }
            }
        }

        val universalCandidates = mutableListOf<RouteCandidate>()
        for (key in universalKeys) {
            val modelId = resolveModelForKey(key, config)
            val rKey = routeKey(key.id, modelId)
            val modelWait = routeCooldownMap[rKey] ?: 0L
            if (key.cooldownUntilEpochMs <= nowMs && modelWait <= nowMs) {
                universalCandidates.add(RouteCandidate(key.provider, modelId, key))
            }
        }

        val allOrdered = when (config.primaryProvider) {
            AiProvider.GEMINI -> geminiCandidates + openRouterCandidates + universalCandidates
            AiProvider.OPENROUTER -> openRouterCandidates + geminiCandidates + universalCandidates
            else -> {
                val prioritized = universalCandidates.filter { it.provider == config.primaryProvider }
                val otherUniversal = universalCandidates.filter { it.provider != config.primaryProvider }
                prioritized + geminiCandidates + openRouterCandidates + otherUniversal
            }
        }

        if (allOrdered.isNotEmpty()) {
            return allOrdered.take(config.maxAttemptsPerCall.coerceAtLeast(1))
        }

        // Emergency fallback if everything is cooling down
        val fallback = mutableListOf<RouteCandidate>()
        geminiKeys.forEach { fallback.add(RouteCandidate(AiProvider.GEMINI, geminiModels.first(), it)) }
        openRouterKeys.forEach { key ->
            openRouterModels.forEach { m -> fallback.add(RouteCandidate(AiProvider.OPENROUTER, m, key)) }
        }
        universalKeys.forEach { key ->
            fallback.add(RouteCandidate(key.provider, resolveModelForKey(key, config), key))
        }
        return fallback.take(config.maxAttemptsPerCall.coerceAtLeast(1))
    }

    private fun orderGeminiKeysLru(keys: List<ApiKeyEntry>, nowMs: Long): List<ApiKeyEntry> {
        if (keys.size <= 1) return keys
        val ready = keys.filter { it.cooldownUntilEpochMs <= nowMs }
            .sortedBy { it.lastUsedEpochMs }
        val cooling = keys.filter { it.cooldownUntilEpochMs > nowMs }
            .sortedBy { it.cooldownUntilEpochMs }
        val ordered = ready + cooling
        val offset = Math.floorMod(geminiRoundRobinCursor.getAndIncrement(), ordered.size)
        return ordered.drop(offset) + ordered.take(offset)
    }

    private fun routeKey(keyId: String, modelId: String): String = "$keyId::$modelId"

    private fun recordRotation(from: String, to: String, reason: String) {
        val event = KeyRotationEvent(
            timestampMs = System.currentTimeMillis(),
            fromRoute = from,
            toRoute = to,
            reason = reason.take(140)
        )
        _rotationHistory.value = (listOf(event) + _rotationHistory.value).take(40)
    }

    private data class RouteCandidate(
        val provider: AiProvider,
        val modelId: String,
        val key: ApiKeyEntry
    )
}
