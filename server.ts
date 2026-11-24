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

type UniversalProviderId =
  | "GEMINI"
  | "OPENROUTER"
  | "OPENAI"
  | "ANTHROPIC"
  | "GROQ"
  | "DEEPSEEK"
  | "MISTRAL"
  | "CUSTOM";

interface EnvSlotDescriptor {
  slotId: string;
  providerId: UniversalProviderId;
  envVarName: string;
  label: string;
  endpointHost: string;
  defaultModel: string;
  configured: boolean;
}

interface ProviderCandidate {
  slotId: string;
  providerId: UniversalProviderId;
  envVarName: string;
  label: string;
  apiKey: string;
  modelId: string;
  baseUrl?: string;
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

function isValidCustomBaseUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const host = parsed.hostname.toLowerCase();
    // Block cloud instance metadata IPs
    if (host === "169.254.169.254" || host === "metadata.google.internal") return false;
    return true;
  } catch {
    return false;
  }
}

function getEnvTrimmed(name: string): string {
  const val = process.env[name];
  if (!val || val === "MY_GEMINI_API_KEY") return "";
  return val.trim();
}

function buildEnvDescriptors(): EnvSlotDescriptor[] {
  const geminiDefaultModel = getEnvTrimmed("GEMINI_MODEL") || "gemini-4-hydrogen";
  const openRouterModels = (
    getEnvTrimmed("OPENROUTER_MODELS") ||
    "google/gemini-2.0-flash-exp:free,meta-llama/llama-3.3-70b-instruct:free"
  )
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  const customBase = getEnvTrimmed("CUSTOM_AI_BASE_URL");
  const customKey = getEnvTrimmed("CUSTOM_AI_API_KEY");
  const customModel = getEnvTrimmed("CUSTOM_AI_MODEL") || "custom-model";
  const customName = getEnvTrimmed("CUSTOM_AI_NAME") || "Custom OpenAI-Compatible AI";
  let customHost = "CUSTOM_AI_BASE_URL not set";
  if (customBase && isValidCustomBaseUrl(customBase)) {
    try {
      customHost = new URL(customBase).host;
    } catch {
      customHost = customBase;
    }
  }

  return [
    {
      slotId: "GEMINI_PRIMARY",
      providerId: "GEMINI",
      envVarName: "GEMINI_API_KEY",
      label: "Gemini Primary (Server Secret)",
      endpointHost: "generativelanguage.googleapis.com",
      defaultModel: geminiDefaultModel,
      configured: Boolean(getEnvTrimmed("GEMINI_API_KEY")),
    },
    ...[1, 2, 3, 4, 5].map((idx) => ({
      slotId: `GEMINI_${idx}`,
      providerId: "GEMINI" as UniversalProviderId,
      envVarName: `GEMINI_API_KEY_${idx}`,
      label: `Gemini Free Slot #${idx}`,
      endpointHost: "generativelanguage.googleapis.com",
      defaultModel: geminiDefaultModel,
      configured: Boolean(getEnvTrimmed(`GEMINI_API_KEY_${idx}`)),
    })),
    {
      slotId: "OPENROUTER",
      providerId: "OPENROUTER",
      envVarName: "OPENROUTER_API_KEY",
      label: "OpenRouter (Free Model Cascade)",
      endpointHost: "openrouter.ai",
      defaultModel: openRouterModels[0] || "google/gemini-2.0-flash-exp:free",
      configured: Boolean(getEnvTrimmed("OPENROUTER_API_KEY")),
    },
    {
      slotId: "OPENAI",
      providerId: "OPENAI",
      envVarName: "OPENAI_API_KEY",
      label: "OpenAI (ChatGPT / GPT-4o)",
      endpointHost: "api.openai.com",
      defaultModel: getEnvTrimmed("OPENAI_MODEL") || "gpt-4o-mini",
      configured: Boolean(getEnvTrimmed("OPENAI_API_KEY")),
    },
    {
      slotId: "ANTHROPIC",
      providerId: "ANTHROPIC",
      envVarName: "ANTHROPIC_API_KEY",
      label: "Anthropic (Claude)",
      endpointHost: "api.anthropic.com",
      defaultModel: getEnvTrimmed("ANTHROPIC_MODEL") || "claude-3-5-haiku-latest",
      configured: Boolean(getEnvTrimmed("ANTHROPIC_API_KEY")),
    },
    {
      slotId: "GROQ",
      providerId: "GROQ",
      envVarName: "GROQ_API_KEY",
      label: "Groq Cloud",
      endpointHost: "api.groq.com",
      defaultModel: getEnvTrimmed("GROQ_MODEL") || "llama-3.3-70b-versatile",
      configured: Boolean(getEnvTrimmed("GROQ_API_KEY")),
    },
    {
      slotId: "DEEPSEEK",
      providerId: "DEEPSEEK",
      envVarName: "DEEPSEEK_API_KEY",
      label: "DeepSeek API",
      endpointHost: "api.deepseek.com",
      defaultModel: getEnvTrimmed("DEEPSEEK_MODEL") || "deepseek-chat",
      configured: Boolean(getEnvTrimmed("DEEPSEEK_API_KEY")),
    },
    {
      slotId: "MISTRAL",
      providerId: "MISTRAL",
      envVarName: "MISTRAL_API_KEY",
      label: "Mistral AI",
      endpointHost: "api.mistral.ai",
      defaultModel: getEnvTrimmed("MISTRAL_MODEL") || "mistral-small-latest",
      configured: Boolean(getEnvTrimmed("MISTRAL_API_KEY")),
    },
    {
      slotId: "CUSTOM",
      providerId: "CUSTOM",
      envVarName: "CUSTOM_AI_API_KEY + CUSTOM_AI_BASE_URL",
      label: customName,
      endpointHost: customHost,
      defaultModel: customModel,
      configured: Boolean(customKey && customBase && isValidCustomBaseUrl(customBase)),
    },
  ];
}

