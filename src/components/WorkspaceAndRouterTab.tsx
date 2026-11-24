import React, { useState } from "react";
import { WorkspaceFile } from "../types/agent";
import { FileText, Plus, Trash2, Save, FolderOpen } from "lucide-react";

interface WorkspaceTabProps {
  files: WorkspaceFile[];
  onSaveFile: (path: string, content: string) => void;
  onDeleteFile: (path: string) => void;
}

const WORKSPACE_FOLDERS = ["research", "drafts", "scripts", "media", "history"];

export const WorkspaceAndRouterTab: React.FC<WorkspaceTabProps> = ({
  files,
  onSaveFile,
  onDeleteFile,
}) => {
  const [selectedPath, setSelectedPath] = useState<string>(files[0]?.path ?? "");
  const [newPath, setNewPath] = useState("drafts/new_note.md");
  const [creatingNew, setCreatingNew] = useState(false);

  const activeFile = files.find((f) => f.path === selectedPath) ?? files[0];
  const [editorText, setEditorText] = useState(activeFile?.content ?? "");

  const handleSelectFile = (file: WorkspaceFile) => {
    setCreatingNew(false);
    setSelectedPath(file.path);
    setEditorText(file.content);
  };

  const handleCreateSubmit = () => {
    const clean = newPath.trim();
    if (!clean) return;
    onSaveFile(clean, editorText || "# New Workspace File\n");
    setSelectedPath(clean);
    setCreatingNew(false);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Sandboxed Virtual Workspace
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            filesDir/agent_workspace/ · {files.length} files stored locally across research/, drafts/, scripts/, media/, history/
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setCreatingNew(true);
            setEditorText("");
          }}
          className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          New File
        </button>
      </div>

      {/* Sandboxed Folder Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {WORKSPACE_FOLDERS.map((folder) => {
          const count = files.filter((f) => f.folder === folder).length;
          return (
            <div
              key={folder}
              className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
            >
              <span className="font-mono font-semibold text-slate-800 flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5 text-teal-700" />
                {folder}/
              </span>
              <span className="font-mono text-slate-500 tabular-nums">{count}</span>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
          {files.length === 0 ? (
            <div className="p-4 text-xs text-slate-500">
              Workspace is empty. Create a file or run an agent task.
            </div>
          ) : (
            files.map((file) => {
              const isSelected = !creatingNew && activeFile?.path === file.path;
              return (
                <div
                  key={file.path}
                  onClick={() => handleSelectFile(file)}
                  className={`p-3 cursor-pointer transition-colors flex items-start justify-between gap-2 ${
                    isSelected ? "bg-teal-50/70" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 truncate flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{file.path}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
                      {file.content.length} chars · {file.updatedAt}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteFile(file.path);
                    }}
                    title="Delete file (Guardrail protected)"
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="lg:col-span-7 flex flex-col gap-3">
          {creatingNew ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="research/topic.md"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono"
              />
              <button
                type="button"
                onClick={handleCreateSubmit}
                className="px-3 py-1.5 rounded-lg bg-teal-700 text-white text-xs font-semibold whitespace-nowrap shrink-0"
              >
                Create
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono font-semibold text-slate-800 truncate">
                {activeFile ? activeFile.path : "No file selected"}
              </span>
              {activeFile && (
                <button
                  type="button"
                  onClick={() => onSaveFile(activeFile.path, editorText)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-800 flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Changes
                </button>
              )}
            </div>
          )}

          <textarea
            value={editorText}
            onChange={(e) => setEditorText(e.target.value)}
            rows={18}
            className="w-full flex-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-mono text-slate-800 focus:outline-none focus:border-teal-600"
            placeholder="File content..."
          />
        </div>
      </div>
    </div>
  );
};
