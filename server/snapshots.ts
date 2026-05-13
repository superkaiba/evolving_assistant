import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { addAudit, id, nowIso } from "./db";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const snapshotRoot = path.join(root, ".assistant", "snapshots");
const trackedPaths = [
  "SELF_EVOLVING_ASSISTANT_PLAN.md",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "eslint.config.js",
  "vite.config.ts",
  "index.html",
  "src",
  "server",
  "shared",
  "scripts",
  "android"
];
const ignoredNames = new Set(["node_modules", "dist", ".assistant", ".gradle", "build"]);

export interface SnapshotRecord {
  id: string;
  createdAt: string;
  path: string;
  trackedPaths: string[];
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function copyTracked(destination: string): Promise<string[]> {
  await fs.mkdir(destination, { recursive: true });
  const copied: string[] = [];

  for (const relativePath of trackedPaths) {
    const source = path.join(root, relativePath);
    if (!(await exists(source))) continue;
    const target = path.join(destination, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.cp(source, target, {
      recursive: true,
      filter: (sourcePath) => !ignoredNames.has(path.basename(sourcePath))
    });
    copied.push(relativePath);
  }

  return copied;
}

export async function createSnapshot(reason: string): Promise<SnapshotRecord> {
  const snapshot: SnapshotRecord = {
    id: id("snap"),
    createdAt: nowIso(),
    path: "",
    trackedPaths: []
  };
  snapshot.path = path.join(snapshotRoot, snapshot.id);
  const workspacePath = path.join(snapshot.path, "workspace");
  snapshot.trackedPaths = await copyTracked(workspacePath);

  await fs.writeFile(
    path.join(snapshot.path, "metadata.json"),
    JSON.stringify({ ...snapshot, reason }, null, 2)
  );
  addAudit("snapshot.created", snapshot.id, reason);
  return snapshot;
}

export async function diffSnapshot(snapshotId: string): Promise<{ fullDiff: string; filesChanged: string[] }> {
  const snapshotPath = path.join(snapshotRoot, snapshotId, "workspace");
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "assistant-current-"));
  const currentPath = path.join(tempRoot, "workspace");

  try {
    await copyTracked(currentPath);
    try {
      const { stdout } = await execFileAsync("diff", ["-ruN", snapshotPath, currentPath], {
        maxBuffer: 1024 * 1024 * 4
      });
      return { fullDiff: stdout.trim(), filesChanged: [] };
    } catch (error) {
      const diffError = error as { stdout?: string };
      const fullDiff = diffError.stdout?.trim() ?? "";
      return { fullDiff, filesChanged: parseChangedFiles(fullDiff, snapshotPath, currentPath) };
    }
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

export async function restoreSnapshot(snapshotId: string): Promise<void> {
  const snapshotPath = path.join(snapshotRoot, snapshotId, "workspace");
  if (!(await exists(snapshotPath))) {
    throw new Error(`Snapshot ${snapshotId} does not exist`);
  }

  for (const relativePath of trackedPaths) {
    const target = path.join(root, relativePath);
    const source = path.join(snapshotPath, relativePath);
    await fs.rm(target, { recursive: true, force: true });
    if (await exists(source)) {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.cp(source, target, { recursive: true });
    }
  }
  addAudit("snapshot.restored", snapshotId, "Source files restored from snapshot");
}

function parseChangedFiles(diffText: string, beforeRoot: string, afterRoot: string): string[] {
  const files = new Set<string>();
  for (const line of diffText.split("\n")) {
    if (!line.startsWith("diff -ruN ")) continue;
    const segments = line.split(" ");
    const candidate = segments[segments.length - 1];
    if (!candidate) continue;
    const relative = candidate
      .replace(`${afterRoot}${path.sep}`, "")
      .replace(`${beforeRoot}${path.sep}`, "")
      .replace(/^\.\//, "");
    if (relative && !relative.startsWith("/")) {
      files.add(relative);
    }
  }
  return Array.from(files).sort();
}
