# Self Evolving Assistant

Local VM-hosted MVP for a mobile-first self-evolving personal assistant.

## What It Includes

- React/Vite mobile-first assistant shell.
- Express/SQLite backend with persistent messages, memories, tasks, versions, audit events, snapshots, and rollback.
- Automatic source evolution loop with visible sub-agent style steps and checks before applying changes.
- Android WebView shell that can be sideloaded and pointed at the VM-hosted runtime for direct updates without Play Store distribution.
- Anthropic-first model adapter. It reads `ANTHROPIC_API_KEY` from `~/explore-persona-space/.env` at runtime and falls back to OpenAI/local behavior when unavailable.

## Run Locally

```bash
npm install
npm run dev
```

The web app runs at `http://localhost:5173/` and the API runs at `http://localhost:8787/`.

## Checks

```bash
npm run check
npm run smoke
```

## Android Shell

Install Android build tools once:

```bash
npm run android:install-tools
```

Build the signed sideload APK:

```bash
npm run android:build
```

The generated APK is intentionally ignored by git. The shell includes a runtime URL field so a physical Android device can point at the VM app URL and reload after runtime changes.

## Storage

Runtime state is stored under `.assistant/` and is intentionally ignored. Source snapshots are generated before evolution tasks and are used by the rollback flow.
