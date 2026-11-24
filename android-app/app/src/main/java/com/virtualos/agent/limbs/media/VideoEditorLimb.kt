package com.virtualos.agent.limbs.media

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.BitmapOverlay
import androidx.media3.effect.OverlayEffect
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Hardware-accelerated on-device Video Editing Limb powered by Jetpack Media3 Transformer.
 * Supports trimming, resolution compression (480p/720p/1080p), audio removal, and text watermarks.
 */
class VideoEditorLimb(private val context: Context) {

    private val mediaDir: File = File(context.filesDir, "agent_workspace/media").apply {
        if (!exists()) mkdirs()
    }

    @OptIn(UnstableApi::class)
    suspend fun trimVideo(
        sourceUriOrPath: String,
        startMs: Long,
        endMs: Long,
        outputName: String = "trimmed_${System.currentTimeMillis()}.mp4"
    ): Result<String> = runTransform(
        mediaItem = MediaItem.Builder()
            .setUri(resolveUri(sourceUriOrPath))
            .setClippingConfiguration(
                MediaItem.ClippingConfiguration.Builder()
                    .setStartPositionMs(startMs.coerceAtLeast(0L))
                    .setEndPositionMs(endMs.coerceAtLeast(startMs + 500L))
                    .build()
            )
            .build(),
        effects = Effects(emptyList(), emptyList()),
        removeAudio = false,
        outputFile = File(mediaDir, sanitizeName(outputName))
    )

    @OptIn(UnstableApi::class)
    suspend fun resizeAndCompressVideo(
        sourceUriOrPath: String,
        targetHeightPx: Int = 720,
        outputName: String = "compressed_${targetHeightPx}p_${System.currentTimeMillis()}.mp4"
    ): Result<String> {
        val presentation = Presentation.createForHeight(targetHeightPx.coerceIn(360, 1080))
        return runTransform(
            mediaItem = MediaItem.fromUri(resolveUri(sourceUriOrPath)),
            effects = Effects(emptyList(), listOf(presentation)),
            removeAudio = false,
            outputFile = File(mediaDir, sanitizeName(outputName))
        )
    }

    @OptIn(UnstableApi::class)
    suspend fun muteVideo(
        sourceUriOrPath: String,
        outputName: String = "muted_${System.currentTimeMillis()}.mp4"
    ): Result<String> = runTransform(
        mediaItem = MediaItem.fromUri(resolveUri(sourceUriOrPath)),
        effects = Effects(emptyList(), emptyList()),
        removeAudio = true,
        outputFile = File(mediaDir, sanitizeName(outputName))
    )

    @OptIn(UnstableApi::class)
    suspend fun addTextWatermark(
        sourceUriOrPath: String,
        watermarkText: String,
        outputName: String = "watermarked_${System.currentTimeMillis()}.mp4"
    ): Result<String> {
        val bitmap = renderTextBitmap(watermarkText.ifBlank { "KaryoOS" })
        val overlay = BitmapOverlay.createFromBitmap(bitmap)
        val overlayEffect = OverlayEffect(listOf(overlay))
        return runTransform(
            mediaItem = MediaItem.fromUri(resolveUri(sourceUriOrPath)),
            effects = Effects(emptyList(), listOf(overlayEffect)),
            removeAudio = false,
            outputFile = File(mediaDir, sanitizeName(outputName))
        )
    }

    @OptIn(UnstableApi::class)
    private suspend fun runTransform(
        mediaItem: MediaItem,
        effects: Effects,
        removeAudio: Boolean,
        outputFile: File
    ): Result<String> = withContext(Dispatchers.Main) {
        if (outputFile.exists()) outputFile.delete()
        val deferred = CompletableDeferred<Result<String>>()

        val edited = EditedMediaItem.Builder(mediaItem)
            .setRemoveAudio(removeAudio)
            .setEffects(effects)
            .build()

        val transformer = Transformer.Builder(context)
            .setVideoMimeType(MimeTypes.VIDEO_H264)
            .setAudioMimeType(MimeTypes.AUDIO_AAC)
            .addListener(object : Transformer.Listener {
                override fun onCompleted(composition: Composition, result: ExportResult) {
                    val sizeKb = outputFile.length() / 1024L
                    deferred.complete(
                        Result.success("Exported media/${outputFile.name} (${sizeKb} KB)")
                    )
                }

                override fun onError(
                    composition: Composition,
                    result: ExportResult,
                    exception: ExportException
                ) {
                    deferred.complete(
                        Result.failure(IllegalStateException("Media3 export failed: ${exception.message}"))
                    )
                }
            })
            .build()

        transformer.start(edited, outputFile.absolutePath)
        deferred.await()
    }

    private fun resolveUri(input: String): Uri {
        val trimmed = input.trim()
        return if (trimmed.startsWith("content://") || trimmed.startsWith("file://") || trimmed.startsWith("https://")) {
            Uri.parse(trimmed)
        } else {
            val localFile = File(context.filesDir, "agent_workspace/${trimmed.trimStart('/')}")
            Uri.fromFile(localFile)
        }
    }

    private fun sanitizeName(name: String): String {
        val base = name.substringAfterLast('/').replace(Regex("[^a-zA-Z0-9._-]"), "_")
        return if (base.endsWith(".mp4")) base else "$base.mp4"
    }

    private fun renderTextBitmap(text: String): Bitmap {
        val width = 480
        val height = 84
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(150, 15, 23, 42)
        }
        canvas.drawRoundRect(8f, 8f, width - 8f, height - 8f, 16f, 16f, bgPaint)
        val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = 28f
            isFakeBoldText = true
        }
        canvas.drawText(text.take(28), 24f, 52f, textPaint)
        return bitmap
    }
}
