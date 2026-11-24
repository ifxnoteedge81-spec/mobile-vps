package com.virtualos.agent.scheduler

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.work.WorkManager

class BootCompletedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action == Intent.ACTION_BOOT_COMPLETED) {
            // WorkManager automatically reschedules persisted work; initializing ensures instance readiness.
            WorkManager.getInstance(context)
        }
    }
}
