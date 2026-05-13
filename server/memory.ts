import type { MemoryRecord } from "../shared/types";
import { db, id, nowIso } from "./db";

export function inferMemoriesFromMessage(content: string, sourceMessageId: string): MemoryRecord[] {
  const inferred: Array<Pick<MemoryRecord, "kind" | "title" | "value">> = [];
  const trimmed = content.trim();

  const rememberMatch = trimmed.match(/remember (that )?(?<value>.+)$/i);
  if (rememberMatch?.groups?.value) {
    inferred.push({
      kind: "fact",
      title: "Remembered fact",
      value: rememberMatch.groups.value.trim()
    });
  }

  const preferenceMatch = trimmed.match(/\b(i prefer|i like|use|default to)\b (?<value>.+)$/i);
  if (preferenceMatch?.groups?.value) {
    inferred.push({
      kind: "preference",
      title: "User preference",
      value: preferenceMatch.groups.value.trim()
    });
  }

  const requirementMatch = trimmed.match(/\b(always|never|must|should)\b (?<value>.+)$/i);
  if (requirementMatch?.groups?.value) {
    inferred.push({
      kind: "requirement",
      title: "Assistant requirement",
      value: `${requirementMatch[1]} ${requirementMatch.groups.value}`.trim()
    });
  }

  const saved: MemoryRecord[] = [];
  for (const memory of inferred) {
    const existing = db
      .prepare(`SELECT * FROM memories WHERE kind = @kind AND value = @value LIMIT 1`)
      .get(memory) as Record<string, unknown> | undefined;
    if (existing) continue;

    const record: MemoryRecord = {
      id: id("mem"),
      kind: memory.kind,
      title: memory.title,
      value: memory.value,
      sourceMessageId,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    db.prepare(
      `INSERT INTO memories (id, kind, title, value, source_message_id, created_at, updated_at)
       VALUES (@id, @kind, @title, @value, @sourceMessageId, @createdAt, @updatedAt)`
    ).run(record);
    saved.push(record);
  }

  return saved;
}

export function latestMemories(): MemoryRecord[] {
  return db
    .prepare(`SELECT * FROM memories ORDER BY updated_at DESC LIMIT 12`)
    .all()
    .map((row) => {
      const item = row as Record<string, unknown>;
      return {
        id: String(item.id),
        kind: item.kind as MemoryRecord["kind"],
        title: String(item.title),
        value: String(item.value),
        sourceMessageId: item.source_message_id ? String(item.source_message_id) : undefined,
        createdAt: String(item.created_at),
        updatedAt: String(item.updated_at)
      };
    });
}
