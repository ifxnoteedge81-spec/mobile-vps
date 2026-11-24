package com.virtualos.agent.data.security

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.virtualos.agent.domain.model.AiProvider
import com.virtualos.agent.domain.model.ApiKeyEntry
import com.virtualos.agent.domain.model.BrainRouterConfig
import com.virtualos.agent.domain.model.CredentialCategory
import com.virtualos.agent.domain.model.CredentialEntry
import com.virtualos.agent.domain.model.KeyHealthStatus
import com.virtualos.agent.domain.model.MemoryCategory
import com.virtualos.agent.domain.model.MemoryNoteEntry
import com.virtualos.agent.domain.model.PaymentMethodEntry
import com.virtualos.agent.domain.model.SkillSettingsConfig
import com.virtualos.agent.domain.model.UserProfileVault
import com.virtualos.agent.domain.model.VirtualAppEntry
import com.virtualos.agent.domain.model.VirtualEnvironmentConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.UUID

/**
 * AES-256 EncryptedSharedPreferences store for:
 * - 5+ Gemini free keys + OpenRouter key
 * - Virtual Mobile RAM & Sandbox settings
 * - Skills & Guardrails policy
 * - User Profile Vault, Credentials/Passwords, Payment Metadata, Persistent AI Memories,
 *   Installed Virtual Play Store Apps, and Privacy PIN lock hash.
 */
class EncryptedVaultStore(context: Context) {

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val masterKey: MasterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        PREFS_FILE_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    private val _apiKeys = MutableStateFlow(loadApiKeysInternal())
    val apiKeys: StateFlow<List<ApiKeyEntry>> = _apiKeys.asStateFlow()

    private val _routerConfig = MutableStateFlow(loadRouterConfigInternal())
    val routerConfig: StateFlow<BrainRouterConfig> = _routerConfig.asStateFlow()

    private val _userProfile = MutableStateFlow(loadUserProfileInternal())
    val userProfile: StateFlow<UserProfileVault> = _userProfile.asStateFlow()

    private val _virtualEnvConfig = MutableStateFlow(loadVirtualEnvConfigInternal())
    val virtualEnvConfig: StateFlow<VirtualEnvironmentConfig> = _virtualEnvConfig.asStateFlow()

    private val _skillSettings = MutableStateFlow(loadSkillSettingsInternal())
    val skillSettings: StateFlow<SkillSettingsConfig> = _skillSettings.asStateFlow()

    private val _credentials = MutableStateFlow(loadCredentialsInternal())
    val credentials: StateFlow<List<CredentialEntry>> = _credentials.asStateFlow()

    private val _paymentMethods = MutableStateFlow(loadPaymentMethodsInternal())
    val paymentMethods: StateFlow<List<PaymentMethodEntry>> = _paymentMethods.asStateFlow()

    private val _memories = MutableStateFlow(loadMemoriesInternal())
    val memories: StateFlow<List<MemoryNoteEntry>> = _memories.asStateFlow()

    private val _virtualApps = MutableStateFlow(loadVirtualAppsInternal())
    val virtualApps: StateFlow<List<VirtualAppEntry>> = _virtualApps.asStateFlow()

    private val _hasPrivacyPin = MutableStateFlow(prefs.getString(KEY_PRIVACY_PIN_HASH, null) != null)
    val hasPrivacyPin: StateFlow<Boolean> = _hasPrivacyPin.asStateFlow()

    fun addApiKey(
        label: String,
        provider: AiProvider,
        rawKey: String,
        accountHint: String = "",
        customBaseUrl: String = "",
        modelOverride: String = ""
    ) {
        val trimmed = rawKey.trim()
        if (trimmed.isBlank()) return
        val existingCount = _apiKeys.value.count { it.provider == provider }
        val updated = _apiKeys.value + ApiKeyEntry(
            id = UUID.randomUUID().toString(),
            label = label.ifBlank { "${provider.displayName} #${existingCount + 1}" },
            provider = provider,
            apiKey = trimmed,
            accountHint = accountHint.trim(),
            customBaseUrl = customBaseUrl.trim(),
            modelOverride = modelOverride.trim(),
            enabled = true
        )
        persistApiKeys(updated)
    }

