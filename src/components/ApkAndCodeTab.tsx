import React, { useState } from "react";
import { AndroidSourceFile } from "../types/agent";
import { ApkPortalTab } from "./ApkPortalTab";
import { AndroidCodeExplorerTab } from "./AndroidCodeExplorerTab";
import { Smartphone, Code2 } from "lucide-react";

interface ApkAndCodeTabProps {
  files: AndroidSourceFile[];
  loading: boolean;
  error: string | null;
  onExportZip: () => void;
}

export const ApkAndCodeTab: React.FC<ApkAndCodeTabProps> = ({
  files,
  loading,
  error,
  onExportZip,
}) => {
  const [subView, setSubView] = useState<"apk" | "code">("apk");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl px-4 py-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setSubView("apk")}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              subView === "apk"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            Netlify & APK Download
          </button>
          <button
            type="button"
            onClick={() => setSubView("code")}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              subView === "code"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            Android Studio Code ({files.length})
          </button>
        </div>

        <span className="text-xs text-slate-500 hidden sm:inline tabular-nums">
          android-app/ · Kotlin 2.1 · Media3 Transformer 1.5.1 · Compose
        </span>
      </div>

      {subView === "apk" ? (
        <ApkPortalTab totalAndroidFiles={files.length} onExportZip={onExportZip} />
      ) : (
        <AndroidCodeExplorerTab
          files={files}
          loading={loading}
          error={error}
          onExportZip={onExportZip}
        />
      )}
    </div>
  );
};
