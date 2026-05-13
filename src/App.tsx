import {
  Bot,
  CheckCircle2,
  Code2,
  History,
  MessageSquare,
  RotateCcw,
  Save,
  Send,
  ServerCog,
  Smartphone,
  Trash2
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  buildAndroidApk,
  clearMemories,
  deleteMemory,
  fetchState,
  refreshAndroidRuntime,
  rollbackVersion,
  sendMessage,
  updateMemory
} from "./api";
import { generatedWorkspace } from "./generated/workspaceState";
import type { AssistantState, MemoryRecord, StepStatus, TaskStatus } from "../shared/types";

const emptyState: AssistantState = {
  messages: [],
  memories: [],
  tasks: [],
  versions: [],
  auditEvents: [],
  android: {
    shellVersion: "0.1.0-webview",
    currentRuntimeVersion: "seed",
    latestRuntimeVersion: "seed",
    nativeApkRequired: false,
    apkStatus: "not_built",
    installNotes: "Install the Android WebView shell APK, then point it at this VM app URL."
  },
  model: {
    provider: "anthropic",
    model: "claude-opus-4-7",
    configured: false
  },
  orchestratorCapabilities: []
};

type Tab = "workspace" | "tasks" | "versions" | "memory" | "android";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "workspace", label: "Workspace" },
  { id: "tasks", label: "Tasks" },
  { id: "versions", label: "Versions" },
  { id: "memory", label: "Memory" },
  { id: "android", label: "Android" }
];

function statusClass(status: TaskStatus | StepStatus): string {
  return `status status-${status.replace("_", "-")}`;
}

