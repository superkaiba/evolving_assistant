# Self-Evolving Assistant Plan

## Product Definition

Build a single-user, VM-hosted, self-evolving general personal assistant. The assistant starts as a mobile-first app experience that works on web and on the user's Android device through an installed app shell. It can modify both its own app experience and its agent/orchestrator code over time.

The user interacts through text chat only in the first version. The assistant may create multiple tools, screens, dashboards, and workflows inside the app, but the messaging interface must always remain visible.

The product promise is:

> A personal assistant that adapts to the user by turning conversation into working app features.

## First-Version Decisions

- Mobile-first responsive web app plus an Android install path.
- The installed Android app should receive direct updates without requiring Play Store distribution.
- No voice input in version 1.
- No auth in version 1.
- Single-user on this VM.
- General personal assistant specialization.
- One evolving app, allowed to contain multiple screens/tools.
- Assistant messaging is always visible.
- Code changes auto-apply after checks pass.
- The assistant may modify both app code and agent/orchestrator code.
- Strongest available model is used everywhere for now.
- Inferred memories are automatic and silent.
- User can still inspect, edit, delete, and clear memories.
- Connectors are introduced only when needed, with clear instructions.
- Sub-agent work is visible in the UI.
- Snapshots and rollback are mandatory.

## Core User Experience

The app should feel like a useful assistant shell, not a plain chatbot.

The main screen should include:

- Persistent assistant messaging panel.
- Current generated/evolving app area.
- Visible task/sub-agent status.
- Version history and rollback access.
- Memory management access.
- Clear indication when the assistant is editing, checking, applying, or rolling back code.
- Direct Android update status when the installed Android app receives a new runtime or needs a new APK.

The assistant should prefer interactive UI over text-only answers when appropriate:

- Planning requests should become calendars, lists, kanban boards, or timelines.
- Tracking requests should become tables, charts, and dashboards.
- Writing requests should become editors or document views.
- Personal organization requests should become structured workflows.
- App evolution requests should show task progress, applied changes, and rollback controls.

## Approval And Autonomy

The default experience should be smooth and low-friction.

Code changes should auto-apply after checks pass. The system should still maintain recoverability:

- Snapshot before every change.
- Store the diff.
- Store command/check logs.
- Store a short changelog.
- Expose one-click rollback in the UI.

Approval strictness should be user-configurable later. The initial default is:

- Memory inference: automatic.
- Low-risk UI/content updates: automatic.
- Code changes: automatic after checks pass.
- External actions such as sending email, deleting data, spending money, or publishing externally: explicit approval.
- Connector authorization: user-triggered when the assistant explains the need.

## Direct Android App Updating

The assistant should support direct updates to the installed Android app without using the Play Store.

The recommended V1 approach is a stable Android shell plus remotely/directly updated app experience:

1. Install a signed Android APK on the user's Android device.
2. The APK acts as a stable assistant shell.
3. The evolving assistant UI, generated screens, and most app behavior are delivered from the VM-hosted app runtime.
4. When the agent changes app code, passing changes are applied on the VM and the Android shell reloads or refreshes into the new version.
5. The user experiences the app as updating directly, without app-store review or Play Store distribution.

This should be treated as a required product behavior, not a later deployment extra.

There are two update classes:

- Runtime updates: UI, JavaScript/TypeScript logic, screens, styles, assets, memory behavior, and assistant workflows. These should update directly in the installed Android app after checks pass.
- Native APK updates: changes to Android permissions, native modules, app icon, package metadata, background services, or other native capabilities. These require building a new signed APK. The assistant should generate the APK on the VM and expose an "Install update" flow.

For native APK updates, Android may require the user to allow installs from the update source and confirm installation. The app should give clear instructions and a direct update button. The system should not require Play Store or App Store distribution.

Implementation options:

- V1 practical path: Android WebView or Trusted Web Activity shell pointing at the VM-hosted assistant app. This gives immediate direct updates whenever the VM app updates.
- Later React Native path: Expo/React Native Android build with OTA-style JavaScript and asset updates for runtime changes, plus sideloaded APK updates for native changes.

The assistant should track Android update state:

- Current installed shell version.
- Current runtime version loaded in the Android app.
- Latest available runtime version.
- Whether a native APK update is required.
- Last successful Android refresh/update.
- Rollback target for the runtime currently served to Android.

## Security Model For V1

The first version runs locally on this VM, but should still keep a recoverable structure.

Required:

- Workspace snapshots before edits.
- Rollback command behind a UI button.
- Audit trail for file edits, commands, checks, and applied versions.
- Separate records for app changes versus orchestrator changes.
- Clear failure states when checks fail.
- Never hide a failed evolution attempt.

Acceptable for V1:

- Single-user local trust model.
- No auth.
- No separate per-user containers.
- Broad local filesystem access inside this project.

Later hardening:

- Containerized workspaces.
- Production secret isolation.
- Permission scopes.
- Prompt-injection defenses for connector content.
- Deployment environment separation.

## Architecture

### 1. Assistant Shell

Mobile-first responsive web app that contains:

