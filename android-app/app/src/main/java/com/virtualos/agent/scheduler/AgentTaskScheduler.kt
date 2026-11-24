package com.virtualos.agent.scheduler

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.virtualos.agent.data.queue.ScheduledTaskEntity
import com.virtualos.agent.data.queue.TaskQueueDatabase
import com.virtualos.agent.domain.model.ScheduledTask
import com.virtualos.agent.domain.model.TaskQueueStatus
import kotlinx.coroutines.flow.Flow
import java.util.UUID
import java.util.concurrent.TimeUnit

class AgentTaskScheduler(
    context: Context,
    private val database: TaskQueueDatabase
) {
    private val workManager = WorkManager.getInstance(context)

    fun observeTasks(): Flow<List<ScheduledTask>> = database.observeDomainTasks()

    suspend fun enqueueTask(
        title: String,
        prompt: String,
        isRecurring: Boolean,
        intervalHours: Long = 12L,
        requiresUnmeteredNetwork: Boolean = false,
        requiresBatteryNotLow: Boolean = true
    ): ScheduledTask {
        val taskId = UUID.randomUUID().toString()
        val task = ScheduledTask(
            id = taskId,
            title = title.trim(),
            prompt = prompt.trim(),
            isRecurring = isRecurring,
            intervalHours = intervalHours.coerceAtLeast(1L),
            requiresUnmeteredNetwork = requiresUnmeteredNetwork,
            requiresBatteryNotLow = requiresBatteryNotLow,
            status = TaskQueueStatus.QUEUED,
            createdAtMs = System.currentTimeMillis()
        )
        database.scheduledTaskDao().upsert(ScheduledTaskEntity.fromDomain(task))

        val constraints = Constraints.Builder()
            .setRequiredNetworkType(if (requiresUnmeteredNetwork) NetworkType.UNMETERED else NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(requiresBatteryNotLow)
            .build()

        val input = workDataOf(
            AgentWorker.KEY_TASK_ID to task.id,
            AgentWorker.KEY_TASK_TITLE to task.title,
            AgentWorker.KEY_TASK_PROMPT to task.prompt
        )

        if (isRecurring) {
            val periodicRequest = PeriodicWorkRequestBuilder<AgentWorker>(
                intervalHours.coerceAtLeast(1L),
                TimeUnit.HOURS
            )
                .setConstraints(constraints)
                .setInputData(input)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.MINUTES)
                .build()

            workManager.enqueueUniquePeriodicWork(
                uniqueWorkName(task.id),
                ExistingPeriodicWorkPolicy.UPDATE,
                periodicRequest
            )
        } else {
            val oneTimeRequest = OneTimeWorkRequestBuilder<AgentWorker>()
                .setConstraints(constraints)
                .setInputData(input)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 5, TimeUnit.MINUTES)
                .build()

            workManager.enqueueUniqueWork(
                uniqueWorkName(task.id),
                ExistingWorkPolicy.REPLACE,
                oneTimeRequest
            )
        }

        return task
    }

    suspend fun cancelTask(taskId: String) {
        workManager.cancelUniqueWork(uniqueWorkName(taskId))
        database.scheduledTaskDao().deleteById(taskId)
    }

    private fun uniqueWorkName(taskId: String): String = "karyo_task_$taskId"
}
