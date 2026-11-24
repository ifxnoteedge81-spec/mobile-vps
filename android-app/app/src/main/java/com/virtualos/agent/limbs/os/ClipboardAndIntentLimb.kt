package com.virtualos.agent.limbs.os

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent

/**
 * OS-level Clipboard & Intent Share Limb for moving text/drafts across Android apps safely.
 */
class ClipboardAndIntentLimb(private val context: Context) {

    fun copyToClipboard(label: String, text: String): Result<String> {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText(label.ifBlank { "KaryoOS" }, text))
        return Result.success("Copied ${text.length} chars to system clipboard")
    }

    fun shareTextIntent(title: String, body: String): Result<String> {
        val sendIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, title)
            putExtra(Intent.EXTRA_TEXT, body)
        }
        val chooser = Intent.createChooser(sendIntent, title.ifBlank { "Share via KaryoOS" }).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(chooser)
        return Result.success("Opened Android share sheet for '$title'")
    }
}
