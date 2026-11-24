import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const androidDir = path.join(rootDir, "android-app");
const publicDir = path.join(rootDir, "public");
const outputFile = path.join(publicDir, "android-project.json");
const apkManifestFile = path.join(publicDir, "apk-release.json");
const localApkFile = path.join(publicDir, "KaryoOS-Agent.apk");

function detectLanguage(fileName) {
  if (fileName.endsWith(".kt") || fileName.endsWith(".kts")) return "kotlin";
  if (fileName.endsWith(".xml")) return "xml";
  if (fileName.endsWith(".yml") || fileName.endsWith(".yaml")) return "yaml";
  if (fileName.endsWith(".pro")) return "proguard";
  if (fileName.endsWith(".properties")) return "properties";
  if (fileName.endsWith(".md")) return "markdown";
  return "text";
}

function collectFiles(dir, base) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, base));
    } else if (entry.isFile()) {
      const rel = path.relative(base, full).split(path.sep).join("/");
      const content = fs.readFileSync(full, "utf-8");
      results.push({
        path: rel,
        name: entry.name,
        folder: rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "root",
        language: detectLanguage(entry.name),
        size: Buffer.byteLength(content, "utf-8"),
        content,
      });
    }
  }
  return results.sort((a, b) => a.path.localeCompare(b.path));
}

function parseGithubOwnerRepo(raw) {
  if (!raw || typeof raw !== "string") return "";
  const cleaned = raw
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "");
  const parts = cleaned.split("/");
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : "";
}

async function prepareApkManifest() {
  const repoEnv =
    process.env.VITE_GITHUB_REPO ||
    process.env.GITHUB_REPOSITORY ||
    process.env.REPOSITORY_URL ||
    "";
  const githubRepo = parseGithubOwnerRepo(repoEnv);
  let releaseApkUrl = "";
  let versionTag = "v1.0";

  if (!fs.existsSync(localApkFile) && githubRepo) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(
        `https://api.github.com/repos/${githubRepo}/releases/latest`,
        {
          headers: { Accept: "application/vnd.github+json", "User-Agent": "karyoos-build" },
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        versionTag = data.tag_name || versionTag;
        const asset = (data.assets || []).find(
          (a) => a.name === "KaryoOS-Agent.apk" || a.name.endsWith(".apk")
        );
        if (asset?.browser_download_url) {
          releaseApkUrl = asset.browser_download_url;
          const apkController = new AbortController();
          const apkTimeout = setTimeout(() => apkController.abort(), 10000);
          try {
            const apkRes = await fetch(asset.browser_download_url, {
              signal: apkController.signal,
            });
            if (apkRes.ok) {
              const buf = Buffer.from(await apkRes.arrayBuffer());
              fs.writeFileSync(localApkFile, buf);
              console.log(`Fetched release APK (${buf.length} bytes) into public/KaryoOS-Agent.apk`);
            }
          } finally {
            clearTimeout(apkTimeout);
          }
        }
      }
    } catch {
      // Offline or release not published yet; fallback cleanly to runtime manifest
    }
  }

  const hasLocalApk = fs.existsSync(localApkFile);
  const apkSizeBytes = hasLocalApk ? fs.statSync(localApkFile).size : 0;

  fs.writeFileSync(
    apkManifestFile,
    JSON.stringify(
      {
        packageId: "com.virtualos.agent",
        fileName: "KaryoOS-Agent.apk",
        versionTag,
        hasLocalApk,
        apkPath: hasLocalApk ? "/KaryoOS-Agent.apk" : "",
        apkSizeBytes,
        githubRepo,
        releaseApkUrl,
      },
      null,
      2
    ),
    "utf-8"
  );
}

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const files = collectFiles(androidDir, androidDir);
fs.writeFileSync(
  outputFile,
  JSON.stringify({ projectRoot: "android-app", totalFiles: files.length, files }),
  "utf-8"
);
await prepareApkManifest();
console.log(`Generated public/android-project.json (${files.length} Android files) and apk-release.json`);
