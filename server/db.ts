import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type {
  AndroidState,
  AssistantState,
  AuditEvent,
  EvolutionTask,
  MemoryRecord,
  Message,
  TaskStep,
  VersionRecord
} from "../shared/types";
import { getModelStatus } from "./model";

const dataDir = path.join(process.cwd(), ".assistant");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "assistant.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  value TEXT NOT NULL,
  source_message_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_request TEXT NOT NULL,
  status TEXT NOT NULL,
  target TEXT NOT NULL,
  current_step TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_steps (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  ordinal INTEGER NOT NULL,
  FOREIGN KEY(task_id) REFERENCES tasks(id)
);

CREATE TABLE IF NOT EXISTS versions (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  user_request TEXT NOT NULL,
  files_changed_json TEXT NOT NULL,
  diff_summary TEXT NOT NULL,
  full_diff TEXT NOT NULL,
  check_log TEXT NOT NULL,
  changelog TEXT NOT NULL,
  changed_app INTEGER NOT NULL,
  changed_orchestrator INTEGER NOT NULL,
  rollback_target TEXT,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS android_state (
  id TEXT PRIMARY KEY,
  shell_version TEXT NOT NULL,
  current_runtime_version TEXT NOT NULL,
  latest_runtime_version TEXT NOT NULL,
  native_apk_required INTEGER NOT NULL,
  last_refresh_at TEXT,
  rollback_target TEXT,
  apk_status TEXT NOT NULL,
  apk_path TEXT,
  install_notes TEXT NOT NULL
);
`);

db.prepare(
  `INSERT OR IGNORE INTO android_state (
    id,
    shell_version,
    current_runtime_version,
    latest_runtime_version,
    native_apk_required,
    last_refresh_at,
    rollback_target,
    apk_status,
    apk_path,
    install_notes
  ) VALUES (
    'default',
    '0.1.0-webview',
    'seed',
    'seed',
    0,
    NULL,
    NULL,
    'not_built',
    NULL,
    'Build and install the signed WebView APK from this VM, then load the VM-hosted runtime URL. Runtime changes update without Play Store distribution.'
  )`
).run();

export function nowIso(): string {
  return new Date().toISOString();
}

export function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function addAudit(eventType: string, subjectId: string, detail: string): void {
  db.prepare(
    `INSERT INTO audit_events (id, event_type, subject_id, detail, created_at)
     VALUES (@id, @eventType, @subjectId, @detail, @createdAt)`
  ).run({
    id: id("audit"),
    eventType,
    subjectId,
    detail,
    createdAt: nowIso()
  });
}

export function addMessage(role: Message["role"], content: string): Message {
  const message: Message = {
    id: id("msg"),
    role,
    content,
    createdAt: nowIso()
  };

  db.prepare(
    `INSERT INTO messages (id, role, content, created_at)
     VALUES (@id, @role, @content, @createdAt)`
  ).run(message);

  return message;
}

export function getActiveVersionId(): string {
  const row = db
    .prepare(`SELECT id FROM versions WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`)
    .get() as { id: string } | undefined;
  return row?.id ?? "seed";
}

function mapMessage(row: Record<string, unknown>): Message {
  return {
    id: String(row.id),
    role: row.role as Message["role"],
    content: String(row.content),
    createdAt: String(row.created_at)
  };
}

function mapMemory(row: Record<string, unknown>): MemoryRecord {
  return {
    id: String(row.id),
    kind: row.kind as MemoryRecord["kind"],
    title: String(row.title),
    value: String(row.value),
    sourceMessageId: row.source_message_id ? String(row.source_message_id) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapStep(row: Record<string, unknown>): TaskStep {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    label: String(row.label),
    status: row.status as TaskStep["status"],
    detail: String(row.detail),
    startedAt: row.started_at ? String(row.started_at) : undefined,
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    ordinal: Number(row.ordinal)
  };
}

function mapTask(row: Record<string, unknown>, steps: TaskStep[]): EvolutionTask {
  return {
    id: String(row.id),
    userRequest: String(row.user_request),
    status: row.status as EvolutionTask["status"],
    target: row.target as EvolutionTask["target"],
    currentStep: String(row.current_step),
    error: row.error ? String(row.error) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    steps
  };
}

function mapVersion(row: Record<string, unknown>): VersionRecord {
  return {
    id: String(row.id),
    snapshotId: String(row.snapshot_id),
    createdAt: String(row.created_at),
    userRequest: String(row.user_request),
    filesChanged: JSON.parse(String(row.files_changed_json)) as string[],
    diffSummary: String(row.diff_summary),
    fullDiff: String(row.full_diff),
    checkLog: String(row.check_log),
    changelog: String(row.changelog),
    changedApp: Boolean(row.changed_app),
    changedOrchestrator: Boolean(row.changed_orchestrator),
    rollbackTarget: row.rollback_target ? String(row.rollback_target) : undefined,
    status: row.status as VersionRecord["status"]
  };
}

function mapAndroid(row: Record<string, unknown>): AndroidState {
  return {
    shellVersion: String(row.shell_version),
    currentRuntimeVersion: String(row.current_runtime_version),
    latestRuntimeVersion: String(row.latest_runtime_version),
    nativeApkRequired: Boolean(row.native_apk_required),
    lastRefreshAt: row.last_refresh_at ? String(row.last_refresh_at) : undefined,
    rollbackTarget: row.rollback_target ? String(row.rollback_target) : undefined,
    apkStatus: row.apk_status as AndroidState["apkStatus"],
    apkPath: row.apk_path ? String(row.apk_path) : undefined,
    installNotes: String(row.install_notes)
  };
}

function mapAudit(row: Record<string, unknown>): AuditEvent {
  return {
    id: String(row.id),
    eventType: String(row.event_type),
    subjectId: String(row.subject_id),
    detail: String(row.detail),
    createdAt: String(row.created_at)
  };
}

export function getState(): AssistantState {
  const messages = db
    .prepare(`SELECT * FROM messages ORDER BY created_at ASC LIMIT 200`)
    .all()
    .map((row) => mapMessage(row as Record<string, unknown>));
  const memories = db
    .prepare(`SELECT * FROM memories ORDER BY updated_at DESC`)
    .all()
    .map((row) => mapMemory(row as Record<string, unknown>));
  const steps = db
    .prepare(`SELECT * FROM task_steps ORDER BY ordinal ASC`)
    .all()
    .map((row) => mapStep(row as Record<string, unknown>));
  const tasks = db
    .prepare(`SELECT * FROM tasks ORDER BY created_at DESC LIMIT 50`)
    .all()
    .map((row) =>
      mapTask(
        row as Record<string, unknown>,
        steps.filter((step) => step.taskId === String((row as Record<string, unknown>).id))
      )
    );
  const versions = db
    .prepare(`SELECT * FROM versions ORDER BY created_at DESC LIMIT 50`)
    .all()
    .map((row) => mapVersion(row as Record<string, unknown>));
  const auditEvents = db
    .prepare(`SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 100`)
    .all()
    .map((row) => mapAudit(row as Record<string, unknown>));
  const androidRow = db
    .prepare(`SELECT * FROM android_state WHERE id = 'default'`)
    .get() as Record<string, unknown>;

  return {
    messages,
    memories,
    tasks,
    versions,
    auditEvents,
    android: mapAndroid(androidRow),
    model: getModelStatus(),
    orchestratorCapabilities: readOrchestratorCapabilities()
  };
}

function readOrchestratorCapabilities(): AssistantState["orchestratorCapabilities"] {
  const filePath = path.join(process.cwd(), "server", "generated", "orchestratorCapabilities.json");
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as AssistantState["orchestratorCapabilities"];
  } catch {
    return [
      {
        id: "seed-evolution-loop",
        title: "Recoverable evolution loop",
        description:
          "Creates visible task steps, snapshots source files, runs checks, records versions, and exposes rollback.",
        createdAt: "initial",
        sourceRequest: "Initial MVP scaffold"
      }
    ];
  }
}
