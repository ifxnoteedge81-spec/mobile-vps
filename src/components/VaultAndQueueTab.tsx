import React, { useState } from "react";
import {
  CredentialEntry,
  MemoryNoteEntry,
  PaymentMethodEntry,
  ScheduledTask,
  UserProfileVault,
} from "../types/agent";
import {
  Play,
  Trash2,
  CalendarClock,
  UserCheck,
  KeyRound,
  CreditCard,
  BrainCircuit,
  Eye,
  EyeOff,
  Copy,
  Check,
  Sparkles,
} from "lucide-react";

interface VaultAndQueueTabProps {
  profile: UserProfileVault;
  onSaveProfile: (profile: UserProfileVault) => void;
  credentials: CredentialEntry[];
  onSaveCredential: (cred: Omit<CredentialEntry, "id" | "savedLocationPath" | "updatedAt">) => void;
  onDeleteCredential: (id: string) => void;
  paymentMethods: PaymentMethodEntry[];
  onSavePaymentMethod: (pm: Omit<PaymentMethodEntry, "id" | "savedLocationPath" | "updatedAt">) => void;
  onDeletePaymentMethod: (id: string) => void;
  memories: MemoryNoteEntry[];
  onSaveMemory: (mem: Omit<MemoryNoteEntry, "id" | "savedLocationPath" | "updatedAt">) => void;
  onDeleteMemory: (id: string) => void;
  tasks: ScheduledTask[];
  onAddTask: (task: Omit<ScheduledTask, "id" | "status">) => void;
  onDeleteTask: (id: string) => void;
  onRunTaskNow: (task: ScheduledTask) => void;
}

type VaultSubTab = "profile" | "credentials" | "payments" | "memory" | "scheduler";

function generateRandomPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
  const arr = new Uint32Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (x) => chars[x % chars.length]).join("");
}