function buildConfiguredCandidates(
  preferredProvider: string = "AUTO",
  preferredGeminiModel: string = "gemini-4-hydrogen",
  openRouterModelOverride?: string,
  stepIndex: number = 1
): ProviderCandidate[] {
  const all: ProviderCandidate[] = [];
  const allowedGeminiModels = new Set(["gemini-4-hydrogen", "gemini-4-neon", "gemini-2.5-flash", "gemini-2.5-flash-lite"]);
  const activeGeminiModel = allowedGeminiModels.has(preferredGeminiModel)
    ? preferredGeminiModel
    : getEnvTrimmed("GEMINI_MODEL") || "gemini-4-hydrogen";

  const geminiPool: ProviderCandidate[] = [];
  const primaryGem = getEnvTrimmed("GEMINI_API_KEY");
  if (primaryGem) {
    geminiPool.push({
      slotId: "GEMINI_PRIMARY",
      providerId: "GEMINI",
      envVarName: "GEMINI_API_KEY",
      label: "Gemini Primary",
      apiKey: primaryGem,
      modelId: activeGeminiModel,
    });
  }
  for (let i = 1; i <= 5; i++) {
    const k = getEnvTrimmed(`GEMINI_API_KEY_${i}`);
    if (k) {
      geminiPool.push({
        slotId: `GEMINI_${i}`,
        providerId: "GEMINI",
        envVarName: `GEMINI_API_KEY_${i}`,
        label: `Gemini Slot #${i}`,
        apiKey: k,
        modelId: activeGeminiModel,
      });
    }
  }

  // Round-robin offset across configured Gemini env keys
  if (geminiPool.length > 1) {
    const offset = (Math.max(1, stepIndex) - 1) % geminiPool.length;
    all.push(...geminiPool.slice(offset), ...geminiPool.slice(0, offset));
  } else {
    all.push(...geminiPool);
  }

  const orKey = getEnvTrimmed("OPENROUTER_API_KEY");
  if (orKey) {
    const models = (
      openRouterModelOverride ||
      getEnvTrimmed("OPENROUTER_MODELS") ||
      "google/gemini-2.0-flash-exp:free,meta-llama/llama-3.3-70b-instruct:free,deepseek/deepseek-chat-v3-0324:free"
    )
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    for (const m of models) {
      all.push({
        slotId: "OPENROUTER",
        providerId: "OPENROUTER",
        envVarName: "OPENROUTER_API_KEY",
        label: `OpenRouter (${m})`,
        apiKey: orKey,
        modelId: m,
        baseUrl: "https://openrouter.ai/api/v1",
      });
    }
  }

  const openaiKey = getEnvTrimmed("OPENAI_API_KEY");
  if (openaiKey) {
    all.push({
      slotId: "OPENAI",
      providerId: "OPENAI",
      envVarName: "OPENAI_API_KEY",
      label: "OpenAI",
      apiKey: openaiKey,
      modelId: getEnvTrimmed("OPENAI_MODEL") || "gpt-4o-mini",
      baseUrl: "https://api.openai.com/v1",
    });
  }

  const anthropicKey = getEnvTrimmed("ANTHROPIC_API_KEY");
  if (anthropicKey) {
    all.push({
      slotId: "ANTHROPIC",
      providerId: "ANTHROPIC",
      envVarName: "ANTHROPIC_API_KEY",
      label: "Anthropic Claude",
      apiKey: anthropicKey,
      modelId: getEnvTrimmed("ANTHROPIC_MODEL") || "claude-3-5-haiku-latest",
      baseUrl: "https://api.anthropic.com/v1",
    });
  }

  const groqKey = getEnvTrimmed("GROQ_API_KEY");
  if (groqKey) {
    all.push({
      slotId: "GROQ",
      providerId: "GROQ",
      envVarName: "GROQ_API_KEY",
      label: "Groq",
      apiKey: groqKey,
      modelId: getEnvTrimmed("GROQ_MODEL") || "llama-3.3-70b-versatile",
      baseUrl: "https://api.groq.com/openai/v1",
    });
  }

  const deepseekKey = getEnvTrimmed("DEEPSEEK_API_KEY");
  if (deepseekKey) {
    all.push({
      slotId: "DEEPSEEK",
      providerId: "DEEPSEEK",
      envVarName: "DEEPSEEK_API_KEY",
      label: "DeepSeek",
      apiKey: deepseekKey,
      modelId: getEnvTrimmed("DEEPSEEK_MODEL") || "deepseek-chat",
      baseUrl: "https://api.deepseek.com",
    });
  }

  const mistralKey = getEnvTrimmed("MISTRAL_API_KEY");
  if (mistralKey) {
    all.push({
      slotId: "MISTRAL",
      providerId: "MISTRAL",
      envVarName: "MISTRAL_API_KEY",
      label: "Mistral",
      apiKey: mistralKey,
      modelId: getEnvTrimmed("MISTRAL_MODEL") || "mistral-small-latest",
      baseUrl: "https://api.mistral.ai/v1",
    });
  }

  const customBase = getEnvTrimmed("CUSTOM_AI_BASE_URL");
  const customKey = getEnvTrimmed("CUSTOM_AI_API_KEY");
  if (customBase && customKey && isValidCustomBaseUrl(customBase)) {
    all.push({
      slotId: "CUSTOM",
      providerId: "CUSTOM",
      envVarName: "CUSTOM_AI_API_KEY",
      label: getEnvTrimmed("CUSTOM_AI_NAME") || "Custom AI",
      apiKey: customKey,
      modelId: getEnvTrimmed("CUSTOM_AI_MODEL") || "default",
      baseUrl: customBase.replace(/\/+$/, ""),
    });
  }

  if (preferredProvider && preferredProvider !== "AUTO") {
    const prioritized = all.filter(
      (c) => c.providerId === preferredProvider || c.slotId === preferredProvider
    );
    const rest = all.filter(
      (c) => c.providerId !== preferredProvider && c.slotId !== preferredProvider
    );
    return [...prioritized, ...rest];
  }

  const priorityOrder = getEnvTrimmed("AI_PROVIDER_PRIORITY");
  if (priorityOrder && priorityOrder.toUpperCase() !== "AUTO") {
    const orderList = priorityOrder
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    return [...all].sort((a, b) => {
      const ia = orderList.indexOf(a.providerId);
      const ib = orderList.indexOf(b.providerId);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  }

  return all;
}

function extractJsonObject(raw: string): Record<string, unknown> {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(slice) as Record<string, unknown>;
}

async function callCandidate(
  candidate: ProviderCandidate,
  systemInstruction: string,
  userPrompt: string,
  jsonSchemaMode: boolean
): Promise<string> {
  if (candidate.providerId === "GEMINI") {
    const ai = new GoogleGenAI({
      apiKey: candidate.apiKey,
      httpOptions: {
        headers: { "User-Agent": "aistudio-build" },
      },
    });
    const config: Record<string, unknown> = {
      systemInstruction,
      responseMimeType: "application/json",
    };
    if (jsonSchemaMode) {
      config.responseSchema = {
        type: Type.OBJECT,
        properties: {
          thought: { type: Type.STRING },
          phaseNote: { type: Type.STRING },
          plannedSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
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
      };
    }
    const response = await ai.models.generateContent({
      model: candidate.modelId,
      contents: userPrompt,
      config,
    });
    const txt = (response.text ?? "").trim();
    if (!txt) throw new Error("Gemini returned empty response");
    return txt;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);
  try {
    if (candidate.providerId === "ANTHROPIC") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "x-api-key": candidate.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: candidate.modelId,
          max_tokens: 1200,
          system: systemInstruction,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(`Anthropic HTTP ${res.status}: ${data?.error?.message || JSON.stringify(data).slice(0, 140)}`);
      }
      const txt = data?.content?.[0]?.text?.trim();
      if (!txt) throw new Error("Anthropic returned empty content");
      return txt;
    }

    // OpenAI-compatible: OPENROUTER, OPENAI, GROQ, DEEPSEEK, MISTRAL, CUSTOM
    const base = (candidate.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
    const endpoint = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${candidate.apiKey}`,
      "Content-Type": "application/json",
    };
    if (candidate.providerId === "OPENROUTER") {
      headers["HTTP-Referer"] = process.env.APP_URL || "https://karyoos.local.agent";
      headers["X-Title"] = "KaryoOS Agent";
    }

    const bodyPayload: Record<string, unknown> = {
      model: candidate.modelId,
      temperature: 0.2,
      max_tokens: 1200,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: userPrompt },
      ],
    };
    if (candidate.providerId !== "CUSTOM") {
      bodyPayload.response_format = { type: "json_object" };
    }

    const res = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers,
      body: JSON.stringify(bodyPayload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(`${candidate.providerId} HTTP ${res.status}: ${data?.error?.message || JSON.stringify(data).slice(0, 140)}`);
    }
    const txt = data?.choices?.[0]?.message?.content?.trim();
    if (!txt) throw new Error(`${candidate.providerId} returned empty choice content`);
    return txt;
  } finally {
    clearTimeout(timeout);
  }
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

  // Safe server environment status (NEVER exposes secret values, only configured booleans & variable names)
  app.get("/api/brain/env-status", (_req, res) => {
    const slots = buildEnvDescriptors();
    res.json({
      priorityMode: getEnvTrimmed("AI_PROVIDER_PRIORITY") || "AUTO",
      configuredCount: slots.filter((s) => s.configured).length,
      totalSlots: slots.length,
      slots,
    });
  });

  // Individual server-side API connection tester for any configured environment variable
  app.post("/api/brain/test", async (req, res) => {
    const { slotId } = req.body ?? {};
    const slots = buildEnvDescriptors();
    const targetDesc = slots.find((s) => s.slotId === slotId);
    if (!targetDesc) {
      return res.status(400).json({ error: "Unknown AI slotId." });
    }
    if (!targetDesc.configured) {
      return res.json({
        ok: false,
        slotId: targetDesc.slotId,
        envVarName: targetDesc.envVarName,
        modelId: targetDesc.defaultModel,
        latencyMs: 0,
        message: `Environment variable ${targetDesc.envVarName} is not set on this server.`,
      });
    }

    const candidates = buildConfiguredCandidates("AUTO", targetDesc.defaultModel);
    const candidate = candidates.find((c) => c.slotId === slotId);
    if (!candidate) {
      return res.json({
        ok: false,
        slotId,
        envVarName: targetDesc.envVarName,
        modelId: targetDesc.defaultModel,
        latencyMs: 0,
        message: "Provider configuration invalid or missing endpoint URL.",
      });
    }

    const startedAt = Date.now();
    try {
      await callCandidate(
        candidate,
        'Respond strictly with JSON: {"ok":true}',
        "Ping connectivity check",
        false
      );
      return res.json({
        ok: true,
        slotId: candidate.slotId,
        envVarName: candidate.envVarName,
        modelId: candidate.modelId,
        latencyMs: Date.now() - startedAt,
        message: `Connected cleanly to ${candidate.label}`,
      });
    } catch (error) {
      return res.json({
        ok: false,
        slotId: candidate.slotId,
        envVarName: candidate.envVarName,
        modelId: candidate.modelId,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Connection test failed",
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

      const geminiKey =
        getEnvTrimmed("GEMINI_API_KEY") || getEnvTrimmed("GEMINI_API_KEY_1");
      if (!geminiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured in server secrets." });
      }
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: { headers: { "User-Agent": "aistudio-build" } },
      });

      const langHint =
        language === "bn-BD"
          ? "Transcribe this spoken command accurately. It may be in Bengali (বাংলা) or mixed Bengali-English. Output only the clean command text without commentary."
          : "Transcribe this spoken command accurately in English (or Bengali if spoken in Bengali). Output only the clean command text without commentary.";

      const response = await ai.models.generateContent({
        model: "gemini-3.5-transcribe",
        contents: {
          parts: [
            { inlineData: { mimeType, data: audioBase64 } },
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
        preferredProvider = "AUTO",
        simulateRateLimit = false,
        activeGeminiSlotCount = 5,
        openRouterFallbackModel = "google/gemini-2.0-flash-exp:free",
      } = req.body ?? {};

      if (!goal || typeof goal !== "string") {
        return res.status(400).json({ error: "A valid goal string is required." });
      }

      const candidates = buildConfiguredCandidates(
        preferredProvider,
        preferredModel,
        openRouterFallbackModel,
        stepIndex
      );

      if (candidates.length === 0) {
        return res.status(500).json({
          error:
            "No AI provider API key is configured on the server. Set GEMINI_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, GROQ_API_KEY, or CUSTOM_AI_API_KEY in server environment variables.",
        });
      }

      const rotationEvents: Array<{ from: string; to: string; reason: string }> = [];
      let simulatedLabelOverride: string | null = null;

      if (simulateRateLimit) {
        const simFrom = `Gemini Gmail #${((stepIndex - 1) % Math.max(1, activeGeminiSlotCount)) + 1}`;
        const nextSlot = (stepIndex % Math.max(2, activeGeminiSlotCount)) + 1;
        rotationEvents.push({
          from: `${simFrom} (${preferredModel})`,
          to: `Gemini Gmail #${nextSlot} (${preferredModel})`,
          reason: "Simulated HTTP 429 RESOURCE_EXHAUSTED — auto-rotated across pool",
        });
        if (stepIndex >= 2) {
          rotationEvents.push({
            from: `Gemini Gmail #${nextSlot}`,
            to: `Fallback Provider (${openRouterFallbackModel})`,
            reason: "Primary pool cooling down — cascaded to next configured AI provider",
          });
          simulatedLabelOverride = `Cascade (${openRouterFallbackModel})`;
        }
      }

      const systemInstruction = `You are KaryoOS, an autonomous isolated Virtual Phone & OS Agent ("হাত-পা" / Limbs) operating inside a private Virtual Mobile Environment.
You understand both Bengali (বাংলা) and English fluently, including voice-transcribed commands.
Respond in the user's language in phaseNote, thought, and finalSummary while keeping action enums exact.
Respond strictly with a single valid JSON object containing: thought, phaseNote, plannedSteps (array of strings), action, target, value, requiresConfirmation (boolean), riskReason, isDone (boolean), finalSummary.
Follow Observe -> Plan -> Act -> Verify strictly.

Key Autonomous Capabilities:
1. Built-in Play Store & Isolated Virtual Apps: If the user asks to download or open WhatsApp, imo, Telegram, Calling/Dialer, Messenger, Facebook, YouTube, Gmail, CapCut, or any app, NEVER tell them to leave the app—use PLAY_STORE_SEARCH / PLAY_STORE_INSTALL and OPEN_VIRTUAL_APP right inside the Virtual Phone!
2. Account, Password & Payment Vault: If the user gives credentials or asks you to set up/generate a password or connect an account/payment method, use CREDENTIAL_GENERATE_AND_SAVE or CREDENTIAL_SAVE or PAYMENT_METHOD_SAVE, and ALWAYS state the exact Vault location path (e.g., "Vault -> Credentials -> WhatsApp") and username in finalSummary so the user knows exactly where it is stored.
3. Self-Improving Long-Term Memory: Whenever the user shares an address, preference, important note, or tells you to remember something so they don't repeat it, call MEMORY_SAVE immediately. Always reuse facts from persistentMemories and savedCredentialsIndex in observation!

Available actions:
- PLAY_STORE_SEARCH: target = app name or query (e.g. "WhatsApp", "imo", "Calling")
- PLAY_STORE_INSTALL: target = app name or packageId (e.g. "WhatsApp", "com.imo.android.imoim")
- OPEN_VIRTUAL_APP: target = app name or packageId to launch inside Virtual Phone viewport
- CREDENTIAL_GENERATE_AND_SAVE: target = service/app name, value = "usernameOrEmail|notes"
- CREDENTIAL_SAVE: target = service/app name, value = "usernameOrEmail|password|notes"
- PAYMENT_METHOD_SAVE: target = label, value = "provider|maskedIdentifier|billingAddress"
- MEMORY_SAVE: target = short memory title, value = "ADDRESS|details" or "PREFERENCE|details" or "IMPORTANT_NOTE|details" or "SKILL_EVOLUTION|details"
- WEB_NAVIGATE: target = URL
- WEB_EXTRACT_DOM: inspect current WebView page
- WEB_FILL_INPUT: target = CSS selector, value = text to fill
- WEB_CLICK_ELEMENT: target = CSS selector
- WORKSPACE_WRITE_FILE: target = relative path, value = complete file content
- WORKSPACE_READ_FILE: target = relative path
- WORKSPACE_LIST_FILES: list sandboxed workspace files
- WORKSPACE_DELETE_FILE: target = relative path (MUST set requiresConfirmation=true)
- ACCESSIBILITY_READ_SCREEN: read active screen nodes
- ACCESSIBILITY_CLICK_NODE: target = node text or resourceId
- ACCESSIBILITY_TYPE_TEXT: target = node id, value = text
- LAUNCH_APP: target = app name
- CLIPBOARD_SET: target = label, value = text
- SEND_SHARE_INTENT: target = share title, value = content (MUST set requiresConfirmation=true)
- VIDEO_TRIM: target = video name, value = "startMs:endMs"
- VIDEO_RESIZE_COMPRESS: target = video name, value = "480"|"720"|"1080"
- VIDEO_MUTE: target = video name, value = "mute"
- VIDEO_WATERMARK: target = video name, value = watermark text
- SUBMIT_SENSITIVE_FORM: target = submit selector (MUST set requiresConfirmation=true)
- ACCOUNT_LOGIN_OR_SIGNUP: target = login button (MUST set requiresConfirmation=true)
- PAYMENT_ACTION: target = payment button (MUST set requiresConfirmation=true)
- FINISH_TASK: set isDone=true and provide a clear finalSummary in the user's language.

Safety Rules:
1. Never repeat the exact same failing action twice.
2. Keep plannedSteps concise (2-4 items).`;

      const userPrompt = `GOAL: ${goal}
STEP INDEX: ${stepIndex}

OBSERVATION SNAPSHOT:
${JSON.stringify(observation, null, 2)}

RECENT STEP OUTCOMES:
${Array.isArray(recentHistory) && recentHistory.length > 0 ? recentHistory.join("\n") : "None yet."}`;

      let lastErr = "All configured AI providers failed";
      let previousRoute = "";

      for (const candidate of candidates) {
        const currentRoute = `${candidate.label} (${candidate.modelId})`;
        if (previousRoute) {
          rotationEvents.push({
            from: previousRoute,
            to: currentRoute,
            reason: lastErr,
          });
        }
        previousRoute = currentRoute;

        try {
          const rawText = await callCandidate(
            candidate,
            systemInstruction,
            userPrompt,
            candidate.providerId === "GEMINI"
          );
          const plan = extractJsonObject(rawText);

          return res.json({
            plan,
            routerMeta: {
              provider: candidate.providerId,
              modelId: candidate.modelId,
              keyLabel: simulatedLabelOverride || `${candidate.label} [${candidate.envVarName}]`,
              latencyMs: Date.now() - startedAt,
              rotationEvents,
            },
          });
        } catch (err) {
          lastErr = err instanceof Error ? err.message : "Provider request failed";
        }
      }

      return res.status(502).json({
        error: `All ${candidates.length} configured AI routes failed. Last error: ${lastErr}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent step execution failed";
      res.status(502).json({ error: message });
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
