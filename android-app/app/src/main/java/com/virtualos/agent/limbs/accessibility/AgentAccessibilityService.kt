package com.virtualos.agent.limbs.accessibility

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Android AccessibilityService acting as the agent's OS-level sensory and motor limb.
 * Only inspects and acts on screen elements when explicitly invoked by the agent orchestrator.
 */
class AgentAccessibilityService : AccessibilityService() {

    override fun onServiceConnected() {
        super.onServiceConnected()
        AccessibilityBridge.attach(this)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val pkg = event?.packageName?.toString().orEmpty()
        if (pkg.isNotBlank()) {
            AccessibilityBridge.updateActiveWindow(pkg)
        }
    }

    override fun onInterrupt() {
        // Required override; bridge remains attached until unbind.
    }

    override fun onDestroy() {
        AccessibilityBridge.detach()
        super.onDestroy()
    }

    fun captureUiTreeSummary(maxNodes: Int = 55): String {
        val root = rootInActiveWindow ?: return "No active window root available."
        val lines = mutableListOf<String>()
        val queue = ArrayDeque<Pair<AccessibilityNodeInfo, Int>>()
        queue.add(root to 0)

        try {
            while (queue.isNotEmpty() && lines.size < maxNodes) {
                val (node, depth) = queue.removeFirst()
                val text = node.text?.toString()?.trim().orEmpty()
                val desc = node.contentDescription?.toString()?.trim().orEmpty()
                val resId = node.viewIdResourceName?.substringAfterLast('/')?.orEmpty().orEmpty()

                val isUseful = text.isNotBlank() || desc.isNotBlank() ||
                    node.isClickable || node.isEditable || node.isScrollable

                if (isUseful) {
                    val bounds = Rect().also { node.getBoundsInScreen(it) }
                    val flags = buildList {
                        if (node.isClickable) add("click")
                        if (node.isEditable) add("edit")
                        if (node.isScrollable) add("scroll")
                    }.joinToString(",")
                    val indent = "  ".repeat(depth.coerceAtMost(4))
                    val classSimple = node.className?.toString()?.substringAfterLast('.') ?: "View"
                    lines.add(
                        "$indent[$classSimple] id='$resId' text='${text.take(48)}' desc='${desc.take(36)}' ($flags) @${bounds.centerX()},${bounds.centerY()}"
                    )
                }

                for (i in 0 until node.childCount) {
                    node.getChild(i)?.let { child ->
                        queue.add(child to depth + 1)
                    }
                }
            }
        } finally {
            root.recycle()
        }

        return if (lines.isEmpty()) "Window has no interactive nodes." else lines.joinToString("\n")
    }

    fun clickNodeByQuery(query: String): Result<String> {
        val root = rootInActiveWindow ?: return Result.failure(IllegalStateException("No active window"))
        val match = findNode(root, query) ?: return Result.failure(
            IllegalStateException("No UI node matched '$query'")
        )

        var current: AccessibilityNodeInfo? = match
        while (current != null && !current.isClickable) {
            current = current.parent
        }

        val clicked = if (current != null && current.isClickable) {
            current.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        } else {
            val rect = Rect()
            match.getBoundsInScreen(rect)
            dispatchTapGesture(rect.centerX().toFloat(), rect.centerY().toFloat())
        }

        return if (clicked) Result.success("Clicked node matching '$query'")
        else Result.failure(IllegalStateException("Failed to click '$query'"))
    }

    fun setTextOnNode(query: String, value: String): Result<String> {
        val root = rootInActiveWindow ?: return Result.failure(IllegalStateException("No active window"))
        val target = if (query.isBlank()) {
            findFirstEditableNode(root)
        } else {
            findNode(root, query) ?: findFirstEditableNode(root)
        } ?: return Result.failure(IllegalStateException("No editable UI node matched '$query'"))

        target.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value)
        }
        val ok = target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        return if (ok) Result.success("Typed into node '$query'")
        else Result.failure(IllegalStateException("ACTION_SET_TEXT rejected on '$query'"))
    }

    fun scrollActiveWindow(forward: Boolean): Result<String> {
        val root = rootInActiveWindow ?: return Result.failure(IllegalStateException("No active window"))
        val scrollable = findFirstScrollableNode(root)
            ?: return Result.failure(IllegalStateException("No scrollable container in active window"))
        val action = if (forward) {
            AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
        } else {
            AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
        }
        val ok = scrollable.performAction(action)
        return if (ok) Result.success(if (forward) "Scrolled forward" else "Scrolled backward")
        else Result.failure(IllegalStateException("Scroll action returned false"))
    }

    fun performGlobalBack(): Boolean = performGlobalAction(GLOBAL_ACTION_BACK)

    private fun dispatchTapGesture(x: Float, y: Float): Boolean {
        val path = Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(path, 0L, 65L)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        return dispatchGesture(gesture, null, null)
    }

    private fun findNode(root: AccessibilityNodeInfo, query: String): AccessibilityNodeInfo? {
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        while (queue.isNotEmpty()) {
            val node = queue.removeFirst()
            val text = node.text?.toString().orEmpty()
            val desc = node.contentDescription?.toString().orEmpty()
            val resId = node.viewIdResourceName.orEmpty()
            if (text.contains(query, ignoreCase = true) ||
                desc.contains(query, ignoreCase = true) ||
                resId.contains(query, ignoreCase = true)
            ) {
                return node
            }
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { queue.add(it) }
            }
        }
        return null
    }

    private fun findFirstEditableNode(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        while (queue.isNotEmpty()) {
            val node = queue.removeFirst()
            if (node.isEditable) return node
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { queue.add(it) }
            }
        }
        return null
    }

    private fun findFirstScrollableNode(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        while (queue.isNotEmpty()) {
            val node = queue.removeFirst()
            if (node.isScrollable) return node
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { queue.add(it) }
            }
        }
        return null
    }
}
