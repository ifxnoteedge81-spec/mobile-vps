import React, { useState } from "react";
import {
  AccessibilityNode,
  AgentRunStatus,
  GuardrailRequest,
  VideoStudioState,
  VirtualAppItem,
  VirtualBrowserState,
} from "../types/agent";
import {
  Globe,
  Layers,
  Film,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Upload,
  LayoutGrid,
  ShoppingBag,
  Minimize2,
  Maximize2,
  Lock,
  Search,
  Download,
  Phone,
  MessageSquare,
} from "lucide-react";

export type VirtualLimbView = "apps" | "playstore" | "webview" | "accessibility" | "video";

interface AndroidDevicePreviewProps {
  browserState: VirtualBrowserState;
  activeLimbView: VirtualLimbView;
  onChangeLimbView: (view: VirtualLimbView) => void;
  activeAppKey: string;
  accessibilityNodes: AccessibilityNode[];
  highlightedNodeId: string;
  videoState: VideoStudioState;
  onAttachVideo: (file: File) => void;
  virtualApps: VirtualAppItem[];
  activeVirtualApp: VirtualAppItem | null;
  onInstallApp: (packageId: string) => void;
  onOpenVirtualApp: (app: VirtualAppItem) => void;
  onCloseVirtualApp: () => void;
  allocatedRamGb: number;
  status: AgentRunStatus;
  pendingGuardrail: GuardrailRequest | null;
  onResolveGuardrail: (approved: boolean) => void;
  onManualNavigate: (url: string) => void;
  isMinimized: boolean;
  onToggleMinimize: () => void;
  isLocked: boolean;
  hasPrivacyPin: boolean;
  onLockPhone: () => void;
  onUnlockWithPin: (pin: string) => boolean;
}

