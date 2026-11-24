package com.virtualos.agent.scheduler

import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.virtualos.agent.VirtualOsApplication

/**
 * Lightweight foreground service preventing premature process kill on 4 GB RAM devices
 * while the user runs multi-step browser or Accessibility automation tasks.
 */
class AgentForegroundService : Service() {

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = NotificationCompat.Builder(this, VirtualOsApplication.AGENT_CHANNEL_ID)
            .setContentTitle("KaryoOS Agent Active")
            .setContentText("Autonomous workspace session running")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setOngoing(true)
            .build()

        startForeground(NOTIFICATION_ID, notification)
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val NOTIFICATION_ID = 4101
    }
}
