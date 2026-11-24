package com.virtualos.agent.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.virtualos.agent.domain.model.AgentPhase
import com.virtualos.agent.domain.model.AgentRunStatus
import com.virtualos.agent.domain.model.ExecutionLogEntry
import com.virtualos.agent.domain.model.GuardrailRequest
import com.virtualos.agent.limbs.voice.VoiceLanguage
import com.virtualos.agent.ui.viewmodel.MainAgentViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Clean Front Page:
 * Displays ONLY the Virtual Mobile Screen status, Command Input (Text, Voice Mic, Attach Video),
 * Run/Pause/Stop/Clear controls, and the live Execution Console.
 * All API keys, RAM allocation, skills, and permissions live inside the dedicated Settings screen.
 */
@Composable
fun CommandCenterScreen(viewModel: MainAgentViewModel) {
    val context = LocalContext.current
    val status by viewModel.status.collectAsState()
    val logs by viewModel.logs.collectAsState()
    val envConfig by viewModel.virtualEnvConfig.collectAsState()
    val pendingGuardrail by viewModel.pendingGuardrail.collectAsState()
    val stepNumber by viewModel.currentStepNumber.collectAsState()
    val voiceState by viewModel.voiceState.collectAsState()

    var commandText by rememberSaveable { mutableStateOf("") }
    var attachedVideoUri by rememberSaveable { mutableStateOf("") }
    var autoExecuteAfterVoice by rememberSaveable { mutableStateOf(true) }
    val listState = rememberLazyListState()

    val audioPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            viewModel.startVoiceListening { spoken ->
                commandText = spoken
                if (autoExecuteAfterVoice) {
                    val fullGoal = if (attachedVideoUri.isNotBlank()) {
                        "$spoken\n[Attached Video URI: $attachedVideoUri]"
                    } else spoken
                    viewModel.startCommand(fullGoal)
                }
            }
        }
    }

    val videoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            attachedVideoUri = uri.toString()
        }
    }

    LaunchedEffect(logs.size) {
        if (logs.isNotEmpty()) {
            listState.animateScrollToItem(logs.lastIndex)
        }
    }

    pendingGuardrail?.let { request ->
        GuardrailApprovalDialog(
            request = request,
            onApprove = { viewModel.resolveGuardrail(true) },
            onDeny = { viewModel.resolveGuardrail(false) }
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        // Minimal Virtual Mobile Status Strip
        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            shape = RoundedCornerShape(12.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "${envConfig.envName} · ${envConfig.allocatedRamGb.toInt()} GB RAM",
                    style = MaterialTheme.typography.titleMedium
                )
                Text(
                    text = "${status.name} · Step $stepNumber",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary
                )
            }
        }

        // Clean Command Input Box (Text + Voice + Video Attach)
        OutlinedTextField(
            value = commandText,
            onValueChange = { commandText = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Command (বাংলা বা English-এ লিখুন বা ভয়েস দিন)") },
            placeholder = { Text("e.g., Edit attached video to 720p, or fill form...") },
            minLines = 2,
            maxLines = 4
        )

        // Voice Mic + Video Attachment Row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedButton(
                onClick = {
                    val nextLang = if (voiceState.language == VoiceLanguage.BENGALI) {
                        VoiceLanguage.ENGLISH
                    } else {
                        VoiceLanguage.BENGALI
                    }
                    viewModel.setVoiceLanguage(nextLang)
                }
            ) {
                Text(voiceState.language.displayName, maxLines = 1)
            }

            Button(
                onClick = {
                    if (voiceState.isListening) {
                        viewModel.stopVoiceListening()
                    } else {
                        val hasPerm = ContextCompat.checkSelfPermission(
                            context,
                            Manifest.permission.RECORD_AUDIO
                        ) == PackageManager.PERMISSION_GRANTED
                        if (hasPerm) {
                            viewModel.startVoiceListening { spoken ->
                                commandText = spoken
                                if (autoExecuteAfterVoice) {
                                    val fullGoal = if (attachedVideoUri.isNotBlank()) {
                                        "$spoken\n[Attached Video URI: $attachedVideoUri]"
                                    } else spoken
                                    viewModel.startCommand(fullGoal)
                                }
                            }
                        } else {
                            audioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                        }
                    }
                },
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (voiceState.isListening) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
                )
            ) {
                Text(if (voiceState.isListening) "Stop Mic" else "Voice Mic", maxLines = 1)
            }

            OutlinedButton(onClick = { videoPickerLauncher.launch("video/*") }) {
                Text(if (attachedVideoUri.isBlank()) "Video" else "Video Ready", maxLines = 1)
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = autoExecuteAfterVoice,
                    onCheckedChange = { autoExecuteAfterVoice = it }
                )
                Text("Auto", fontSize = 11.sp)
            }
        }

        if (attachedVideoUri.isNotBlank()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Attached Video: ${attachedVideoUri.takeLast(36)}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary
                )
                TextButton(onClick = { attachedVideoUri = "" }) {
                    Text("Detach")
                }
            }
        }

        if (voiceState.isListening || voiceState.partialTranscript.isNotBlank() || voiceState.errorMessage != null) {
            Text(
                text = voiceState.errorMessage
                    ?: if (voiceState.isListening) "Listening (${voiceState.language.localeTag}): ${voiceState.partialTranscript}"
                    else "Transcript: ${voiceState.partialTranscript}",
                style = MaterialTheme.typography.labelMedium,
                color = if (voiceState.errorMessage != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
            )
        }

        // Run / Pause / Stop / Clear Controls
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            val isRunning = status == AgentRunStatus.RUNNING || status == AgentRunStatus.AWAITING_CONFIRMATION
            val isPaused = status == AgentRunStatus.PAUSED

            Button(
                onClick = {
                    val fullGoal = if (attachedVideoUri.isNotBlank()) {
                        "$commandText\n[Attached Video URI: $attachedVideoUri]"
                    } else commandText
                    viewModel.startCommand(fullGoal)
                },
                enabled = commandText.isNotBlank() && !isRunning && !isPaused,
                modifier = Modifier.weight(1f)
            ) {
                Text("Run")
            }

            OutlinedButton(
                onClick = { viewModel.pauseOrResume() },
                enabled = isRunning || isPaused
            ) {
                Text(if (isPaused) "Resume" else "Pause")
            }

            OutlinedButton(
                onClick = { viewModel.stopCommand() },
                enabled = isRunning || isPaused,
                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)
            ) {
                Text("Stop")
            }

            TextButton(onClick = {
                commandText = ""
                attachedVideoUri = ""
                viewModel.clearLogs()
            }) {
                Text("Clear")
            }
        }

        // Live Scrolling Execution Console
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .background(Color(0xFF0F172A), RoundedCornerShape(12.dp))
                .padding(12.dp)
        ) {
            if (logs.isEmpty()) {
                Text(
                    text = "Console ready. Configure API keys, RAM & Skills inside Settings, then speak or type a command here.",
                    color = Color(0xFF94A3B8),
                    fontFamily = FontFamily.Monospace,
                    fontSize = 12.sp
                )
            } else {
                LazyColumn(
                    state = listState,
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(logs, key = { it.id }) { entry ->
                        LogRowItem(entry)
                    }
                }
            }
        }
    }
}

