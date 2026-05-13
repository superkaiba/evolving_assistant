import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ChangeTarget, TaskStep } from "../shared/types";
import { runChecks } from "./checks";
import { addAudit, addMessage, db, getActiveVersionId, id, nowIso } from "./db";
import { applyEvolutionCode, decideTarget, requiresNativeApk } from "./evolver";
import { inferMemoriesFromMessage, latestMemories } from "./memory";
import { generateAssistantReply } from "./model";
import { createSnapshot, diffSnapshot, restoreSnapshot } from "./snapshots";

const execFileAsync = promisify(execFile);

const stepLabels = [
  "Product interpretation",
  "Snapshot",
  "Code implementation",
  "Checks",
  "Apply",
  "Memory and Android update"
];

export async function handleUserMessage(content: string): Promise<void> {
  const userMessage = addMessage("user", content);
  const memories = inferMemoriesFromMessage(content, userMessage.id);
  const shouldEvolve = isEvolutionRequest(content);

  if (shouldEvolve) {
    const taskId = createTask(content, decideTarget(content));
    addMessage(
      "assistant",
      `I started an evolution task for that request. It will snapshot source files, edit the ${decideTarget(
        content
      )} code, run checks, and apply the version only if checks pass.`
    );
    setTimeout(() => {
      void runEvolutionTask(taskId).catch((error) => {
        markTaskFailed(taskId, error instanceof Error ? error.message : String(error));
      });
    }, 50);
    return;
  }

  addMessage(
    "assistant",
    await generateAssistantReply({
      content,
      memories: latestMemories(),
      inferredMemoryCount: memories.length
    })
  );
}

function isEvolutionRequest(content: string): boolean {
  return /\b(evolve|change|update|modify|build|create|add|remove|fix|redesign|implement)\b/i.test(content);
}

function createTask(userRequest: string, target: ChangeTarget): string {
  const taskId = id("task");
  const timestamp = nowIso();
  db.prepare(
    `INSERT INTO tasks (id, user_request, status, target, current_step, error, created_at, updated_at)
     VALUES (@id, @userRequest, 'queued', @target, 'Queued', NULL, @createdAt, @updatedAt)`
  ).run({
    id: taskId,
    userRequest,
    target,
    createdAt: timestamp,
    updatedAt: timestamp
  });

  stepLabels.forEach((label, index) => {
    db.prepare(
      `INSERT INTO task_steps (id, task_id, label, status, detail, started_at, completed_at, ordinal)
       VALUES (@id, @taskId, @label, 'queued', 'Waiting', NULL, NULL, @ordinal)`
    ).run({
      id: id("step"),
      taskId,
      label,
      ordinal: index
    });
  });
  addAudit("task.created", taskId, `Evolution task queued for ${target}`);
  return taskId;
}

