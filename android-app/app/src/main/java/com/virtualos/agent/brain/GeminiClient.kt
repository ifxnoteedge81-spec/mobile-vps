package com.virtualos.agent.brain

import com.virtualos.agent.domain.model.BrainRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

sealed class BrainCallResult {
    data class Success(val text: String, val latencyMs: Long) : BrainCallResult()
    data class Failure(
        val httpCode: Int,
        val isRateLimitOrQuota: Boolean,
        val isAuthError: Boolean,
        val isTransientNetwork: Boolean,
        val message: String
    ) : BrainCallResult()
}

class GeminiClient(
    private val httpClient: OkHttpClient
) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun generate(
        apiKey: String,
        modelId: String,
        request: BrainRequest
    ): BrainCallResult = withContext(Dispatchers.IO) {
        val started = System.currentTimeMillis()
        val endpoint = "https://generativelanguage.googleapis.com/v1beta/models/$modelId:generateContent?key=$apiKey"

        val payload = buildJsonObject {
            putJsonObject("systemInstruction") {
                putJsonArray("parts") {
                    add(buildJsonObject { put("text", request.systemInstruction) })
                }
            }
            putJsonArray("contents") {
                add(buildJsonObject {
                    put("role", "user")
                    putJsonArray("parts") {
                        add(buildJsonObject { put("text", request.userPrompt) })
                    }
                })
            }
            putJsonObject("generationConfig") {
                put("temperature", 0.2)
                put("maxOutputTokens", request.maxTokens)
                if (request.jsonMode) {
                    put("responseMimeType", "application/json")
                }
            }
        }

        val httpRequest = Request.Builder()
            .url(endpoint)
            .post(payload.toString().toRequestBody(JSON_MEDIA_TYPE))
            .header("Content-Type", "application/json")
            .build()

        try {
            httpClient.newCall(httpRequest).execute().use { response ->
                val rawBody = response.body?.string().orEmpty()
                val latency = System.currentTimeMillis() - started

                if (!response.isSuccessful) {
                    val code = response.code
                    val isQuota = code == 429 || rawBody.contains("RESOURCE_EXHAUSTED", ignoreCase = true)
                    val isAuth = code == 401 || code == 403 || rawBody.contains("API_KEY_INVALID", ignoreCase = true)
                    val isTransient = code >= 500 || code == 408
                    return@withContext BrainCallResult.Failure(
                        httpCode = code,
                        isRateLimitOrQuota = isQuota,
                        isAuthError = isAuth,
                        isTransientNetwork = isTransient,
                        message = "Gemini HTTP $code: ${extractErrorMessage(rawBody)}"
                    )
                }

                val root = json.parseToJsonElement(rawBody).jsonObject
                val text = root["candidates"]
                    ?.jsonArray
                    ?.firstOrNull()
                    ?.jsonObject
                    ?.get("content")
                    ?.jsonObject
                    ?.get("parts")
                    ?.jsonArray
                    ?.firstOrNull()
                    ?.jsonObject
                    ?.get("text")
                    ?.jsonPrimitive
                    ?.content

                if (text.isNullOrBlank()) {
                    BrainCallResult.Failure(
                        httpCode = 200,
                        isRateLimitOrQuota = false,
                        isAuthError = false,
                        isTransientNetwork = false,
                        message = "Gemini returned empty candidate text"
                    )
                } else {
                    BrainCallResult.Success(text = text, latencyMs = latency)
                }
            }
        } catch (io: IOException) {
            BrainCallResult.Failure(
                httpCode = -1,
                isRateLimitOrQuota = false,
                isAuthError = false,
                isTransientNetwork = true,
                message = "Gemini network error: ${io.message ?: "IOException"}"
            )
        } catch (t: Throwable) {
            BrainCallResult.Failure(
                httpCode = -1,
                isRateLimitOrQuota = false,
                isAuthError = false,
                isTransientNetwork = false,
                message = "Gemini parse error: ${t.message ?: "Unknown"}"
            )
        }
    }

    private fun extractErrorMessage(rawBody: String): String {
        return runCatching {
            val obj = json.parseToJsonElement(rawBody).jsonObject
            obj["error"]?.jsonObject?.get("message")?.jsonPrimitive?.content ?: rawBody.take(180)
        }.getOrDefault(rawBody.take(180))
    }

    companion object {
        private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
    }
}
