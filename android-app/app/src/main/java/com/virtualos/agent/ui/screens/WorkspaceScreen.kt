package com.virtualos.agent.ui.screens

import android.view.ViewGroup
import android.webkit.WebView
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.virtualos.agent.ui.viewmodel.MainAgentViewModel

@Composable
fun WorkspaceScreen(viewModel: MainAgentViewModel) {
    var selectedTab by remember { mutableIntStateOf(0) }
    val webObs by viewModel.webObservation.collectAsState()
    val files by viewModel.workspaceFiles.collectAsState()
    val selectedFile by viewModel.selectedFileContent.collectAsState()
    val installedApps by viewModel.installedVirtualApps.collectAsState()

    var urlInput by remember(webObs.url) {
        mutableStateOf(if (webObs.url == "about:blank") "https://en.wikipedia.org/wiki/Android_(operating_system)" else webObs.url)
    }
    var playStoreQuery by remember { mutableStateOf("") }
    var showNewNoteDialog by remember { mutableStateOf(false) }

    selectedFile?.let { (path, content) ->
        AlertDialog(
            onDismissRequest = { viewModel.closeWorkspaceFile() },
            title = { Text(path, fontSize = 15.sp, fontWeight = FontWeight.SemiBold) },
            text = {
                Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                    Text(content, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
                }
            },
            confirmButton = {
                TextButton(onClick = { viewModel.closeWorkspaceFile() }) {
                    Text("Close")
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.deleteWorkspaceFile(path) }) {
                    Text("Delete", color = MaterialTheme.colorScheme.error)
                }
            }
        )
    }

    if (showNewNoteDialog) {
        NewNoteDialog(
            onDismiss = { showNewNoteDialog = false },
            onSave = { path, body ->
                viewModel.createWorkspaceNote(path, body)
                showNewNoteDialog = false
            }
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TabRow(selectedTabIndex = selectedTab) {
            Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }, text = { Text("Browser") })
            Tab(selected = selectedTab == 1, onClick = { selectedTab = 1 }, text = { Text("Play Store") })
            Tab(selected = selectedTab == 2, onClick = { selectedTab = 2 }, text = { Text("Files (${files.count { !it.isDirectory }})") })
        }

        when (selectedTab) {
            0 -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        OutlinedTextField(
                            value = urlInput,
                            onValueChange = { urlInput = it },
                            modifier = Modifier.weight(1f),
                            singleLine = true,
                            label = { Text("Target URL / Virtual App View") }
                        )
                        Button(onClick = { viewModel.navigateWebView(urlInput) }) {
                            Text("Go")
                        }
                    }
                    if (webObs.isLoading) {
                        LinearProgressIndicator(
                            progress = { webObs.progress / 100f },
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                    AndroidView(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        factory = { ctx ->
                            WebView(ctx).apply {
                                layoutParams = ViewGroup.LayoutParams(
                                    ViewGroup.LayoutParams.MATCH_PARENT,
                                    ViewGroup.LayoutParams.MATCH_PARENT
                                )
                                viewModel.getWebViewController().attachWebView(this)
                            }
                        }
                    )
                }
            }

            1 -> {
                val catalogResults = remember(playStoreQuery) {
                    viewModel.searchPlayStoreCatalog(playStoreQuery)
                }
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text("Built-in Virtual Play Store", style = MaterialTheme.typography.titleMedium)
                    OutlinedTextField(
                        value = playStoreQuery,
                        onValueChange = { playStoreQuery = it },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        label = { Text("Search Apps (WhatsApp, imo, Calling, Telegram...)") }
                    )

                    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(catalogResults, key = { it.packageId }) { app ->
                            val isInstalled = installedApps.any { it.packageId == app.packageId }
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
                                        Text(app.appName, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                        Text(
                                            "${app.category} · ${app.packageId}",
                                            style = MaterialTheme.typography.labelMedium,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                    if (isInstalled) {
                                        OutlinedButton(onClick = {
                                            viewModel.openVirtualApp(app.webFallbackUrl)
                                            selectedTab = 0
                                        }) {
                                            Text("Open Inside")
                                        }
                                    } else {
                                        Button(onClick = { viewModel.installPlayStoreApp(app.packageId) }) {
                                            Text("Install")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            else -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Sandboxed App Storage", style = MaterialTheme.typography.titleMedium)
                        OutlinedButton(onClick = { showNewNoteDialog = true }) {
                            Text("New File")
                        }
                    }
                    HorizontalDivider()
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(files.filter { !it.isDirectory }, key = { it.relativePath }) { file ->
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { viewModel.openWorkspaceFile(file.relativePath) },
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
                                        Text(file.relativePath, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                        Text(
                                            "${file.sizeBytes} bytes · ${file.folder}",
                                            style = MaterialTheme.typography.labelMedium,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                    TextButton(onClick = { viewModel.deleteWorkspaceFile(file.relativePath) }) {
                                        Text("Delete", color = MaterialTheme.colorScheme.error)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NewNoteDialog(onDismiss: () -> Unit, onSave: (String, String) -> Unit) {
    var path by remember { mutableStateOf("drafts/note.md") }
    var body by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Create Workspace File") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = path, onValueChange = { path = it }, label = { Text("Relative Path") })
                OutlinedTextField(
                    value = body,
                    onValueChange = { body = it },
                    label = { Text("Content") },
                    modifier = Modifier.height(140.dp)
                )
            }
        },
        confirmButton = {
            Button(onClick = { if (path.isNotBlank()) onSave(path, body) }) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