async function runEvolutionTask(taskId: string): Promise<void> {
  const task = db.prepare(`SELECT * FROM tasks WHERE id = @taskId`).get({ taskId }) as
    | { user_request: string; target: ChangeTarget }
    | undefined;
  if (!task) throw new Error(`Task ${taskId} was not found`);

  updateTask(taskId, "running", "Product interpretation");
  startStep(taskId, "Product interpretation", `Target selected: ${task.target}`);
  passStep(taskId, "Product interpretation", `Request interpreted as ${task.target} evolution`);

  updateTask(taskId, "running", "Snapshot");
  startStep(taskId, "Snapshot", "Creating pre-change source snapshot");
  const snapshot = await createSnapshot(`Before task ${taskId}: ${task.user_request}`);
  passStep(taskId, "Snapshot", `Snapshot ${snapshot.id} created`);

  updateTask(taskId, "running", "Code implementation");
  startStep(taskId, "Code implementation", "Writing generated source changes");
  const versionId = id("ver");
  const changedFiles = await applyEvolutionCode(task.user_request, task.target, versionId, latestMemories());
  passStep(taskId, "Code implementation", `Changed ${changedFiles.length} file(s)`);

  updateTask(taskId, "running", "Checks");
  startStep(taskId, "Checks", "Running lint, typecheck, and build");
  const checkResult = await runChecks();
  if (!checkResult.passed) {
    failStep(taskId, "Checks", "Checks failed; restoring snapshot");
    await restoreSnapshot(snapshot.id);
    markTaskFailed(taskId, "Checks failed. Source files were restored from the pre-change snapshot.");
    addMessage("assistant", "The evolution attempt failed checks. I restored the pre-change snapshot and kept the failed task visible.");
    addAudit("task.failed", taskId, "Checks failed and rollback was automatic");
    return;
  }
  passStep(taskId, "Checks", "Checks passed");

  updateTask(taskId, "running", "Apply");
  startStep(taskId, "Apply", "Recording active version");
  const diff = await diffSnapshot(snapshot.id);
  const files = Array.from(new Set([...changedFiles, ...diff.filesChanged])).sort();
  const rollbackTarget = getActiveVersionId();
  db.prepare(
    `INSERT INTO versions (
      id,
      snapshot_id,
      created_at,
      user_request,
      files_changed_json,
      diff_summary,
      full_diff,
      check_log,
      changelog,
      changed_app,
      changed_orchestrator,
      rollback_target,
      status
    ) VALUES (
      @id,
      @snapshotId,
      @createdAt,
      @userRequest,
      @filesChangedJson,
      @diffSummary,
      @fullDiff,
      @checkLog,
      @changelog,
      @changedApp,
      @changedOrchestrator,
      @rollbackTarget,
      'active'
    )`
  ).run({
    id: versionId,
    snapshotId: snapshot.id,
    createdAt: nowIso(),
    userRequest: task.user_request,
    filesChangedJson: JSON.stringify(files),
    diffSummary: summarizeDiff(files, diff.fullDiff),
    fullDiff: diff.fullDiff.slice(0, 120_000),
    checkLog: checkResult.log.slice(-80_000),
    changelog: changelog(task.user_request, task.target),
    changedApp: task.target === "app" || task.target === "both" ? 1 : 0,
    changedOrchestrator: task.target === "orchestrator" || task.target === "both" ? 1 : 0,
    rollbackTarget
  });
  passStep(taskId, "Apply", `Version ${versionId} is active`);

  updateTask(taskId, "running", "Memory and Android update");
  startStep(taskId, "Memory and Android update", "Recording memory and runtime state");
  storeChangeMemory(task.user_request, versionId);
  updateAndroidRuntime(versionId, requiresNativeApk(task.user_request), rollbackTarget);
  passStep(taskId, "Memory and Android update", "Memory and Android runtime status updated");

  updateTask(taskId, "passed", "Complete");
  addMessage(
    "assistant",
    `Applied ${versionId}. Checks passed, version history was recorded, and the Android runtime state now points at the latest VM-hosted app.`
  );
  addAudit("version.applied", versionId, `Task ${taskId} applied automatically after checks passed`);
}

export async function rollbackVersion(versionId: string): Promise<void> {
  const version = db.prepare(`SELECT * FROM versions WHERE id = @versionId`).get({ versionId }) as
    | { snapshot_id: string; rollback_target?: string; status: string }
    | undefined;
  if (!version) throw new Error(`Version ${versionId} was not found`);
  if (version.status !== "active") throw new Error(`Version ${versionId} is not active`);

  await restoreSnapshot(version.snapshot_id);
  const rollbackId = id("rollback");
  const log = await runPostRollbackCheck();
  const timestamp = nowIso();

  db.prepare(`UPDATE versions SET status = 'rolled_back' WHERE id = @versionId`).run({ versionId });
  db.prepare(
    `INSERT INTO versions (
      id,
      snapshot_id,
      created_at,
      user_request,
      files_changed_json,
      diff_summary,
      full_diff,
      check_log,
      changelog,
      changed_app,
      changed_orchestrator,
      rollback_target,
      status
    ) VALUES (
      @id,
      @snapshotId,
      @createdAt,
      @userRequest,
      @filesChangedJson,
      @diffSummary,
      @fullDiff,
      @checkLog,
      @changelog,
      @changedApp,
      @changedOrchestrator,
      @rollbackTarget,
      'active'
    )`
  ).run({
    id: rollbackId,
    snapshotId: version.snapshot_id,
    createdAt: timestamp,
    userRequest: `Rollback ${versionId}`,
    filesChangedJson: JSON.stringify(["workspace snapshot restore"]),
    diffSummary: `Restored snapshot ${version.snapshot_id}`,
    fullDiff: "",
    checkLog: log,
    changelog: `Rolled back ${versionId}`,
    changedApp: 1,
    changedOrchestrator: 1,
    rollbackTarget: version.rollback_target ?? "seed"
  });
  db.prepare(
    `UPDATE android_state
     SET current_runtime_version = @runtime,
         latest_runtime_version = @runtime,
         last_refresh_at = @lastRefreshAt,
         rollback_target = @rollbackTarget,
         native_apk_required = 0
     WHERE id = 'default'`
  ).run({
    runtime: rollbackId,
    lastRefreshAt: timestamp,
    rollbackTarget: version.rollback_target ?? "seed"
  });
  addAudit("version.rollback", rollbackId, `Rolled back version ${versionId}`);
  addMessage("assistant", `Rolled back ${versionId}. The VM runtime and Android runtime state now point at ${rollbackId}.`);
}

