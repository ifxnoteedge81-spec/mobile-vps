import React, { useMemo, useState } from "react";
import { AndroidSourceFile } from "../types/agent";
import { Copy, Check, Download, Search, FileCode2 } from "lucide-react";

interface AndroidCodeExplorerTabProps {
  files: AndroidSourceFile[];
  loading: boolean;
  error: string | null;
  onExportZip: () => void;
}

export const AndroidCodeExplorerTab: React.FC<AndroidCodeExplorerTabProps> = ({
  files,
  loading,
  error,
  onExportZip,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPath, setSelectedPath] = useState<string>(
    "app/src/main/java/com/virtualos/agent/agent/AgentOrchestrator.kt"
  );
  const [copied, setCopied] = useState(false);

  const filteredFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return files;
    return files.filter(
      (f) => f.path.toLowerCase().includes(q) || f.name.toLowerCase().includes(q)
    );
  }, [files, searchQuery]);

  const activeFile =
    files.find((f) => f.path === selectedPath) ?? filteredFiles[0] ?? files[0];

  const handleCopy = async () => {
    if (!activeFile) return;
    await navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-sm text-slate-600">
        Loading Android Studio project files...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-red-200 rounded-xl p-6 text-sm text-red-700">
        Failed to load Android project files: {error}
      </div>
    );
  }

  const lines = activeFile ? activeFile.content.split("\n") : [];

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
      {/* Header Bar */}
      <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Complete Android Kotlin & Compose Codebase
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            android-app/ · {files.length} production files · Kotlin 2.1 · Compose Material 3 · WorkManager · Room · AccessibilityService
          </p>
        </div>

        <button
          type="button"
          onClick={onExportZip}
          className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          Download Android Studio ZIP
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[600px]">
        {/* Sidebar Tree */}
        <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col bg-slate-50">
          <div className="p-3 border-b border-slate-200">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter Kotlin, XML, or Gradle files..."
                className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-teal-600"
              />
            </div>
          </div>

          <div className="overflow-y-auto flex-1 max-h-[580px] divide-y divide-slate-100">
            {filteredFiles.map((file) => {
              const isSelected = activeFile?.path === file.path;
              const shortFolder = file.folder.replace("app/src/main/java/com/virtualos/agent", "src");
              return (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => setSelectedPath(file.path)}
                  className={`w-full text-left px-3.5 py-2.5 transition-colors flex items-start justify-between gap-2 ${
                    isSelected ? "bg-white text-teal-800 font-semibold" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs flex items-center gap-1.5 truncate">
                      <FileCode2 className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{file.name}</span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                      {shortFolder}
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 tabular-nums shrink-0">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Code Viewer */}
        <div className="lg:col-span-8 flex flex-col bg-slate-950 text-slate-100">
          {activeFile && (
            <>
              <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-4">
                <div className="text-xs font-mono text-slate-300 truncate">
                  {activeFile.path}
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-3 py-1 rounded border border-slate-700 hover:bg-slate-800 text-xs text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy File
                    </>
                  )}
                </button>
              </div>

              <div className="overflow-auto flex-1 max-h-[580px] p-4 font-mono text-xs leading-relaxed">
                <table className="w-full border-collapse">
                  <tbody>
                    {lines.map((line, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/60">
                        <td className="select-none pr-4 text-right text-slate-600 tabular-nums w-10 align-top">
                          {idx + 1}
                        </td>
                        <td className="whitespace-pre text-slate-200">{line || " "}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
