package com.virtualos.agent.ui.screens

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.virtualos.agent.domain.model.CredentialCategory
import com.virtualos.agent.domain.model.MemoryCategory
import com.virtualos.agent.domain.model.UserProfileVault
import com.virtualos.agent.ui.viewmodel.MainAgentViewModel

@Composable
fun VaultAndQueueScreen(viewModel: MainAgentViewModel) {
    var selectedTab by remember { mutableIntStateOf(0) }

    Column(modifier = Modifier.fillMaxSize()) {
        ScrollableTabRow(selectedTabIndex = selectedTab, edgePadding = 8.dp) {
            Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }, text = { Text("Profile") })
            Tab(selected = selectedTab == 1, onClick = { selectedTab = 1 }, text = { Text("Credentials") })
            Tab(selected = selectedTab == 2, onClick = { selectedTab = 2 }, text = { Text("Payments") })
            Tab(selected = selectedTab == 3, onClick = { selectedTab = 3 }, text = { Text("AI Memory") })
            Tab(selected = selectedTab == 4, onClick = { selectedTab = 4 }, text = { Text("Scheduler") })
        }

        when (selectedTab) {
            0 -> ProfileVaultForm(viewModel)
            1 -> CredentialsVaultPanel(viewModel)
            2 -> PaymentsVaultPanel(viewModel)
            3 -> AiMemoryNotesPanel(viewModel)
            else -> TaskSchedulerPanel(viewModel)
        }
    }
}

