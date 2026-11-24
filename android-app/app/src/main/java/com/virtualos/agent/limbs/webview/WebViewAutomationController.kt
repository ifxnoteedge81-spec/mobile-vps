package com.virtualos.agent.limbs.webview

import android.annotation.SuppressLint
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

data class WebViewObservation(
    val url: String = "about:blank",
    val title: String = "",
    val isLoading: Boolean = false,
    val progress: Int = 0,
    val domSummaryJson: String = "{}"
)

/**
 * Controlled WebView automation limb supporting URL navigation, compact DOM inspection,
 * form input injection, element clicking, scrolling, and memory-aware cache trimming.
 */
class WebViewAutomationController {

    private var webView: WebView? = null
    private var pendingNavigation: CompletableDeferred<String>? = null

    private val _observation = MutableStateFlow(WebViewObservation())
    val observation: StateFlow<WebViewObservation> = _observation.asStateFlow()

    @SuppressLint("SetJavaScriptEnabled")
    fun attachWebView(instance: WebView) {
        if (webView === instance) return
        webView = instance

        instance.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            loadsImagesAutomatically = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            userAgentString = "$userAgentString KaryoOSAgent/1.0"
        }

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(instance, false)

        instance.addJavascriptInterface(WebBridge(), "KaryoBridge")

