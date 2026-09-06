# obsidian-scripts

A personal task and project management automation system built around Obsidian, Node.js, and macOS tooling. Designed to eliminate the friction of starting a work session — choosing what to work on in under 30 seconds, with no decisions to make under pressure.

## Table of contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Flux A — Home page rotation](#flux-a--home-page-rotation)
- [Flux B — Web interface (current)](#flux-b--web-interface-current)
- [Flux B — Legacy CLI (deprecated)](#flux-b--legacy-cli-deprecated)
- [Phase 4 — Reminders import](#phase-4--reminders-import)
- [How to use: recommended order of operations](#how-to-use-recommended-order-of-operations)
- [File reference](#file-reference)
- [Configuration](#configuration)
- [Key technical decisions](#key-technical-decisions)
- [Requirements](#requirements)

---

## Overview

The system operates on a single guiding principle: **what is not visible does not exist**.

Tasks captured throughout the day — in daily notes or in iPhone Reminders — are surfaced automatically at the start of a work session. A web interface (the "digest") lets you triage them into three buckets: today, soon, or already done. The result is written to a home page in Obsidian (`🏠 Accueil.md`) that shows only what matters right now.

The digest is accessed via a Dock/home-screen shortcut that opens a small web app in Safari — locally on the Mac mini, or remotely from iPhone/iPad over Tailscale. An earlier terminal-based CLI flow (Hyper + `inquirer`) was used during development and is kept in the codebase for reference, but is no longer part of the daily workflow — see [Flux B — Legacy CLI (deprecated)](#flux-b--legacy-cli-deprecated).

The system is designed around real constraints: unpredictable energy and available time, a tendency for important projects to become invisible behind daily urgencies, and a strong preference for systems that don't add friction to existing note-taking habits.

---

## Architecture

The system is split into two independent fluxes, sharing a common core, plus one macOS Shortcut.

```
obsidian-scripts/
├── index.js              # Flux B CLI entry point — deprecated, kept for reference
├── flux-a.js             # Flux A entry point — home page rotation
├── config.js             # All paths, section names, routing rules (shared by both fluxes)
├── run-digest.sh         # Deprecated — shell wrapper for the CLI flow (Hyper/Automator)
├── reminders-inbox.txt   # Temporary buffer for iPhone Reminders (git-ignored)
├── server/
│   └── api.js            # Express server — current Flux B entry point
├── web/
│   └── src/               # React frontend for the digest, served by server/api.js
└── src/
    ├── parser.js         # Reads daily notes and reminders-inbox.txt
    ├── router.js         # Routes items into buckets
    ├── interactive.js    # inquirer-based CLI digest — deprecated
    ├── accueil.js        # Builds 🏠 Accueil.md content
    └── writer.js         # Writes all output files
```

`parser.js`, `router.js`, `accueil.js`, and `writer.js` are shared, unmodified business logic — both the current web flow and the legacy CLI flow call the same functions with the same signatures.

### Data flow overview

```
iPhone Reminders ──► Siri Shortcut ──► reminders-inbox.txt ──┐
                                                               │
Daily notes (.md) ──────────────────────────────────────────►─┤
                                                               │
                                                    parser.js  │
                                                               ▼
                                                         router.js
                                                               │
                              ┌──────────────┬────────────────┤
                              ▼              ▼                 ▼
                         auto-routed      accueil           digest
                         (wish lists)   (direct copy)    (interactive)
                                                               │
                                          ┌────────────────────┤
                                          ▼                    ▼
                              server/api.js (current)   index.js (deprecated)
                              + web/src/ (React UI)      + interactive.js (inquirer)
                                          │                    │
                                          └─────────┬──────────┘
                                                     ▼
                                                 writer.js
                                                     │
                          ┌──────────────────────────┼───────────────┐
                          ▼                          ▼                ▼
                    🏠 Accueil.md              daily note      source cleanup
```

---

## Flux A — Home page rotation

**Script:** `flux-a.js`
**Trigger:** launchd (scheduled), or manual

Flux A handles the structural content of the home page: the featured project suggestion, the Dataview blocks for active projects, and the "available activities" table. It rotates the featured project name (`featuredName`) every 2–3 days and rewrites `🏠 Accueil.md` completely.

**What it does:**
- Reads all project files from the vault and picks a non-IT project to feature
- Preserves the task sections written by Flux B (`extractTaskSections()` — critical)
- Writes the full home page structure including Dataview queries

**Important:** the section titles in `config.js` and `flux-a.js` must always be kept in sync. If a section title changes in one place, it must change in both.

---

## Flux B — Web interface (current)

**Scripts:** `server/api.js` (Express) + `web/src/` (React frontend)
**Trigger:** Digest icon in the Dock / home screen → opens the web app in Safari
**Access:** immediate on the local network; from outside the house (iPhone/iPad away from home), access goes through Tailscale
**Runs via:** `launchd` service `com.candice.digest-web.plist` — the Express process is **persistent**, started once and left running.

This is the sole day-to-day entry point. The interface presents each item with three actions — **Today**, **Soon**, **Done** — with Today capped at 3 items and Soon at 5 (buttons disable once the cap is reached). Everything not explicitly picked goes to "later" automatically. The API is stateless: triage state lives in React state on the frontend and is only sent back to the server on commit, which makes the flow robust to an accidental page refresh over a remote connection.

### Item routing logic

| Source section | Destination |
|---|---|
| `Voir, Lire, Ecouter` | Auto-routed to wish list files by bold label |
| `À partager` | Auto-routed to `Partages.md` |
| `Contacter` | Copied directly to Accueil (no digest) |
| `EN COURS` | Copied directly to Accueil (no digest) |
| All other sections | Interactive digest (Today / Soon / Done) |
| Reminders inbox | Injected into daily note → interactive digest |

### Checked items

Checked items (`- [x]`) are never shown in the digest. They are removed from their source daily note during the write phase.

### ⚠️ `config.js` changes require a service restart

Because `server/api.js` runs as a **long-lived process**, Node does not reload `config.js` (or any other server-side file) after a code edit. Any change — a new routing label, a path update, a section rename — is silently ignored until the service is restarted:

```bash
launchctl unload ~/Library/LaunchAgents/com.candice.digest-web.plist
launchctl load ~/Library/LaunchAgents/com.candice.digest-web.plist
```

This was the root cause of a real bug: a newly added wish-list routing label kept falling back to `Autres.md` because the running server had `LABEL_ROUTING` loaded in memory from before the edit. Skipping this restart is the single most common cause of "my change didn't take effect."

---

## Flux B — Legacy CLI (deprecated)

**Script:** `index.js`
**Trigger (historical):** Automator app in the Dock (calls `run-digest.sh` → Hyper terminal)

This was the original Flux B interface, run entirely in a terminal via `inquirer`. It is **no longer used** — the web interface fully replaces it and is more practical, in particular from a phone or tablet. The code is kept in the repository for reference and because it still shares the same `parser.js` / `router.js` / `writer.js` / `accueil.js` core, but it is not part of the recommended workflow. See [Dependency cleanup](#key-technical-decisions) for what can eventually be removed.

<details>
<summary>Historical execution flow (click to expand)</summary>

```
[1/6] Parse daily notes
[2/6] Parse Reminders inbox
        └─► inject into daily note (### À la maison - autres)
        └─► update item source to point to daily note
[3/6] Route items into buckets
[4/6] Interactive digest (inquirer CLI, two passes: Today / Soon)
[5/6] Safety Git commit
[6/6] Write outputs
        ├─► 🏠 Accueil.md
        ├─► wish list files (auto-routed items)
        ├─► daily note source cleanup
        └─► reminders-inbox.txt (cleared)
```

Dry-run mode (still functional if the CLI is ever revived):

```bash
node index.js --dry-run
```

</details>

---

## Phase 4 — Reminders import

**Shortcut:** `Export Reminders Inbox` (macOS Shortcuts app)
**Buffer file:** `reminders-inbox.txt`

iPhone Reminders captured in the `📥 Inbox` list are exported to the local filesystem before the digest runs. The Shortcut handles capture; Node.js handles consumption. This part of the pipeline is shared by the current web flow (`server/api.js`) and is unaffected by the CLI deprecation.

### Shortcut flow

```
[Search Reminders] — list: 📥 Inbox, filter: not completed
        │
        ▼ (if results exist)
[Repeat for each reminder]
   └─► [Run Shell Script] — echo "title" >> reminders-inbox.txt
[End repeat]
[Run Shell Script] — osascript to mark all as completed
[Show notification] — "Rappels importés dans reminders-inbox.txt"
        │
        ▼ (if no results)
[Show notification] — "Aucun rappel à importer"
```

### Why a buffer file instead of direct injection

The Shortcut writes to `reminders-inbox.txt` in append mode. This means:
- If you forget to run the digest after the Shortcut, reminders accumulate safely
- If you run the Shortcut multiple times, items are never lost (deduplication happens in `injectRemindersInDailyNote()`)
- The buffer is always cleared after processing, regardless of triage outcome

### Reminders lifecycle in Node.js

```
reminders-inbox.txt
        │
        ▼
injectRemindersInDailyNote()
        ├─► finds today's daily note (or most recent, or creates today's from template)
        ├─► injects items under ### À la maison - autres
        └─► deduplicates — skips items already present
        │
        ▼
item.source updated to point to the daily note filename
        │
        ▼
items enter the digest pool like any other daily note task
        │
        ▼
clearRemindersInbox() — buffer always cleared after run
```

---

## How to use: recommended order of operations

### Starting a work session

**Step 1 — Export Reminders (optional, on iPhone or Mac)**
If you have items in `📥 Inbox`, run the `Export Reminders Inbox` Shortcut first. This can be done from iPhone before sitting down, or from Mac. If you skip this step, the digest runs without Reminders — nothing breaks.

**Step 2 — Open the digest**
Tap the `Digest` icon in the Dock or on the iPhone/iPad home screen. This opens the web interface in Safari — locally on the network, or via Tailscale from outside.

**Step 3 — Triage**
For each item, choose **Today** (max 3), **Soon** (max 5), or **Done**. Everything else goes to "later" automatically. Commit the selection when done.

**Step 4 — Work**
Open `🏠 Accueil.md` in Obsidian. Your tasks for today are in the first section. Each task links back to its source daily note — click the `[[date]]` link to open it and check off the task when done.

### Running Flux A

Flux A runs automatically via launchd. You can also trigger it manually:

```bash
node flux-a.js
```

Run Flux A manually if you want to immediately rotate the featured project or refresh the home page structure without waiting for the scheduled run.

### Testing changes

Always test with dry-run before running in production:

```bash
node index.js --dry-run    # exercises the shared parser/router/writer core
node flux-a.js --dry-run
```

Note: `node index.js --dry-run` is still the fastest way to test changes to `router.js` or `config.js` in isolation, even though `index.js` itself is deprecated as a daily-use entry point — it prints straight to your terminal, unlike the web flow whose output only appears in `logs/digest-web.log`.

---

## File reference

| File | Role |
|---|---|
| `server/api.js` | **Current** Flux B entry point. Express server, runs persistently via `launchd`. |
| `web/src/` | **Current** Flux B frontend. React app served by `server/api.js`. |
| `flux-a.js` | Flux A entry point. Rotates featured name, rewrites home page. |
| `config.js` | Single source of truth for all paths, section names, routing rules. Shared by both fluxes. |
| `src/parser.js` | Reads all daily notes and `reminders-inbox.txt`. Returns structured objects. |
| `src/router.js` | Routes parsed items into `autoRouted`, `accueil`, `digest`, and `done` buckets. |
| `src/accueil.js` | Builds the full content of `🏠 Accueil.md`. Preserves task sections written by Flux B. |
| `src/writer.js` | Writes all output files. Handles daily notes, wish lists, Accueil, Reminders injection, and Git commit. |
| `index.js` | **Deprecated.** Legacy CLI entry point. Kept for reference and for isolated `--dry-run` testing. |
| `src/interactive.js` | **Deprecated.** `inquirer` v8 CLI, two-pass selection (today / soon). |
| `run-digest.sh` | **Deprecated.** Shell wrapper for the legacy CLI. Opens Hyper and sends `node index.js` via keystroke simulation. |
| `reminders-inbox.txt` | Temporary buffer. Written by the Siri Shortcut, read and cleared by the digest. Git-ignored. |

---

## Configuration

All paths and routing rules are centralised in `config.js`. Key values to update before deploying to a new vault:

```js
const VAULT_ROOT = "/Users/candice/4 - Organisation/obsidian-vault";

const PATHS = {
  vault: VAULT_ROOT,
  dailyNotes: path.join(VAULT_ROOT, "07 NOTES QUOTIDIENNES"),
  accueil: path.join(VAULT_ROOT, "🏠 Accueil.md"),
  // ...
};

const REMINDERS = {
  inboxExportPath: "/Users/candice/DEV/obsidian-scripts/reminders-inbox.txt",
  listName: "📥 Inbox",
};
```

**Important:** the `Voir, Lire, Ecouter` section name (without accents) was added manually to `config.js` on the production Mac mini. Preserve it when replacing the config file.

**Also important:** since the digest now runs through the persistent Express server, any edit to `config.js` requires a `launchd` restart to take effect — see [⚠️ `config.js` changes require a service restart](#️-configjs-changes-require-a-service-restart).

### Section name synchronisation

Section titles are defined in `config.js` under `SECTIONS`. The `extractTaskSections()` function in `flux-a.js` uses the same titles to preserve Flux B output when rewriting the home page. If you rename a section, update both files.

---

## Key technical decisions

- **Web interface as the sole entry point** — the Express API + React frontend built for mobile access now fully replace the terminal-based CLI. Kept the legacy code rather than deleting it outright, since it shares the same core modules and is occasionally still useful for isolated `--dry-run` debugging.
- **Stateless API design** — triage state lives in React state on the frontend and is only sent to the server on commit, making the flow robust to accidental refreshes over a remote Tailscale connection.
- **`launchd` restart required after server-side edits** — Node.js does not hot-reload; `server/api.js` must be restarted via `launchctl unload` then `launchctl load` after any change to `config.js` or other files it depends on.
- **Express 5 wildcard route** — `app.get("*", ...)` is invalid with `path-to-regexp` v8; use `app.get("/*splat", ...)` instead.
- **`inquirer` pinned to v8** — v9+ uses ESM, incompatible with the current CommonJS architecture. Only relevant if the legacy CLI (`index.js`) is ever revived.
- **`gray-matter` date parsing** — YAML dates are converted to JS `Date` objects. `parseDate()` tests `instanceof Date` before `typeof string`. YAML dates must use `yyyy-mm-dd` format.
- **`reminders-inbox.txt` outside the vault** — keeps the temporary buffer out of Obsidian search and Dataview queries, while keeping it versioned with the project code. The file is git-ignored.
- **Reminders injected before routing** — items from `reminders-inbox.txt` are written to the daily note before parsing, so their `source` points to the daily note rather than the buffer file. This ensures source cleanup works correctly when they are checked off.

### Dependency cleanup candidates (not yet done)

Now that the CLI is deprecated, the following are no longer required for daily use but haven't been removed yet:

- `inquirer` dependency in `package.json` — only used by `index.js` / `src/interactive.js`.
- `index.js`, `src/interactive.js`, `run-digest.sh` — legacy CLI code and its shell wrapper.
- The Automator app (formerly in the Dock) and its Hyper terminal dependency.
- The `skippedReminders` parameter on `clearRemindersInbox()` — dead code, both current callers always pass `[]`.

---

## Requirements

- Node.js (via nvm — path hardcoded in `server/api.js`'s `launchd` plist, update if Node version changes)
- npm packages: `express`, `react`, `gray-matter`, `simple-git` (`inquirer@8` only if the legacy CLI is kept)
- Tailscale (for remote access to the web interface from iPhone/iPad away from home)
- macOS with Reminders.app and Shortcuts.app (Sequoia 15+)
- Obsidian with Dataview plugin and Homepage plugin
- Jump Desktop (optional, for remote Mac mini administration — e.g. restarting `launchd` services)
- Hyper terminal (optional, legacy CLI only)