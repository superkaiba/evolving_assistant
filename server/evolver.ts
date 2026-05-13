import fs from "node:fs/promises";
import path from "node:path";
import type { ChangeTarget, MemoryRecord } from "../shared/types";

const root = process.cwd();

export function decideTarget(request: string): ChangeTarget {
  const normalized = request.toLowerCase();
  const mentionsApp = /(app|ui|screen|workflow|dashboard|tracker|planner|calendar|editor|tool)/.test(
    normalized
  );
  const mentionsOrchestrator = /(orchestrator|agent|sub-agent|backend|evolution loop|memory inference)/.test(
    normalized
  );

  if (mentionsApp && mentionsOrchestrator) return "both";
  if (mentionsOrchestrator) return "orchestrator";
  return "app";
}

export function requiresNativeApk(request: string): boolean {
  return /(android permission|native module|app icon|apk|background service|package name|webview setting)/i.test(
    request
  );
}

export async function applyEvolutionCode(
  request: string,
  target: ChangeTarget,
  versionId: string,
  memories: MemoryRecord[]
): Promise<string[]> {
  const changed = new Set<string>();
  if (target === "app" || target === "both") {
    changed.add(await writeWorkspaceState(request, versionId, memories));
  }

  if (target === "orchestrator" || target === "both") {
    changed.add(await writeOrchestratorCapability(request, versionId));
    changed.add("server/generated/orchestratorCapabilities.json");
  }

  return Array.from(changed).sort();
}

async function writeWorkspaceState(
  request: string,
  versionId: string,
  memories: MemoryRecord[]
): Promise<string> {
  const mode = chooseMode(request);
  const title = titleFromRequest(request, mode);
  const summary = `Generated from: ${request.trim()}`;
  const memoryRows = memories.slice(0, 4).map((memory) => ({
    label: `Memory: ${memory.title}`,
    value: memory.value
  }));
  const rows = [
    { label: "Mode", value: mode },
    { label: "Applied version", value: versionId },
    { label: "Runtime update", value: "Available immediately to the VM web app and Android WebView shell" },
    ...memoryRows
  ];
  const cards = buildCards(request, mode);
  const content = `export const generatedWorkspace = ${JSON.stringify(
    {
      version: versionId,
      updatedAt: new Date().toISOString(),
      title,
      summary,
      mode,
      cards,
      rows
    },
    null,
    2
  )} as const;\n`;

  const filePath = path.join(root, "src", "generated", "workspaceState.ts");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  return "src/generated/workspaceState.ts";
}

async function writeOrchestratorCapability(request: string, versionId: string): Promise<string> {
  const filePath = path.join(root, "server", "generated", "orchestratorCapabilities.ts");
  const existing = await readExistingCapabilities(filePath);
  const next = [
    ...existing.filter((capability) => capability.id !== versionId),
    {
      id: versionId,
      title: titleFromRequest(request, "orchestrator"),
      description: `Source-backed orchestrator capability generated from the request: ${compact(request)}`,
      createdAt: new Date().toISOString(),
      sourceRequest: request
    }
  ];
  const content = `export interface OrchestratorCapability {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  sourceRequest: string;
}

export const orchestratorCapabilities: OrchestratorCapability[] = ${JSON.stringify(next, null, 2)};
`;
  await fs.writeFile(filePath, content);
  await fs.writeFile(
    path.join(root, "server", "generated", "orchestratorCapabilities.json"),
    `${JSON.stringify(next, null, 2)}\n`
  );
  return "server/generated/orchestratorCapabilities.ts";
}

async function readExistingCapabilities(filePath: string) {
  try {
    const jsonPath = path.join(root, "server", "generated", "orchestratorCapabilities.json");
    return JSON.parse(await fs.readFile(jsonPath, "utf8")) as Array<{
      id: string;
      title: string;
      description: string;
      createdAt: string;
      sourceRequest: string;
    }>;
  } catch {
    // Fall back to the TypeScript module for workspaces created before the JSON sidecar existed.
  }

  try {
    const modulePath = `${filePath}?cache=${Date.now()}`;
    const imported = (await import(modulePath)) as {
      orchestratorCapabilities?: Array<{
        id: string;
        title: string;
        description: string;
        createdAt: string;
        sourceRequest: string;
      }>;
    };
    return imported.orchestratorCapabilities ?? [];
  } catch {
    return [];
  }
}

function chooseMode(request: string): string {
  const text = request.toLowerCase();
  if (/calendar|schedule|timeline|plan/.test(text)) return "planner";
  if (/track|dashboard|metric|habit|budget|table|chart/.test(text)) return "tracker";
  if (/write|draft|document|note|editor/.test(text)) return "writer";
  if (/workflow|process|kanban|project/.test(text)) return "workflow";
  return "overview";
}

function buildCards(request: string, mode: string) {
  const compactRequest = compact(request);
  if (mode === "planner") {
    return [
      {
        id: "plan-next",
        title: "Next block",
        body: "Clarify the next action, time window, owner, and expected result.",
        meta: "planner"
      },
      {
        id: "plan-sequence",
        title: "Sequence",
        body: `Plan created from: ${compactRequest}`,
        meta: "timeline"
      },
      {
        id: "plan-review",
        title: "Review point",
        body: "Use the message panel to refine dates, priorities, or dependencies.",
        meta: "checkpoint"
      }
    ];
  }

  if (mode === "tracker") {
    return [
      {
        id: "track-input",
        title: "Tracked item",
        body: compactRequest,
        meta: "tracker"
      },
      {
        id: "track-status",
        title: "Status",
        body: "Ready for the next message to add rows, metrics, or thresholds.",
        meta: "dashboard"
      },
      {
        id: "track-history",
        title: "History",
        body: "Version history records every generated tracker change.",
        meta: "audit"
      }
    ];
  }

  if (mode === "writer") {
    return [
      {
        id: "write-brief",
        title: "Brief",
        body: compactRequest,
        meta: "editor"
      },
      {
        id: "write-draft",
        title: "Draft area",
        body: "Use the chat to request sections, rewrites, or structured notes.",
        meta: "document"
      }
    ];
  }

  if (mode === "workflow") {
    return [
      {
        id: "workflow-queue",
        title: "Queue",
        body: compactRequest,
        meta: "workflow"
      },
      {
        id: "workflow-check",
        title: "Check",
        body: "Each code evolution still runs snapshot, checks, apply, and rollback recording.",
        meta: "control"
      }
    ];
  }

  return [
    {
      id: "request",
      title: "Current request",
      body: compactRequest,
      meta: "generated"
    },
    {
      id: "runtime",
      title: "Runtime update",
      body: "This source change is served directly by the VM-hosted app runtime.",
      meta: "android"
    }
  ];
}

function titleFromRequest(request: string, mode: string): string {
  const cleaned = compact(request)
    .replace(/^(please|can you|could you|make|build|create|update|change)\s+/i, "")
    .slice(0, 68)
    .trim();
  if (!cleaned) return `${mode[0]?.toUpperCase() ?? "A"}${mode.slice(1)} workspace`;
  return cleaned[0].toUpperCase() + cleaned.slice(1);
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
