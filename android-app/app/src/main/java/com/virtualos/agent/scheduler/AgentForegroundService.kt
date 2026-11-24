package com.virtualos.agent.scheduler

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.virtualos.agent.VirtualOsApplication

/**
 * Lightweight foreground service preventing premature process kill on low-RAM devices
 * while the user runs multi-step automation or minimizes KaryoOS to the background.
 */
class AgentForegroundService : Service() {

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = NotificationCompat.Builder(this, VirtualOsApplication.AGENT_CHANNEL_ID)
            .setContentTitle("KaryoOS Virtual Phone Active")
            .setContentText("Autonomous workspace running safely in background")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val NOTIFICATION_ID = 4101
    }
}
