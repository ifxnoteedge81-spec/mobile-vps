package com.virtualos.agent.brain

import com.virtualos.agent.domain.model.AiProvider
import com.virtualos.agent.domain.model.BrainRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

/**
 * Universal OpenAI-compatible chat completions client supporting:
 * OpenAI, Groq, DeepSeek, Mistral, Together, xAI Grok, Ollama, vLLM, and any custom AI server.
 */
class UniversalOpenAiClient(
    private val httpClient: OkHttpClient
) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun generate(
        provider: AiProvider,
        apiKey: String,
        baseUrl: String,
        modelId: String,
        request: BrainRequest
    ): BrainCallResult = withContext(Dispatchers.IO) {
        val started = System.currentTimeMillis()
        val rawBase = baseUrl.trim().ifBlank { provider.defaultBaseUrl }.trimEnd('/')
        if (rawBase.isBlank()) {
            return@withContext BrainCallResult.Failure(
                httpCode = -1,
                isRateLimitOrQuota = false,
                isAuthError = true,
                isTransientNetwork = false,
                message = "${provider.displayName}: Base URL is missing."
            )
        }

        val resolvedEndpoint = if (rawBase.endsWith("/chat/completions")) {
            rawBase
        } else {
            "$rawBase/chat/completions"
        }

        val parsedUrl = resolvedEndpoint.toHttpUrlOrNull()
        if (parsedUrl == null ||
            parsedUrl.host.equals("169.254.169.254", ignoreCase = true) ||
            parsedUrl.host.equals("metadata.google.internal", ignoreCase = true)
        ) {
            return@withContext BrainCallResult.Failure(
                httpCode = -1,
                isRateLimitOrQuota = false,
                isAuthError = true,
                isTransientNetwork = false,
                message = "${provider.displayName}: Invalid or blocked endpoint URL."
            )
        }

        val payload = buildJsonObject {
            put("model", modelId.ifBlank { provider.defaultModel })
            put("temperature", 0.2)
            put("max_tokens", request.maxTokens)
            if (request.jsonMode && provider != AiProvider.CUSTOM_OPENAI) {
                putJsonObject("response_format") {
                    put("type", "json_object")
                }
            }
            putJsonArray("messages") {
                add(buildJsonObject {
                    put("role", "system")
                    put("content", request.systemInstruction)
                })
                add(buildJsonObject {
                    put("role", "user")
                    put("content", request.userPrompt)
                })
            }
        }

        val httpRequest = Request.Builder()
            .url(parsedUrl)
            .post(payload.toString().toRequestBody(JSON_MEDIA_TYPE))
            .header("Authorization", "Bearer $apiKey")
            .header("Content-Type", "application/json")
            .build()

        try {
            httpClient.newCall(httpRequest).execute().use { response ->
                val rawBody = response.body?.string().orEmpty()
                val latency = System.currentTimeMillis() - started

                if (!response.isSuccessful) {
                    val code = response.code
                    val isQuota = code == 429 || code == 402 || rawBody.contains("rate", ignoreCase = true)
                    val isAuth = code == 401 || code == 403
                    val isTransient = code >= 500 || code == 408
                    return@withContext BrainCallResult.Failure(
                        httpCode = code,
                        isRateLimitOrQuota = isQuota,
                        isAuthError = isAuth,
                        isTransientNetwork = isTransient,
                        message = "${provider.displayName} HTTP $code: ${extractError(rawBody)}"
                    )
                }

                val root = json.parseToJsonElement(rawBody).jsonObject
                val content = root["choices"]
                    ?.jsonArray
                    ?.firstOrNull()
                    ?.jsonObject
                    ?.get("message")
                    ?.jsonObject
                    ?.get("content")
                    ?.jsonPrimitive
                    ?.content

                if (content.isNullOrBlank()) {
                    BrainCallResult.Failure(
                        httpCode = 200,
                        isRateLimitOrQuota = false,
                        isAuthError = false,
                        isTransientNetwork = false,
                        message = "${provider.displayName} returned empty message content"
                    )
                } else {
                    BrainCallResult.Success(text = content, latencyMs = latency)
                }
            }
        } catch (io: IOException) {
            BrainCallResult.Failure(
                httpCode = -1,
                isRateLimitOrQuota = false,
                isAuthError = false,
                isTransientNetwork = true,
                message = "${provider.displayName} network error: ${io.message ?: "IOException"}"
            )
        } catch (t: Throwable) {
            BrainCallResult.Failure(
                httpCode = -1,
                isRateLimitOrQuota = false,
                isAuthError = false,
                isTransientNetwork = false,
                message = "${provider.displayName} parse error: ${t.message ?: "Unknown"}"
            )
        }
    }

    private fun extractError(rawBody: String): String {
        return runCatching {
            val obj = json.parseToJsonElement(rawBody).jsonObject
            obj["error"]?.jsonObject?.get("message")?.jsonPrimitive?.content ?: rawBody.take(180)
        }.getOrDefault(rawBody.take(180))
    }

    companion object {
        private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
    }
}
