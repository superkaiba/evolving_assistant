import type { AssistantState, MemoryRecord } from "../shared/types";

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchState(): Promise<AssistantState> {
  return readJson<AssistantState>(await fetch("/api/state"));
}

export async function sendMessage(content: string): Promise<AssistantState> {
  return readJson<AssistantState>(
    await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    })
  );
}

export async function updateMemory(
  id: string,
  patch: Pick<MemoryRecord, "title" | "value" | "kind">
): Promise<AssistantState> {
  return readJson<AssistantState>(
    await fetch(`/api/memories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    })
  );
}

export async function deleteMemory(id: string): Promise<AssistantState> {
  return readJson<AssistantState>(
    await fetch(`/api/memories/${id}`, {
      method: "DELETE"
    })
  );
}

export async function clearMemories(): Promise<AssistantState> {
  return readJson<AssistantState>(
    await fetch("/api/memories", {
      method: "DELETE"
    })
  );
}

export async function rollbackVersion(id: string): Promise<AssistantState> {
  return readJson<AssistantState>(
    await fetch(`/api/versions/${id}/rollback`, {
      method: "POST"
    })
  );
}

export async function refreshAndroidRuntime(): Promise<AssistantState> {
  return readJson<AssistantState>(
    await fetch("/api/android/refresh", {
      method: "POST"
    })
  );
}

export async function buildAndroidApk(): Promise<AssistantState> {
  return readJson<AssistantState>(
    await fetch("/api/android/build-apk", {
      method: "POST"
    })
  );
}