- Persistent text messaging.
- Generated/evolving app surface.
- Sub-agent activity display.
- Version history.
- Rollback UI.
- Memory UI.

### 2. Agent Orchestrator

Backend service responsible for:

- Receiving user messages.
- Deciding whether to answer, update memory, or start an evolution task.
- Dispatching sub-agents.
- Tracking task status.
- Creating snapshots.
- Running code edits.
- Running checks.
- Applying changes automatically when checks pass.
- Recording changelogs, diffs, logs, and versions.

### 3. Workspace

The local project workspace that the assistant modifies.

It should contain:

- App source.
- Orchestrator source.
- Snapshot/version metadata.
- Check/build scripts.
- Logs.

### 4. Memory Store

Stores:

- User preferences.
- Stable facts the assistant should remember.
- Inferred patterns.
- App requirements.
- Past change summaries.

Memory should be automatically inferred without review friction. The user should still be able to view, edit, delete, or clear it.

### 5. Sub-Agent System

When the user requests a change, the orchestrator should create visible work items such as:

- Product interpretation.
- UI/design update.
- Code implementation.
- Check/build verification.
- Memory update.

For V1 these may be simulated or serialized internally, but the UI should be designed around visible agent work from the start.

## Snapshot And Rollback Requirements

Every evolution task must create a snapshot before edits.

Each version should store:

- Version ID.
- Timestamp.
- User request.
- Files changed.
- Diff summary.
- Full diff if practical.
- Check results.
- Changelog.
- Whether it changed app code, orchestrator code, or both.
- Rollback target.

Rollback should:

- Be available from the UI.
- Restore a previous snapshot.
- Immediately affect the VM-hosted runtime used by the Android app.
- Prompt or refresh the installed Android shell so the device returns to the rolled-back runtime.
- Create a new audit event.
- Clearly indicate success or failure.

## Suggested Initial Tech Stack

Use a stack optimized for fast local iteration:

- Frontend: React + TypeScript + Vite.
- Styling: CSS modules or plain CSS with a small design system.
- Backend: FastAPI or Node/Express.
- Storage: SQLite.
- Agent runtime: Python or Node, depending on the existing implementation direction.
- Process control: local shell commands.
- Checks: typecheck, lint, and build.
- Android direct app path: simple signed Android WebView/TWA shell for V1, or Expo Android with runtime updates if that proves faster in this workspace.

The Android shell should be installable directly on the user's Android device from a generated APK. Runtime app updates should not require rebuilding or reinstalling the APK unless native capabilities change.

## MVP Milestones

### Milestone 1: Static Assistant Shell

Build the first responsive app shell:

- Persistent messaging interface.
- Main evolving app area.
- Task/sub-agent status area.
- Version history placeholder.
- Memory placeholder.

### Milestone 2: Backend And Persistence

Add backend service and storage:

- User messages.
- Assistant responses.
- Memory records.
- Evolution tasks.
- Version records.
- Logs.

### Milestone 3: Snapshot System

Implement:

- Snapshot creation before changes.
- Version metadata.
- Rollback command.
- Rollback UI wiring.

### Milestone 4: Evolution Task Loop

Implement the first real evolution loop:

1. User requests a change.
2. Orchestrator creates a task.
3. UI shows sub-agent/task progress.
4. Snapshot is created.
5. Agent edits code.
6. Checks run.
7. Passing changes auto-apply.
8. Version history updates.
9. User sees the updated app.
10. Installed Android app refreshes to the updated runtime.

### Milestone 5: Memory System

Implement:

- Automatic memory inference.
- Memory storage.
- Memory UI.
- Edit/delete/clear controls.
- Memory context injection into assistant behavior.

### Milestone 6: Orchestrator Self-Modification

Allow the assistant to modify orchestrator code too:

- Mark orchestrator-changing tasks clearly.
- Snapshot before edit.
- Run stricter checks.
- Keep rollback available.

### Milestone 7: UI Quality Pass

Add standards and checks:

- Mobile viewport review.
- No text overflow.
- Loading, empty, and error states.
- Accessible contrast.
- Consistent spacing.
- Clear task states.
- No generic landing-page filler.

### Milestone 8: Android Direct Update Path

Implement:

- Signed Android APK shell.
- Device-accessible VM app URL or update endpoint.
- Runtime version check from the Android shell.
- Refresh/reload after successful app evolution.
- APK build artifact for native shell updates.
- UI state that distinguishes runtime updates from native APK updates.
- Clear Android install/update instructions when a new APK is required.

## Non-Goals For V1

- No voice input.
- No multi-user accounts.
- No Google OAuth unless a connector becomes necessary later.
- No app store deployment.
- No Play Store dependency.
- No payment system.
- No connector marketplace.
- No autonomous external actions without approval.
- No complex model routing; use the strongest model.

## Goal-Mode Objective

Build the local VM-hosted MVP described in this plan: a mobile-first responsive self-evolving general personal assistant with persistent text messaging, visible sub-agent task status, automatic code-change application after checks, snapshots, one-click rollback, memory storage and management, direct updates to an installed Android app shell without Play Store distribution, and the ability to evolve both the app code and agent/orchestrator code.