function updateTask(taskId: string, status: "queued" | "running" | "passed" | "failed", currentStep: string): void {
  db.prepare(
    `UPDATE tasks SET status = @status, current_step = @currentStep, updated_at = @updatedAt WHERE id = @taskId`
  ).run({
    taskId,
    status,
    currentStep,
    updatedAt: nowIso()
  });
}

function taskStep(taskId: string, label: string): TaskStep | undefined {
  const row = db.prepare(`SELECT * FROM task_steps WHERE task_id = @taskId AND label = @label`).get({
    taskId,
    label
  }) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    label: String(row.label),
    status: row.status as TaskStep["status"],
    detail: String(row.detail),
    ordinal: Number(row.ordinal)
  };
}

function startStep(taskId: string, label: string, detail: string): void {
  const step = taskStep(taskId, label);
  if (!step) return;
  db.prepare(
    `UPDATE task_steps SET status = 'running', detail = @detail, started_at = @startedAt WHERE id = @id`
  ).run({
    id: step.id,
    detail,
    startedAt: nowIso()
  });
}

function passStep(taskId: string, label: string, detail: string): void {
  const step = taskStep(taskId, label);
  if (!step) return;
  db.prepare(
    `UPDATE task_steps SET status = 'passed', detail = @detail, completed_at = @completedAt WHERE id = @id`
  ).run({
    id: step.id,
    detail,
    completedAt: nowIso()
  });
}

function failStep(taskId: string, label: string, detail: string): void {
  const step = taskStep(taskId, label);
  if (!step) return;
  db.prepare(
    `UPDATE task_steps SET status = 'failed', detail = @detail, completed_at = @completedAt WHERE id = @id`
  ).run({
    id: step.id,
    detail,
    completedAt: nowIso()
  });
}

function markTaskFailed(taskId: string, error: string): void {
  db.prepare(
    `UPDATE tasks SET status = 'failed', current_step = 'Failed', error = @error, updated_at = @updatedAt WHERE id = @taskId`
  ).run({
    taskId,
    error,
    updatedAt: nowIso()
  });
}

function storeChangeMemory(request: string, versionId: string): void {
  db.prepare(
    `INSERT INTO memories (id, kind, title, value, source_message_id, created_at, updated_at)
     VALUES (@id, 'change', @title, @value, NULL, @createdAt, @updatedAt)`
  ).run({
    id: id("mem"),
    title: `Applied ${versionId}`,
    value: request,
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
}

function updateAndroidRuntime(versionId: string, nativeApkRequired: boolean, rollbackTarget: string): void {
  db.prepare(
    `UPDATE android_state
     SET current_runtime_version = @versionId,
         latest_runtime_version = @versionId,
         native_apk_required = @nativeApkRequired,
         last_refresh_at = @lastRefreshAt,
         rollback_target = @rollbackTarget
     WHERE id = 'default'`
  ).run({
    versionId,
    nativeApkRequired: nativeApkRequired ? 1 : 0,
    lastRefreshAt: nowIso(),
    rollbackTarget
  });
}

function changelog(request: string, target: ChangeTarget): string {
  return `${target} update: ${request.replace(/\s+/g, " ").trim().slice(0, 90)}`;
}

function summarizeDiff(files: string[], fullDiff: string): string {
  const lineCount = fullDiff ? fullDiff.split("\n").length : 0;
  return `${files.length} file(s) changed, ${lineCount} diff line(s) captured`;
}

async function runPostRollbackCheck(): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync("npm", ["run", "check"], {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 2
    });
    return `${stdout}\n${stderr}`.trim();
  } catch (error) {
    const checkError = error as { stdout?: string; stderr?: string };
    return `${checkError.stdout ?? ""}\n${checkError.stderr ?? ""}`.trim();
  }
}
