package com.virtualos.agent

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.virtualos.agent.agent.AgentOrchestrator
import com.virtualos.agent.agent.GuardrailEngine
import com.virtualos.agent.agent.LowMemoryMonitor
import com.virtualos.agent.brain.AnthropicClient
import com.virtualos.agent.brain.BrainRouter
import com.virtualos.agent.brain.GeminiClient
import com.virtualos.agent.brain.OpenRouterClient
import com.virtualos.agent.brain.UniversalOpenAiClient
import com.virtualos.agent.data.queue.TaskQueueDatabase
import com.virtualos.agent.data.security.EncryptedVaultStore
import com.virtualos.agent.data.workspace.SandboxedWorkspaceManager
import com.virtualos.agent.limbs.media.VideoEditorLimb
import com.virtualos.agent.limbs.os.ClipboardAndIntentLimb
import com.virtualos.agent.limbs.store.PlayStoreLimb
import com.virtualos.agent.limbs.voice.VoiceCommandController
import com.virtualos.agent.limbs.webview.WebViewAutomationController
import com.virtualos.agent.scheduler.AgentTaskScheduler
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

class VirtualOsApplication : Application() {

    lateinit var vaultStore: EncryptedVaultStore
        private set
    lateinit var workspaceManager: SandboxedWorkspaceManager
        private set
    lateinit var taskDatabase: TaskQueueDatabase
        private set
    lateinit var webViewController: WebViewAutomationController
        private set
    lateinit var voiceController: VoiceCommandController
        private set
    lateinit var videoEditorLimb: VideoEditorLimb
        private set
    lateinit var clipboardLimb: ClipboardAndIntentLimb
        private set
    lateinit var playStoreLimb: PlayStoreLimb
        private set
    lateinit var guardrailEngine: GuardrailEngine
        private set
    lateinit var lowMemoryMonitor: LowMemoryMonitor
        private set
    lateinit var brainRouter: BrainRouter
        private set
    lateinit var orchestrator: AgentOrchestrator
        private set
    lateinit var taskScheduler: AgentTaskScheduler
        private set

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()

        val httpClient = OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(45, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .build()

        vaultStore = EncryptedVaultStore(this)
        workspaceManager = SandboxedWorkspaceManager(this)
        taskDatabase = TaskQueueDatabase.getInstance(this)
        webViewController = WebViewAutomationController()
        voiceController = VoiceCommandController(this)
        videoEditorLimb = VideoEditorLimb(this)
        clipboardLimb = ClipboardAndIntentLimb(this)
        playStoreLimb = PlayStoreLimb(this, vaultStore)
        guardrailEngine = GuardrailEngine()
        lowMemoryMonitor = LowMemoryMonitor(this, vaultStore, webViewController)
        registerComponentCallbacks(lowMemoryMonitor)

        val geminiClient = GeminiClient(httpClient)
        val openRouterClient = OpenRouterClient(httpClient)
        val universalOpenAiClient = UniversalOpenAiClient(httpClient)
        val anthropicClient = AnthropicClient(httpClient)
        brainRouter = BrainRouter(
            vaultStore = vaultStore,
            geminiClient = geminiClient,
            openRouterClient = openRouterClient,
            universalOpenAiClient = universalOpenAiClient,
            anthropicClient = anthropicClient
        )

        orchestrator = AgentOrchestrator(
            appContext = this,
            brainRouter = brainRouter,
            vaultStore = vaultStore,
            workspaceManager = workspaceManager,
            webViewController = webViewController,
            videoEditorLimb = videoEditorLimb,
            clipboardLimb = clipboardLimb,
            playStoreLimb = playStoreLimb,
            guardrailEngine = guardrailEngine,
            lowMemoryMonitor = lowMemoryMonitor
        )
        taskScheduler = AgentTaskScheduler(this, taskDatabase)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                AGENT_CHANNEL_ID,
                getString(R.string.notification_channel_agent),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = getString(R.string.notification_channel_agent_desc)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    companion object {
        const val AGENT_CHANNEL_ID = "karyo_agent_channel"
    }
}