        instance.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val scheme = request?.url?.scheme?.lowercase() ?: return true
                return scheme != "https" && scheme != "http"
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                val currentUrl = url.orEmpty()
                _observation.value = _observation.value.copy(
                    url = currentUrl,
                    title = view?.title.orEmpty(),
                    isLoading = false,
                    progress = 100
                )
                pendingNavigation?.complete(currentUrl)
                pendingNavigation = null
            }
        }

        instance.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                _observation.value = _observation.value.copy(
                    progress = newProgress,
                    isLoading = newProgress < 100
                )
            }
        }
    }

    fun detachWebView() {
        webView = null
    }

    suspend fun navigate(url: String): Result<String> = withContext(Dispatchers.Main) {
        val view = webView ?: return@withContext Result.failure(
            IllegalStateException("WebView workspace is not mounted. Open the Workspace tab or keep host active.")
        )
        val normalized = if (url.startsWith("http://") || url.startsWith("https://")) url else "https://$url"
        val deferred = CompletableDeferred<String>()
        pendingNavigation = deferred
        _observation.value = _observation.value.copy(url = normalized, isLoading = true, progress = 5)
        view.loadUrl(normalized)

        val finishedUrl = withTimeoutOrNull(18_000L) { deferred.await() }
        if (finishedUrl != null) {
            Result.success("Navigated to $finishedUrl")
        } else {
            pendingNavigation = null
            Result.success("Navigation initiated to $normalized (page still streaming)")
        }
    }

    suspend fun extractDomSnapshot(maxChars: Int = 6000): Result<String> = withContext(Dispatchers.Main) {
        val view = webView ?: return@withContext Result.failure(IllegalStateException("WebView not attached"))
        val script = """
            (function() {
              const interactive = [];
              const nodes = document.querySelectorAll('a, button, input, textarea, select, [role="button"]');
              for (let i = 0; i < Math.min(nodes.length, 45); i++) {
                const el = nodes[i];
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) continue;
                const selector = el.id ? '#' + el.id :
                  (el.name ? el.tagName.toLowerCase() + '[name="' + el.name + '"]' :
                  el.tagName.toLowerCase() + ':nth-of-type(' + (i + 1) + ')');
                interactive.push({
                  tag: el.tagName.toLowerCase(),
                  type: el.type || '',
                  selector: selector,
                  text: (el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || '').trim().slice(0, 80)
                });
              }
              const bodyText = (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').trim().slice(0, 2800);
              return JSON.stringify({
                url: window.location.href,
                title: document.title,
                textPreview: bodyText,
                elements: interactive
              });
            })();
        """.trimIndent()

        val deferred = CompletableDeferred<String>()
        view.evaluateJavascript(script) { raw ->
            val unescaped = unquoteJsString(raw.orEmpty()).take(maxChars)
            _observation.value = _observation.value.copy(domSummaryJson = unescaped)
            deferred.complete(unescaped)
        }
        val snapshot = withTimeoutOrNull(4_000L) { deferred.await() } ?: "{}"
        Result.success(snapshot)
    }

    suspend fun fillInput(cssSelector: String, value: String): Result<String> = withContext(Dispatchers.Main) {
        val view = webView ?: return@withContext Result.failure(IllegalStateException("WebView not attached"))
        val safeSelector = escapeJs(cssSelector)
        val safeValue = escapeJs(value)
        val script = """
            (function() {
              const el = document.querySelector('$safeSelector');
              if (!el) return 'NOT_FOUND';
              el.focus();
              const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
              const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
              if (setter) setter.call(el, '$safeValue'); else el.value = '$safeValue';
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return 'FILLED';
            })();
        """.trimIndent()

        val deferred = CompletableDeferred<String>()
        view.evaluateJavascript(script) { raw -> deferred.complete(unquoteJsString(raw.orEmpty())) }
        val status = withTimeoutOrNull(3_000L) { deferred.await() } ?: "TIMEOUT"
        if (status == "FILLED") Result.success("Filled $cssSelector")
        else Result.failure(IllegalStateException("Element $cssSelector status: $status"))
    }

    suspend fun clickElement(cssSelector: String): Result<String> = withContext(Dispatchers.Main) {
        val view = webView ?: return@withContext Result.failure(IllegalStateException("WebView not attached"))
        val safeSelector = escapeJs(cssSelector)
        val script = """
            (function() {
              const el = document.querySelector('$safeSelector');
              if (!el) return 'NOT_FOUND';
              el.scrollIntoView({ behavior: 'instant', block: 'center' });
              el.click();
              return 'CLICKED';
            })();
        """.trimIndent()

        val deferred = CompletableDeferred<String>()
        view.evaluateJavascript(script) { raw -> deferred.complete(unquoteJsString(raw.orEmpty())) }
        val status = withTimeoutOrNull(3_000L) { deferred.await() } ?: "TIMEOUT"
        if (status == "CLICKED") Result.success("Clicked $cssSelector")
        else Result.failure(IllegalStateException("Element $cssSelector status: $status"))
    }

    suspend fun scrollPage(direction: String): Result<String> = withContext(Dispatchers.Main) {
        val view = webView ?: return@withContext Result.failure(IllegalStateException("WebView not attached"))
        val delta = if (direction.equals("up", ignoreCase = true)) -650 else 650
        view.evaluateJavascript("window.scrollBy(0, $delta);", null)
        Result.success("Scrolled $direction by ${kotlin.math.abs(delta)}px")
    }

    fun trimMemory(lowMemoryMode: Boolean) {
        webView?.post {
            webView?.clearCache(false)
            if (lowMemoryMode) {
                webView?.settings?.loadsImagesAutomatically = false
            }
        }
    }

    fun applyMemoryProfile(lowMemoryMode: Boolean) {
        webView?.post {
            webView?.settings?.loadsImagesAutomatically = !lowMemoryMode
        }
    }

    private fun escapeJs(input: String): String = input
        .replace("\\", "\\\\")
        .replace("'", "\\'")
        .replace("\n", "\\n")
        .replace("\r", "")

    private fun unquoteJsString(raw: String): String {
        if (raw == "null" || raw.isBlank()) return ""
        return if (raw.startsWith("\"") && raw.endsWith("\"") && raw.length >= 2) {
            raw.substring(1, raw.length - 1)
                .replace("\\\"", "\"")
                .replace("\\\\", "\\")
                .replace("\\n", "\n")
        } else {
            raw
        }
    }

    inner class WebBridge {
        @JavascriptInterface
        fun notifyDomEvent(eventJson: String) {
            _observation.value = _observation.value.copy(domSummaryJson = eventJson.take(6000))
        }
    }
}