function formatTime(value?: string): string {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function App() {
  const [state, setState] = useState<AssistantState>(emptyState);
  const [activeTab, setActiveTab] = useState<Tab>("workspace");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const runningTask = useMemo(
    () => state.tasks.find((task) => task.status === "running" || task.status === "queued"),
    [state.tasks]
  );

  async function refresh() {
    try {
      setState(await fetchState());
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to refresh state");
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1600);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [state.messages.length]);

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setDraft("");
    setBusy(true);
    try {
      setState(await sendMessage(content));
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Message failed");
    } finally {
      setBusy(false);
    }
  }

  async function withState(action: () => Promise<AssistantState>) {
    setBusy(true);
    try {
      setState(await action());
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <main className="work-area" aria-label="Assistant workspace">
        <header className="topbar">
          <div>
            <h1>Self Evolving Assistant</h1>
            <p>
              Runtime {state.android.currentRuntimeVersion} on shell {state.android.shellVersion}
            </p>
            <p>
              Model {state.model.provider}/{state.model.model}
              {state.model.configured ? "" : " with local fallback until an API key is set"}
            </p>
          </div>
          <div className="topbar-actions">
            <span className={runningTask ? "activity is-active" : "activity"}>
              {runningTask ? runningTask.currentStep : "Idle"}
            </span>
          </div>
        </header>

        <nav className="tabs" aria-label="Workspace views">
          {tabs.map((tab) => (
            <button
              className={activeTab === tab.id ? "tab active" : "tab"}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <section className="panel viewport-panel">
          {activeTab === "workspace" && <WorkspaceView />}
          {activeTab === "tasks" && <TaskView state={state} />}
          {activeTab === "versions" && (
            <VersionView
              state={state}
              onRollback={(id) => withState(() => rollbackVersion(id))}
              busy={busy}
            />
          )}
          {activeTab === "memory" && (
            <MemoryView
              memories={state.memories}
              busy={busy}
              onUpdate={(memory) =>
                withState(() =>
                  updateMemory(memory.id, {
                    kind: memory.kind,
                    title: memory.title,
                    value: memory.value
                  })
                )
              }
              onDelete={(id) => withState(() => deleteMemory(id))}
              onClear={() => withState(clearMemories)}
            />
          )}
          {activeTab === "android" && (
            <AndroidView
              state={state}
              busy={busy}
              onRefresh={() => withState(refreshAndroidRuntime)}
              onBuild={() => withState(buildAndroidApk)}
            />
          )}
        </section>
      </main>

      <aside className="chat-panel" aria-label="Persistent assistant messages">
        <div className="chat-header">
          <MessageSquare size={18} aria-hidden />
          <div>
            <h2>Messages</h2>
            <p>{state.messages.length} stored</p>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="messages">
          {state.messages.length === 0 && (
            <div className="empty-state">
              Ask for an app change, a personal workflow, or a memory to remember.
            </div>
          )}
          {state.messages.map((message) => (
            <article className={`message message-${message.role}`} key={message.id}>
              <span>{message.role === "user" ? "You" : "Assistant"}</span>
              <p>{message.content}</p>
              <time>{formatTime(message.createdAt)}</time>
            </article>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form className="composer" onSubmit={submitMessage}>
          <textarea
            aria-label="Message"
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Message the assistant"
            rows={3}
            value={draft}
          />
          <button type="submit" disabled={busy || draft.trim().length === 0} title="Send message">
            <Send size={18} aria-hidden />
            <span>Send</span>
          </button>
        </form>
      </aside>
    </div>
  );
}

function WorkspaceView() {
  return (
    <div className="workspace-view">
      <div className="workspace-copy">
        <h2>{generatedWorkspace.title}</h2>
        <p>{generatedWorkspace.summary}</p>
      </div>
      <div className="workspace-grid">
        {generatedWorkspace.cards.map((card) => (
          <article className="workspace-card" key={card.id}>
            <span>{card.meta}</span>
            <h3>{card.title}</h3>
            <p>{card.body}</p>
          </article>
        ))}
      </div>
      <div className="data-table" role="table" aria-label="Workspace details">
        {generatedWorkspace.rows.map((row) => (
          <div className="data-row" role="row" key={row.label}>
            <strong role="cell">{row.label}</strong>
            <span role="cell">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskView({ state }: { state: AssistantState }) {
  return (
    <div className="stack">
      {state.tasks.length === 0 && <div className="empty-state">No evolution tasks yet.</div>}
      {state.tasks.map((task) => (
        <article className="task-card" key={task.id}>
          <div className="card-title">
            <ServerCog size={18} aria-hidden />
            <div>
              <h3>{task.userRequest}</h3>
              <p>
                {task.target} change created {formatTime(task.createdAt)}
              </p>
            </div>
            <span className={statusClass(task.status)}>{task.status.replace("_", " ")}</span>
          </div>
          <ol className="steps">
            {task.steps.map((step) => (
              <li key={step.id}>
                <span className={statusClass(step.status)}>{step.status.replace("_", " ")}</span>
                <div>
                  <strong>{step.label}</strong>
                  <p>{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          {task.error && <div className="error-banner">{task.error}</div>}
        </article>
      ))}
    </div>
  );
}

function VersionView({
  state,
  onRollback,
  busy
}: {
  state: AssistantState;
  onRollback: (id: string) => void;
  busy: boolean;
}) {
  return (
    <div className="stack">
      {state.versions.length === 0 && (
        <div className="empty-state">Applied versions will appear after the first evolution.</div>
      )}
      {state.versions.map((version) => (
        <article className="version-card" key={version.id}>
          <div className="card-title">
            <History size={18} aria-hidden />
            <div>
              <h3>{version.changelog}</h3>
              <p>{formatTime(version.createdAt)}</p>
            </div>
            <span className={statusClass(version.status === "failed" ? "failed" : "passed")}>
              {version.status}
            </span>
          </div>
          <p className="muted">{version.diffSummary}</p>
          <div className="file-list">
            {version.filesChanged.map((file) => (
              <code key={file}>{file}</code>
            ))}
          </div>
          <details>
            <summary>Check log and diff</summary>
            <pre>{version.checkLog}</pre>
            <pre>{version.fullDiff || "No diff captured."}</pre>
          </details>
          <button
            className="secondary-button"
            disabled={busy || version.status !== "active"}
            onClick={() => onRollback(version.id)}
            type="button"
          >
            <RotateCcw size={16} aria-hidden />
            <span>Rollback this change</span>
          </button>
        </article>
      ))}
    </div>
  );
}

function MemoryView({
  memories,
  busy,
  onUpdate,
  onDelete,
  onClear
}: {
  memories: MemoryRecord[];
  busy: boolean;
  onUpdate: (memory: MemoryRecord) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  const [editing, setEditing] = useState<Record<string, MemoryRecord>>({});

  function current(memory: MemoryRecord): MemoryRecord {
    return editing[memory.id] ?? memory;
  }

  return (
    <div className="stack">
      <div className="toolbar">
        <button className="secondary-button" disabled={busy || memories.length === 0} onClick={onClear} type="button">
          <Trash2 size={16} aria-hidden />
          <span>Clear memory</span>
        </button>
      </div>
      {memories.length === 0 && <div className="empty-state">No memories stored yet.</div>}
      {memories.map((memory) => {
        const draftMemory = current(memory);
        return (
          <article className="memory-card" key={memory.id}>
            <label>
              Kind
              <select
                value={draftMemory.kind}
                onChange={(event) =>
                  setEditing((items) => ({
                    ...items,
                    [memory.id]: {
                      ...draftMemory,
                      kind: event.target.value as MemoryRecord["kind"]
                    }
                  }))
                }
              >
                <option value="preference">Preference</option>
                <option value="fact">Fact</option>
                <option value="pattern">Pattern</option>
                <option value="requirement">Requirement</option>
                <option value="change">Change</option>
              </select>
            </label>
            <label>
              Title
              <input
                value={draftMemory.title}
                onChange={(event) =>
                  setEditing((items) => ({
                    ...items,
                    [memory.id]: { ...draftMemory, title: event.target.value }
                  }))
                }
              />
            </label>
            <label>
              Value
              <textarea
                rows={3}
                value={draftMemory.value}
                onChange={(event) =>
                  setEditing((items) => ({
                    ...items,
                    [memory.id]: { ...draftMemory, value: event.target.value }
                  }))
                }
              />
            </label>
            <div className="row-actions">
              <button
                disabled={busy}
                onClick={() => onUpdate(draftMemory)}
                type="button"
                title="Save memory"
              >
                <Save size={16} aria-hidden />
                <span>Save</span>
              </button>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => onDelete(memory.id)}
                type="button"
                title="Delete memory"
              >
                <Trash2 size={16} aria-hidden />
                <span>Delete</span>
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function AndroidView({
  state,
  busy,
  onRefresh,
  onBuild
}: {
  state: AssistantState;
  busy: boolean;
  onRefresh: () => void;
  onBuild: () => void;
}) {
  const rows = [
    ["Installed shell", state.android.shellVersion],
    ["Runtime loaded", state.android.currentRuntimeVersion],
    ["Latest runtime", state.android.latestRuntimeVersion],
    ["Native APK required", state.android.nativeApkRequired ? "Yes" : "No"],
    ["APK status", state.android.apkStatus],
    ["Last refresh", formatTime(state.android.lastRefreshAt)]
  ];

  return (
    <div className="stack">
      <div className="android-actions">
        <button disabled={busy} onClick={onRefresh} type="button">
          <Smartphone size={16} aria-hidden />
          <span>Refresh runtime</span>
        </button>
        <button className="secondary-button" disabled={busy} onClick={onBuild} type="button">
          <Code2 size={16} aria-hidden />
          <span>Build APK</span>
        </button>
      </div>
      <div className="data-table" role="table" aria-label="Android update state">
        {rows.map(([label, value]) => (
          <div className="data-row" role="row" key={label}>
            <strong role="cell">{label}</strong>
            <span role="cell">{value}</span>
          </div>
        ))}
      </div>
      <article className="android-card">
        <div className="card-title">
          <CheckCircle2 size={18} aria-hidden />
          <div>
            <h3>Install path</h3>
            <p>{state.android.installNotes}</p>
          </div>
        </div>
        {state.android.apkPath && <code>{state.android.apkPath}</code>}
      </article>
      <article className="android-card">
        <div className="card-title">
          <Bot size={18} aria-hidden />
          <div>
            <h3>Orchestrator capabilities</h3>
            <p>{state.orchestratorCapabilities.length} source-backed capabilities</p>
          </div>
        </div>
        <div className="capability-list">
          {state.orchestratorCapabilities.map((capability) => (
            <div key={capability.id}>
              <strong>{capability.title}</strong>
              <span>{capability.description}</span>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

export default App;
