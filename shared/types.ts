export type MessageRole = "user" | "assistant" | "system";
export type TaskStatus = "queued" | "running" | "passed" | "failed" | "rolled_back";
export type StepStatus = "queued" | "running" | "passed" | "failed" | "skipped";
export type ChangeTarget = "app" | "orchestrator" | "both";

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface MemoryRecord {
  id: string;
  kind: "preference" | "fact" | "pattern" | "requirement" | "change";
  title: string;
  value: string;
  sourceMessageId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskStep {
  id: string;
  taskId: string;
  label: string;
  status: StepStatus;
  detail: string;
  startedAt?: string;
  completedAt?: string;
  ordinal: number;
}

export interface EvolutionTask {
  id: string;
  userRequest: string;
  status: TaskStatus;
  target: ChangeTarget;
  currentStep: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  steps: TaskStep[];
}

export interface VersionRecord {
  id: string;
  snapshotId: string;
  createdAt: string;
  userRequest: string;
  filesChanged: string[];
  diffSummary: string;
  fullDiff: string;
  checkLog: string;
  changelog: string;
  changedApp: boolean;
  changedOrchestrator: boolean;
  rollbackTarget?: string;
  status: "active" | "rolled_back" | "failed";
}

export interface AndroidState {
  shellVersion: string;
  currentRuntimeVersion: string;
  latestRuntimeVersion: string;
  nativeApkRequired: boolean;
  lastRefreshAt?: string;
  rollbackTarget?: string;
  apkStatus: "not_built" | "building" | "built" | "failed" | "sdk_missing";
  apkPath?: string;
  installNotes: string;
}

export interface AuditEvent {
  id: string;
  eventType: string;
  subjectId: string;
  detail: string;
  createdAt: string;
}

export interface AssistantState {
  messages: Message[];
  memories: MemoryRecord[];
  tasks: EvolutionTask[];
  versions: VersionRecord[];
  auditEvents: AuditEvent[];
  android: AndroidState;
  model: {
    provider: "anthropic" | "openai" | "local";
    model: string;
    configured: boolean;
  };
  orchestratorCapabilities: Array<{
    id: string;
    title: string;
    description: string;
    createdAt: string;
    sourceRequest: string;
  }>;
}