    fun upsertProviderConnector(
        label: String,
        provider: AiProvider,
        rawKey: String,
        customBaseUrl: String = "",
        modelOverride: String = ""
    ) {
        val trimmedKey = rawKey.trim()
        if (trimmedKey.isBlank()) return
        val cleanBase = customBaseUrl.trim()
        val cleanModel = modelOverride.trim()
        val existing = _apiKeys.value.firstOrNull {
            it.provider == provider &&
                (provider != AiProvider.CUSTOM_OPENAI || it.customBaseUrl.equals(cleanBase, ignoreCase = true))
        }
        val entry = existing?.copy(
            label = label.ifBlank { existing.label },
            apiKey = trimmedKey,
            customBaseUrl = cleanBase.ifBlank { provider.defaultBaseUrl },
            modelOverride = cleanModel.ifBlank { provider.defaultModel },
            enabled = true,
            cooldownUntilEpochMs = 0L,
            healthStatus = KeyHealthStatus.READY,
            lastError = null
        ) ?: ApiKeyEntry(
            id = UUID.randomUUID().toString(),
            label = label.ifBlank { provider.displayName },
            provider = provider,
            apiKey = trimmedKey,
            accountHint = provider.envVarName,
            customBaseUrl = cleanBase.ifBlank { provider.defaultBaseUrl },
            modelOverride = cleanModel.ifBlank { provider.defaultModel },
            enabled = true
        )
        val updated = _apiKeys.value.filterNot { existing != null && it.id == existing.id } + entry
        persistApiKeys(updated)
    }

    fun upsertBatchGeminiKeys(entries: List<Triple<String, String, String>>) {
        val nonGemini = _apiKeys.value.filter { it.provider != AiProvider.GEMINI }
        val existingGemini = _apiKeys.value.filter { it.provider == AiProvider.GEMINI }
        val newGemini = entries.mapIndexedNotNull { idx, (label, accountHint, rawKey) ->
            val trimmed = rawKey.trim()
            if (trimmed.isBlank()) return@mapIndexedNotNull null
            val existing = existingGemini.firstOrNull { it.apiKey == trimmed }
            existing?.copy(
                label = label.ifBlank { existing.label },
                accountHint = accountHint.ifBlank { existing.accountHint },
                enabled = true
            ) ?: ApiKeyEntry(
                id = UUID.randomUUID().toString(),
                label = label.ifBlank { "Gemini Gmail #${idx + 1}" },
                provider = AiProvider.GEMINI,
                apiKey = trimmed,
                accountHint = accountHint.trim(),
                enabled = true
            )
        }
        persistApiKeys(newGemini + nonGemini)
    }

    fun removeApiKey(id: String) = persistApiKeys(_apiKeys.value.filterNot { it.id == id })

    fun toggleApiKeyEnabled(id: String) {
        val updated = _apiKeys.value.map { entry ->
            if (entry.id == id) {
                entry.copy(
                    enabled = !entry.enabled,
                    cooldownUntilEpochMs = 0L,
                    healthStatus = KeyHealthStatus.READY
                )
            } else entry
        }
        persistApiKeys(updated)
    }

    fun markKeySuccess(id: String) {
        val now = System.currentTimeMillis()
        val updated = _apiKeys.value.map { entry ->
            if (entry.id == id) {
                entry.copy(
                    successCount = entry.successCount + 1,
                    lastUsedEpochMs = now,
                    cooldownUntilEpochMs = 0L,
                    healthStatus = KeyHealthStatus.READY,
                    lastError = null
                )
            } else entry
        }
        persistApiKeys(updated)
    }

    fun markKeyCooldown(
        id: String,
        cooldownUntilMs: Long,
        errorMessage: String,
        isAuthInvalid: Boolean = false
    ) {
        val updated = _apiKeys.value.map { entry ->
            if (entry.id == id) {
                entry.copy(
                    cooldownUntilEpochMs = cooldownUntilMs,
                    failureCount = entry.failureCount + 1,
                    lastUsedEpochMs = System.currentTimeMillis(),
                    lastError = errorMessage.take(180),
                    healthStatus = if (isAuthInvalid) KeyHealthStatus.AUTH_INVALID else KeyHealthStatus.COOLDOWN
                )
            } else entry
        }
        persistApiKeys(updated)
    }

    fun resetAllCooldowns() {
        val updated = _apiKeys.value.map {
            it.copy(
                cooldownUntilEpochMs = 0L,
                healthStatus = KeyHealthStatus.READY,
                lastError = null
            )
        }
        persistApiKeys(updated)
    }

