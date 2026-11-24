package com.virtualos.agent.domain.model

import kotlinx.serialization.Serializable

@Serializable
data class UserProfileVault(
    val fullName: String = "",
    val email: String = "",
    val phone: String = "",
    val location: String = "",
    val headline: String = "",
    val education: String = "",
    val workExperience: String = "",
    val skills: String = "",
    val portfolioUrl: String = "",
    val customInstructions: String = ""
) {
    fun toCompactAgentContext(): String {
        val parts = buildList {
            if (fullName.isNotBlank()) add("Name: $fullName")
            if (email.isNotBlank()) add("Email: $email")
            if (phone.isNotBlank()) add("Phone: $phone")
            if (location.isNotBlank()) add("Address/Location: $location")
            if (headline.isNotBlank()) add("Headline: $headline")
            if (education.isNotBlank()) add("Education: $education")
            if (workExperience.isNotBlank()) add("Experience: $workExperience")
            if (skills.isNotBlank()) add("Skills: $skills")
            if (portfolioUrl.isNotBlank()) add("Portfolio: $portfolioUrl")
            if (customInstructions.isNotBlank()) add("Preferences: $customInstructions")
        }
        return if (parts.isEmpty()) "No user profile configured." else parts.joinToString("\n")
    }
}

@Serializable
enum class CredentialCategory {
    APP_ACCOUNT,
    EMAIL,
    SOCIAL_MEDIA,
    WEBSITE,
    OTHER
}

@Serializable
data class CredentialEntry(
    val id: String,
    val serviceName: String,
    val category: CredentialCategory = CredentialCategory.APP_ACCOUNT,
    val usernameOrEmail: String,
    val secretValue: String,
    val savedLocationPath: String = "Vault -> Credentials -> $serviceName",
    val notes: String = "",
    val updatedAtMs: Long = System.currentTimeMillis()
)

@Serializable
data class PaymentMethodEntry(
    val id: String,
    val label: String,
    val provider: String,
    val maskedIdentifier: String,
    val billingAddress: String = "",
    val savedLocationPath: String = "Vault -> Payments -> $label",
    val notes: String = "",
    val updatedAtMs: Long = System.currentTimeMillis()
)

@Serializable
enum class MemoryCategory {
    ADDRESS,
    PREFERENCE,
    IMPORTANT_NOTE,
    SKILL_EVOLUTION,
    FACT
}

@Serializable
data class MemoryNoteEntry(
    val id: String,
    val category: MemoryCategory = MemoryCategory.IMPORTANT_NOTE,
    val title: String,
    val content: String,
    val savedLocationPath: String = "Vault -> Memory -> $title",
    val updatedAtMs: Long = System.currentTimeMillis()
)

@Serializable
data class VirtualAppEntry(
    val packageId: String,
    val appName: String,
    val category: String,
    val webFallbackUrl: String,
    val version: String = "1.0.0",
    val installedInVirtualPhone: Boolean = false,
    val installedAtMs: Long? = null
)

enum class TaskQueueStatus {
    QUEUED,
    RUNNING,
    SUCCEEDED,
    FAILED,
    CANCELLED
}

data class ScheduledTask(
    val id: String,
    val title: String,
    val prompt: String,
    val isRecurring: Boolean,
    val intervalHours: Long,
    val requiresUnmeteredNetwork: Boolean,
    val requiresBatteryNotLow: Boolean,
    val status: TaskQueueStatus,
    val createdAtMs: Long,
    val lastRunAtMs: Long? = null,
    val lastResultSummary: String? = null
)

data class WorkspaceFileEntry(
    val relativePath: String,
    val name: String,
    val folder: String,
    val sizeBytes: Long,
    val lastModifiedMs: Long,
    val isDirectory: Boolean
)
