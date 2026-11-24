# Preserve Kotlinx Serialization models for Gemini & OpenRouter JSON payloads
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.virtualos.agent.domain.model.**$$serializer { *; }
-keepclassmembers class com.virtualos.agent.domain.model.** {
    *** Companion;
}

# Preserve WebView JavascriptInterface methods
-keepclassmembers class com.virtualos.agent.limbs.webview.WebViewAutomationController$WebBridge {
    @android.webkit.JavascriptInterface <methods>;
}

# Room & WorkManager
-keep class * extends androidx.room.RoomDatabase
-keep class com.virtualos.agent.scheduler.AgentWorker