    fun saveCredential(
        serviceName: String,
        usernameOrEmail: String,
        secretValue: String,
        category: CredentialCategory = CredentialCategory.APP_ACCOUNT,
        notes: String = ""
    ): CredentialEntry {
        val cleanService = serviceName.trim().ifBlank { "Service" }
        val entry = CredentialEntry(
            id = UUID.randomUUID().toString(),
            serviceName = cleanService,
            category = category,
            usernameOrEmail = usernameOrEmail.trim(),
            secretValue = secretValue,
            savedLocationPath = "Vault -> Credentials -> $cleanService",
            notes = notes.trim(),
            updatedAtMs = System.currentTimeMillis()
        )
        val updated = _credentials.value.filterNot {
            it.serviceName.equals(cleanService, ignoreCase = true) &&
                it.usernameOrEmail.equals(entry.usernameOrEmail, ignoreCase = true)
        } + entry
        _credentials.value = updated
        prefs.edit().putString(KEY_CREDENTIALS, json.encodeToString(updated)).apply()
        return entry
    }

    fun deleteCredential(id: String) {
        val updated = _credentials.value.filterNot { it.id == id }
        _credentials.value = updated
        prefs.edit().putString(KEY_CREDENTIALS, json.encodeToString(updated)).apply()
    }

    fun generateStrongPassword(length: Int = 16): String {
        val charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*"
        val random = SecureRandom()
        return buildString {
            repeat(length.coerceIn(12, 32)) {
                append(charset[random.nextInt(charset.length)])
            }
        }
    }

    fun savePaymentMethod(
        label: String,
        provider: String,
        maskedIdentifier: String,
        billingAddress: String = "",
        notes: String = ""
    ): PaymentMethodEntry {
        val cleanLabel = label.trim().ifBlank { provider }
        val entry = PaymentMethodEntry(
            id = UUID.randomUUID().toString(),
            label = cleanLabel,
            provider = provider.trim(),
            maskedIdentifier = maskedIdentifier.trim(),
            billingAddress = billingAddress.trim(),
            savedLocationPath = "Vault -> Payments -> $cleanLabel",
            notes = notes.trim(),
            updatedAtMs = System.currentTimeMillis()
        )
        val updated = _paymentMethods.value.filterNot { it.label.equals(cleanLabel, ignoreCase = true) } + entry
        _paymentMethods.value = updated
        prefs.edit().putString(KEY_PAYMENTS, json.encodeToString(updated)).apply()
        return entry
    }

    fun deletePaymentMethod(id: String) {
        val updated = _paymentMethods.value.filterNot { it.id == id }
        _paymentMethods.value = updated
        prefs.edit().putString(KEY_PAYMENTS, json.encodeToString(updated)).apply()
    }

    fun saveMemoryNote(
        title: String,
        content: String,
        category: MemoryCategory = MemoryCategory.IMPORTANT_NOTE
    ): MemoryNoteEntry {
        val cleanTitle = title.trim().ifBlank { "Note" }
        val entry = MemoryNoteEntry(
            id = UUID.randomUUID().toString(),
            category = category,
            title = cleanTitle,
            content = content.trim(),
            savedLocationPath = "Vault -> Memory -> $cleanTitle",
            updatedAtMs = System.currentTimeMillis()
        )
        val updated = _memories.value.filterNot { it.title.equals(cleanTitle, ignoreCase = true) } + entry
        _memories.value = updated
        prefs.edit().putString(KEY_MEMORIES, json.encodeToString(updated)).apply()
        return entry
    }

    fun deleteMemoryNote(id: String) {
        val updated = _memories.value.filterNot { it.id == id }
        _memories.value = updated
        prefs.edit().putString(KEY_MEMORIES, json.encodeToString(updated)).apply()
    }

    fun upsertVirtualApp(app: VirtualAppEntry) {
        val updated = _virtualApps.value.filterNot { it.packageId == app.packageId } + app
        _virtualApps.value = updated
        prefs.edit().putString(KEY_VIRTUAL_APPS, json.encodeToString(updated)).apply()
    }

    fun setPrivacyPin(rawPin: String) {
        val trimmed = rawPin.trim()
        if (trimmed.isBlank()) {
            prefs.edit().remove(KEY_PRIVACY_PIN_HASH).apply()
            _hasPrivacyPin.value = false
            return
        }
        prefs.edit().putString(KEY_PRIVACY_PIN_HASH, sha256(trimmed)).apply()
        _hasPrivacyPin.value = true
    }

    fun verifyPrivacyPin(candidatePin: String): Boolean {
        val stored = prefs.getString(KEY_PRIVACY_PIN_HASH, null) ?: return true
        return stored == sha256(candidatePin.trim())
    }

    fun updateRouterConfig(config: BrainRouterConfig) {
        _routerConfig.value = config
        prefs.edit().putString(KEY_ROUTER_CONFIG, json.encodeToString(config)).apply()
    }