export const VaultAndQueueTab: React.FC<VaultAndQueueTabProps> = ({
  profile,
  onSaveProfile,
  credentials,
  onSaveCredential,
  onDeleteCredential,
  paymentMethods,
  onSavePaymentMethod,
  onDeletePaymentMethod,
  memories,
  onSaveMemory,
  onDeleteMemory,
  tasks,
  onAddTask,
  onDeleteTask,
  onRunTaskNow,
}) => {
  const [subTab, setSubTab] = useState<VaultSubTab>("credentials");

  // Profile form state
  const [formState, setFormState] = useState<UserProfileVault>(profile);
  const [savedNotice, setSavedNotice] = useState(false);

  // Credential form state
  const [serviceName, setServiceName] = useState("");
  const [credCategory, setCredCategory] = useState<CredentialEntry["category"]>("APP_ACCOUNT");
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [credNotes, setCredNotes] = useState("");
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Payment method state
  const [pmLabel, setPmLabel] = useState("");
  const [pmProvider, setPmProvider] = useState("bKash");
  const [pmMaskedId, setPmMaskedId] = useState("");
  const [pmBilling, setPmBilling] = useState(profile.location);
  const [pmNotes, setPmNotes] = useState("");

  // Persistent memory state
  const [memTitle, setMemTitle] = useState("");
  const [memCategory, setMemCategory] = useState<MemoryNoteEntry["category"]>("IMPORTANT_NOTE");
  const [memContent, setMemContent] = useState("");

  // Task scheduler state
  const [newTitle, setNewTitle] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [isRecurring, setIsRecurring] = useState(true);
  const [intervalHours, setIntervalHours] = useState(12);
  const [requiresWifi, setRequiresWifi] = useState(true);

  const handleSaveVault = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveProfile(formState);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleAddCredential = (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceName.trim() || !usernameOrEmail.trim()) return;
    onSaveCredential({
      serviceName: serviceName.trim(),
      category: credCategory,
      usernameOrEmail: usernameOrEmail.trim(),
      secretValue: secretValue.trim() || generateRandomPassword(),
      notes: credNotes.trim(),
    });
    setServiceName("");
    setUsernameOrEmail("");
    setSecretValue("");
    setCredNotes("");
  };

  const handleAddPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pmLabel.trim() || !pmMaskedId.trim()) return;
    onSavePaymentMethod({
      label: pmLabel.trim(),
      provider: pmProvider.trim(),
      maskedIdentifier: pmMaskedId.trim(),
      billingAddress: pmBilling.trim(),
      notes: pmNotes.trim(),
    });
    setPmLabel("");
    setPmMaskedId("");
    setPmNotes("");
  };

  const handleAddMemory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!memTitle.trim() || !memContent.trim()) return;
    onSaveMemory({
      title: memTitle.trim(),
      category: memCategory,
      content: memContent.trim(),
    });
    setMemTitle("");
    setMemContent("");
  };

  const handleEnqueue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newPrompt.trim()) return;
    onAddTask({
      title: newTitle.trim(),
      prompt: newPrompt.trim(),
      isRecurring,
      intervalHours: Math.max(1, intervalHours),
      requiresWifi,
      requiresBatteryNotLow: true,
    });
    setNewTitle("");
    setNewPrompt("");
  };

  const copySecret = async (id: string, val: string) => {
    await navigator.clipboard.writeText(val);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="space-y-5">
      {/* Sub-navigation bar */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {[
            { id: "credentials", label: `Accounts & Passwords (${credentials.length})`, icon: KeyRound },
            { id: "memory", label: `AI Memory & Notes (${memories.length})`, icon: BrainCircuit },
            { id: "payments", label: `Payments (${paymentMethods.length})`, icon: CreditCard },
            { id: "profile", label: "Profile & Address", icon: UserCheck },
            { id: "scheduler", label: `Task Queue (${tasks.length})`, icon: CalendarClock },
          ].map((t) => {
            const Icon = t.icon;
            const active = subTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id as VaultSubTab)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {subTab === "credentials" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleAddCredential}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3.5"
          >
            <div className="pb-3 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">
                Save Account, Email & Password
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Agent auto-saves created credentials here and tells you the exact Vault path
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">App / Website Name</label>
              <input
                type="text"
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                placeholder="WhatsApp, Gmail, JobPortal..."
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Category</label>
              <select
                value={credCategory}
                onChange={(e) => setCredCategory(e.target.value as CredentialEntry["category"])}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs bg-white"
              >
                <option value="APP_ACCOUNT">App Account</option>
                <option value="EMAIL">Email</option>
                <option value="SOCIAL_MEDIA">Social Media</option>
                <option value="WEBSITE">Website</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Username / Email / Phone</label>
              <input
                type="text"
                value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)}
                placeholder="user@gmail.com or +88017..."
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-700">Password</label>
                <button
                  type="button"
                  onClick={() => setSecretValue(generateRandomPassword())}
                  className="text-[11px] font-semibold text-teal-700 hover:underline flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  Generate Strong
                </button>
              </div>
              <input
                type="text"
                value={secretValue}
                onChange={(e) => setSecretValue(e.target.value)}
                placeholder="Leave blank to auto-generate strong password"
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Notes</label>
              <input
                type="text"
                value={credNotes}
                onChange={(e) => setCredNotes(e.target.value)}
                placeholder="Recovery hint or account purpose"
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={!serviceName.trim() || !usernameOrEmail.trim()}
              className="w-full py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white text-xs font-semibold"
            >
              Save to Credential Vault
            </button>
          </form>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                Stored Accounts & Exact Locations
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {credentials.length} saved credentials · Masked by default
              </p>
            </div>

            {credentials.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
                No credentials saved yet. Ask the agent to create/save an account or add one manually on the left.
              </div>
            ) : (
              <div className="space-y-2.5">
                {credentials.map((cred) => {
                  const revealed = revealedId === cred.id;
                  return (
                    <div
                      key={cred.id}
                      className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 flex flex-wrap items-start justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="text-xs font-bold text-slate-900">
                          {cred.serviceName} · <span className="text-slate-500 font-normal">{cred.category}</span>
                        </div>
                        <div className="text-xs font-mono text-slate-700">
                          Username: {cred.usernameOrEmail}
                        </div>
                        <div className="text-xs font-mono text-slate-700">
                          Password: {revealed ? cred.secretValue : "••••••••••••••••"}
                        </div>
                        <div className="text-[11px] font-mono text-teal-800">
                          Location: {cred.savedLocationPath}
                        </div>
                        {cred.notes && (
                          <div className="text-[11px] text-slate-500">{cred.notes}</div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setRevealedId(revealed ? null : cred.id)}
                          className="p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-700"
                          title={revealed ? "Hide password" : "Reveal password"}
                        >
                          {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => copySecret(cred.id, cred.secretValue)}
                          className="p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-700"
                          title="Copy password"
                        >
                          {copiedId === cred.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteCredential(cred.id)}
                          className="p-1.5 rounded border border-slate-200 bg-white hover:bg-red-50 text-red-600"
                          title="Delete credential"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === "memory" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleAddMemory}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3.5"
          >
            <div className="pb-3 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">
                Save Long-Term AI Memory
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Save addresses, preferences, and rules once—agent remembers forever and improves automatically
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Title</label>
              <input
                type="text"
                value={memTitle}
                onChange={(e) => setMemTitle(e.target.value)}
                placeholder="Home Address, Work Email Style..."
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Category</label>
              <select
                value={memCategory}
                onChange={(e) => setMemCategory(e.target.value as MemoryNoteEntry["category"])}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs bg-white"
              >
                <option value="IMPORTANT_NOTE">Important Note</option>
                <option value="ADDRESS">Address / Location</option>
                <option value="PREFERENCE">User Preference</option>
                <option value="SKILL_EVOLUTION">Agent Improvement Rule</option>
                <option value="FACT">Personal Fact</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Memory Content</label>
              <textarea
                rows={4}
                value={memContent}
                onChange={(e) => setMemContent(e.target.value)}
                placeholder="Write details in বাংলা or English so you never have to repeat them..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={!memTitle.trim() || !memContent.trim()}
              className="w-full py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white text-xs font-semibold"
            >
              Save to Persistent Memory
            </button>
          </form>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                Active Memories Injected Into Every Command
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {memories.length} memories stored locally
              </p>
            </div>

            <div className="space-y-2.5">
              {memories.map((m) => (
                <div
                  key={m.id}
                  className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 flex items-start justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-slate-900">
                      [{m.category}] {m.title}
                    </div>
                    <div className="text-xs text-slate-700 whitespace-pre-wrap">{m.content}</div>
                    <div className="text-[11px] font-mono text-teal-800">
                      {m.savedLocationPath} · {m.updatedAt}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteMemory(m.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {subTab === "payments" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleAddPayment}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3.5"
          >
            <div className="pb-3 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">
                Payment Method Metadata
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Store masked wallet/card metadata. Actual payment clicks always require operator approval.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Label</label>
              <input
                type="text"
                value={pmLabel}
                onChange={(e) => setPmLabel(e.target.value)}
                placeholder="Personal bKash or Primary Visa"
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Provider</label>
              <input
                type="text"
                value={pmProvider}
                onChange={(e) => setPmProvider(e.target.value)}
                placeholder="bKash, Nagad, Visa, Mastercard"
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Masked Identifier (Last 4 / Masked Number)</label>
              <input
                type="text"
                value={pmMaskedId}
                onChange={(e) => setPmMaskedId(e.target.value)}
                placeholder="**** 4821 or 01711-***821"
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Billing Address</label>
              <input
                type="text"
                value={pmBilling}
                onChange={(e) => setPmBilling(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Notes</label>
              <input
                type="text"
                value={pmNotes}
                onChange={(e) => setPmNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={!pmLabel.trim() || !pmMaskedId.trim()}
              className="w-full py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white text-xs font-semibold"
            >
              Save Payment Metadata
            </button>
          </form>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">Saved Payment Methods</h3>
            </div>
            {paymentMethods.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
                No payment metadata configured yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {paymentMethods.map((pm) => (
                  <div
                    key={pm.id}
                    className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-slate-900">
                        {pm.label} · {pm.provider}
                      </div>
                      <div className="text-xs font-mono text-slate-700">{pm.maskedIdentifier}</div>
                      {pm.billingAddress && (
                        <div className="text-xs text-slate-600">Billing: {pm.billingAddress}</div>
                      )}
                      <div className="text-[11px] font-mono text-teal-800">
                        Location: {pm.savedLocationPath}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeletePaymentMethod(pm.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === "profile" && (
        <form
          onSubmit={handleSaveVault}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 max-w-3xl"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-teal-700" />
                User Profile & Address Vault
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Injected automatically into the agent OBSERVE context for forms and drafts
              </p>
            </div>
            {savedNotice && (
              <span className="text-xs font-medium text-emerald-700">Saved to Vault</span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { key: "fullName", label: "Full Name" },
              { key: "email", label: "Email" },
              { key: "phone", label: "Phone" },
              { key: "location", label: "Full Address / Location" },
              { key: "headline", label: "Headline" },
              { key: "portfolioUrl", label: "Portfolio / GitHub URL" },
            ].map((item) => (
              <div key={item.key} className="space-y-1">
                <label className="text-xs font-medium text-slate-700">{item.label}</label>
                <input
                  type="text"
                  value={formState[item.key as keyof UserProfileVault]}
                  onChange={(e) =>
                    setFormState({ ...formState, [item.key]: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-teal-600"
                />
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Education</label>
            <input
              type="text"
              value={formState.education}
              onChange={(e) => setFormState({ ...formState, education: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-teal-600"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Work Experience</label>
            <textarea
              rows={2}
              value={formState.workExperience}
              onChange={(e) => setFormState({ ...formState, workExperience: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-teal-600"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Skills</label>
            <input
              type="text"
              value={formState.skills}
              onChange={(e) => setFormState({ ...formState, skills: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-teal-600"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">
              Custom Agent Instructions (BN / EN)
            </label>
            <textarea
              rows={2}
              value={formState.customInstructions}
              onChange={(e) =>
                setFormState({ ...formState, customInstructions: e.target.value })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-teal-600"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition-colors"
          >
            Save Profile Vault
          </button>
        </form>
      )}

      {subTab === "scheduler" && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4 max-w-3xl">
          <div className="pb-3 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-teal-700" />
              Task Queue & WorkManager Scheduler
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Queue one-off jobs or recurring routines with Android battery & network constraints
            </p>
          </div>

          <form
            onSubmit={handleEnqueue}
            className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 space-y-3"
          >
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Routine title (e.g., Nightly Job Digest)"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
            />
            <textarea
              rows={2}
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              placeholder="Agent instruction in English or বাংলা..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
            />
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-700">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="rounded border-slate-300 text-teal-700"
                />
                Recurring
              </label>
              {isRecurring && (
                <label className="flex items-center gap-1.5">
                  <span>Every</span>
                  <input
                    type="number"
                    min={1}
                    max={168}
                    value={intervalHours}
                    onChange={(e) => setIntervalHours(Number(e.target.value) || 12)}
                    className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums"
                  />
                  <span>hours</span>
                </label>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requiresWifi}
                  onChange={(e) => setRequiresWifi(e.target.checked)}
                  className="rounded border-slate-300 text-teal-700"
                />
                Wi-Fi Only
              </label>
            </div>
            <button
              type="submit"
              disabled={!newTitle.trim() || !newPrompt.trim()}
              className="w-full py-2 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-semibold transition-colors"
            >
              Enqueue Task
            </button>
          </form>

          <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
            {tasks.length === 0 ? (
              <div className="p-4 text-xs text-slate-500">No scheduled tasks in queue.</div>
            ) : (
              tasks.map((task) => (
                <div key={task.id} className="p-3.5 bg-white space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-slate-900">{task.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                        {task.status} · {task.isRecurring ? `Every ${task.intervalHours}h` : "One-time"} ·{" "}
                        {task.requiresWifi ? "Unmetered Wi-Fi" : "Any Network"}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onRunTaskNow(task)}
                        className="px-2.5 py-1.5 rounded-md bg-teal-700 hover:bg-teal-800 text-white text-[11px] font-medium flex items-center gap-1 whitespace-nowrap"
                      >
                        <Play className="w-3 h-3" />
                        Run Now
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteTask(task.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                        title="Cancel & delete task"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600">{task.prompt}</p>
                  {task.lastResult && (
                    <div className="text-[11px] font-mono text-slate-500">
                      Last run ({task.lastRunAt}): {task.lastResult}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
