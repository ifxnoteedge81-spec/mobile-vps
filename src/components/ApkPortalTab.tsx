import React, { useEffect, useState } from "react";
import { Download, ExternalLink, RefreshCw, Smartphone, CheckCircle2, AlertCircle } from "lucide-react";

interface ApkPortalTabProps {
  totalAndroidFiles: number;
  onExportZip: () => void;
}

interface GithubAsset {
  name: string;
  size: number;
  browser_download_url: string;
}

interface GithubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
  assets: GithubAsset[];
}

export const ApkPortalTab: React.FC<ApkPortalTabProps> = ({
  totalAndroidFiles,
  onExportZip,
}) => {
  const [githubRepo, setGithubRepo] = useState<string>(
    () => localStorage.getItem("karyo_github_repo") || ""
  );
  const [release, setRelease] = useState<GithubRelease | null>(null);
  const [loadingRelease, setLoadingRelease] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem("karyo_github_repo", githubRepo);
  }, [githubRepo]);

  const fetchLatestApk = async () => {
    const cleaned = githubRepo
      .trim()
      .replace(/^https?:\/\/github\.com\//, "")
      .replace(/\.git$/, "")
      .replace(/\/+$/, "");

    if (!cleaned.includes("/")) {
      setReleaseError("Enter repository as owner/repo (example: tariqul/karyoos-agent).");
      return;
    }

    setLoadingRelease(true);
    setReleaseError(null);
    try {
      const res = await fetch(`https://api.github.com/repos/${cleaned}/releases/latest`);
      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? "No GitHub Release found yet. Push to GitHub and wait ~3 min for the Build KaryoOS Android APK workflow to finish."
            : `GitHub API returned HTTP ${res.status}`
        );
      }
      const data = (await res.json()) as GithubRelease;
      setRelease(data);
    } catch (err) {
      setReleaseError(err instanceof Error ? err.message : "Failed to fetch release");
      setRelease(null);
    } finally {
      setLoadingRelease(false);
    }
  };

  const apkAssets = release?.assets?.filter((a) => a.name.endsWith(".apk")) ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left: Netlify + GitHub Actions APK Download Portal */}
      <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="pb-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-teal-700" />
              Netlify & Android APK Download Portal
            </h2>
            <p className="text-xs text-slate-500 mt-1 tabular-nums">
              {totalAndroidFiles} Android files ready · Netlify static build (netlify.toml) + GitHub Actions Cloud APK Compiler
            </p>
          </div>
          <button
            type="button"
            onClick={onExportZip}
            className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Download APK-Ready ZIP
          </button>
        </div>

        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-2 leading-relaxed">
          <div className="font-semibold text-slate-900">
            How APK Building & Netlify Hosting Connect:
          </div>
          <p>
            Netlify serves static web bundles (<code>dist/</code>) and does not run the Android SDK/Gradle JVM toolchain during static site builds. To let you host this portal on <strong>Netlify</strong> and download a genuine, installable <strong>.apk</strong> file from here, this project includes{" "}
            <code className="font-mono text-slate-900">.github/workflows/build-android-apk.yml</code>.
          </p>
          <p>
            Once you push to GitHub, GitHub Actions compiles{" "}
            <code className="font-mono">app-debug.apk</code> &{" "}
            <code className="font-mono">app-release-unsigned.apk</code> automatically in ~3 minutes and publishes them to Releases. Connect your repo below to download the APK directly from your Netlify site.
          </p>
        </div>

        {/* Connect GitHub Repo to Pull Compiled APK */}
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-slate-800">
            Connect Your GitHub Repo for Direct APK Download
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
              placeholder="owner/repo (e.g. username/karyoos-agent)"
              className="flex-1 min-w-[220px] rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono focus:outline-none focus:border-teal-600"
            />
            <button
              type="button"
              onClick={fetchLatestApk}
              disabled={loadingRelease || !githubRepo.trim()}
              className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingRelease ? "animate-spin" : ""}`} />
              Fetch Latest APK
            </button>
          </div>

          {releaseError && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>{releaseError}</span>
            </div>
          )}

          {release && (
            <div className="border border-emerald-200 bg-emerald-50/50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    {release.name || release.tag_name}
                  </div>
                  <div className="text-xs text-slate-500 tabular-nums mt-0.5">
                    Tag: {release.tag_name} · Published {new Date(release.published_at).toLocaleDateString()}
                  </div>
                </div>
                <a
                  href={release.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-teal-800 hover:underline flex items-center gap-1"
                >
                  Release Page
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {apkAssets.length === 0 ? (
                <div className="text-xs text-slate-600">
                  Release found, but no .apk assets attached yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {apkAssets.map((asset) => (
                    <a
                      key={asset.name}
                      href={asset.browser_download_url}
                      className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200 hover:border-teal-600 transition-colors"
                    >
                      <div>
                        <div className="text-xs font-mono font-semibold text-slate-900">
                          {asset.name}
                        </div>
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          {(asset.size / (1024 * 1024)).toFixed(2)} MB · Ready for Android 8.0+
                        </div>
                      </div>
                      <span className="px-3 py-1.5 rounded-md bg-teal-700 text-white text-xs font-semibold flex items-center gap-1.5">
                        <Download className="w-3.5 h-3.5" />
                        Download APK
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Local Gradle CLI Commands */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-800">
            Option 2: Build APK Locally via Android Studio or Gradle CLI
          </div>
          <pre className="p-3.5 rounded-lg bg-slate-950 text-slate-200 text-xs font-mono overflow-x-auto leading-relaxed">
{`cd android-app
gradle assembleDebug --no-daemon
# Output APK:
# android-app/app/build/outputs/apk/debug/app-debug.apk`}
          </pre>
        </div>
      </div>

      {/* Right: Step-by-Step Setup & Post-Install Guide */}
      <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="pb-3 border-b border-slate-200">
          <h3 className="text-base font-bold text-slate-900">
            Setup, Install & Post-Install Checklist
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Follow these steps after downloading and installing the APK on your phone
          </p>
        </div>

        <ol className="space-y-3 text-xs text-slate-700 leading-relaxed">
          <li className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <strong className="text-slate-900 block mb-0.5">
              01. Deploy Portal to Netlify + Build APK on GitHub
            </strong>
            Push this repo to GitHub. GitHub Actions automatically runs{" "}
            <code className="font-mono">build-android-apk.yml</code> to compile the APK, while Netlify runs{" "}
            <code className="font-mono">npm run build</code> using <code className="font-mono">netlify.toml</code>.
          </li>

          <li className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <strong className="text-slate-900 block mb-0.5">
              02. Install APK on Android
            </strong>
            Open the downloaded <code className="font-mono">app-debug.apk</code> on your phone and allow{" "}
            <em>Install Unknown Apps</em> for your browser or file manager.
          </li>

          <li className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <strong className="text-slate-900 block mb-0.5">
              03. Add 5 Free Gemini Keys + 1 OpenRouter Key
            </strong>
            Inside the Android app, open the <strong>Settings</strong> tab {"->"} enter your 5 free Gemini API keys (from 5 Gmail accounts) and 1 OpenRouter API key. They are encrypted with AES-256 on your phone.
          </li>

          <li className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <strong className="text-slate-900 block mb-0.5">
              04. Enable Accessibility, Mic & Video Permissions
            </strong>
            Tap <strong>Enable Accessibility Service</strong> inside Settings and turn on{" "}
            <em>KaryoOS Virtual Limbs Service</em>. Allow Microphone and Media/Video access when prompted, and set Battery usage to <em>Unrestricted</em> for WorkManager tasks.
          </li>

          <li className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <strong className="text-slate-900 block mb-0.5">
              05. Select Virtual Mobile RAM (1 GB – 16 GB) & Skills
            </strong>
            In the <strong>Settings</strong> tab, choose your Virtual RAM allocation (e.g., 4 GB on an 8 GB phone), toggle your Virtual Mobile Skills (including Media3 Video Editing), fill your <strong>Vault</strong> details, and give commands from the clean front screen.
          </li>
        </ol>
      </div>
    </div>
  );
};
