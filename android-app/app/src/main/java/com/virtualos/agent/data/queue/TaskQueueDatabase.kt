package com.virtualos.agent.data.queue

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import com.virtualos.agent.domain.model.ScheduledTask
import com.virtualos.agent.domain.model.TaskQueueStatus
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

@Entity(tableName = "scheduled_tasks")
data class ScheduledTaskEntity(
    @PrimaryKey val id: String,
    val title: String,
    val prompt: String,
    val isRecurring: Boolean,
    val intervalHours: Long,
    val requiresUnmeteredNetwork: Boolean,
    val requiresBatteryNotLow: Boolean,
    val status: String,
    val createdAtMs: Long,
    val lastRunAtMs: Long?,
    val lastResultSummary: String?
) {
    fun toDomain(): ScheduledTask = ScheduledTask(
        id = id,
        title = title,
        prompt = prompt,
        isRecurring = isRecurring,
        intervalHours = intervalHours,
        requiresUnmeteredNetwork = requiresUnmeteredNetwork,
        requiresBatteryNotLow = requiresBatteryNotLow,
        status = runCatching { TaskQueueStatus.valueOf(status) }.getOrDefault(TaskQueueStatus.QUEUED),
        createdAtMs = createdAtMs,
        lastRunAtMs = lastRunAtMs,
        lastResultSummary = lastResultSummary
    )

    companion object {
        fun fromDomain(task: ScheduledTask): ScheduledTaskEntity = ScheduledTaskEntity(
            id = task.id,
            title = task.title,
            prompt = task.prompt,
            isRecurring = task.isRecurring,
            intervalHours = task.intervalHours,
            requiresUnmeteredNetwork = task.requiresUnmeteredNetwork,
            requiresBatteryNotLow = task.requiresBatteryNotLow,
            status = task.status.name,
            createdAtMs = task.createdAtMs,
            lastRunAtMs = task.lastRunAtMs,
            lastResultSummary = task.lastResultSummary
        )
    }
}

@Dao
interface ScheduledTaskDao {
    @Query("SELECT * FROM scheduled_tasks ORDER BY createdAtMs DESC")
    fun observeAll(): Flow<List<ScheduledTaskEntity>>

    @Query("SELECT * FROM scheduled_tasks WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): ScheduledTaskEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: ScheduledTaskEntity)

    @Query("UPDATE scheduled_tasks SET status = :status, lastRunAtMs = :lastRunAtMs, lastResultSummary = :summary WHERE id = :id")
    suspend fun updateExecutionResult(id: String, status: String, lastRunAtMs: Long, summary: String)

    @Query("DELETE FROM scheduled_tasks WHERE id = :id")
    suspend fun deleteById(id: String)
}

@Database(entities = [ScheduledTaskEntity::class], version = 1, exportSchema = false)
abstract class TaskQueueDatabase : RoomDatabase() {
    abstract fun scheduledTaskDao(): ScheduledTaskDao

    fun observeDomainTasks(): Flow<List<ScheduledTask>> =
        scheduledTaskDao().observeAll().map { rows -> rows.map { it.toDomain() } }

    companion object {
        @Volatile
        private var INSTANCE: TaskQueueDatabase? = null

        fun getInstance(context: Context): TaskQueueDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    TaskQueueDatabase::class.java,
                    "karyo_task_queue.db"
                ).fallbackToDestructiveMigration().build().also { INSTANCE = it }
            }
        }
    }
}
