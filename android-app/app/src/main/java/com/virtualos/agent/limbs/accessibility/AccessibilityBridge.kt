package com.virtualos.agent.limbs.accessibility

import android.content.Context
import android.content.Intent
import android.provider.Settings
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.lang.ref.WeakReference

/**
 * Thread-safe bridge between the AgentOrchestrator and Android's AccessibilityService.
 */
object AccessibilityBridge {

    private var serviceRef: WeakReference<AgentAccessibilityService>? = null

    private val _isConnected = MutableStateFlow(false)
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private val _activePackage = MutableStateFlow("")
    val activePackage: StateFlow<String> = _activePackage.asStateFlow()

    private val _lastScreenSnapshot = MutableStateFlow("Accessibility service inactive")
    val lastScreenSnapshot: StateFlow<String> = _lastScreenSnapshot.asStateFlow()

    internal fun attach(service: AgentAccessibilityService) {
        serviceRef = WeakReference(service)
        _isConnected.value = true
    }

    internal fun detach() {
        serviceRef = null
        _isConnected.value = false
    }

    internal fun updateActiveWindow(packageName: String) {
        _activePackage.value = packageName
    }

    fun readScreenTree(maxNodes: Int = 55): Result<String> {
        val service = serviceRef?.get() ?: return Result.failure(
            IllegalStateException("Accessibility Service is not enabled. Enable 'KaryoOS Virtual Limbs Service' in Android Settings.")
        )
        val snapshot = service.captureUiTreeSummary(maxNodes)
        _lastScreenSnapshot.value = snapshot
        return Result.success(snapshot)
    }

    fun clickNode(targetTextOrId: String): Result<String> {
        val service = serviceRef?.get() ?: return Result.failure(
            IllegalStateException("Accessibility Service is not enabled.")
        )
        return service.clickNodeByQuery(targetTextOrId)
    }

    fun typeText(targetTextOrId: String, text: String): Result<String> {
        val service = serviceRef?.get() ?: return Result.failure(
            IllegalStateException("Accessibility Service is not enabled.")
        )
        return service.setTextOnNode(targetTextOrId, text)
    }

    fun scrollScreen(forward: Boolean): Result<String> {
        val service = serviceRef?.get() ?: return Result.failure(
            IllegalStateException("Accessibility Service is not enabled.")
        )
        return service.scrollActiveWindow(forward)
    }

    fun performBack(): Result<String> {
        val service = serviceRef?.get() ?: return Result.failure(
            IllegalStateException("Accessibility Service is not enabled.")
        )
        val ok = service.performGlobalBack()
        return if (ok) Result.success("Performed GLOBAL_ACTION_BACK")
        else Result.failure(IllegalStateException("GLOBAL_ACTION_BACK failed"))
    }

    fun launchAppByPackageOrName(context: Context, query: String): Result<String> {
        val pm = context.packageManager
        val directIntent = pm.getLaunchIntentForPackage(query.trim())
        if (directIntent != null) {
            directIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(directIntent)
            return Result.success("Launched package $query")
        }

        val mainIntent = Intent(Intent.ACTION_MAIN, null).apply {
            addCategory(Intent.CATEGORY_LAUNCHER)
        }
        val apps = pm.queryIntentActivities(mainIntent, 0)
        val match = apps.firstOrNull { resolveInfo ->
            val label = resolveInfo.loadLabel(pm).toString()
            label.contains(query, ignoreCase = true) ||
                resolveInfo.activityInfo.packageName.contains(query, ignoreCase = true)
        } ?: return Result.failure(IllegalStateException("No installed app matching '$query'"))

        val launchIntent = pm.getLaunchIntentForPackage(match.activityInfo.packageName)
            ?: return Result.failure(IllegalStateException("Cannot create launch intent for ${match.activityInfo.packageName}"))
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(launchIntent)
        return Result.success("Launched ${match.loadLabel(pm)} (${match.activityInfo.packageName})")
    }

    fun openAccessibilitySettings(context: Context) {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }
}
