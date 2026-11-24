package com.virtualos.agent.ui.viewmodel

import android.app.Application
import android.content.Intent
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.virtualos.agent.VirtualOsApplication
import com.virtualos.agent.domain.model.AgentRunStatus
import com.virtualos.agent.domain.model.AiProvider
import com.virtualos.agent.domain.model.BrainRouterConfig
import com.virtualos.agent.domain.model.CredentialCategory
import com.virtualos.agent.domain.model.MemoryCategory
import com.virtualos.agent.domain.model.RouteDiagnosticResult
import com.virtualos.agent.domain.model.SkillSettingsConfig
import com.virtualos.agent.domain.model.UserProfileVault
import com.virtualos.agent.limbs.accessibility.AccessibilityBridge
import com.virtualos.agent.limbs.voice.VoiceLanguage
import com.virtualos.agent.scheduler.AgentForegroundService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class MainAgentViewModel(application: Application) : AndroidViewModel(application) {

    private val app = application as VirtualOsApplication

    val status = app.orchestrator.status
    val logs = app.orchestrator.logs
    val currentStepNumber = app.orchestrator.currentStepNumber
    val pendingGuardrail = app.guardrailEngine.pendingConfirmation
    val memoryProfile = app.lowMemoryMonitor.memoryProfile
    val virtualEnvConfig = app.vaultStore.virtualEnvConfig
    val skillSettings = app.vaultStore.skillSettings
    val apiKeys = app.vaultStore.apiKeys
    val routerConfig = app.vaultStore.routerConfig
    val rotationHistory = app.brainRouter.rotationHistory
    val userProfile = app.vaultStore.userProfile
    val credentials = app.vaultStore.credentials
    val paymentMethods = app.vaultStore.paymentMethods
    val memories = app.vaultStore.memories
    val installedVirtualApps = app.vaultStore.virtualApps
    val hasPrivacyPin = app.vaultStore.hasPrivacyPin
    val workspaceFiles = app.workspaceManager.files
    val webObservation = app.webViewController.observation
    val voiceState = app.voiceController.state
    val accessibilityConnected = AccessibilityBridge.isConnected
    val activeAccessibilityApp = AccessibilityBridge.activePackage

    val scheduledTasks = app.taskScheduler.observeTasks()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _selectedFileContent = MutableStateFlow<Pair<String, String>?>(null)
    val selectedFileContent: StateFlow<Pair<String, String>?> = _selectedFileContent.asStateFlow()

    private val _routeDiagnostics = MutableStateFlow<List<RouteDiagnosticResult>>(emptyList())
    val routeDiagnostics: StateFlow<List<RouteDiagnosticResult>> = _routeDiagnostics.asStateFlow()

    private val _diagnosticsRunning = MutableStateFlow(false)
    val diagnosticsRunning: StateFlow<Boolean> = _diagnosticsRunning.asStateFlow()

    private val _isLocked = MutableStateFlow(app.vaultStore.hasPrivacyPin.value)
    val isLocked: StateFlow<Boolean> = _isLocked.asStateFlow()

    fun unlockWithPin(pin: String): Boolean {
        val ok = app.vaultStore.verifyPrivacyPin(pin)
        if (ok) _isLocked.value = false
        return ok
    }

    fun lockVirtualPhone() {
        if (app.vaultStore.hasPrivacyPin.value) {
            _isLocked.value = true
        }
    }

    fun setPrivacyPin(pin: String) {
        app.vaultStore.setPrivacyPin(pin)
        _isLocked.value = false
    }

    fun startCommand(prompt: String) {
        val intent = Intent(app, AgentForegroundService::class.java)
        ContextCompat.startForegroundService(app, intent)
        app.orchestrator.startTask(prompt)
    }

    fun ensureBackgroundServiceRunning() {
        val intent = Intent(app, AgentForegroundService::class.java)
        ContextCompat.startForegroundService(app, intent)
    }

    fun pauseOrResume() {
        when (status.value) {
            AgentRunStatus.RUNNING -> app.orchestrator.pause()
            AgentRunStatus.PAUSED -> app.orchestrator.resume()
            else -> Unit
        }
    }

    fun stopCommand() {
        app.orchestrator.stop()
        app.stopService(Intent(app, AgentForegroundService::class.java))
    }

    fun clearLogs() = app.orchestrator.clearLogs()

    fun resolveGuardrail(approved: Boolean) = app.guardrailEngine.resolveConfirmation(approved)

    fun setVirtualRamAllocation(ramGb: Float, envName: String = virtualEnvConfig.value.envName) {
        val current = virtualEnvConfig.value
        app.vaultStore.updateVirtualEnvConfig(
            current.copy(
                envName = envName.ifBlank { "Virtual Mobile #1" },
                allocatedRamGb = ramGb.coerceIn(1.0f, 16.0f),
                lowMemoryOptimizationEnabled = ramGb <= 4.0f
            )
        )
        app.lowMemoryMonitor.refreshProfile()
    }

    fun updateSkillSettings(config: SkillSettingsConfig) =
        app.vaultStore.updateSkillSettings(config)

    fun setVoiceLanguage(language: VoiceLanguage) = app.voiceController.setLanguage(language)

    fun startVoiceListening(onTranscriptReady: (String) -> Unit) =
        app.voiceController.startListening(onTranscriptReady)

    fun stopVoiceListening() = app.voiceController.stopListening()

    fun saveFiveGeminiKeys(entries: List<Triple<String, String, String>>) =
        app.vaultStore.upsertBatchGeminiKeys(entries)

    fun addApiKey(label: String, provider: AiProvider, key: String, accountHint: String = "") =
        app.vaultStore.addApiKey(label, provider, key, accountHint)

    fun removeApiKey(id: String) = app.vaultStore.removeApiKey(id)

    fun resetAllCooldowns() = app.brainRouter.clearRouteCooldowns()

    fun updateRouterConfig(config: BrainRouterConfig) = app.vaultStore.updateRouterConfig(config)

    fun runRouteDiagnostics() {
        viewModelScope.launch {
            _diagnosticsRunning.value = true
            _routeDiagnostics.value = app.brainRouter.testAllConfiguredRoutes()
            _diagnosticsRunning.value = false
        }
    }

    fun saveUserProfile(profile: UserProfileVault) = app.vaultStore.updateUserProfile(profile)

    fun saveCredential(
        serviceName: String,
        username: String,
        password: String,
        category: CredentialCategory = CredentialCategory.APP_ACCOUNT,
        notes: String = ""
    ) {
        val actualPassword = password.ifBlank { app.vaultStore.generateStrongPassword(16) }
        app.vaultStore.saveCredential(serviceName, username, actualPassword, category, notes)
    }

    fun deleteCredential(id: String) = app.vaultStore.deleteCredential(id)

    fun savePaymentMethod(label: String, provider: String, maskedIdentifier: String, billingAddress: String) =
        app.vaultStore.savePaymentMethod(label, provider, maskedIdentifier, billingAddress)

    fun deletePaymentMethod(id: String) = app.vaultStore.deletePaymentMethod(id)

    fun saveMemoryNote(title: String, content: String, category: MemoryCategory = MemoryCategory.IMPORTANT_NOTE) =
        app.vaultStore.saveMemoryNote(title, content, category)

    fun deleteMemoryNote(id: String) = app.vaultStore.deleteMemoryNote(id)

    fun searchPlayStoreCatalog(query: String) = app.playStoreLimb.searchCatalog(query)

    fun installPlayStoreApp(queryOrPackage: String) {
        app.playStoreLimb.installApp(queryOrPackage, triggerSystemPlayStore = true)
    }

    fun openVirtualApp(url: String) {
        viewModelScope.launch { app.webViewController.navigate(url) }
    }

    fun navigateWebView(url: String) {
        viewModelScope.launch { app.webViewController.navigate(url) }
    }

    fun getWebViewController() = app.webViewController

    fun openWorkspaceFile(relativePath: String) {
        viewModelScope.launch {
            val content = app.workspaceManager.readFile(relativePath).getOrElse { "Error: ${it.message}" }
            _selectedFileContent.value = relativePath to content
        }
    }

    fun closeWorkspaceFile() {
        _selectedFileContent.value = null
    }

    fun createWorkspaceNote(relativePath: String, content: String) {
        viewModelScope.launch { app.workspaceManager.writeFile(relativePath, content) }
    }

    fun deleteWorkspaceFile(relativePath: String) {
        viewModelScope.launch {
            app.workspaceManager.deleteFile(relativePath)
            if (_selectedFileContent.value?.first == relativePath) {
                _selectedFileContent.value = null
            }
        }
    }

    fun enqueueScheduledTask(
        title: String,
        prompt: String,
        isRecurring: Boolean,
        intervalHours: Long,
        requiresUnmetered: Boolean,
        requiresBatteryNotLow: Boolean
    ) {
        viewModelScope.launch {
            app.taskScheduler.enqueueTask(
                title = title,
                prompt = prompt,
                isRecurring = isRecurring,
                intervalHours = intervalHours,
                requiresUnmeteredNetwork = requiresUnmetered,
                requiresBatteryNotLow = requiresBatteryNotLow
            )
        }
    }

    fun cancelScheduledTask(taskId: String) {
        viewModelScope.launch { app.taskScheduler.cancelTask(taskId) }
    }

    fun openAccessibilitySettings() = AccessibilityBridge.openAccessibilitySettings(app)

    override fun onCleared() {
        app.voiceController.destroy()
        super.onCleared()
    }
}