@Composable
private fun ProfileVaultForm(viewModel: MainAgentViewModel) {
    val profile by viewModel.userProfile.collectAsState()

    var fullName by remember(profile) { mutableStateOf(profile.fullName) }
    var email by remember(profile) { mutableStateOf(profile.email) }
    var phone by remember(profile) { mutableStateOf(profile.phone) }
    var location by remember(profile) { mutableStateOf(profile.location) }
    var headline by remember(profile) { mutableStateOf(profile.headline) }
    var education by remember(profile) { mutableStateOf(profile.education) }
    var workExperience by remember(profile) { mutableStateOf(profile.workExperience) }
    var skills by remember(profile) { mutableStateOf(profile.skills) }
    var portfolioUrl by remember(profile) { mutableStateOf(profile.portfolioUrl) }
    var customInstructions by remember(profile) { mutableStateOf(profile.customInstructions) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text("User Identity & Address Vault", style = MaterialTheme.typography.titleMedium)
        OutlinedTextField(value = fullName, onValueChange = { fullName = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Full Name") })
        OutlinedTextField(value = email, onValueChange = { email = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Email") })
        OutlinedTextField(value = phone, onValueChange = { phone = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Phone") })
        OutlinedTextField(value = location, onValueChange = { location = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Full Address / Location") })
        OutlinedTextField(value = headline, onValueChange = { headline = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Professional Headline") })
        OutlinedTextField(value = education, onValueChange = { education = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Education") }, minLines = 2)
        OutlinedTextField(value = workExperience, onValueChange = { workExperience = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Work Experience") }, minLines = 2)
        OutlinedTextField(value = skills, onValueChange = { skills = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Skills (comma separated)") })
        OutlinedTextField(value = portfolioUrl, onValueChange = { portfolioUrl = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Portfolio / LinkedIn URL") })
        OutlinedTextField(value = customInstructions, onValueChange = { customInstructions = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Custom Agent Instructions") }, minLines = 2)

        Button(
            onClick = {
                viewModel.saveUserProfile(
                    UserProfileVault(
                        fullName = fullName.trim(),
                        email = email.trim(),
                        phone = phone.trim(),
                        location = location.trim(),
                        headline = headline.trim(),
                        education = education.trim(),
                        workExperience = workExperience.trim(),
                        skills = skills.trim(),
                        portfolioUrl = portfolioUrl.trim(),
                        customInstructions = customInstructions.trim()
                    )
                )
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Save Encrypted Profile")
        }
    }
}

@Composable
private fun CredentialsVaultPanel(viewModel: MainAgentViewModel) {
    val creds by viewModel.credentials.collectAsState()
    var serviceName by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var revealedId by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text("Accounts & Password Vault (AES-256)", style = MaterialTheme.typography.titleMedium)
        Text(
            "Agent automatically stores generated or user-provided passwords here and reports the exact Vault path.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        OutlinedTextField(value = serviceName, onValueChange = { serviceName = it }, modifier = Modifier.fillMaxWidth(), label = { Text("App / Website (e.g. WhatsApp, Gmail)") })
        OutlinedTextField(value = username, onValueChange = { username = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Username / Email / Phone") })
        OutlinedTextField(value = password, onValueChange = { password = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Password (leave blank to auto-generate strong)") })
        OutlinedTextField(value = notes, onValueChange = { notes = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Notes") })

        Button(
            onClick = {
                viewModel.saveCredential(serviceName, username, password, CredentialCategory.APP_ACCOUNT, notes)
                serviceName = ""
                username = ""
                password = ""
                notes = ""
            },
            enabled = serviceName.isNotBlank() && username.isNotBlank(),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Save Account Credential")
        }

        HorizontalDivider()
        creds.forEach { item ->
            val revealed = revealedId == item.id
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                shape = RoundedCornerShape(10.dp)
            ) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(item.serviceName, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                    Text("User: ${item.usernameOrEmail}", fontSize = 12.sp)
                    Text("Pass: ${if (revealed) item.secretValue else "••••••••••••"}", fontSize = 12.sp)
                    Text("Saved At: ${item.savedLocationPath}", fontSize = 11.sp, color = MaterialTheme.colorScheme.primary)
                    Row {
                        TextButton(onClick = { revealedId = if (revealed) null else item.id }) {
                            Text(if (revealed) "Hide" else "Reveal")
                        }
                        TextButton(onClick = { viewModel.deleteCredential(item.id) }) {
                            Text("Delete", color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PaymentsVaultPanel(viewModel: MainAgentViewModel) {
    val payments by viewModel.paymentMethods.collectAsState()
    var label by remember { mutableStateOf("") }
    var provider by remember { mutableStateOf("bKash") }
    var maskedId by remember { mutableStateOf("") }
    var billing by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text("Payment Methods Metadata", style = MaterialTheme.typography.titleMedium)
        OutlinedTextField(value = label, onValueChange = { label = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Label (e.g. Personal bKash / Card)") })
        OutlinedTextField(value = provider, onValueChange = { provider = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Provider (bKash, Nagad, Visa)") })
        OutlinedTextField(value = maskedId, onValueChange = { maskedId = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Masked Identifier (e.g. **** 4242)") })
        OutlinedTextField(value = billing, onValueChange = { billing = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Billing Address") })
        Button(
            onClick = {
                viewModel.savePaymentMethod(label, provider, maskedId, billing)
                label = ""
                maskedId = ""
                billing = ""
            },
            enabled = label.isNotBlank() && maskedId.isNotBlank(),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Save Payment Method")
        }
        HorizontalDivider()
        payments.forEach { p ->
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                shape = RoundedCornerShape(10.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("${p.label} · ${p.provider}", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                        Text("${p.maskedIdentifier} | ${p.savedLocationPath}", fontSize = 12.sp)
                    }
                    TextButton(onClick = { viewModel.deletePaymentMethod(p.id) }) {
                        Text("Remove", color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }
    }
}

@Composable
private fun AiMemoryNotesPanel(viewModel: MainAgentViewModel) {
    val memories by viewModel.memories.collectAsState()
    var title by remember { mutableStateOf("") }
    var content by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text("Persistent Self-Improving Memory", style = MaterialTheme.typography.titleMedium)
        Text(
            "Addresses, preferences, and instructions saved here are automatically injected into every future task so you never repeat yourself.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        OutlinedTextField(value = title, onValueChange = { title = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Memory Title") })
        OutlinedTextField(value = content, onValueChange = { content = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Details / Address / Preference") }, minLines = 2)
        Button(
            onClick = {
                viewModel.saveMemoryNote(title, content, MemoryCategory.IMPORTANT_NOTE)
                title = ""
                content = ""
            },
            enabled = title.isNotBlank() && content.isNotBlank(),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Save to Long-Term Memory")
        }
        HorizontalDivider()
        memories.forEach { m ->
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                shape = RoundedCornerShape(10.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("[${m.category.name}] ${m.title}", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                        Text(m.content, fontSize = 12.sp)
                    }
                    TextButton(onClick = { viewModel.deleteMemoryNote(m.id) }) {
                        Text("Delete", color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }
    }
}

@Composable
private fun TaskSchedulerPanel(viewModel: MainAgentViewModel) {
    val tasks by viewModel.scheduledTasks.collectAsState()

    var title by remember { mutableStateOf("") }
    var prompt by remember { mutableStateOf("") }
    var isRecurring by remember { mutableStateOf(true) }
    var intervalHoursText by remember { mutableStateOf("12") }
    var unmeteredOnly by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Enqueue WorkManager Task", style = MaterialTheme.typography.titleMedium)
                OutlinedTextField(value = title, onValueChange = { title = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Task Title") })
                OutlinedTextField(value = prompt, onValueChange = { prompt = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Agent Prompt (EN / বাংলা)") }, minLines = 2)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = isRecurring, onCheckedChange = { isRecurring = it })
                    Text("Recurring Routine")
                }
                if (isRecurring) {
                    OutlinedTextField(
                        value = intervalHoursText,
                        onValueChange = { intervalHoursText = it.filter(Char::isDigit) },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Interval (hours)") }
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = unmeteredOnly, onCheckedChange = { unmeteredOnly = it })
                    Text("Require Wi-Fi (Unmetered Network)")
                }
                Button(
                    onClick = {
                        viewModel.enqueueScheduledTask(
                            title = title,
                            prompt = prompt,
                            isRecurring = isRecurring,
                            intervalHours = intervalHoursText.toLongOrNull() ?: 12L,
                            requiresUnmetered = unmeteredOnly,
                            requiresBatteryNotLow = true
                        )
                        title = ""
                        prompt = ""
                    },
                    enabled = title.isNotBlank() && prompt.isNotBlank(),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Schedule Task")
                }
            }
        }

        HorizontalDivider()
        Text("Queued & Scheduled Routines (${tasks.size})", style = MaterialTheme.typography.titleMedium)

        tasks.forEach { task ->
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                shape = RoundedCornerShape(10.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(task.title, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                        Text(
                            "${task.status.name} · ${if (task.isRecurring) "Every ${task.intervalHours}h" else "One-time"}",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        task.lastResultSummary?.let {
                            Text(it, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    TextButton(onClick = { viewModel.cancelScheduledTask(task.id) }) {
                        Text("Cancel", color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }
    }
}
