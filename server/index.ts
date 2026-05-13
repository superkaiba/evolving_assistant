import express from "express";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { addAudit, db, getState, nowIso } from "./db";
import { handleUserMessage, rollbackVersion } from "./orchestrator";

const app = express();
const port = Number(process.env.PORT ?? 8787);
const execFileAsync = promisify(execFile);

app.use(express.json({ limit: "1mb" }));

app.get("/api/state", (_request, response) => {
  response.json(getState());
});

app.post("/api/messages", async (request, response, next) => {
  try {
    const content = String(request.body?.content ?? "").trim();
    if (!content) {
      response.status(400).send("Message content is required");
      return;
    }

    await handleUserMessage(content);
    response.json(getState());
  } catch (error) {
    next(error);
  }
});

app.patch("/api/memories/:id", (request, response, next) => {
  try {
    const memoryId = request.params.id;
    const kind = String(request.body?.kind ?? "");
    const title = String(request.body?.title ?? "").trim();
    const value = String(request.body?.value ?? "").trim();
    if (!kind || !title || !value) {
      response.status(400).send("Memory kind, title, and value are required");
      return;
    }

    db.prepare(
      `UPDATE memories
       SET kind = @kind, title = @title, value = @value, updated_at = @updatedAt
       WHERE id = @id`
    ).run({ id: memoryId, kind, title, value, updatedAt: nowIso() });
    addAudit("memory.updated", memoryId, title);
    response.json(getState());
  } catch (error) {
    next(error);
  }
});

app.delete("/api/memories/:id", (request, response, next) => {
  try {
    db.prepare(`DELETE FROM memories WHERE id = @id`).run({ id: request.params.id });
    addAudit("memory.deleted", request.params.id, "Memory deleted from UI");
    response.json(getState());
  } catch (error) {
    next(error);
  }
});

app.delete("/api/memories", (_request, response, next) => {
  try {
    db.prepare(`DELETE FROM memories`).run();
    addAudit("memory.cleared", "all", "All memories cleared from UI");
    response.json(getState());
  } catch (error) {
    next(error);
  }
});

app.post("/api/versions/:id/rollback", async (request, response, next) => {
  try {
    await rollbackVersion(request.params.id);
    response.json(getState());
  } catch (error) {
    next(error);
  }
});

app.post("/api/android/refresh", (_request, response, next) => {
  try {
    const state = getState();
    db.prepare(
      `UPDATE android_state
       SET current_runtime_version = latest_runtime_version,
           last_refresh_at = @lastRefreshAt
       WHERE id = 'default'`
    ).run({ lastRefreshAt: nowIso() });
    addAudit("android.refresh", state.android.latestRuntimeVersion, "Runtime refresh requested from UI");
    response.json(getState());
  } catch (error) {
    next(error);
  }
});

app.post("/api/android/build-apk", async (_request, response, next) => {
  try {
    db.prepare(`UPDATE android_state SET apk_status = 'building' WHERE id = 'default'`).run();
    const result = await buildAndroidApk();
    db.prepare(
      `UPDATE android_state
       SET apk_status = @status,
           apk_path = @apkPath,
           install_notes = @installNotes
       WHERE id = 'default'`
    ).run({
      status: result.status,
      apkPath: result.apkPath ?? null,
      installNotes: result.installNotes
    });
    addAudit("android.apk_build", result.status, result.installNotes);
    response.json(getState());
  } catch (error) {
    db.prepare(
      `UPDATE android_state
       SET apk_status = 'failed',
           install_notes = @installNotes
       WHERE id = 'default'`
    ).run({
      installNotes: error instanceof Error ? error.message : "Android APK build failed"
    });
    next(error);
  }
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  response.status(500).send(message);
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Assistant API listening on http://0.0.0.0:${port}`);
});

async function buildAndroidApk(): Promise<{
  status: "built" | "failed" | "sdk_missing";
  apkPath?: string;
  installNotes: string;
}> {
  const script = path.join(process.cwd(), "scripts", "build-android.sh");
  try {
    const result = await execFileAsync("bash", [script], {
      cwd: process.cwd(),
      timeout: 180_000,
      maxBuffer: 1024 * 1024
    });
    const output = `${result.stdout}\n${result.stderr}`.trim();
    const apkPath = path.join(process.cwd(), "android", "app", "build", "outputs", "apk", "release", "app-release.apk");
    if (await fileExists(apkPath)) {
      return {
        status: "built",
        apkPath,
        installNotes: `APK built at ${apkPath}. Install it directly on Android, enter this VM app URL in the shell if needed, and use Reload to pick up runtime changes without Play Store distribution.`
      };
    }
    return {
      status: "failed",
      installNotes: output || "Android APK build did not produce an APK"
    };
  } catch (error) {
    const buildError = error as { stdout?: string; stderr?: string; message?: string };
    const output = `${buildError.stdout ?? ""}\n${buildError.stderr ?? ""}`.trim();
    const message = output || buildError.message || "Unable to run Android build";
    const sdkMissing = /Java runtime is required|ANDROID_HOME|sdkmanager|Android SDK|Gradle/i.test(message);
    return {
      status: sdkMissing ? "sdk_missing" : "failed",
      installNotes: message
    };
  }
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
