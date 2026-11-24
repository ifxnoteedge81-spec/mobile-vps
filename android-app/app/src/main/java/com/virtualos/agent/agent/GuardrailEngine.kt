package com.virtualos.agent.agent

import com.virtualos.agent.domain.model.AgentActionType
import com.virtualos.agent.domain.model.AgentStepPlan
import com.virtualos.agent.domain.model.GuardrailRequest
import com.virtualos.agent.domain.model.RiskLevel
import com.virtualos.agent.domain.model.SkillSettingsConfig
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.UUID

class GuardrailEngine {

    private val _pendingConfirmation = MutableStateFlow<GuardrailRequest?>(null)
    val pendingConfirmation: StateFlow<GuardrailRequest?> = _pendingConfirmation.asStateFlow()

    private var activeDecision: CompletableDeferred<Boolean>? = null

    fun classifyRisk(plan: AgentStepPlan, policy: SkillSettingsConfig = SkillSettingsConfig()): GuardrailRequest? {
        val sensitiveKeywords = listOf(
            "submit", "apply", "pay", "checkout", "purchase", "confirm order",
            "sign in", "login", "register", "delete", "remove", "send email"
        )
        val combinedTarget = "${plan.target} ${plan.value} ${plan.phaseNote}".lowercase()

        val riskLevel: RiskLevel? = when (plan.action) {
            AgentActionType.PAYMENT_ACTION -> RiskLevel.CRITICAL
            AgentActionType.SUBMIT_SENSITIVE_FORM,
            AgentActionType.ACCOUNT_LOGIN_OR_SIGNUP -> if (policy.requireConfirmOnSubmit) RiskLevel.HIGH else null
            AgentActionType.WORKSPACE_DELETE_FILE -> if (policy.requireConfirmOnDelete) RiskLevel.MEDIUM else null
            AgentActionType.SEND_SHARE_INTENT -> if (policy.requireConfirmOnExternalShare) RiskLevel.MEDIUM else null
            AgentActionType.WEB_CLICK_ELEMENT,
            AgentActionType.ACCESSIBILITY_CLICK_NODE -> {
                if (policy.requireConfirmOnSubmit && sensitiveKeywords.any { combinedTarget.contains(it) }) {
                    RiskLevel.HIGH
                } else null
            }
            else -> if (plan.requiresConfirmation) RiskLevel.MEDIUM else null
        }

        if (riskLevel == null) return null

        return GuardrailRequest(
            stepId = UUID.randomUUID().toString(),
            action = plan.action,
            target = plan.target,
            proposedValue = plan.value,
            reason = plan.riskReason.ifBlank {
                "Sensitive or irreversible action detected (${plan.action.name}). Explicit approval required."
            },
            riskLevel = riskLevel
        )
    }

    suspend fun requestUserApproval(request: GuardrailRequest): Boolean {
        val deferred = CompletableDeferred<Boolean>()
        activeDecision = deferred
        _pendingConfirmation.value = request
        return try {
            deferred.await()
        } finally {
            _pendingConfirmation.value = null
            activeDecision = null
        }
    }

    fun resolveConfirmation(approved: Boolean) {
        activeDecision?.complete(approved)
    }

    fun cancelPending() {
        activeDecision?.complete(false)
        _pendingConfirmation.value = null
        activeDecision = null
    }
}
