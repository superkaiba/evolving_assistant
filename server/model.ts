import type { MemoryRecord } from "../shared/types";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

loadExternalAnthropicEnv();

const anthropicModel = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7";
const openAiModel = process.env.ASSISTANT_MODEL ?? "gpt-5.5";

export function getModelStatus(): {
  provider: "anthropic" | "openai" | "local";
  model: string;
  configured: boolean;
} {
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: "anthropic",
      model: anthropicModel,
      configured: true
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      model: openAiModel,
      configured: true
    };
  }

  return {
    provider: "local",
    model: "deterministic-fallback",
    configured: false
  };
}

export async function generateAssistantReply(input: {
  content: string;
  memories: MemoryRecord[];
  inferredMemoryCount: number;
}): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) {
    return generateAnthropicReply(input);
  }

  if (process.env.OPENAI_API_KEY) {
    return generateOpenAiReply(input);
  }

  return fallbackReply(input);
}

async function generateAnthropicReply(input: {
  content: string;
  memories: MemoryRecord[];
  inferredMemoryCount: number;
}): Promise<string> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": process.env.ANTHROPIC_VERSION ?? "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: anthropicModel,
        max_tokens: 600,
        system:
          "You are the text interface for a single-user local self-evolving personal assistant. Be concise, use stored memory when relevant, and do not claim external actions were taken. Code/app evolution is handled by the local orchestrator after checks.",
        messages: [
          {
            role: "user",
            content: `Stored memories:\n${memoryContext(input.memories)}\n\nUser message:\n${input.content}`
          }
        ]
      })
    });

    if (!response.ok) {
      return fallbackReply(input);
    }

    const payload = (await response.json()) as {
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    };
    const text = payload.content?.find((item) => item.type === "text" && item.text)?.text;
    return text?.trim() || fallbackReply(input);
  } catch {
    return fallbackReply(input);
  }
}

async function generateOpenAiReply(input: {
  content: string;
  memories: MemoryRecord[];
  inferredMemoryCount: number;
}): Promise<string> {
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: openAiModel,
        instructions:
          "You are the text interface for a single-user local self-evolving personal assistant. Be concise, use stored memory when relevant, and do not claim external actions were taken. Code/app evolution is handled by the local orchestrator after checks.",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Stored memories:\n${memoryContext(input.memories)}\n\nUser message:\n${input.content}`
              }
            ]
          }
        ],
        max_output_tokens: 600
      })
    });

    if (!response.ok) {
      return fallbackReply(input);
    }

    const payload = (await response.json()) as {
      output_text?: string;
      output?: Array<{
        content?: Array<{
          text?: string;
        }>;
      }>;
    };
    const text =
      payload.output_text ??
      payload.output?.flatMap((item) => item.content ?? []).find((item) => item.text)?.text;

    return text?.trim() || fallbackReply(input);
  } catch {
    return fallbackReply(input);
  }
}

function loadExternalAnthropicEnv(): void {
  if (process.env.ANTHROPIC_API_KEY) return;

  const envPath =
    process.env.ANTHROPIC_ENV_FILE ??
    path.join(os.homedir(), "explore-persona-space", ".env");
  let body = "";
  try {
    body = fs.readFileSync(envPath, "utf8");
  } catch {
    return;
  }

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, name, rawValue] = match;
    if (!name.startsWith("ANTHROPIC_")) continue;
    process.env[name] = unquote(rawValue.trim());
  }
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function fallbackReply(input: { memories: MemoryRecord[]; inferredMemoryCount: number }): string {
  const stored = memoryContext(input.memories.slice(0, 2));
  const memoryText =
    input.inferredMemoryCount > 0
      ? ` I also stored ${input.inferredMemoryCount} memory item${input.inferredMemoryCount === 1 ? "" : "s"}.`
      : "";
  return `Noted. Current memory context: ${stored || "no stored memory yet"}.${memoryText} Ask for a change when you want the app or orchestrator to evolve.`;
}

function memoryContext(memories: MemoryRecord[]): string {
  return memories.map((memory) => `${memory.title}: ${memory.value}`).join("; ");
}
