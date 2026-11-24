import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const ANDROID_PROJECT_DIR = path.resolve(__dirname, "android-app");

interface AndroidSourceFile {
  path: string;
  name: string;
  folder: string;
  language: string;
  size: number;
  content: string;
}

function detectLanguage(fileName: string): string {
  if (fileName.endsWith(".kt") || fileName.endsWith(".kts")) return "kotlin";
  if (fileName.endsWith(".xml")) return "xml";
  if (fileName.endsWith(".yml") || fileName.endsWith(".yaml")) return "yaml";
  if (fileName.endsWith(".pro")) return "proguard";
  if (fileName.endsWith(".properties")) return "properties";
  if (fileName.endsWith(".md")) return "markdown";
  return "text";
}

function collectAndroidFiles(dir: string, root: string): AndroidSourceFile[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results: AndroidSourceFile[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectAndroidFiles(fullPath, root));
    } else if (entry.isFile()) {
      const relPath = path.relative(root, fullPath).split(path.sep).join("/");
      const content = fs.readFileSync(fullPath, "utf-8");
      results.push({
        path: relPath,
        name: entry.name,
        folder: relPath.includes("/") ? relPath.slice(0, relPath.lastIndexOf("/")) : "root",
        language: detectLanguage(entry.name),
        size: Buffer.byteLength(content, "utf-8"),
        content,
      });
    }
  }

  return results.sort((a, b) => a.path.localeCompare(b.path));
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in environment secrets.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "karyoos-workbench" });
  });

  app.get("/api/android-project/files", (_req, res) => {
    try {
      const files = collectAndroidFiles(ANDROID_PROJECT_DIR, ANDROID_PROJECT_DIR);
      res.json({
        projectRoot: "android-app",
        totalFiles: files.length,
        files,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to read Android project files",
      });
    }
  });

  // Voice recording transcription (Bengali bn-BD & English en-US) via Gemini 3.5 Transcribe
  app.post("/api/voice/transcribe", async (req, res) => {
    try {
      const { audioBase64, mimeType = "audio/webm", language = "bn-BD" } = req.body ?? {};
      if (!audioBase64 || typeof audioBase64 !== "string") {
        return res.status(400).json({ error: "Missing audioBase64 payload." });
      }

      const ai = getGeminiClient();
      const langHint =
        language === "bn-BD"
          ? "Transcribe this spoken command accurately. It may be in Bengali (বাংলা) or mixed Bengali-English. Output only the clean command text without commentary."
          : "Transcribe this spoken command accurately in English (or Bengali if spoken in Bengali). Output only the clean command text without commentary.";

      const response = await ai.models.generateContent({
        model: "gemini-3.5-transcribe",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: audioBase64,
              },
            },
            { text: langHint },
          ],
        },
      });

      const transcript = (response.text ?? "").trim();
      res.json({ transcript });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Voice transcription failed";
      res.status(502).json({ error: message });
    }
  });

  app.post("/api/agent/step", async (req, res) => {
    const startedAt = Date.now();
    try {
      const {
        goal,
        stepIndex = 1,
        observation = {},
        recentHistory = [],
        preferredModel = "gemini-4-hydrogen",
        simulateRateLimit = false,
        activeGeminiSlotCount = 5,
        openRouterFallbackModel = "google/gemini-2.0-flash-exp:free",
      } = req.body ?? {};

      if (!goal || typeof goal !== "string") {
        return res.status(400).json({ error: "A valid goal string is required." });
      }

      const allowedModels = new Set(["gemini-4-hydrogen", "gemini-4-neon"]);
      const activeModel = allowedModels.has(preferredModel)
        ? preferredModel
        : "gemini-4-hydrogen";

      const rotationEvents: Array<{ from: string; to: string; reason: string }> = [];
      let keyLabel = `Gemini Gmail #${((stepIndex - 1) % Math.max(1, activeGeminiSlotCount)) + 1}`;
      let providerLabel = "GEMINI";

      if (simulateRateLimit) {
        const nextSlot = (stepIndex % Math.max(2, activeGeminiSlotCount)) + 1;
        rotationEvents.push({
          from: `${keyLabel} (${activeModel})`,
          to: `Gemini Gmail #${nextSlot} (${activeModel})`,
          reason: "Simulated HTTP 429 RESOURCE_EXHAUSTED — auto-rotated across Gmail free pool",
        });
        if (stepIndex >= 2) {
          rotationEvents.push({
            from: `Gemini Gmail #${nextSlot}`,
            to: `OpenRouter Primary (${openRouterFallbackModel})`,
            reason: "All Gemini free slots cooling down — cascaded to single OpenRouter key free model",
          });
          keyLabel = `OpenRouter Free Cascade (${openRouterFallbackModel})`;
          providerLabel = "OPENROUTER_SIM";
        } else {
          keyLabel = `Gemini Gmail #${nextSlot}`;
        }
      }

      const ai = getGeminiClient();

      const systemInstruction = `You are KaryoOS, an autonomous isolated Virtual Phone & OS Agent ("হাত-পা" / Limbs) operating inside a private Virtual Mobile Environment.
You understand both Bengali (বাংলা) and English commands fluently, including voice-transcribed commands.
Respond in the user's language in phaseNote, thought, and finalSummary while keeping action enums exact.
Follow Observe -> Plan -> Act -> Verify strictly.

Key Autonomous Capabilities:
1. Built-in Play Store & Isolated Virtual Apps: If the user asks to download or open WhatsApp, imo, Telegram, Calling/Dialer, Messenger, Facebook, YouTube, Gmail, CapCut, or any app, NEVER tell them to leave the app—use PLAY_STORE_SEARCH / PLAY_STORE_INSTALL and OPEN_VIRTUAL_APP right inside the Virtual Phone!
2. Account, Password & Payment Vault: If the user gives credentials or asks you to set up/generate a password or connect an account/payment method, use CREDENTIAL_GENERATE_AND_SAVE or CREDENTIAL_SAVE or PAYMENT_METHOD_SAVE, and ALWAYS state the exact Vault location path (e.g., "Vault -> Credentials -> WhatsApp") and username in finalSummary so the user knows exactly where it is stored.
3. Self-Improving Long-Term Memory: Whenever the user shares an address, preference, important note, or tells you to remember something so they don't repeat it, call MEMORY_SAVE immediately. Always reuse facts from persistentMemories and savedCredentialsIndex in observation!

Available actions:
- PLAY_STORE_SEARCH: target = app name or query (e.g. "WhatsApp", "imo", "Calling")
- PLAY_STORE_INSTALL: target = app name or packageId (e.g. "WhatsApp", "com.imo.android.imoim")
- OPEN_VIRTUAL_APP: target = app name or packageId to launch inside Virtual Phone viewport
- CREDENTIAL_GENERATE_AND_SAVE: target = service/app name, value = "usernameOrEmail|notes" (auto-generates strong random password and saves to Vault -> Credentials)
- CREDENTIAL_SAVE: target = service/app name, value = "usernameOrEmail|password|notes"
- PAYMENT_METHOD_SAVE: target = label (e.g. "bKash Personal"), value = "provider|maskedIdentifier|billingAddress"
- MEMORY_SAVE: target = short memory title (e.g. "Home Address", "Preferred Tone"), value = "ADDRESS|details" or "PREFERENCE|details" or "IMPORTANT_NOTE|details" or "SKILL_EVOLUTION|details"
- WEB_NAVIGATE: target = URL (e.g. "https://jobs.karyo.local/apply" or "https://research.karyo.local/android-4gb")
- WEB_EXTRACT_DOM: inspect the current WebView page text and interactive form selectors
- WEB_FILL_INPUT: target = CSS selector from DOM elements (e.g. "#fullName"), value = text to fill (use User Profile Vault + persistentMemories!)
- WEB_CLICK_ELEMENT: target = CSS selector (e.g. "#nextBtn" or "#submitApplication")
- WORKSPACE_WRITE_FILE: target = relative path like "research/summary.md" or "drafts/cover_letter.txt", value = complete file content
- WORKSPACE_READ_FILE: target = relative path
- WORKSPACE_LIST_FILES: list sandboxed workspace files
- WORKSPACE_DELETE_FILE: target = relative path (MUST set requiresConfirmation=true)
- ACCESSIBILITY_READ_SCREEN: read active Android screen AccessibilityNodeInfo tree
- ACCESSIBILITY_CLICK_NODE: target = node text or resourceId from Accessibility tree
- ACCESSIBILITY_TYPE_TEXT: target = editable node text/id, value = text to type
- LAUNCH_APP: target = app name or package (e.g. "Settings", "JobPortal")
- CLIPBOARD_SET: target = label, value = text to copy to Android clipboard
- SEND_SHARE_INTENT: target = share title, value = content to share (MUST set requiresConfirmation=true)
- VIDEO_TRIM: target = attached video name or path, value = "startMs:endMs" (e.g. "0:15000")
- VIDEO_RESIZE_COMPRESS: target = attached video name or path, value = target height pixels ("480", "720", or "1080")
- VIDEO_MUTE: target = attached video name or path, value = "mute"
- VIDEO_WATERMARK: target = attached video name or path, value = watermark overlay text
- SUBMIT_SENSITIVE_FORM: target = submit button selector (MUST set requiresConfirmation=true when clicking final submit/apply)
- ACCOUNT_LOGIN_OR_SIGNUP: target = login/signup button (MUST set requiresConfirmation=true)
- PAYMENT_ACTION: target = payment button (MUST set requiresConfirmation=true)
- FINISH_TASK: set isDone=true and provide a clear finalSummary in the user's language (always report exact Vault paths if credentials/memories/apps were saved).

Safety Rules:
1. Never repeat the exact same failing action twice.
2. When filling forms, use User Profile Vault + persistentMemories first, then use SUBMIT_SENSITIVE_FORM with requiresConfirmation=true when clicking final Submit.
3. Keep plannedSteps concise (2-4 items).`;

      const userPrompt = `GOAL: ${goal}
STEP INDEX: ${stepIndex}

OBSERVATION SNAPSHOT:
${JSON.stringify(observation, null, 2)}

RECENT STEP OUTCOMES:
${Array.isArray(recentHistory) && recentHistory.length > 0 ? recentHistory.join("\n") : "None yet."}`;

      const response = await ai.models.generateContent({
        model: activeModel,
        contents: userPrompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              thought: { type: Type.STRING },
              phaseNote: { type: Type.STRING },
              plannedSteps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              action: { type: Type.STRING },
              target: { type: Type.STRING },
              value: { type: Type.STRING },
              requiresConfirmation: { type: Type.BOOLEAN },
              riskReason: { type: Type.STRING },
              isDone: { type: Type.BOOLEAN },
              finalSummary: { type: Type.STRING },
            },
            required: [
              "thought",
              "phaseNote",
              "plannedSteps",
              "action",
              "target",
              "value",
              "requiresConfirmation",
              "riskReason",
              "isDone",
              "finalSummary",
            ],
          },
        },
      });

      const rawText = (response.text ?? "{}").trim();
      const plan = JSON.parse(rawText);

      res.json({
        plan,
        routerMeta: {
          provider: providerLabel,
          modelId: activeModel,
          keyLabel,
          latencyMs: Date.now() - startedAt,
          rotationEvents,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent step execution failed";
      const status = message.includes("GEMINI_API_KEY") ? 500 : 502;
      res.status(status).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`KaryoOS Workbench listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
