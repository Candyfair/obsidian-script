# obsidian-scripts

A personal task and project management automation system built around Obsidian, Node.js, and macOS tooling. Designed to eliminate the friction of starting a work session — choosing what to work on in under 30 seconds, with no decisions to make under pressure.

## Table of contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Flux A — Home page rotation](#flux-a--home-page-rotation)
- [Flux B — Interactive digest](#flux-b--interactive-digest)
- [Phase 4 — Reminders import](#phase-4--reminders-import)
- [How to use: recommended order of operations](#how-to-use-recommended-order-of-operations)
- [File reference](#file-reference)
- [Configuration](#configuration)
- [Key technical decisions](#key-technical-decisions)
- [Requirements](#requirements)

---

## Overview

The system operates on a single guiding principle: **what is not visible does not exist**.

Tasks captured throughout the day — in daily notes or in iPhone Reminders — are surfaced automatically at the start of a work session. A short interactive CLI (the "digest") lets you triage them into three buckets: today, soon, or later. The result is written to a home page in Obsidian (`🏠 Accueil.md`) that shows only what matters right now.

The system is designed around real constraints: unpredictable energy and available time, a tendency for important projects to become invisible behind daily urgencies, and a strong preference for systems that don't add friction to existing note-taking habits.

---

## Architecture

The system is split into two independent scripts and one macOS Shortcut.

```
obsidian-scripts/
├── index.js              # Flux B entry point — interactive digest
├── flux-a.js             # Flux A entry point — home page rotation
├── config.js             # All paths, section names, routing rules
├── run-digest.sh         # Shell wrapper called by the Automator app
├── reminders-inbox.txt   # Temporary buffer for iPhone Reminders (git-ignored)
└── src/
    ├── parser.js         # Reads daily notes and reminders-inbox.txt
    ├── router.js         # Routes items into buckets
    ├── interactive.js    # inquirer-based CLI digest
    ├── accueil.js        # Builds 🏠 Accueil.md content
    └── writer.js         # Writes all output files
```

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
                                                    interactive.js
                                                               │
                                          ┌────────────────────┤
                                          ▼                    ▼
                                      today/soon            later
                                          │
                                      writer.js
                                          │
                          ┌───────────────┼───────────────┐
                          ▼               ▼               ▼
                    🏠 Accueil.md   daily note      source cleanup
```

---

## Flux A — Home page rotation

**Script:** `flux-a.js`
**Trigger:** launchd (scheduled), or manual

Flux A handles the structural content of the home page: the featured project suggestion, the Dataview blocks for active projects, and the "available activities" table. It rotates the featured project name (`featuredName`) every 3 days and rewrites `🏠 Accueil.md` completely.

**What it does:**
- Reads all project files from the vault and picks a non-IT project to feature
- Preserves the task sections written by Flux B (`extractTaskSections()` — critical)
- Writes the full home page structure including Dataview queries

**Important:** the section titles in `config.js` and `flux-a.js` must always be kept in sync. If a section title changes in one place, it must change in both.

---

## Flux B — Interactive digest

**Script:** `index.js`
**Trigger:** Automator app in the Dock (calls `run-digest.sh` → Hyper terminal)

Flux B is the main daily workflow. It runs in two passes inside the terminal: first you select up to 3 tasks for today, then up to 5 for soon. Everything else goes to later automatically.

### Execution steps

```
[1/6] Parse daily notes
[2/6] Parse Reminders inbox
        └─► inject into daily note (### À la maison - autres)
        └─► update item source to point to daily note
[3/6] Route items into buckets
[4/6] Interactive digest (inquirer CLI)
[5/6] Safety Git commit
[6/6] Write outputs
        ├─► 🏠 Accueil.md
        ├─► wish list files (auto-routed items)
        ├─► daily note source cleanup
        └─► reminders-inbox.txt (cleared)
```

### Item routing logic

| Source section | Destination |
|---|---|
| `Voir, Lire, Ecouter` | Auto-routed to wish list files by label |
| `À partager` | Auto-routed to `Partages.md` |
| `Contacter` | Copied directly to Accueil (no digest) |
| `EN COURS` | Copied directly to Accueil (no digest) |
| All other sections | Interactive digest |
| Reminders inbox | Injected into daily note → interactive digest |

### Checked items

Checked items (`- [x]`) are never shown in the digest. They are removed from their source daily note during the write phase.

### Dry-run mode

```bash
node index.js --dry-run
```

In dry-run mode, no files are modified. All planned changes are printed to the console. The Git commit is skipped.

---

## Phase 4 — Reminders import

**Shortcut:** `Export Reminders Inbox` (macOS Shortcuts app)
**Buffer file:** `reminders-inbox.txt`

iPhone Reminders captured in the `📥 Inbox` list are exported to the local filesystem before the digest runs. The Shortcut handles capture; Node.js handles consumption.

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
- If you forget to run `index.js` after the Shortcut, reminders accumulate safely
- If you run the Shortcut multiple times, items are never lost (deduplication happens in `injectRemindersInDailyNote()`)
- `index.js` always clears the buffer after processing, regardless of triage outcome

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

**Step 2 — Launch the digest**
Click the `Digest` app in the Dock (or connect via Jump Desktop and click it remotely). This opens Hyper and runs `node index.js` automatically.

**Step 3 — Triage**
- Pass 1: select up to 3 tasks for today
- Pass 2: select up to 5 tasks for soon
- Everything else goes to later automatically

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
node index.js --dry-run
node flux-a.js --dry-run
```

---

## File reference

| File | Role |
|---|---|
| `index.js` | Flux B entry point. Orchestrates all steps. |
| `flux-a.js` | Flux A entry point. Rotates featured name, rewrites home page. |
| `config.js` | Single source of truth for all paths, section names, routing rules. |
| `run-digest.sh` | Shell wrapper. Called by the Automator app. Opens Hyper and sends `node index.js` via keystroke simulation. |
| `reminders-inbox.txt` | Temporary buffer. Written by the Siri Shortcut, read and cleared by `index.js`. Git-ignored. |
| `src/parser.js` | Reads all daily notes and `reminders-inbox.txt`. Returns structured objects. |
| `src/router.js` | Routes parsed items into `autoRouted`, `accueil`, `digest`, and `done` buckets. |
| `src/interactive.js` | inquirer v8 CLI. Two-pass selection (today / soon). |
| `src/accueil.js` | Builds the full content of `🏠 Accueil.md`. Preserves task sections written by Flux B. |
| `src/writer.js` | Writes all output files. Handles daily notes, wish lists, Accueil, Reminders injection, and Git commit. |

---

## Configuration

All paths and routing rules are centralised in `config.js`. Key values to update before deploying to a new vault:

```js
const VAULT_ROOT = "/Users/xxx/4 - Organisation/obsidian-vault";

const PATHS = {
  vault: VAULT_ROOT,
  dailyNotes: path.join(VAULT_ROOT, "07 NOTES QUOTIDIENNES"),
  accueil: path.join(VAULT_ROOT, "🏠 Accueil.md"),
  // ...
};

const REMINDERS = {
  inboxExportPath: "/Users/xxx/DEV/obsidian-scripts/reminders-inbox.txt",
  listName: "📥 Inbox",
};
```

**Important:** the `Voir, Lire, Ecouter` section name (without accents) was added manually to `config.js` on the production Mac mini. Preserve it when replacing the config file.

### Section name synchronisation

Section titles are defined in `config.js` under `SECTIONS`. The `extractTaskSections()` function in `flux-a.js` uses the same titles to preserve Flux B output when rewriting the home page. If you rename a section, update both files.

---

## Key technical decisions

- **`inquirer` pinned to v8** — v9+ uses ESM, incompatible with the current CommonJS architecture.
- **`gray-matter` date parsing** — YAML dates are converted to JS `Date` objects. `parseDate()` tests `instanceof Date` before `typeof string`. YAML dates must use `yyyy-mm-dd` format.
- **Hyper as terminal target** — `index.js` uses `inquirer` for interactive selection and cannot run silently in the background. The Automator app simulates keystrokes to send the command to Hyper rather than passing a script as an argument (Hyper interprets path arguments as directories).
- **`reminders-inbox.txt` outside the vault** — keeps the temporary buffer out of Obsidian search and Dataview queries, while keeping it versioned with the project code. The file is git-ignored.
- **Reminders injected before routing** — items from `reminders-inbox.txt` are written to the daily note before `parseAllDailyNotes()` processes them, so their `source` points to the daily note rather than the buffer file. This ensures `rewriteAllSourceFiles()` can clean them up correctly when they are checked off.

---

## Requirements

- Node.js (via nvm — path hardcoded in `run-digest.sh`, update if Node version changes)
- npm packages: `gray-matter`, `inquirer@8`, `simple-git`
- macOS with Reminders.app and Shortcuts.app (Sequoia 15+)
- Hyper terminal
- Obsidian with Dataview plugin and Homepage plugin
- Jump Desktop (optional, for remote access)