const baseUrl = process.env.ASSISTANT_URL ?? "http://127.0.0.1:8787";

async function request(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

const initial = await request("/api/state");
if (!Array.isArray(initial.messages) || !initial.android) {
  throw new Error("State payload is missing messages or Android state");
}

await request("/api/messages", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ content: "remember that I prefer concise status updates" })
});

const afterMemory = await request("/api/state");
if (!afterMemory.memories.some((memory) => memory.value.includes("concise status updates"))) {
  throw new Error("Memory inference did not persist a preference");
}

console.log("Smoke test passed");