@Composable
private fun LogRowItem(entry: ExecutionLogEntry) {
    val phaseColor = when (entry.phase) {
        AgentPhase.OBSERVE -> Color(0xFF38BDF8)
        AgentPhase.PLAN -> Color(0xFF2DD4BF)
        AgentPhase.ACT -> Color(0xFF4ADE80)
        AgentPhase.VERIFY -> Color(0xFFA7F3D0)
        AgentPhase.GUARDRAIL -> Color(0xFFFBBF24)
        AgentPhase.ROUTER -> Color(0xFFC084FC)
        AgentPhase.VOICE -> Color(0xFFF472B6)
        AgentPhase.MEDIA -> Color(0xFFFB923C)
        AgentPhase.STORE -> Color(0xFF60A5FA)
        AgentPhase.MEMORY -> Color(0xFFA3E635)
        AgentPhase.ERROR -> Color(0xFFF87171)
        AgentPhase.SYSTEM -> Color(0xFFCBD5E1)
    }
    val timeStr = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date(entry.timestampMs))

    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = timeStr,
                color = Color(0xFF64748B),
                fontFamily = FontFamily.Monospace,
                fontSize = 11.sp
            )
            Text(
                text = entry.phase.name,
                color = phaseColor,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold,
                fontSize = 11.sp
            )
            Text(
                text = entry.title,
                color = Color(0xFFF8FAFC),
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold
            )
        }
        if (entry.detail.isNotBlank()) {
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = entry.detail,
                color = Color(0xFFCBD5E1),
                fontFamily = FontFamily.Monospace,
                fontSize = 11.sp,
                lineHeight = 15.sp
            )
        }
        entry.providerUsed?.let { provider ->
            Text(
                text = "Brain: $provider",
                color = Color(0xFF94A3B8),
                fontFamily = FontFamily.Monospace,
                fontSize = 10.sp
            )
        }
        Spacer(modifier = Modifier.height(6.dp))
        HorizontalDivider(color = Color(0xFF1E293B))
    }
}

@Composable
private fun GuardrailApprovalDialog(
    request: GuardrailRequest,
    onApprove: () -> Unit,
    onDeny: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDeny,
        title = { Text("Confirmation Required (${request.riskLevel.name})") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Action: ${request.action.name}", fontWeight = FontWeight.SemiBold)
                if (request.target.isNotBlank()) Text("Target: ${request.target}")
                if (request.proposedValue.isNotBlank()) Text("Value: ${request.proposedValue.take(160)}")
                Text(request.reason, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        confirmButton = {
            Button(onClick = onApprove) {
                Text("Approve & Continue")
            }
        },
        dismissButton = {
            OutlinedButton(
                onClick = onDeny,
                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)
            ) {
                Text("Deny & Stop")
            }
        }
    )
}
