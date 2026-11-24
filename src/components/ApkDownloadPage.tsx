import React, { useEffect, useState } from "react";
import { Download, CheckCircle2, Smartphone, ShieldCheck, AlertCircle, RefreshCw } from "lucide-react";

interface ApkManifest {
  packageId: string;
  fileName: string;
  versionTag: string;
  hasLocalApk: boolean;
  apkPath: string;
  apkSizeBytes: number;
  githubRepo: string;
  releaseApkUrl: string;
}

const APP_ICON_URL = "/src/assets/images/karyoos_app_icon_1795547085760.jpg";

export const ApkDownloadPage: React.FC = () => {
  const [manifest, setManifest] = useState<ApkManifest | null>(null);
  const [iconFailed, setIconFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [repoInput, setRepoInput] = useState<string>(
    () => localStorage.getItem("karyo_apk_github_repo") || ""
  );
  const [showRepoLink, setShowRepoLink] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/apk-release.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ApkManifest | null) => {
        if (!active || !data) return;
        setManifest(data);
        if (data.githubRepo && !repoInput) {
          setRepoInput(data.githubRepo);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const triggerDownloadUrl = (url: string, filename: string) => {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const resolveGithubApk = async (repo: string): Promise<string | null> => {
    const cleaned = repo
      .trim()
      .replace(/^https?:\/\/github\.com\//i, "")
      .replace(/\.git$/i, "")
      .replace(/^\/+|\/+$/g, "");
    if (!cleaned.includes("/")) return null;

    const res = await fetch(`https://api.github.com/repos/${cleaned}/releases/latest`);
    if (!res.ok) return null;
    const data = await res.json();
    const asset = (data.assets || []).find(
      (a: { name?: string }) =>
        a.name === "KaryoOS-Agent.apk" || a.name?.endsWith(".apk")
    );
    return asset?.browser_download_url || null;
  };

  const handleDownloadApk = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setDownloading(true);

    try {
      if (manifest?.hasLocalApk && manifest.apkPath) {
        triggerDownloadUrl(manifest.apkPath, manifest.fileName || "KaryoOS-Agent.apk");
        setStatusMessage("KaryoOS-Agent.apk ডাউনলোড শুরু হয়েছে। ডাউনলোড শেষে ফোনে ইনস্টল করুন।");
        return;
      }

      if (manifest?.releaseApkUrl) {
        triggerDownloadUrl(manifest.releaseApkUrl, manifest.fileName || "KaryoOS-Agent.apk");
        setStatusMessage("KaryoOS-Agent.apk ডাউনলোড শুরু হয়েছে।");
        return;
      }

      const candidateRepo = repoInput.trim() || manifest?.githubRepo || "";
      if (candidateRepo) {
        const assetUrl = await resolveGithubApk(candidateRepo);
        if (assetUrl) {
          localStorage.setItem("karyo_apk_github_repo", candidateRepo);
          triggerDownloadUrl(assetUrl, "KaryoOS-Agent.apk");
          setStatusMessage("KaryoOS-Agent.apk ডাউনলোড শুরু হয়েছে।");
          setShowRepoLink(false);
          return;
        }
      }

      setShowRepoLink(true);
      setErrorMessage(
        "এই সাইটে এখনো কম্পাইল করা APK রিলিজ যুক্ত হয়নি। নিচে আপনার GitHub repo (owner/repo) যুক্ত করে Save করুন অথবা public/KaryoOS-Agent.apk আপলোড করুন।"
      );
    } catch {
      setShowRepoLink(true);
      setErrorMessage("APK রিলিজ খুঁজে পাওয়া যায়নি। GitHub repo সংযোগ পরীক্ষা করুন।");
    } finally {
      setDownloading(false);
    }
  };

  const handleSaveAndDownloadRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoInput.trim()) return;
    localStorage.setItem("karyo_apk_github_repo", repoInput.trim());
    await handleDownloadApk();
  };

  const sizeLabel =
    manifest?.hasLocalApk && manifest.apkSizeBytes > 0
      ? `${(manifest.apkSizeBytes / (1024 * 1024)).toFixed(1)} MB`
      : "Android Installer (.apk)";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Clean 3-Zone Top Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            KaryoOS
          </a>

          <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a
              href="#download"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Download
            </a>
            <a
              href="#install-steps"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Install Guide
            </a>
            <a
              href="#requirements"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Requirements
            </a>
          </nav>

          <button
            type="button"
            onClick={handleDownloadApk}
            disabled={downloading}
            className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:bg-slate-400 text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Download APK
          </button>
        </div>
      </header>

      <main id="top" className="max-w-[1200px] w-full mx-auto px-6 py-14 flex-1 space-y-16">
        {/* Hero Download Section */}
        <section
          id="download"
          className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch bg-white border border-slate-200 rounded-2xl p-8 md:p-12"
        >
          <div className="lg:col-span-7 flex flex-col justify-center space-y-6">
            <div className="text-xs font-medium text-slate-500 tabular-nums">
              Android Application Package · {manifest?.versionTag || "v1.0"} · {sizeLabel}
            </div>

            <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 leading-[1.12] text-balance">
              KaryoOS Android App ডাউনলোড করুন
            </h1>

            <p className="text-base text-slate-600 leading-relaxed max-w-xl">
              অফিশিয়াল Android ইনস্টলার (<span className="font-mono text-slate-800">KaryoOS-Agent.apk</span>) সরাসরি আপনার ফোনে ডাউনলোড করে ইনস্টল করুন। ইনস্টল করার পর অ্যাপ ওপেন করে ভেতর থেকেই সব সেটিংস ও ব্যবহার শুরু করতে পারবেন।
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-1">
              <button
                type="button"
                onClick={handleDownloadApk}
                disabled={downloading}
                className="px-7 py-3.5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:bg-slate-400 text-white text-sm font-semibold flex items-center gap-2.5 transition-colors whitespace-nowrap shrink-0"
              >
                {downloading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {downloading ? "অপেক্ষা করুন..." : "Download KaryoOS APK"}
              </button>

              <span className="text-xs text-slate-500 tabular-nums">
                com.virtualos.agent · Android 8.0+
              </span>
            </div>

            {statusMessage && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2.5 max-w-xl">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <span>{statusMessage}</span>
              </div>
            )}

            {errorMessage && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-3 max-w-xl">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
                {showRepoLink && (
                  <form onSubmit={handleSaveAndDownloadRepo} className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={repoInput}
                      onChange={(e) => setRepoInput(e.target.value)}
                      placeholder="owner/repo (যেমন username/karyoos-app)"
                      className="flex-1 min-w-[200px] rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:border-teal-700"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap shrink-0"
                    >
                      Save & Download
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* App Package Emblem Card (No Internal App Screens Shown) */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center bg-slate-50 border border-slate-200 rounded-xl p-8 text-center space-y-5">
            {!iconFailed ? (
              <img
                src={APP_ICON_URL}
                alt="KaryoOS Android App Icon"
                referrerPolicy="no-referrer"
                onError={() => setIconFailed(true)}
                className="w-40 h-40 rounded-3xl object-cover border border-slate-200 shadow-sm"
              />
            ) : (
              <div className="w-40 h-40 rounded-3xl bg-slate-900 flex items-center justify-center text-teal-400">
                <Smartphone className="w-16 h-16" />
              </div>
            )}

            <div className="space-y-1">
              <div className="text-base font-bold text-slate-900">KaryoOS for Android</div>
              <div className="text-xs font-mono text-slate-500">KaryoOS-Agent.apk</div>
            </div>

            <div className="w-full pt-4 border-t border-slate-200 grid grid-cols-2 gap-4 text-left text-xs">
              <div>
                <div className="text-slate-500">Package ID</div>
                <div className="font-mono font-medium text-slate-900 mt-0.5 truncate">
                  com.virtualos.agent
                </div>
              </div>
              <div>
                <div className="text-slate-500">Architecture</div>
                <div className="font-medium text-slate-900 mt-0.5">Universal APK</div>
              </div>
            </div>
          </div>
        </section>

        {/* Simple 3-Step Install Guide (No internal app configuration exposed) */}
        <section id="install-steps" className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">ইনস্টল করার নিয়ম</h2>
            <p className="text-sm text-slate-600 mt-1">
              মাত্র ৩টি সহজ ধাপে আপনার ফোনে অ্যাপটি ডাউনলোড ও ইনস্টল করুন।
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2">
              <div className="text-xs font-semibold text-teal-800 tabular-nums">01. Download</div>
              <h3 className="text-base font-bold text-slate-900">APK ফাইল ডাউনলোড করুন</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                উপরের Download KaryoOS APK বাটনে ক্লিক করে সরাসরি আপনার অ্যান্ড্রয়েড ফোনে ইনস্টলার ফাইলটি ডাউনলোড করুন।
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2">
              <div className="text-xs font-semibold text-teal-800 tabular-nums">02. Install</div>
              <h3 className="text-base font-bold text-slate-900">ফোনে ইনস্টল করুন</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                ডাউনলোড হওয়া APK ফাইলে ট্যাপ করুন এবং প্রয়োজন হলে ব্রাউজার বা ফাইল ম্যানেজারের জন্য Install Unknown Apps অনুমতি দিন।
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2">
              <div className="text-xs font-semibold text-teal-800 tabular-nums">03. Launch</div>
              <h3 className="text-base font-bold text-slate-900">অ্যাপ ওপেন করে সেটআপ করুন</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                ইনস্টল সম্পন্ন হলে হোম স্ক্রিন থেকে KaryoOS অ্যাপ চালু করুন। অ্যাপের ভেতরেই প্রয়োজনীয় সব সেটিংস ও ব্যবহারের সুবিধা পাবেন।
              </p>
            </div>
          </div>
        </section>

        {/* System Requirements */}
        <section
          id="requirements"
          className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-6"
        >
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">সিস্টেম রিকোয়ারমেন্টস</h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Android 8.0 (Oreo) বা তার পরবর্তী যেকোনো ভার্সন · কমপক্ষে ১০০ MB ফ্রি স্টোরেজ · ARM64 / ARMv7 ডিভাইস সাপোর্ট
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDownloadApk}
            disabled={downloading}
            className="px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Download APK
          </button>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-[1200px] mx-auto px-6 py-5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>KaryoOS · Android Distribution Portal</span>
          <span className="font-mono">com.virtualos.agent</span>
        </div>
      </footer>
    </div>
  );
};
