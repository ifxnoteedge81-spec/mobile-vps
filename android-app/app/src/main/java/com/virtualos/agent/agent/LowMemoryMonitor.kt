package com.virtualos.agent.agent

import android.app.ActivityManager
import android.content.ComponentCallbacks2
import android.content.Context
import android.content.res.Configuration
import com.virtualos.agent.data.security.EncryptedVaultStore
import com.virtualos.agent.domain.model.MemoryProfile
import com.virtualos.agent.limbs.webview.WebViewAutomationController
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Dynamically configures the Virtual Mobile Environment based on user-selected RAM allocation
 * (1 GB, 2 GB, 4 GB, 6 GB, 8 GB, 12 GB, 16 GB) relative to host device RAM.
 */
class LowMemoryMonitor(
    context: Context,
    private val vaultStore: EncryptedVaultStore,
    private val webViewController: WebViewAutomationController
) : ComponentCallbacks2 {

    private val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager

    private val _memoryProfile = MutableStateFlow(sampleMemoryProfile())
    val memoryProfile: StateFlow<MemoryProfile> = _memoryProfile.asStateFlow()

    fun refreshProfile(): MemoryProfile {
        val sampled = sampleMemoryProfile()
        _memoryProfile.value = sampled
        webViewController.applyMemoryProfile(!sampled.webViewImagesEnabled)
        return sampled
    }

    private fun sampleMemoryProfile(): MemoryProfile {
        val info = ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(info)
        val totalHostMb = (info.totalMem / (1024L * 1024L)).coerceAtLeast(1024L)
        val availHostMb = info.availMem / (1024L * 1024L)

        val envCfg = vaultStore.virtualEnvConfig.value
        val allocatedMb = (envCfg.allocatedRamGb * 1024f).toLong().coerceIn(1024L, 16384L)
        val hostReservedMb = (totalHostMb - allocatedMb).coerceAtLeast(0L)
        val lowMode = envCfg.lowMemoryOptimizationEnabled || allocatedMb <= 4096L || info.lowMemory

        val (maxTasks, maxLogs, maxDomChars, maxAccNodes, quotaMb) = when {
            allocatedMb <= 2048L -> Quintuple(1, 80, 3500, 30, 64)
            allocatedMb <= 4096L -> Quintuple(1, 150, 5500, 45, 256)
            allocatedMb <= 8192L -> Quintuple(2, 300, 9000, 75, 512)
            else -> Quintuple(3, 500, 14000, 110, 1024)
        }

        return MemoryProfile(
            envName = envCfg.envName,
            allocatedRamMb = allocatedMb,
            lowMemoryModeEnabled = lowMode,
            totalHostRamMb = totalHostMb,
            availableHostRamMb = availHostMb,
            hostReservedRamMb = hostReservedMb,
            maxConcurrentTasks = maxTasks,
            maxLogEntries = maxLogs,
            maxDomCharacters = maxDomChars,
            maxAccessibilityNodes = maxAccNodes,
            webViewImagesEnabled = allocatedMb > 4096L && !info.lowMemory,
            workspaceQuotaMb = quotaMb
        )
    }

    override fun onTrimMemory(level: Int) {
        if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) {
            webViewController.trimMemory(lowMemoryMode = true)
        }
        refreshProfile()
    }

    override fun onConfigurationChanged(newConfig: Configuration) = Unit

    override fun onLowMemory() {
        webViewController.trimMemory(lowMemoryMode = true)
        refreshProfile()
    }

    private data class Quintuple(
        val maxTasks: Int,
        val maxLogs: Int,
        val maxDomChars: Int,
        val maxAccNodes: Int,
        val quotaMb: Int
    )
}
