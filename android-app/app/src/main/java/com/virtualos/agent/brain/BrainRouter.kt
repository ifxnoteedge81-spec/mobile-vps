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
 * Production Multi-Key + Multi-Model Cascade Router:
 * - Rotates across 5+ Free Gemini API keys (separate Gmail accounts) using LRU + round-robin.
 * - Uses 1 single OpenRouter API key to cascade across all configured OpenRouter `:free` models.
 * - Tracks per-(keyId + modelId) cooldowns independently so a 429 on one OpenRouter free model
 *   never blocks the other free models on the same OpenRouter key.
 */
class BrainRouter(
    private val vaultStore: EncryptedVaultStore,
    private val geminiClient: GeminiClient,
    private val openRouterClient: OpenRouterClient
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
                IllegalStateException("No API keys configured. Add up to 5 free Gemini keys and/or 1 OpenRouter key in Brain Settings.")
            )
        }

        val candidates = buildCandidateChain(allKeys, config, now)
        if (candidates.isEmpty()) {
            return Result.failure(
                IllegalStateException("All configured Gemini keys & OpenRouter free models are currently cooling down. Reset cooldowns or wait.")
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

            val result = when (candidate.provider) {
                AiProvider.GEMINI -> geminiClient.generate(candidate.key.apiKey, candidate.modelId, request)
                AiProvider.OPENROUTER -> openRouterClient.generate(candidate.key.apiKey, candidate.modelId, request)
            }

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
                        // Cool down ONLY this specific free model so the same OpenRouter key can try other :free models immediately!
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
            val res = geminiClient.generate(key.apiKey, primaryGeminiModel, probeReq)
            diagnostics.add(
                when (res) {
                    is BrainCallResult.Success -> RouteDiagnosticResult(
                        AiProvider.GEMINI, key.label, primaryGeminiModel, true, res.latencyMs, "Healthy"
                    )
                    is BrainCallResult.Failure -> RouteDiagnosticResult(
                        AiProvider.GEMINI, key.label, primaryGeminiModel, false, 0L, res.message
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
                            AiProvider.OPENROUTER, primaryOrKey.label, freeModel, true, res.latencyMs, "Healthy"
                        )
                        is BrainCallResult.Failure -> RouteDiagnosticResult(
                            AiProvider.OPENROUTER, primaryOrKey.label, freeModel, false, 0L, res.message
                        )
                    }
                )
            }
        }

        return diagnostics
    }

    fun clearRouteCooldowns() {
        routeCooldownMap.clear()
        vaultStore.resetAllCooldowns()
    }

    private fun buildCandidateChain(
        allKeys: List<ApiKeyEntry>,
        config: BrainRouterConfig,
        nowMs: Long
    ): List<RouteCandidate> {
        val geminiKeys = orderGeminiKeysLru(allKeys.filter { it.provider == AiProvider.GEMINI }, nowMs)
        val openRouterKeys = allKeys.filter { it.provider == AiProvider.OPENROUTER }

        val geminiModels = config.geminiModels.ifEmpty { listOf("gemini-2.5-flash") }
        val openRouterModels = config.openRouterFreeModels.ifEmpty { listOf("google/gemini-2.0-flash-exp:free") }

        val geminiCandidates = mutableListOf<RouteCandidate>()
        // Rotate across all 5 Gemini keys on primary model first, then try secondary Gemini free models
        for (modelId in geminiModels) {
            for (key in geminiKeys) {
                val rKey = routeKey(key.id, modelId)
                val modelWait = routeCooldownMap[rKey] ?: 0L
                if (key.cooldownUntilEpochMs <= nowMs && modelWait <= nowMs) {
                    geminiCandidates.add(RouteCandidate(AiProvider.GEMINI, modelId, key))
                }
            }
        }

        val openRouterCandidates = mutableListOf<RouteCandidate>()
        // 1 OpenRouter key cascades across every free model in priority order
        for (key in openRouterKeys) {
            for (freeModel in openRouterModels) {
                val rKey = routeKey(key.id, freeModel)
                val modelWait = routeCooldownMap[rKey] ?: 0L
                if (modelWait <= nowMs) {
                    openRouterCandidates.add(RouteCandidate(AiProvider.OPENROUTER, freeModel, key))
                }
            }
        }

        val combined = if (config.primaryProvider == AiProvider.GEMINI) {
            geminiCandidates + openRouterCandidates
        } else {
            openRouterCandidates + geminiCandidates
        }

        if (combined.isNotEmpty()) {
            return combined.take(config.maxAttemptsPerCall.coerceAtLeast(1))
        }

        // Emergency fallback if everything is in cooldown: pick any enabled keys & models
        val fallback = mutableListOf<RouteCandidate>()
        geminiKeys.forEach { fallback.add(RouteCandidate(AiProvider.GEMINI, geminiModels.first(), it)) }
        openRouterKeys.forEach { key ->
            openRouterModels.forEach { m -> fallback.add(RouteCandidate(AiProvider.OPENROUTER, m, key)) }
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