export const AndroidDevicePreview: React.FC<AndroidDevicePreviewProps> = ({
  browserState,
  activeLimbView,
  onChangeLimbView,
  activeAppKey,
  accessibilityNodes,
  highlightedNodeId,
  videoState,
  onAttachVideo,
  virtualApps,
  activeVirtualApp,
  onInstallApp,
  onOpenVirtualApp,
  onCloseVirtualApp,
  allocatedRamGb,
  status,
  pendingGuardrail,
  onResolveGuardrail,
  onManualNavigate,
  isMinimized,
  onToggleMinimize,
  isLocked,
  hasPrivacyPin,
  onLockPhone,
  onUnlockWithPin,
}) => {
  const [storeQuery, setStoreQuery] = useState("");
  const [pinAttempt, setPinAttempt] = useState("");
  const [pinError, setPinError] = useState(false);

  const isResearchPage = browserState.url.includes("research.karyo.local");
  const installedApps = virtualApps.filter((a) => a.installed);
  const filteredCatalog = virtualApps.filter((a) => {
    const q = storeQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      a.appName.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q) ||
      a.packageId.toLowerCase().includes(q)
    );
  });

  if (isMinimized) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Virtual Phone Running in Background
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              {allocatedRamGb} GB Virtual RAM · Status: {status} · {installedApps.length} apps inside
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleMinimize}
            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            Restore Phone
          </button>
        </div>
        <div className="p-3 rounded-lg bg-slate-950 text-slate-300 text-xs font-mono">
          Background Daemon Active — agent tasks, downloads, and scheduler continue even when minimized.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col h-full">
      {/* Header + Minimize / Lock Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Isolated Virtual Phone</h3>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            {allocatedRamGb} GB Sandbox · {installedApps.length} Apps Installed
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {hasPrivacyPin && !isLocked && (
            <button
              type="button"
              onClick={onLockPhone}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <Lock className="w-3.5 h-3.5" />
              Lock
            </button>
          )}
          <button
            type="button"
            onClick={onToggleMinimize}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            Minimize
          </button>
        </div>
      </div>

      {/* Inside-Phone Mode Switcher */}
      <div className="mt-3 flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
        {[
          { id: "apps", label: "Apps", icon: LayoutGrid },
          { id: "playstore", label: "Play Store", icon: ShoppingBag },
          { id: "webview", label: "Browser", icon: Globe },
          { id: "accessibility", label: "UI Tree", icon: Layers },
          { id: "video", label: "Video", icon: Film },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeLimbView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangeLimbView(tab.id as VirtualLimbView)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 ${
                active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Android Hardware Frame */}
      <div className="mt-3 mx-auto w-full max-w-[360px] bg-slate-950 rounded-[28px] p-3 border border-slate-800 shadow-sm flex-1 flex flex-col">
        <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-mono tabular-nums text-slate-400">
          <span>09:59</span>
          <span className="text-slate-300 font-medium truncate max-w-[140px]">{status}</span>
          <span>{allocatedRamGb}GB · PRIVATE</span>
        </div>

        <div className="relative bg-white rounded-[20px] overflow-hidden flex-1 flex flex-col min-h-[460px]">
          {isLocked ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-slate-950 text-white space-y-4">
              <Lock className="w-7 h-7 text-teal-400" />
              <div>
                <div className="text-sm font-bold">Private Virtual Phone Locked</div>
                <div className="text-xs text-slate-400 mt-1">
                  Enter your Privacy PIN to access isolated apps, credentials & memory.
                </div>
              </div>
              <input
                type="password"
                value={pinAttempt}
                onChange={(e) => {
                  setPinAttempt(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setPinError(false);
                }}
                placeholder="Enter PIN"
                className="w-40 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-center text-sm font-mono tracking-widest text-white"
              />
              {pinError && <div className="text-xs text-red-400">Incorrect PIN</div>}
              <button
                type="button"
                onClick={() => {
                  if (!onUnlockWithPin(pinAttempt)) {
                    setPinError(true);
                  } else {
                    setPinAttempt("");
                  }
                }}
                className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-xs font-semibold text-white"
              >
                Unlock Phone
              </button>
            </div>
          ) : (
            <>
              {/* Active Virtual App Overlay inside Phone */}
              {activeVirtualApp && activeLimbView === "apps" ? (
                <div className="flex flex-col h-full bg-slate-50">
                  <div className="bg-slate-900 text-white px-3 py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold">{activeVirtualApp.appName}</div>
                      <div className="text-[10px] font-mono text-slate-400">
                        Sandboxed Session · {activeVirtualApp.packageId}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onCloseVirtualApp}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px]"
                    >
                      Home
                    </button>
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between text-xs space-y-3">
                    <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2">
                      <div className="font-semibold text-slate-900 flex items-center gap-2">
                        {activeVirtualApp.category.includes("Call") ? (
                          <Phone className="w-4 h-4 text-teal-700" />
                        ) : (
                          <MessageSquare className="w-4 h-4 text-teal-700" />
                        )}
                        <span>{activeVirtualApp.appName} Running Inside KaryoOS</span>
                      </div>
                      <p className="text-slate-600 leading-relaxed">
                        Isolated container endpoint:{" "}
                        <span className="font-mono text-slate-900">{activeVirtualApp.webUrl}</span>
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Credentials, session notes, and saved contacts stay isolated inside this Virtual Phone and encrypted Vault.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => {
                          onManualNavigate(activeVirtualApp.webUrl);
                          onChangeLimbView("webview");
                        }}
                        className="w-full py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold"
                      >
                        Open {activeVirtualApp.appName} Web Container
                      </button>
                      <button
                        type="button"
                        onClick={onCloseVirtualApp}
                        className="w-full py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-medium"
                      >
                        Back to App Drawer
                      </button>
                    </div>
                  </div>
                </div>
              ) : activeLimbView === "apps" ? (
                <div className="flex flex-col h-full bg-slate-50">
                  <div className="bg-slate-900 text-white px-3 py-2.5 flex items-center justify-between text-xs">
                    <span className="font-semibold">Virtual Phone Drawer</span>
                    <button
                      type="button"
                      onClick={() => onChangeLimbView("playstore")}
                      className="text-[11px] text-teal-300 hover:underline font-medium"
                    >
                      + Get Apps (Play Store)
                    </button>
                  </div>
                  <div className="p-3 grid grid-cols-2 gap-2.5 overflow-y-auto flex-1 content-start">
                    {installedApps.map((app) => (
                      <button
                        key={app.packageId}
                        type="button"
                        onClick={() => onOpenVirtualApp(app)}
                        className="p-3 rounded-xl bg-white border border-slate-200 hover:border-teal-600 text-left space-y-1 transition-colors"
                      >
                        <div className="text-xs font-bold text-slate-900 truncate">{app.appName}</div>
                        <div className="text-[10px] text-slate-500 truncate">{app.category}</div>
                        <div className="text-[10px] font-mono text-teal-700">Open Inside</div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : activeLimbView === "playstore" ? (
                <div className="flex flex-col h-full bg-slate-50">
                  <div className="bg-white px-3 py-2.5 border-b border-slate-200 space-y-2">
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <ShoppingBag className="w-3.5 h-3.5 text-teal-700" />
                      Built-in Virtual Play Store
                    </div>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={storeQuery}
                        onChange={(e) => setStoreQuery(e.target.value)}
                        placeholder="Search WhatsApp, imo, Calling..."
                        className="w-full rounded-lg border border-slate-300 bg-slate-50 pl-8 pr-2.5 py-1.5 text-xs focus:outline-none focus:border-teal-600"
                      />
                    </div>
                  </div>
                  <div className="p-3 space-y-2 overflow-y-auto flex-1">
                    {filteredCatalog.map((app) => (
                      <div
                        key={app.packageId}
                        className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {app.appName}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {app.category} · v{app.version}
                          </div>
                        </div>
                        {app.installed ? (
                          <button
                            type="button"
                            onClick={() => onOpenVirtualApp(app)}
                            className="px-2.5 py-1.5 rounded-lg border border-teal-700 text-teal-800 text-[11px] font-semibold whitespace-nowrap shrink-0"
                          >
                            Open
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onInstallApp(app.packageId)}
                            className="px-2.5 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
                          >
                            <Download className="w-3 h-3" />
                            Install
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : activeLimbView === "webview" ? (
                <div className="flex flex-col h-full">
                  <div className="bg-slate-100 px-3 py-2 border-b border-slate-200 flex items-center gap-2">
                    <span className="text-[11px] font-mono text-slate-600 truncate flex-1">
                      {browserState.url}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onManualNavigate(
                          isResearchPage
                            ? "https://jobs.karyo.local/apply"
                            : "https://research.karyo.local/android-4gb"
                        )
                      }
                      className="text-[11px] font-medium text-teal-700 hover:text-teal-900 whitespace-nowrap shrink-0"
                    >
                      {isResearchPage ? "Job Portal" : "Research Page"}
                    </button>
                  </div>

                  <div className="p-3.5 overflow-y-auto flex-1 space-y-3 text-xs">
                    {isResearchPage ? (
                      <article className="space-y-2.5 text-slate-700 leading-relaxed">
                        <h4 className="text-sm font-bold text-slate-900">
                          Low-Memory AI Automation on Android Devices
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          research.karyo.local · Technical Brief
                        </p>
                        <p>
                          1. Enforce single-coroutine execution locks so WebView and Accessibility trees never contend simultaneously.
                        </p>
                        <p>
                          2. Cap AccessibilityNodeInfo traversals and store 5 Gmail Gemini keys + 1 OpenRouter key in AES-256 storage.
                        </p>
                      </article>
                    ) : (
                      <div className="space-y-2.5">
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">
                            {browserState.title}
                          </h4>
                          <p className="text-[11px] text-slate-500">
                            Sandboxed WebView DOM · #fullName, #email, #phone, #portfolio, #coverNote
                          </p>
                        </div>

                        {browserState.formFields.submitted ? (
                          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-1">
                            <div className="font-semibold flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              Application Submitted
                            </div>
                            <p className="text-[11px]">
                              Submitted for {browserState.formFields.fullName || "Applicant"} after operator approval.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {[
                              { id: "#fullName", label: "Full Name", val: browserState.formFields.fullName },
                              { id: "#email", label: "Email Address", val: browserState.formFields.email },
                              { id: "#phone", label: "Phone Number", val: browserState.formFields.phone },
                              { id: "#portfolio", label: "Portfolio / GitHub", val: browserState.formFields.portfolio },
                            ].map((field) => {
                              const isActive = browserState.activeSelector === field.id;
                              return (
                                <div key={field.id} className="space-y-1">
                                  <div className="flex items-center justify-between text-[11px] text-slate-600">
                                    <span>{field.label}</span>
                                    <span className="font-mono text-slate-400">{field.id}</span>
                                  </div>
                                  <div
                                    className={`px-2.5 py-1.5 rounded-md border text-xs min-h-[30px] flex items-center ${
                                      isActive
                                        ? "border-teal-600 bg-teal-50/40 text-slate-900 ring-1 ring-teal-500"
                                        : "border-slate-200 bg-slate-50 text-slate-800"
                                    }`}
                                  >
                                    {field.val || <span className="text-slate-400">Empty</span>}
                                  </div>
                                </div>
                              );
                            })}

                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px] text-slate-600">
                                <span>Cover Note</span>
                                <span className="font-mono text-slate-400">#coverNote</span>
                              </div>
                              <div
                                className={`px-2.5 py-1.5 rounded-md border text-[11px] min-h-[54px] ${
                                  browserState.activeSelector === "#coverNote"
                                    ? "border-teal-600 bg-teal-50/40 text-slate-900 ring-1 ring-teal-500"
                                    : "border-slate-200 bg-slate-50 text-slate-800"
                                }`}
                              >
                                {browserState.formFields.coverNote || (
                                  <span className="text-slate-400">Waiting for agent input...</span>
                                )}
                              </div>
                            </div>

                            <div
                              className={`mt-2 w-full py-2 rounded-lg text-center font-semibold text-xs ${
                                browserState.activeSelector === "#submitApplication"
                                  ? "bg-amber-600 text-white ring-2 ring-amber-400"
                                  : "bg-slate-900 text-white"
                              }`}
                            >
                              Submit Application (#submitApplication)
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : activeLimbView === "accessibility" ? (
                <div className="flex flex-col h-full bg-slate-50">
                  <div className="bg-slate-900 text-white px-3 py-2 text-[11px] font-mono">
                    Window: {activeAppKey} · AccessibilityNodeInfo Tree
                  </div>
                  <div className="p-3 space-y-2 overflow-y-auto flex-1">
                    {accessibilityNodes.map((node) => {
                      const isActive =
                        highlightedNodeId &&
                        (node.resourceId.toLowerCase().includes(highlightedNodeId.toLowerCase()) ||
                          node.text.toLowerCase().includes(highlightedNodeId.toLowerCase()));
                      return (
                        <div
                          key={node.id}
                          className={`p-2.5 rounded-lg border text-[11px] space-y-1 ${
                            isActive
                              ? "bg-teal-50 border-teal-600 ring-1 ring-teal-500"
                              : "bg-white border-slate-200"
                          }`}
                        >
                          <div className="flex items-center justify-between font-mono text-slate-800">
                            <span className="font-semibold">
                              [{node.className}] #{node.resourceId}
                            </span>
                            <span className="text-slate-400 tabular-nums">{node.bounds}</span>
                          </div>
                          <div className="text-slate-700">{node.text}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {[
                              node.clickable ? "clickable" : null,
                              node.editable ? "editable" : null,
                              node.scrollable ? "scrollable" : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "static"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col h-full bg-slate-50">
                  <div className="bg-slate-900 text-white px-3 py-2 text-[11px] font-mono flex items-center justify-between">
                    <span>Media3 Transformer v1.5.1</span>
                    <span>{videoState.targetResolution}</span>
                  </div>
                  <div className="p-3.5 space-y-3 overflow-y-auto flex-1 text-xs">
                    <div className="rounded-xl bg-slate-950 text-slate-100 p-4 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                        <span>VIRTUAL VIDEO CANVAS</span>
                        <span className="tabular-nums">
                          {videoState.muted ? "MUTED" : "AUDIO ON"}
                        </span>
                      </div>
                      <div className="py-5 text-center border border-dashed border-slate-700 rounded-lg px-3">
                        {videoState.attachedFileName ? (
                          <div className="space-y-1">
                            <div className="font-mono text-teal-300 font-semibold truncate">
                              {videoState.attachedFileName}
                            </div>
                            <div className="text-[11px] text-slate-400 tabular-nums">
                              {videoState.attachedSizeMb.toFixed(2)} MB · {videoState.targetResolution}
                            </div>
                            {videoState.watermarkText && (
                              <div className="mt-2 inline-block px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-amber-300">
                                Watermark: {videoState.watermarkText}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-slate-400 text-[11px]">
                            No video file attached. Attach a clip below to test Media3 video commands.
                          </div>
                        )}
                      </div>
                    </div>

                    <label className="w-full py-2 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{videoState.attachedFileName ? "Replace Video Clip" : "Attach Video Clip"}</span>
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) onAttachVideo(file);
                        }}
                      />
                    </label>

                    <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-1.5 text-[11px]">
                      <div className="font-semibold text-slate-900">Pipeline State</div>
                      <div className="text-slate-600">{videoState.lastOperation}</div>
                      {videoState.outputFilePath && (
                        <div className="font-mono text-teal-800 break-all">
                          Output: {videoState.outputFilePath}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Guardrail Overlay Inside Device */}
              {pendingGuardrail && (
                <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-[1px] flex items-end p-3 z-20">
                  <div className="bg-white w-full rounded-2xl p-4 border border-slate-200 space-y-3 shadow-lg">
                    <div className="flex items-start gap-2.5">
                      <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">
                          Guardrail Approval · {pendingGuardrail.riskLevel}
                        </h4>
                        <p className="text-xs text-slate-600 mt-0.5">{pendingGuardrail.reason}</p>
                      </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-[11px] font-mono space-y-1 text-slate-700">
                      <div>Action: {pendingGuardrail.action}</div>
                      {pendingGuardrail.target && <div>Target: {pendingGuardrail.target}</div>}
                      {pendingGuardrail.proposedValue && (
                        <div className="truncate">Value: {pendingGuardrail.proposedValue}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onResolveGuardrail(false)}
                        className="flex-1 py-2 px-3 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 flex items-center justify-center gap-1.5"
                      >
                        <XCircle className="w-3.5 h-3.5 text-red-600" />
                        Deny
                      </button>
                      <button
                        type="button"
                        onClick={() => onResolveGuardrail(true)}
                        className="flex-1 py-2 px-3 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approve
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="pt-2.5 pb-1 flex justify-center">
          <div className="w-24 h-1 rounded-full bg-slate-700" />
        </div>
      </div>
    </div>
  );
};
