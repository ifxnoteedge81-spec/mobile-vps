import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const androidDir = path.join(rootDir, "android-app");
const publicDir = path.join(rootDir, "public");
const outputFile = path.join(publicDir, "android-project.json");

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

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const files = collectFiles(androidDir, androidDir);
fs.writeFileSync(
  outputFile,
  JSON.stringify({ projectRoot: "android-app", totalFiles: files.length, files }),
  "utf-8"
);
console.log(`Generated public/android-project.json (${files.length} Android files)`);
