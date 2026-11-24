package com.virtualos.agent

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Terminal
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.virtualos.agent.ui.screens.BrainSettingsScreen
import com.virtualos.agent.ui.screens.CommandCenterScreen
import com.virtualos.agent.ui.screens.VaultAndQueueScreen
import com.virtualos.agent.ui.screens.WorkspaceScreen
import com.virtualos.agent.ui.theme.KaryoOSTheme
import com.virtualos.agent.ui.viewmodel.MainAgentViewModel

class MainActivity : ComponentActivity() {

    private val viewModel: MainAgentViewModel by viewModels()

    @OptIn(ExperimentalMaterial3Api::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            KaryoOSTheme {
                var currentTab by rememberSaveable { mutableIntStateOf(0) }
                val isLocked by viewModel.isLocked.collectAsState()
                val hasPin by viewModel.hasPrivacyPin.collectAsState()
                var pinAttempt by remember { mutableStateOf("") }
                var pinError by remember { mutableStateOf(false) }

                if (isLocked) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            Icons.Default.Lock,
                            contentDescription = "Private Virtual Phone Locked",
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Text(
                            "KaryoOS Private Virtual Phone",
                            style = MaterialTheme.typography.titleLarge,
                            modifier = Modifier.padding(top = 12.dp)
                        )
                        Text(
                            "Enter your Privacy PIN to access isolated apps, credentials & memory.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 6.dp, bottom = 16.dp)
                        )
                        OutlinedTextField(
                            value = pinAttempt,
                            onValueChange = {
                                pinAttempt = it.filter(Char::isDigit).take(6)
                                pinError = false
                            },
                            label = { Text("Privacy PIN") },
                            visualTransformation = PasswordVisualTransformation(),
                            isError = pinError,
                            modifier = Modifier.fillMaxWidth()
                        )
                        if (pinError) {
                            Text("Incorrect PIN", color = MaterialTheme.colorScheme.error)
                        }
                        Button(
                            onClick = {
                                if (!viewModel.unlockWithPin(pinAttempt)) {
                                    pinError = true
                                } else {
                                    pinAttempt = ""
                                }
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 12.dp)
                        ) {
                            Text("Unlock Virtual Phone")
                        }
                    }
                } else {
                    Scaffold(
                        topBar = {
                            TopAppBar(
                                title = {
                                    Text("KaryoOS Virtual Phone", fontWeight = FontWeight.Bold)
                                },
                                actions = {
                                    if (hasPin) {
                                        IconButton(onClick = { viewModel.lockVirtualPhone() }) {
                                            Icon(Icons.Default.Lock, contentDescription = "Lock Phone")
                                        }
                                    }
                                    TextButton(onClick = {
                                        viewModel.ensureBackgroundServiceRunning()
                                        moveTaskToBack(true)
                                    }) {
                                        Text("Minimize")
                                    }
                                }
                            )
                        },
                        bottomBar = {
                            NavigationBar {
                                NavigationBarItem(
                                    selected = currentTab == 0,
                                    onClick = { currentTab = 0 },
                                    icon = { Icon(Icons.Default.Terminal, contentDescription = "Console") },
                                    label = { Text("Console") }
                                )
                                NavigationBarItem(
                                    selected = currentTab == 1,
                                    onClick = { currentTab = 1 },
                                    icon = { Icon(Icons.Default.Folder, contentDescription = "Phone & Store") },
                                    label = { Text("Phone & Store") }
                                )
                                NavigationBarItem(
                                    selected = currentTab == 2,
                                    onClick = { currentTab = 2 },
                                    icon = { Icon(Icons.Default.Person, contentDescription = "Vault") },
                                    label = { Text("Vault") }
                                )
                                NavigationBarItem(
                                    selected = currentTab == 3,
                                    onClick = { currentTab = 3 },
                                    icon = { Icon(Icons.Default.Settings, contentDescription = "Settings") },
                                    label = { Text("Settings") }
                                )
                            }
                        }
                    ) { innerPadding ->
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(innerPadding)
                        ) {
                            when (currentTab) {
                                0 -> CommandCenterScreen(viewModel)
                                1 -> WorkspaceScreen(viewModel)
                                2 -> VaultAndQueueScreen(viewModel)
                                3 -> BrainSettingsScreen(viewModel)
                            }
                        }
                    }
                }
            }
        }
    }
}
