package com.virtualos.agent.data.workspace

import android.content.Context
import com.virtualos.agent.domain.model.WorkspaceFileEntry
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Sandboxed virtual filesystem inside app-private storage (`filesDir/agent_workspace/`).
 * Enforces canonical path confinement to prevent directory traversal outside the workspace.
 */
class SandboxedWorkspaceManager(context: Context) {

    private val rootDir: File = File(context.filesDir, WORKSPACE_ROOT_FOLDER).apply {
        if (!exists()) mkdirs()
        SUBFOLDERS.forEach { folder ->
            File(this, folder).apply { if (!exists()) mkdirs() }
        }
    }

    private val _files = MutableStateFlow<List<WorkspaceFileEntry>>(emptyList())
    val files: StateFlow<List<WorkspaceFileEntry>> = _files.asStateFlow()

    init {
        refreshSync()
    }

    suspend fun refresh(): List<WorkspaceFileEntry> = withContext(Dispatchers.IO) {
        refreshSync()
    }

    private fun refreshSync(): List<WorkspaceFileEntry> {
        val collected = mutableListOf<WorkspaceFileEntry>()
        rootDir.walkTopDown()
            .filter { it != rootDir }
            .sortedWith(compareBy({ !it.isDirectory }, { it.relativeTo(rootDir).path }))
            .forEach { file ->
                val rel = file.relativeTo(rootDir).path.replace(File.separatorChar, '/')
                val folder = rel.substringBefore('/', "root")
                collected.add(
                    WorkspaceFileEntry(
                        relativePath = rel,
                        name = file.name,
                        folder = folder,
                        sizeBytes = if (file.isFile) file.length() else 0L,
                        lastModifiedMs = file.lastModified(),
                        isDirectory = file.isDirectory
                    )
                )
            }
        _files.value = collected
        return collected
    }

    suspend fun writeFile(relativePath: String, content: String): Result<WorkspaceFileEntry> =
        withContext(Dispatchers.IO) {
            runCatching {
                val target = resolveConfinedFile(relativePath)
                require(content.toByteArray(Charsets.UTF_8).size <= MAX_FILE_BYTES) {
                    "File exceeds 512 KB low-memory safety limit"
                }
                target.parentFile?.let { if (!it.exists()) it.mkdirs() }
                target.writeText(content, Charsets.UTF_8)
                refreshSync()
                val rel = target.relativeTo(rootDir).path.replace(File.separatorChar, '/')
                WorkspaceFileEntry(
                    relativePath = rel,
                    name = target.name,
                    folder = rel.substringBefore('/', "root"),
                    sizeBytes = target.length(),
                    lastModifiedMs = target.lastModified(),
                    isDirectory = false
                )
            }
        }

    suspend fun readFile(relativePath: String, maxChars: Int = 12000): Result<String> =
        withContext(Dispatchers.IO) {
            runCatching {
                val target = resolveConfinedFile(relativePath)
                require(target.exists() && target.isFile) { "File not found: $relativePath" }
                val text = target.readText(Charsets.UTF_8)
                if (text.length > maxChars) {
                    text.take(maxChars) + "\n...[truncated for memory budget]"
                } else {
                    text
                }
            }
        }

    suspend fun deleteFile(relativePath: String): Result<Boolean> =
        withContext(Dispatchers.IO) {
            runCatching {
                val target = resolveConfinedFile(relativePath)
                require(target.exists()) { "File does not exist: $relativePath" }
                val deleted = target.deleteRecursively()
                refreshSync()
                deleted
            }
        }

    suspend fun listFilesSummary(): String = withContext(Dispatchers.IO) {
        val entries = refreshSync().filter { !it.isDirectory }
        if (entries.isEmpty()) {
            "Workspace is empty."
        } else {
            entries.joinToString("\n") { "${it.relativePath} (${it.sizeBytes} bytes)" }
        }
    }

    private fun resolveConfinedFile(relativePath: String): File {
        val cleaned = relativePath.trim().trimStart('/').ifBlank { "drafts/untitled.txt" }
        val candidate = File(rootDir, cleaned).canonicalFile
        val rootCanonical = rootDir.canonicalFile
        val rootPrefix = rootCanonical.path + File.separator
        if (candidate.path != rootCanonical.path && !candidate.path.startsWith(rootPrefix)) {
            throw SecurityException("Path traversal blocked outside sandboxed workspace: $relativePath")
        }
        return candidate
    }

    companion object {
        private const val WORKSPACE_ROOT_FOLDER = "agent_workspace"
        private const val MAX_FILE_BYTES = 512 * 1024
        private val SUBFOLDERS = listOf("research", "drafts", "scripts", "media", "history")
    }
}
