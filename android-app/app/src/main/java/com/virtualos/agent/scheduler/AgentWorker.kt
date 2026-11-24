package com.virtualos.agent.scheduler

import android.app.Notification
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import com.virtualos.agent.R
import com.virtualos.agent.VirtualOsApplication
import com.virtualos.agent.domain.model.TaskQueueStatus

/**
 * WorkManager CoroutineWorker executing queued or recurring autonomous tasks under OS constraints.
 */
class AgentWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val taskId = inputData.getString(KEY_TASK_ID) ?: return Result.failure()
        val prompt = inputData.getString(KEY_TASK_PROMPT) ?: return Result.failure()
        val title = inputData.getString(KEY_TASK_TITLE) ?: "Scheduled Agent Task"

        setForeground(createForegroundInfo(title))

        val app = applicationContext as VirtualOsApplication
        val dao = app.taskDatabase.scheduledTaskDao()
        dao.updateExecutionResult(
            id = taskId,
            status = TaskQueueStatus.RUNNING.name,
            lastRunAtMs = System.currentTimeMillis(),
            summary = "Running background execution..."
        )

        val outcome = app.orchestrator.runBlockingForWorker(prompt)
        return outcome.fold(
            onSuccess = { summary ->
                dao.updateExecutionResult(
                    id = taskId,
                    status = TaskQueueStatus.SUCCEEDED.name,
                    lastRunAtMs = System.currentTimeMillis(),
                    summary = summary.take(240)
                )
                Result.success()
            },
            onFailure = { error ->
                dao.updateExecutionResult(
                    id = taskId,
                    status = TaskQueueStatus.FAILED.name,
                    lastRunAtMs = System.currentTimeMillis(),
                    summary = (error.message ?: "Failed").take(240)
                )
                if (runAttemptCount < 2) Result.retry() else Result.failure()
            }
        )
    }

    private fun createForegroundInfo(title: String): ForegroundInfo {
        val notification: Notification = NotificationCompat.Builder(
            applicationContext,
            VirtualOsApplication.AGENT_CHANNEL_ID
        )
            .setContentTitle("KaryoOS Background Task")
            .setContentText(title)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setOngoing(true)
            .build()

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(
                WORKER_NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            ForegroundInfo(WORKER_NOTIFICATION_ID, notification)
        }
    }

    companion object {
        const val KEY_TASK_ID = "task_id"
        const val KEY_TASK_PROMPT = "task_prompt"
        const val KEY_TASK_TITLE = "task_title"
        private const val WORKER_NOTIFICATION_ID = 4102
    }
}
