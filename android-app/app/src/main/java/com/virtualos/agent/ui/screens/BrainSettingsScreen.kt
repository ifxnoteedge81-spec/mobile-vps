package com.virtualos.agent.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.virtualos.agent.domain.model.AiProvider
import com.virtualos.agent.domain.model.ApiKeyEntry
import com.virtualos.agent.domain.model.RouteDiagnosticResult
import com.virtualos.agent.ui.viewmodel.MainAgentViewModel

@Composable
fun BrainSettingsScreen(viewModel: MainAgentViewModel) {
    val apiKeys by viewModel.apiKeys.collectAsState()
    val config by viewModel.routerConfig.collectAsState()
    val envConfig by viewModel.virtualEnvConfig.collectAsState()
    val memoryProfile by viewModel.memoryProfile.collectAsState()
    val skillSettings by viewModel.skillSettings.collectAsState()
    val rotations by viewModel.rotationHistory.collectAsState()
    val diagnostics by viewModel.routeDiagnostics.collectAsState()
    val diagnosticsRunning by viewModel.diagnosticsRunning.collectAsState()
    val accessibilityOn by viewModel.accessibilityConnected.collectAsState()
    val activePkg by viewModel.activeAccessibilityApp.collectAsState()
    val hasPin by viewModel.hasPrivacyPin.collectAsState()

    val existingGemini = remember(apiKeys) { apiKeys.filter { it.provider == AiProvider.GEMINI } }
    val existingOpenRouter = remember(apiKeys) { apiKeys.firstOrNull { it.provider == AiProvider.OPENROUTER } }

    val geminiSlots = remember(existingGemini) {
        mutableStateListOf(
            existingGemini.getOrNull(0)?.apiKey ?: "",
            existingGemini.getOrNull(1)?.apiKey ?: "",
            existingGemini.getOrNull(2)?.apiKey ?: "",
            existingGemini.getOrNull(3)?.apiKey ?: "",
            existingGemini.getOrNull(4)?.apiKey ?: ""
        )
    }
    val gmailHints = remember(existingGemini) {
        mutableStateListOf(
            existingGemini.getOrNull(0)?.accountHint ?: "gmail-1",
            existingGemini.getOrNull(1)?.accountHint ?: "gmail-2",
            existingGemini.getOrNull(2)?.accountHint ?: "gmail-3",
            existingGemini.getOrNull(3)?.accountHint ?: "gmail-4",
            existingGemini.getOrNull(4)?.accountHint ?: "gmail-5"
        )
    }

    var openRouterKeyInput by remember(existingOpenRouter) {
        mutableStateOf(existingOpenRouter?.apiKey ?: "")
    }
    var envNameInput by remember(envConfig.envName) { mutableStateOf(envConfig.envName) }
    var privacyPinInput by remember { mutableStateOf("") }
    var geminiModelsText by remember(config.geminiModels) {
        mutableStateOf(config.geminiModels.joinToString(", "))
    }
    var openRouterModelsText by remember(config.openRouterFreeModels) {
        mutableStateOf(config.openRouterFreeModels.joinToString("\n"))
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // 1. Virtual Mobile RAM + Privacy PIN Lock
        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Virtual Mobile Environment, RAM & Privacy", style = MaterialTheme.typography.titleMedium)
                Text(
                    "Host ${memoryProfile.totalHostRamMb / 1024}GB -> Virtual ${memoryProfile.allocatedRamMb / 1024}GB / Host OS Reserved ${memoryProfile.hostReservedRamMb / 1024}GB",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                OutlinedTextField(
                    value = envNameInput,
                    onValueChange = { envNameInput = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Virtual Mobile Name") },
                    singleLine = true
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    listOf(1f, 2f, 4f, 6f, 8f, 12f, 16f).forEach { gb ->
                        val selected = envConfig.allocatedRamGb == gb
                        OutlinedButton(
                            onClick = { viewModel.setVirtualRamAllocation(gb, envNameInput) },
                            colors = if (selected) {
                                ButtonDefaults.outlinedButtonColors(
                                    containerColor = MaterialTheme.colorScheme.primaryContainer
                                )
                            } else {
                                ButtonDefaults.outlinedButtonColors()
                            }
                        ) {
                            Text("${gb.toInt()} GB", maxLines = 1)
                        }
                    }
                }
                HorizontalDivider()
                Text(
                    text = if (hasPin) "Virtual Phone Privacy Lock: ENABLED" else "Virtual Phone Privacy Lock: OFF",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = privacyPinInput,
                        onValueChange = { privacyPinInput = it.filter(Char::isDigit).take(6) },
                        modifier = Modifier.weight(1f),
                        label = { Text("Set 4-6 Digit Privacy PIN") },
                        visualTransformation = PasswordVisualTransformation(),
                        singleLine = true
                    )
                    Button(onClick = {
                        viewModel.setPrivacyPin(privacyPinInput)
                        privacyPinInput = ""
                    }) {
                        Text(if (privacyPinInput.isBlank() && hasPin) "Remove PIN" else "Save PIN")
                    }
                }
            }
        }

        // 2. 5 Free Gemini Keys (5 Gmail Accounts)
        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("5 Free Gemini API Keys (5 Gmail Accounts)", style = MaterialTheme.typography.titleMedium)
                for (i in 0 until 5) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedTextField(
                            value = gmailHints[i],
                            onValueChange = { gmailHints[i] = it },
                            modifier = Modifier.weight(0.35f),
                            label = { Text("Gmail #${i + 1}") },
                            singleLine = true
                        )
                        OutlinedTextField(
                            value = geminiSlots[i],
                            onValueChange = { geminiSlots[i] = it },
                            modifier = Modifier.weight(0.65f),
                            label = { Text("Gemini Key #${i + 1}") },
                            visualTransformation = PasswordVisualTransformation(),
                            singleLine = true
                        )
                    }
                }
                Button(
                    onClick = {
                        val batch = (0 until 5).map { idx ->
                            Triple("Gemini #${idx + 1}", gmailHints[idx], geminiSlots[idx])
                        }
                        viewModel.saveFiveGeminiKeys(batch)
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Save 5 Gemini Keys (AES-256)")
                }
            }
        }

        // 3. 1 OpenRouter Key -> Multi Free Models Cascade
        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("1 OpenRouter Key · Free-Model Cascade", style = MaterialTheme.typography.titleMedium)
                OutlinedTextField(
                    value = openRouterKeyInput,
                    onValueChange = { openRouterKeyInput = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("OpenRouter API Key (sk-or-v1-...)") },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true
                )
                Button(
                    onClick = {
                        existingOpenRouter?.let { viewModel.removeApiKey(it.id) }
                        if (openRouterKeyInput.isNotBlank()) {
                            viewModel.addApiKey("OpenRouter Primary", AiProvider.OPENROUTER, openRouterKeyInput, "openrouter")
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Save OpenRouter Key")
                }

                HorizontalDivider()

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Prefer 5 Gemini Keys first")
                    Switch(
                        checked = config.primaryProvider == AiProvider.GEMINI,
                        onCheckedChange = { preferGemini ->
                            viewModel.updateRouterConfig(
                                config.copy(primaryProvider = if (preferGemini) AiProvider.GEMINI else AiProvider.OPENROUTER)
                            )
                        }
                    )
                }

                OutlinedTextField(
                    value = geminiModelsText,
                    onValueChange = { geminiModelsText = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Gemini Models (comma separated)") }
                )

                OutlinedTextField(
                    value = openRouterModelsText,
                    onValueChange = { openRouterModelsText = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("OpenRouter Free Models (1 per line)") },
                    minLines = 4
                )

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    Button(
                        onClick = {
                            val gModels = geminiModelsText.split(",").map { it.trim() }.filter { it.isNotBlank() }
                            val orModels = openRouterModelsText.lines().map { it.trim() }.filter { it.isNotBlank() }
                            viewModel.updateRouterConfig(
                                config.copy(
                                    geminiModels = gModels.ifEmpty { config.geminiModels },
                                    openRouterFreeModels = orModels.ifEmpty { config.openRouterFreeModels }
                                )
                            )
                        },
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Save Cascade")
                    }
                    OutlinedButton(onClick = { viewModel.resetAllCooldowns() }) {
                        Text("Reset Cooldowns")
                    }
                }
            }
        }

        // 3b. Universal AI Connectors & Environment Variables (OpenAI, Claude, Groq, DeepSeek, Mistral, Custom)
        UniversalAiConnectorsCard(
            apiKeys = apiKeys,
            primaryProvider = config.primaryProvider,
            diagnostics = diagnostics,
            diagnosticsRunning = diagnosticsRunning,
            onSetPrimaryProvider = { p ->
                viewModel.updateRouterConfig(config.copy(primaryProvider = p))
            },
            onSaveConnector = { label, provider, key, baseUrl, model ->
                viewModel.upsertUniversalConnector(label, provider, key, baseUrl, model)
            },
            onTestKey = { keyId -> viewModel.testSingleKey(keyId) },
            onRemoveKey = { keyId -> viewModel.removeApiKey(keyId) }
        )

        // 4. Agent Skills & Safety Policies
        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Virtual Mobile Skills & Safety Policies", style = MaterialTheme.typography.titleMedium)

                SkillSwitchRow("Built-in Play Store & App Installer", skillSettings.playStoreInstallEnabled) {
                    viewModel.updateSkillSettings(skillSettings.copy(playStoreInstallEnabled = it))
                }
                SkillSwitchRow("Auto Memory Learning & Credential Vault", skillSettings.autoMemoryLearningEnabled) {
                    viewModel.updateSkillSettings(skillSettings.copy(autoMemoryLearningEnabled = it))
                }
                SkillSwitchRow("WebView Browser Automation", skillSettings.webAutomationEnabled) {
                    viewModel.updateSkillSettings(skillSettings.copy(webAutomationEnabled = it))
                }
                SkillSwitchRow("Accessibility OS Control", skillSettings.accessibilityControlEnabled) {
                    viewModel.updateSkillSettings(skillSettings.copy(accessibilityControlEnabled = it))
                }
                SkillSwitchRow("Media3 Video Editor (Trim/Compress/Watermark)", skillSettings.videoEditingEnabled) {
                    viewModel.updateSkillSettings(skillSettings.copy(videoEditingEnabled = it))
                }
                SkillSwitchRow("Sandboxed File Workspace", skillSettings.fileWorkspaceEnabled) {
                    viewModel.updateSkillSettings(skillSettings.copy(fileWorkspaceEnabled = it))
                }
                SkillSwitchRow("Voice Commands (বাংলা & English)", skillSettings.voiceCommandsEnabled) {
                    viewModel.updateSkillSettings(skillSettings.copy(voiceCommandsEnabled = it))
                }
                SkillSwitchRow("Clipboard & Android Share Sheet", skillSettings.clipboardAndShareEnabled) {
                    viewModel.updateSkillSettings(skillSettings.copy(clipboardAndShareEnabled = it))
                }

                HorizontalDivider()

                SkillSwitchRow("Confirm before Form Submit / Login", skillSettings.requireConfirmOnSubmit) {
                    viewModel.updateSkillSettings(skillSettings.copy(requireConfirmOnSubmit = it))
                }
                SkillSwitchRow("Confirm before File Delete", skillSettings.requireConfirmOnDelete) {
                    viewModel.updateSkillSettings(skillSettings.copy(requireConfirmOnDelete = it))
                }
                SkillSwitchRow("Confirm before External Share", skillSettings.requireConfirmOnExternalShare) {
                    viewModel.updateSkillSettings(skillSettings.copy(requireConfirmOnExternalShare = it))
                }
            }
        }

        // 5. System Permissions & Accessibility
        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Android System Permissions & Limbs", style = MaterialTheme.typography.titleMedium)
                Text(
                    text = if (accessibilityOn) {
                        "Accessibility Connected · Active: ${activePkg.ifBlank { "System" }}"
                    } else {
                        "Accessibility Disabled · Enable KaryoOS Virtual Limbs Service in Android Settings."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                OutlinedButton(onClick = { viewModel.openAccessibilitySettings() }) {
                    Text(if (accessibilityOn) "Manage Accessibility Service" else "Enable Accessibility Service")
                }
            }
        }

        // 6. Test All Keys & Rotation Logs
        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Route Health Diagnostics", style = MaterialTheme.typography.titleMedium)
                    OutlinedButton(
                        onClick = { viewModel.runRouteDiagnostics() },
                        enabled = !diagnosticsRunning
                    ) {
                        Text(if (diagnosticsRunning) "Testing..." else "Test All Keys")
                    }
                }
                diagnostics.forEach { d ->
                    Text(
                        text = "${if (d.ok) "OK" else "FAIL"} · ${d.keyLabel} [${d.modelId}] (${d.latencyMs}ms) — ${d.message}",
                        style = MaterialTheme.typography.labelMedium,
                        color = if (d.ok) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                    )
                }
                if (rotations.isNotEmpty()) {
                    HorizontalDivider()
                    Text("Recent Automatic Rotations", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                    rotations.take(8).forEach { ev ->
                        Text(
                            "${ev.fromRoute} -> ${ev.toRoute}: ${ev.reason}",
                            style = MaterialTheme.typography.labelMedium
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun UniversalAiConnectorsCard(
    apiKeys: List<ApiKeyEntry>,
    primaryProvider: AiProvider,
    diagnostics: List<RouteDiagnosticResult>,
    diagnosticsRunning: Boolean,
    onSetPrimaryProvider: (AiProvider) -> Unit,
    onSaveConnector: (String, AiProvider, String, String, String) -> Unit,
    onTestKey: (String) -> Unit,
    onRemoveKey: (String) -> Unit
) {
    val universalProviders = remember {
        listOf(
            AiProvider.OPENAI,
            AiProvider.ANTHROPIC,
            AiProvider.GROQ,
            AiProvider.DEEPSEEK,
            AiProvider.MISTRAL,
            AiProvider.CUSTOM_OPENAI
        )
    }
    var selectedProvider by remember { mutableStateOf(AiProvider.OPENAI) }
    var connectorLabel by remember(selectedProvider) { mutableStateOf(selectedProvider.displayName) }
    var baseUrlInput by remember(selectedProvider) { mutableStateOf(selectedProvider.defaultBaseUrl) }
    var modelInput by remember(selectedProvider) { mutableStateOf(selectedProvider.defaultModel) }
    var apiKeyInput by remember(selectedProvider) { mutableStateOf("") }

    val configuredKeys = remember(apiKeys) {
        apiKeys.filter { it.provider != AiProvider.GEMINI && it.provider != AiProvider.OPENROUTER }
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                "Universal AI Connectors & Env Variables",
                style = MaterialTheme.typography.titleMedium
            )
            Text(
                "Connect OpenAI, Claude, Groq, DeepSeek, Mistral, or ANY Custom OpenAI-compatible AI server (Ollama / xAI / vLLM) and test each endpoint individually.",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Text("Primary Routing Priority", fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                AiProvider.entries.forEach { p ->
                    val isSelected = primaryProvider == p
                    OutlinedButton(
                        onClick = { onSetPrimaryProvider(p) },
                        colors = if (isSelected) {
                            ButtonDefaults.outlinedButtonColors(
                                containerColor = MaterialTheme.colorScheme.primaryContainer
                            )
                        } else {
                            ButtonDefaults.outlinedButtonColors()
                        }
                    ) {
                        Text(p.displayName, maxLines = 1)
                    }
                }
            }

            HorizontalDivider()
            Text("Add / Update AI Connector", fontWeight = FontWeight.SemiBold, fontSize = 12.sp)

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                universalProviders.forEach { p ->
                    val isSelected = selectedProvider == p
                    OutlinedButton(
                        onClick = { selectedProvider = p },
                        colors = if (isSelected) {
                            ButtonDefaults.outlinedButtonColors(
                                containerColor = MaterialTheme.colorScheme.primaryContainer
                            )
                        } else {
                            ButtonDefaults.outlinedButtonColors()
                        }
                    ) {
                        Text(p.displayName, maxLines = 1)
                    }
                }
            }

            OutlinedTextField(
                value = connectorLabel,
                onValueChange = { connectorLabel = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Connector Label (${selectedProvider.envVarName})") },
                singleLine = true
            )
            OutlinedTextField(
                value = baseUrlInput,
                onValueChange = { baseUrlInput = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("API Base URL (https://...)") },
                singleLine = true
            )
            OutlinedTextField(
                value = modelInput,
                onValueChange = { modelInput = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Model ID") },
                singleLine = true
            )
            OutlinedTextField(
                value = apiKeyInput,
                onValueChange = { apiKeyInput = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("${selectedProvider.envVarName} (AES-256 Encrypted)") },
                visualTransformation = PasswordVisualTransformation(),
                singleLine = true
            )
            Button(
                onClick = {
                    if (apiKeyInput.isNotBlank()) {
                        onSaveConnector(
                            connectorLabel,
                            selectedProvider,
                            apiKeyInput,
                            baseUrlInput,
                            modelInput
                        )
                        apiKeyInput = ""
                    }
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Save ${selectedProvider.displayName} (AES-256)")
            }

            if (configuredKeys.isNotEmpty()) {
                HorizontalDivider()
                Text("Configured Universal Connectors", fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                configuredKeys.forEach { entry ->
                    val diag = diagnostics.firstOrNull { it.keyId == entry.id }
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    "${entry.label} · ${entry.provider.envVarName}",
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Medium
                                )
                                Text(
                                    "Model: ${entry.modelOverride.ifBlank { entry.provider.defaultModel }}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                OutlinedButton(
                                    onClick = { onTestKey(entry.id) },
                                    enabled = !diagnosticsRunning
                                ) {
                                    Text("Test")
                                }
                                OutlinedButton(onClick = { onRemoveKey(entry.id) }) {
                                    Text("Remove")
                                }
                            }
                        }
                        if (diag != null) {
                            Text(
                                text = "${if (diag.ok) "OK" else "FAIL"} (${diag.latencyMs}ms) · ${diag.message}",
                                style = MaterialTheme.typography.labelSmall,
                                color = if (diag.ok) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                            )
                        }
                    }
                }
            }

            HorizontalDivider()
            Text("Server & Android Environment Variable Checklist", fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
            AiProvider.entries.forEach { provider ->
                val isConfigured = apiKeys.any { it.provider == provider && it.enabled && it.apiKey.isNotBlank() }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        provider.envVarName,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        if (isConfigured) "CONFIGURED" else "NOT SET",
                        style = MaterialTheme.typography.labelSmall,
                        color = if (isConfigured) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
private fun SkillSwitchRow(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

