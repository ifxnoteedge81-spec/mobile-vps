package com.virtualos.agent.agent

import android.content.Context
import com.virtualos.agent.brain.BrainRouter
import com.virtualos.agent.data.security.EncryptedVaultStore
import com.virtualos.agent.data.workspace.SandboxedWorkspaceManager
import com.virtualos.agent.domain.model.AgentActionType
import com.virtualos.agent.domain.model.AgentPhase
import com.virtualos.agent.domain.model.AgentRunStatus
import com.virtualos.agent.domain.model.AgentStepPlan
import com.virtualos.agent.domain.model.BrainRequest
import com.virtualos.agent.domain.model.CredentialCategory
import com.virtualos.agent.domain.model.ExecutionLogEntry
import com.virtualos.agent.domain.model.MemoryCategory
import com.virtualos.agent.limbs.accessibility.AccessibilityBridge
import com.virtualos.agent.limbs.media.VideoEditorLimb
import com.virtualos.agent.limbs.os.ClipboardAndIntentLimb
import com.virtualos.agent.limbs.store.PlayStoreLimb
import com.virtualos.agent.limbs.webview.WebViewAutomationController
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import java.util.UUID

class AgentOrchestrator(
    private val appContext: Context,
    private val brainRouter: BrainRouter,
    private val vaultStore: EncryptedVaultStore,
    private val workspaceManager: SandboxedWorkspaceManager,
    private val webViewController: WebViewAutomationController,
    private val videoEditorLimb: VideoEditorLimb,
    private val clipboardLimb: ClipboardAndIntentLimb,
    private val playStoreLimb: PlayStoreLimb,
    private val guardrailEngine: GuardrailEngine,
    private val lowMemoryMonitor: LowMemoryMonitor
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private var activeJob: Job? = null

    private val _status = MutableStateFlow(AgentRunStatus.IDLE)
    val status: StateFlow<AgentRunStatus> = _status.asStateFlow()

    private val _logs = MutableStateFlow<List<ExecutionLogEntry>>(emptyList())
    val logs: StateFlow<List<ExecutionLogEntry>> = _logs.asStateFlow()

    private val _currentStepNumber = MutableStateFlow(0)
    val currentStepNumber: StateFlow<Int> = _currentStepNumber.asStateFlow()

    private val _activeGoal = MutableStateFlow("")
    val activeGoal: StateFlow<String> = _activeGoal.asStateFlow()

    private val _activeVirtualApp = MutableStateFlow<String?>(null)
    val activeVirtualApp: StateFlow<String?> = _activeVirtualApp.asStateFlow()

    fun startTask(goalPrompt: String) {
        val trimmed = goalPrompt.trim()
        if (trimmed.isBlank()) return

        if (activeJob?.isActive == true) {
            appendLog(AgentPhase.SYSTEM, "Task Rejected", "Another task is already active inside Virtual Mobile.")
            return
        }

        _activeGoal.value = trimmed
        _currentStepNumber.value = 0
        _status.value = AgentRunStatus.RUNNING

        activeJob = scope.launch {
            executeLoop(trimmed)
        }
    }

    suspend fun runBlockingForWorker(goalPrompt: String): Result<String> {
        _activeGoal.value = goalPrompt
        _status.value = AgentRunStatus.RUNNING
        return executeLoop(goalPrompt, maxSteps = 8, allowInteractiveGuardrail = false)
    }

    fun pause() {
        if (_status.value == AgentRunStatus.RUNNING) {
            _status.value = AgentRunStatus.PAUSED
            appendLog(AgentPhase.SYSTEM, "Agent Paused", "Execution paused by operator.")
        }
    }

    fun resume() {
        if (_status.value == AgentRunStatus.PAUSED) {
            _status.value = AgentRunStatus.RUNNING
            appendLog(AgentPhase.SYSTEM, "Agent Resumed", "Resuming execution loop.")
        }
    }

    fun stop() {
        guardrailEngine.cancelPending()
        activeJob?.cancel()
        activeJob = null
        _status.value = AgentRunStatus.STOPPED
        appendLog(AgentPhase.SYSTEM, "Agent Stopped", "Execution terminated safely by user.")
    }

    fun clearLogs() {
        _logs.value = emptyList()
    }

    private suspend fun executeLoop(
        goal: String,
        maxSteps: Int = 12,
        allowInteractiveGuardrail: Boolean = true
    ): Result<String> {
        val recentStepOutcomes = ArrayDeque<String>(6)
        var finalSummary = "Task ended."

        try {
            appendLog(AgentPhase.SYSTEM, "Session Started", "Goal: $goal")

            for (stepIndex in 1..maxSteps) {
                while (_status.value == AgentRunStatus.PAUSED) {
                    delay(250L)
                }
                if (!scope.isActive || _status.value == AgentRunStatus.STOPPED) {
                    return Result.failure(CancellationException("Stopped by user"))
                }

                _currentStepNumber.value = stepIndex
                val memoryProfile = lowMemoryMonitor.refreshProfile()
                val skillPolicy = vaultStore.skillSettings.value

                val observation = observeEnvironment(memoryProfile.maxDomCharacters, memoryProfile.maxAccessibilityNodes)
                appendLog(
                    AgentPhase.OBSERVE,
                    "Step $stepIndex Observation",
                    "Virtual RAM: ${memoryProfile.allocatedRamMb / 1024}GB | Apps: ${observation.installedAppsCount} | Memories: ${observation.memoriesCount}"
                )

                val planResult = requestStepPlan(goal, stepIndex, observation, recentStepOutcomes.toList())
                val plan = planResult.getOrElse { err ->
                    appendLog(AgentPhase.ERROR, "Brain Routing Error", err.message ?: "Unknown AI failure")
                    _status.value = AgentRunStatus.FAILED
                    return Result.failure(err)
                }

                appendLog(
                    AgentPhase.PLAN,
                    "Planned: ${plan.action.name}",
                    "Thought: ${plan.thought}\nSteps: ${plan.plannedSteps.joinToString(" -> ")}",
                    providerUsed = planResult.providerLabel
                )

                if (plan.isDone || plan.action == AgentActionType.FINISH_TASK) {
                    finalSummary = plan.finalSummary.ifBlank { plan.thought }
                    appendLog(AgentPhase.VERIFY, "Task Completed", finalSummary)
                    _status.value = AgentRunStatus.COMPLETED
                    persistHistoryReport(goal, finalSummary, recentStepOutcomes.toList())
                    return Result.success(finalSummary)
                }

                val guardrail = guardrailEngine.classifyRisk(plan, skillPolicy)
                if (guardrail != null) {
                    if (!allowInteractiveGuardrail) {
                        val blockedMsg = "Background worker blocked sensitive action ${plan.action.name} without live UI approval."
                        appendLog(AgentPhase.GUARDRAIL, "Blocked in Background", blockedMsg)
                        _status.value = AgentRunStatus.FAILED
                        return Result.failure(SecurityException(blockedMsg))
                    }
                    _status.value = AgentRunStatus.AWAITING_CONFIRMATION
                    appendLog(AgentPhase.GUARDRAIL, "Awaiting User Confirmation", "${guardrail.reason} Target: ${guardrail.target}")
                    val approved = guardrailEngine.requestUserApproval(guardrail)
                    if (!approved) {
                        _status.value = AgentRunStatus.STOPPED
                        appendLog(AgentPhase.GUARDRAIL, "Action Denied", "Operator denied ${plan.action.name}. Halting safely.")
                        return Result.failure(SecurityException("Action denied by user"))
                    }
                    _status.value = AgentRunStatus.RUNNING
                    appendLog(AgentPhase.GUARDRAIL, "Action Approved", "Operator authorized ${plan.action.name}.")
                }

                val actionOutcome = executeActionSafely(plan)
                val outcomePhase = when {
                    plan.action.name.startsWith("VIDEO_") -> AgentPhase.MEDIA
                    plan.action.name.startsWith("PLAY_STORE_") || plan.action == AgentActionType.OPEN_VIRTUAL_APP -> AgentPhase.STORE
                    plan.action.name.startsWith("CREDENTIAL_") || plan.action == AgentActionType.MEMORY_SAVE || plan.action == AgentActionType.PAYMENT_METHOD_SAVE -> AgentPhase.MEMORY
                    else -> AgentPhase.ACT
                }
                val outcomeText = actionOutcome.fold(
                    onSuccess = { msg ->
                        appendLog(outcomePhase, "Executed ${plan.action.name}", msg)
                        "Step $stepIndex OK (${plan.action.name}): $msg"
                    },
                    onFailure = { err ->
                        val recovered = "Step $stepIndex RECOVERED ERROR (${plan.action.name}): ${err.message}"
                        appendLog(AgentPhase.VERIFY, "Step Failed Safely", recovered)
                        recovered
                    }
                )

                if (recentStepOutcomes.size >= 5) recentStepOutcomes.removeFirst()
                recentStepOutcomes.addLast(outcomeText)
                delay(350L)
            }

            finalSummary = "Reached $maxSteps step safety budget. Partial progress saved to workspace."
            appendLog(AgentPhase.VERIFY, "Step Limit Reached", finalSummary)
            _status.value = AgentRunStatus.COMPLETED
            persistHistoryReport(goal, finalSummary, recentStepOutcomes.toList())
            return Result.success(finalSummary)
        } catch (ce: CancellationException) {
            _status.value = AgentRunStatus.STOPPED
            return Result.failure(ce)
        } catch (t: Throwable) {
            appendLog(AgentPhase.ERROR, "Orchestrator Exception", t.message ?: "Unexpected failure")
            _status.value = AgentRunStatus.FAILED
            return Result.failure(t)
        }
    }

    private suspend fun observeEnvironment(maxDomChars: Int, maxAccNodes: Int): EnvironmentObservation {
        val webObs = webViewController.observation.value
        val domPreview = webObs.domSummaryJson.take(maxDomChars / 2)
        val workspaceFiles = workspaceManager.listFilesSummary().take(1000)
        val accessibilityConnected = AccessibilityBridge.isConnected.value
        val accessibilityTree = if (accessibilityConnected) {
            AccessibilityBridge.readScreenTree(maxNodes = maxAccNodes).getOrDefault("Unavailable")
        } else {
            "Accessibility Service disabled"
        }
        val profileContext = vaultStore.userProfile.value.toCompactAgentContext()
        val credentialSummary = vaultStore.credentials.value.joinToString("\n") {
            "- ${it.serviceName} (${it.category.name}): user=${it.usernameOrEmail} | location=${it.savedLocationPath}"
        }.ifBlank { "None stored yet." }
        val paymentSummary = vaultStore.paymentMethods.value.joinToString("\n") {
            "- ${it.label} (${it.provider} ${it.maskedIdentifier}) | location=${it.savedLocationPath}"
        }.ifBlank { "None stored yet." }
        val memorySummary = vaultStore.memories.value.joinToString("\n") {
            "- [${it.category.name}] ${it.title}: ${it.content}"
        }.ifBlank { "None stored yet." }
        val virtualApps = vaultStore.virtualApps.value.joinToString(", ") {
            "${it.appName} (${it.packageId})"
        }.ifBlank { "None installed yet." }

        return EnvironmentObservation(
            webUrl = webObs.url,
            webTitle = webObs.title,
            webDom = domPreview,
            workspaceSummary = workspaceFiles,
            accessibilityPackage = AccessibilityBridge.activePackage.value,
            accessibilityTree = accessibilityTree,
            userProfile = profileContext,
            credentialsSummary = credentialSummary,
            paymentsSummary = paymentSummary,
            memoriesSummary = memorySummary,
            virtualAppsSummary = virtualApps,
            installedAppsCount = vaultStore.virtualApps.value.size,
            memoriesCount = vaultStore.memories.value.size
        )
    }

    private suspend fun requestStepPlan(
        goal: String,
        stepIndex: Int,
        obs: EnvironmentObservation,
        recentHistory: List<String>
    ): PlanCallEnvelope {
        val skills = vaultStore.skillSettings.value
        val systemPrompt = """
            You are KaryoOS, an autonomous isolated Virtual Phone & OS Agent inside Android.
            You understand Bengali (বাংলা) and English fluently.
            When the user asks to download/install an app (WhatsApp, imo, Telegram, Calling, etc.), use PLAY_STORE_SEARCH / PLAY_STORE_INSTALL and OPEN_VIRTUAL_APP inside the isolated phone.
            When the user gives important info, addresses, preferences, or asks you to remember/save account/password/payment details so they don't have to repeat it, use MEMORY_SAVE, CREDENTIAL_SAVE, CREDENTIAL_GENERATE_AND_SAVE, or PAYMENT_METHOD_SAVE, and explicitly report the exact saved location path (e.g. "Vault -> Credentials -> WhatsApp") in finalSummary!
            Respond ONLY with valid JSON:
            {
              "thought": "concise reasoning",
              "phaseNote": "short status note in user's language",
              "plannedSteps": ["step 1", "step 2"],
              "action": "ONE_OF_ENUM",
              "target": "URL, selector, app name, service name, file path, video URI, or memory title",
              "value": "payload value (for CREDENTIAL_SAVE use 'username|password|notes'; for PAYMENT_METHOD_SAVE use 'provider|maskedIdentifier|billingAddress'; for MEMORY_SAVE use 'CATEGORY|content')",
              "requiresConfirmation": false,
              "riskReason": "",
              "isDone": false,
              "finalSummary": ""
            }
            Enabled Skills:
            - Play Store & Virtual Apps (${skills.playStoreInstallEnabled}): PLAY_STORE_SEARCH, PLAY_STORE_INSTALL, OPEN_VIRTUAL_APP
            - Credentials, Payment Metadata & Self-Improving Memory (${skills.autoMemoryLearningEnabled}): CREDENTIAL_SAVE, CREDENTIAL_GENERATE_AND_SAVE, PAYMENT_METHOD_SAVE, MEMORY_SAVE
            - Web Automation (${skills.webAutomationEnabled}): WEB_NAVIGATE, WEB_EXTRACT_DOM, WEB_FILL_INPUT, WEB_CLICK_ELEMENT, WEB_SCROLL
            - File Workspace (${skills.fileWorkspaceEnabled}): WORKSPACE_WRITE_FILE, WORKSPACE_READ_FILE, WORKSPACE_LIST_FILES, WORKSPACE_DELETE_FILE
            - OS Accessibility (${skills.accessibilityControlEnabled}): ACCESSIBILITY_READ_SCREEN, ACCESSIBILITY_CLICK_NODE, ACCESSIBILITY_TYPE_TEXT, ACCESSIBILITY_SCROLL, ACCESSIBILITY_GLOBAL_BACK, LAUNCH_APP
            - Video Editing Media3 (${skills.videoEditingEnabled}): VIDEO_TRIM, VIDEO_RESIZE_COMPRESS, VIDEO_MUTE, VIDEO_WATERMARK
            - Clipboard & Share (${skills.clipboardAndShareEnabled}): CLIPBOARD_SET, SEND_SHARE_INTENT
            - Sensitive Actions: SUBMIT_SENSITIVE_FORM, ACCOUNT_LOGIN_OR_SIGNUP, PAYMENT_ACTION
            - Completion: FINISH_TASK
        """.trimIndent()

        val userPrompt = """
            USER GOAL: $goal
            CURRENT STEP: $stepIndex
            USER PROFILE VAULT:
            ${obs.userProfile}

            SAVED CREDENTIALS INDEX:
            ${obs.credentialsSummary}

            SAVED PAYMENT METHODS:
            ${obs.paymentsSummary}

            PERSISTENT MEMORIES & ADDRESSES (NEVER ASK AGAIN FOR THESE):
            ${obs.memoriesSummary}

            INSTALLED VIRTUAL PHONE APPS:
            ${obs.virtualAppsSummary}

            WEBVIEW STATE (${obs.webUrl} - ${obs.webTitle}):
            ${obs.webDom}

            ACCESSIBILITY ACTIVE APP (${obs.accessibilityPackage}):
            ${obs.accessibilityTree}

            SANDBOXED WORKSPACE FILES:
            ${obs.workspaceSummary}

            RECENT STEP OUTCOMES:
            ${if (recentHistory.isEmpty()) "None yet." else recentHistory.joinToString("\n")}
        """.trimIndent()

        val response = brainRouter.routeGenerate(
            BrainRequest(
                systemInstruction = systemPrompt,
                userPrompt = userPrompt,
                jsonMode = true,
                maxTokens = 1200
            )
        ).getOrElse { return PlanCallEnvelope.Failure(it) }

        val cleanedJson = extractJsonObject(response.rawText)
        val parsed = runCatching { json.decodeFromString<AgentStepPlan>(cleanedJson) }
            .getOrElse { err ->
                return PlanCallEnvelope.Failure(
                    IllegalStateException("Invalid JSON from ${response.modelId}: ${err.message}")
                )
            }

        return PlanCallEnvelope.Success(
            plan = parsed,
            providerLabel = "${response.provider.name}:${response.modelId} (${response.keyLabel}, ${response.latencyMs}ms)"
        )
    }

    private suspend fun executeActionSafely(plan: AgentStepPlan): Result<String> {
        val skills = vaultStore.skillSettings.value
        return when (plan.action) {
            AgentActionType.PLAY_STORE_SEARCH -> {
                if (!skills.playStoreInstallEnabled) return Result.failure(IllegalStateException("Play Store disabled in Settings"))
                val results = playStoreLimb.searchCatalog(plan.target)
                Result.success("Play Store matches: ${results.joinToString { "${it.appName} (${it.packageId})" }}")
            }
            AgentActionType.PLAY_STORE_INSTALL -> {
                if (!skills.playStoreInstallEnabled) return Result.failure(IllegalStateException("Play Store disabled in Settings"))
                playStoreLimb.installApp(plan.target).map { app ->
                    _activeVirtualApp.value = app.appName
                    "Installed ${app.appName} (${app.packageId}) into Virtual Phone Drawer."
                }
            }
            AgentActionType.OPEN_VIRTUAL_APP -> {
                val app = playStoreLimb.searchCatalog(plan.target).first()
                _activeVirtualApp.value = app.appName
                webViewController.navigate(app.webFallbackUrl)
                Result.success("Opened ${app.appName} inside Virtual Phone viewport (${app.webFallbackUrl})")
            }

            AgentActionType.CREDENTIAL_GENERATE_AND_SAVE -> {
                val parts = plan.value.split("|")
                val userOrEmail = parts.getOrNull(0)?.trim()?.ifBlank {
                    vaultStore.userProfile.value.email.ifBlank { "user@karyoos.local" }
                } ?: "user@karyoos.local"
                val generatedPass = vaultStore.generateStrongPassword(16)
                val notes = parts.getOrNull(1)?.trim() ?: "Auto-generated secure password"
                val entry = vaultStore.saveCredential(
                    serviceName = plan.target,
                    usernameOrEmail = userOrEmail,
                    secretValue = generatedPass,
                    category = CredentialCategory.APP_ACCOUNT,
                    notes = notes
                )
                Result.success("Saved account for ${entry.serviceName} (user: ${entry.usernameOrEmail}) at ${entry.savedLocationPath}")
            }
            AgentActionType.CREDENTIAL_SAVE -> {
                val parts = plan.value.split("|")
                val userOrEmail = parts.getOrNull(0)?.trim() ?: ""
                val pass = parts.getOrNull(1)?.trim()?.ifBlank { vaultStore.generateStrongPassword(16) }
                    ?: vaultStore.generateStrongPassword(16)
                val notes = parts.getOrNull(2)?.trim() ?: ""
                val entry = vaultStore.saveCredential(
                    serviceName = plan.target,
                    usernameOrEmail = userOrEmail,
                    secretValue = pass,
                    category = CredentialCategory.APP_ACCOUNT,
                    notes = notes
                )
                Result.success("Saved credential at ${entry.savedLocationPath} (Username: ${entry.usernameOrEmail})")
            }
            AgentActionType.PAYMENT_METHOD_SAVE -> {
                val parts = plan.value.split("|")
                val provider = parts.getOrNull(0)?.trim()?.ifBlank { "Wallet/Card" } ?: "Wallet/Card"
                val masked = parts.getOrNull(1)?.trim()?.ifBlank { "****" } ?: "****"
                val billing = parts.getOrNull(2)?.trim() ?: vaultStore.userProfile.value.location
                val entry = vaultStore.savePaymentMethod(
                    label = plan.target.ifBlank { provider },
                    provider = provider,
                    maskedIdentifier = masked,
                    billingAddress = billing
                )
                Result.success("Saved payment method (${entry.provider} ${entry.maskedIdentifier}) at ${entry.savedLocationPath}")
            }
            AgentActionType.MEMORY_SAVE -> {
                val parts = plan.value.split("|", limit = 2)
                val cat = if (parts.size == 2) {
                    runCatching { MemoryCategory.valueOf(parts[0].trim().uppercase()) }
                        .getOrDefault(MemoryCategory.IMPORTANT_NOTE)
                } else MemoryCategory.IMPORTANT_NOTE
                val body = if (parts.size == 2) parts[1].trim() else plan.value
                val saved = vaultStore.saveMemoryNote(
                    title = plan.target.ifBlank { "User Note" },
                    content = body,
                    category = cat
                )
                Result.success("Remembered permanently at ${saved.savedLocationPath}")
            }

            AgentActionType.WEB_NAVIGATE -> {
                if (!skills.webAutomationEnabled) return Result.failure(IllegalStateException("Web skill disabled in Settings"))
                webViewController.navigate(plan.target)
            }
            AgentActionType.WEB_EXTRACT_DOM -> {
                if (!skills.webAutomationEnabled) return Result.failure(IllegalStateException("Web skill disabled in Settings"))
                webViewController.extractDomSnapshot(lowMemoryMonitor.memoryProfile.value.maxDomCharacters)
            }
            AgentActionType.WEB_FILL_INPUT -> webViewController.fillInput(plan.target, plan.value)
            AgentActionType.WEB_CLICK_ELEMENT,
            AgentActionType.SUBMIT_SENSITIVE_FORM,
            AgentActionType.ACCOUNT_LOGIN_OR_SIGNUP,
            AgentActionType.PAYMENT_ACTION -> webViewController.clickElement(plan.target)
            AgentActionType.WEB_SCROLL -> webViewController.scrollPage(plan.value.ifBlank { "down" })

            AgentActionType.WORKSPACE_WRITE_FILE -> workspaceManager.writeFile(plan.target, plan.value)
                .map { "Saved ${it.relativePath} (${it.sizeBytes} bytes)" }
            AgentActionType.WORKSPACE_READ_FILE -> workspaceManager.readFile(plan.target)
            AgentActionType.WORKSPACE_LIST_FILES -> Result.success(workspaceManager.listFilesSummary())
            AgentActionType.WORKSPACE_DELETE_FILE -> workspaceManager.deleteFile(plan.target)
                .map { "Deleted ${plan.target}" }

            AgentActionType.ACCESSIBILITY_READ_SCREEN -> AccessibilityBridge.readScreenTree(
                lowMemoryMonitor.memoryProfile.value.maxAccessibilityNodes
            )
            AgentActionType.ACCESSIBILITY_CLICK_NODE -> AccessibilityBridge.clickNode(plan.target)
            AgentActionType.ACCESSIBILITY_TYPE_TEXT -> AccessibilityBridge.typeText(plan.target, plan.value)
            AgentActionType.ACCESSIBILITY_SCROLL -> AccessibilityBridge.scrollScreen(!plan.value.equals("up", ignoreCase = true))
            AgentActionType.ACCESSIBILITY_GLOBAL_BACK -> AccessibilityBridge.performBack()
            AgentActionType.LAUNCH_APP -> AccessibilityBridge.launchAppByPackageOrName(appContext, plan.target)

            AgentActionType.CLIPBOARD_SET -> clipboardLimb.copyToClipboard(plan.target, plan.value)
            AgentActionType.SEND_SHARE_INTENT -> clipboardLimb.shareTextIntent(plan.target, plan.value)

            AgentActionType.VIDEO_TRIM -> {
                if (!skills.videoEditingEnabled) return Result.failure(IllegalStateException("Video editing skill disabled in Settings"))
                val parts = plan.value.split(":", "-", ",")
                val startMs = parts.getOrNull(0)?.trim()?.toLongOrNull() ?: 0L
                val endMs = parts.getOrNull(1)?.trim()?.toLongOrNull() ?: 10_000L
                videoEditorLimb.trimVideo(plan.target, startMs, endMs)
            }
            AgentActionType.VIDEO_RESIZE_COMPRESS -> {
                if (!skills.videoEditingEnabled) return Result.failure(IllegalStateException("Video editing skill disabled in Settings"))
                val height = plan.value.trim().toIntOrNull() ?: 720
                videoEditorLimb.resizeAndCompressVideo(plan.target, height)
            }
            AgentActionType.VIDEO_MUTE -> {
                if (!skills.videoEditingEnabled) return Result.failure(IllegalStateException("Video editing skill disabled in Settings"))
                videoEditorLimb.muteVideo(plan.target)
            }
            AgentActionType.VIDEO_WATERMARK -> {
                if (!skills.videoEditingEnabled) return Result.failure(IllegalStateException("Video editing skill disabled in Settings"))
                videoEditorLimb.addTextWatermark(plan.target, plan.value)
            }

            AgentActionType.FINISH_TASK -> Result.success(plan.finalSummary)
        }
    }

    private suspend fun persistHistoryReport(goal: String, summary: String, steps: List<String>) {
        val fileName = "history/run_${System.currentTimeMillis()}.md"
        val body = buildString {
            appendLine("# KaryoOS Execution Report")
            appendLine("- **Goal**: $goal")
            appendLine("- **Summary**: $summary")
            appendLine("\n## Steps")
            steps.forEach { appendLine("- $it") }
        }
        workspaceManager.writeFile(fileName, body)
    }

    private fun extractJsonObject(raw: String): String {
        val trimmed = raw.trim()
            .removePrefix("```json")
            .removePrefix("```")
            .removeSuffix("```")
            .trim()
        val start = trimmed.indexOf('{')
        val end = trimmed.lastIndexOf('}')
        return if (start >= 0 && end > start) trimmed.substring(start, end + 1) else trimmed
    }

    private fun appendLog(phase: AgentPhase, title: String, detail: String, providerUsed: String? = null) {
        val cap = lowMemoryMonitor.memoryProfile.value.maxLogEntries
        val entry = ExecutionLogEntry(
            id = UUID.randomUUID().toString(),
            timestampMs = System.currentTimeMillis(),
            phase = phase,
            title = title,
            detail = detail,
            providerUsed = providerUsed
        )
        _logs.value = (_logs.value + entry).takeLast(cap)
    }

    private data class EnvironmentObservation(
        val webUrl: String,
        val webTitle: String,
        val webDom: String,
        val workspaceSummary: String,
        val accessibilityPackage: String,
        val accessibilityTree: String,
        val userProfile: String,
        val credentialsSummary: String,
        val paymentsSummary: String,
        val memoriesSummary: String,
        val virtualAppsSummary: String,
        val installedAppsCount: Int,
        val memoriesCount: Int
    )

    private sealed class PlanCallEnvelope {
        data class Success(val plan: AgentStepPlan, val providerLabel: String) : PlanCallEnvelope()
        data class Failure(val error: Throwable) : PlanCallEnvelope()

        inline fun getOrElse(onFailure: (Throwable) -> AgentStepPlan): AgentStepPlan = when (this) {
            is Success -> plan
            is Failure -> onFailure(error)
        }

        val providerLabel: String?
            get() = (this as? Success)?.providerLabel
    }
}
