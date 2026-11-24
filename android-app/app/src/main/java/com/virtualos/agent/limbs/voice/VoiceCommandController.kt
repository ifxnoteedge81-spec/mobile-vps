package com.virtualos.agent.limbs.voice

import android.content.Context
import android.content.Intent
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File

enum class VoiceLanguage(val localeTag: String, val displayName: String) {
    BENGALI("bn-BD", "বাংলা (bn-BD)"),
    ENGLISH("en-US", "English (en-US)")
}

data class VoiceInputState(
    val isListening: Boolean = false,
    val language: VoiceLanguage = VoiceLanguage.BENGALI,
    val partialTranscript: String = "",
    val finalTranscript: String = "",
    val rmsDb: Float = 0f,
    val errorMessage: String? = null,
    val lastRecordedAudioPath: String? = null
)

/**
 * Dual-mode Android Voice Command Controller:
 * 1) Native SpeechRecognizer for real-time Bengali (bn-BD) and English (en-US) speech-to-text.
 * 2) MediaRecorder fallback (.m4a audio capture in app cache) when Google Speech Services are unavailable.
 */
class VoiceCommandController(private val appContext: Context) {

    private var speechRecognizer: SpeechRecognizer? = null
    private var mediaRecorder: MediaRecorder? = null
    private var activeRecordingFile: File? = null
    private var onFinalTranscriptCallback: ((String) -> Unit)? = null

    private val _state = MutableStateFlow(VoiceInputState())
    val state: StateFlow<VoiceInputState> = _state.asStateFlow()

    fun setLanguage(language: VoiceLanguage) {
        _state.value = _state.value.copy(language = language, errorMessage = null)
    }

    fun startListening(onTranscriptReady: (String) -> Unit) {
        onFinalTranscriptCallback = onTranscriptReady
        val lang = _state.value.language

        if (SpeechRecognizer.isRecognitionAvailable(appContext)) {
            startSpeechRecognizer(lang)
        } else {
            startFallbackAudioRecording()
        }
    }

    fun stopListening() {
        speechRecognizer?.stopListening()
        stopFallbackRecorderIfActive()
        _state.value = _state.value.copy(isListening = false, rmsDb = 0f)
    }

    fun destroy() {
        speechRecognizer?.destroy()
        speechRecognizer = null
        stopFallbackRecorderIfActive()
    }

    private fun startSpeechRecognizer(language: VoiceLanguage) {
        speechRecognizer?.destroy()
        val recognizer = SpeechRecognizer.createSpeechRecognizer(appContext)
        speechRecognizer = recognizer

        recognizer.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                _state.value = _state.value.copy(
                    isListening = true,
                    partialTranscript = "",
                    errorMessage = null
                )
            }

            override fun onBeginningOfSpeech() = Unit

            override fun onRmsChanged(rmsdB: Float) {
                _state.value = _state.value.copy(rmsDb = rmsdB)
            }

            override fun onBufferReceived(buffer: ByteArray?) = Unit

            override fun onEndOfSpeech() {
                _state.value = _state.value.copy(isListening = false, rmsDb = 0f)
            }

            override fun onError(error: Int) {
                val msg = when (error) {
                    SpeechRecognizer.ERROR_AUDIO -> "Microphone audio error"
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "RECORD_AUDIO permission required"
                    SpeechRecognizer.ERROR_NETWORK -> "Network needed for speech recognition"
                    SpeechRecognizer.ERROR_NO_MATCH -> "No speech recognized. Try again."
                    SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Speech timeout"
                    else -> "Speech recognizer error ($error)"
                }
                _state.value = _state.value.copy(
                    isListening = false,
                    rmsDb = 0f,
                    errorMessage = msg
                )
            }

            override fun onResults(results: Bundle?) {
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                val transcript = matches?.firstOrNull()?.trim().orEmpty()
                _state.value = _state.value.copy(
                    isListening = false,
                    finalTranscript = transcript,
                    partialTranscript = transcript,
                    rmsDb = 0f
                )
                if (transcript.isNotBlank()) {
                    onFinalTranscriptCallback?.invoke(transcript)
                }
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val partial = partialResults
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    ?.trim()
                    .orEmpty()
                if (partial.isNotBlank()) {
                    _state.value = _state.value.copy(partialTranscript = partial)
                }
            }

            override fun onEvent(eventType: Int, params: Bundle?) = Unit
        })

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, language.localeTag)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language.localeTag)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        }
        recognizer.startListening(intent)
    }

    private fun startFallbackAudioRecording() {
        runCatching {
            val outFile = File(appContext.cacheDir, "voice_cmd_${System.currentTimeMillis()}.m4a")
            activeRecordingFile = outFile
            val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(appContext)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }
            recorder.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioSamplingRate(16000)
                setOutputFile(outFile.absolutePath)
                prepare()
                start()
            }
            mediaRecorder = recorder
            _state.value = _state.value.copy(
                isListening = true,
                errorMessage = null,
                lastRecordedAudioPath = outFile.absolutePath
            )
        }.onFailure { err ->
            _state.value = _state.value.copy(
                isListening = false,
                errorMessage = "Audio recording failed: ${err.message}"
            )
        }
    }

    private fun stopFallbackRecorderIfActive() {
        mediaRecorder?.let { recorder ->
            runCatching {
                recorder.stop()
                recorder.release()
            }
        }
        mediaRecorder = null
    }
}