    fun updateUserProfile(profile: UserProfileVault) {
        _userProfile.value = profile
        prefs.edit().putString(KEY_USER_PROFILE, json.encodeToString(profile)).apply()
    }

    fun updateVirtualEnvConfig(config: VirtualEnvironmentConfig) {
        val clampedRam = config.allocatedRamGb.coerceIn(1.0f, 16.0f)
        val normalized = config.copy(allocatedRamGb = clampedRam)
        _virtualEnvConfig.value = normalized
        prefs.edit().putString(KEY_VIRTUAL_ENV, json.encodeToString(normalized)).apply()
    }

    fun updateSkillSettings(config: SkillSettingsConfig) {
        _skillSettings.value = config
        prefs.edit().putString(KEY_SKILL_SETTINGS, json.encodeToString(config)).apply()
    }

    private fun sha256(value: String): String {
        val bytes = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }

    private fun persistApiKeys(list: List<ApiKeyEntry>) {
        _apiKeys.value = list
        prefs.edit().putString(KEY_API_KEYS, json.encodeToString(list)).apply()
    }

    private fun loadApiKeysInternal(): List<ApiKeyEntry> {
        val raw = prefs.getString(KEY_API_KEYS, null) ?: return emptyList()
        return runCatching { json.decodeFromString<List<ApiKeyEntry>>(raw) }.getOrDefault(emptyList())
    }

    private fun loadRouterConfigInternal(): BrainRouterConfig {
        val raw = prefs.getString(KEY_ROUTER_CONFIG, null) ?: return BrainRouterConfig()
        return runCatching { json.decodeFromString<BrainRouterConfig>(raw) }.getOrDefault(BrainRouterConfig())
    }

    private fun loadUserProfileInternal(): UserProfileVault {
        val raw = prefs.getString(KEY_USER_PROFILE, null) ?: return UserProfileVault()
        return runCatching { json.decodeFromString<UserProfileVault>(raw) }.getOrDefault(UserProfileVault())
    }

    private fun loadVirtualEnvConfigInternal(): VirtualEnvironmentConfig {
        val raw = prefs.getString(KEY_VIRTUAL_ENV, null) ?: return VirtualEnvironmentConfig()
        return runCatching { json.decodeFromString<VirtualEnvironmentConfig>(raw) }
            .getOrDefault(VirtualEnvironmentConfig())
    }

    private fun loadSkillSettingsInternal(): SkillSettingsConfig {
        val raw = prefs.getString(KEY_SKILL_SETTINGS, null) ?: return SkillSettingsConfig()
        return runCatching { json.decodeFromString<SkillSettingsConfig>(raw) }
            .getOrDefault(SkillSettingsConfig())
    }

    private fun loadCredentialsInternal(): List<CredentialEntry> {
        val raw = prefs.getString(KEY_CREDENTIALS, null) ?: return emptyList()
        return runCatching { json.decodeFromString<List<CredentialEntry>>(raw) }.getOrDefault(emptyList())
    }

    private fun loadPaymentMethodsInternal(): List<PaymentMethodEntry> {
        val raw = prefs.getString(KEY_PAYMENTS, null) ?: return emptyList()
        return runCatching { json.decodeFromString<List<PaymentMethodEntry>>(raw) }.getOrDefault(emptyList())
    }

    private fun loadMemoriesInternal(): List<MemoryNoteEntry> {
        val raw = prefs.getString(KEY_MEMORIES, null) ?: return emptyList()
        return runCatching { json.decodeFromString<List<MemoryNoteEntry>>(raw) }.getOrDefault(emptyList())
    }

    private fun loadVirtualAppsInternal(): List<VirtualAppEntry> {
        val raw = prefs.getString(KEY_VIRTUAL_APPS, null) ?: return emptyList()
        return runCatching { json.decodeFromString<List<VirtualAppEntry>>(raw) }.getOrDefault(emptyList())
    }

    companion object {
        private const val PREFS_FILE_NAME = "karyo_encrypted_vault"
        private const val KEY_API_KEYS = "api_keys_json"
        private const val KEY_ROUTER_CONFIG = "router_config_json"
        private const val KEY_USER_PROFILE = "user_profile_json"
        private const val KEY_VIRTUAL_ENV = "virtual_env_config_json"
        private const val KEY_SKILL_SETTINGS = "skill_settings_json"
        private const val KEY_CREDENTIALS = "credentials_json"
        private const val KEY_PAYMENTS = "payments_json"
        private const val KEY_MEMORIES = "memories_json"
        private const val KEY_VIRTUAL_APPS = "virtual_apps_json"
        private const val KEY_PRIVACY_PIN_HASH = "privacy_pin_hash"
    }
}
