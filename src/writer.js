const fs = require("fs");
const path = require("path");
const simpleGit = require("simple-git");
const { PATHS } = require("../config");

// ---------------------------------------------------------------------------
// GIT
// ---------------------------------------------------------------------------

/**
 * Commits all pending changes in the vault with a timestamped message.
 * Acts as a safety net before any file modification.
 * Skips silently if there is nothing to commit.
 *
 * @returns {Promise<void>}
 */
async function commitVault(message) {
  const git = simpleGit(PATHS.vault);
  try {
    await git.add(".");
    const status = await git.status();
    if (status.files.length === 0) {
      console.log("[git] Aucun changement à committer.");
      return;
    }
    await git.commit(message);
    console.log(`[git] Commit effectué : "${message}"`);
  } catch (err) {
    // Git may not be initialised on the copy — warn but do not block execution
    console.warn(`[git] Commit ignoré : ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// SOURCE FILE REWRITER
// ---------------------------------------------------------------------------

/**
 * Determines whether a list item line should be removed from its source file.
 * An item is removed if it was classified (today/soon/later) or if it is checked.
 * Skipped items are left intact.
 *
 * @param {string} line - Raw markdown line from the source file
 * @param {Set<string>} processedRaws - Set of raw line strings to remove
 * @returns {boolean} True if the line should be kept
 */
function shouldKeepLine(line, processedRaws) {
  // Always keep non-list lines (headers, blank lines, plain text)
  if (!line.match(/^- \[[ x]\] /i)) return true;

  // Remove if this exact raw line was processed
  return !processedRaws.has(line);
}

/**
 * Rewrites a single daily note, removing all processed and checked items.
 * If the resulting file has no remaining unchecked items, it is deleted.
 * In dry-run mode, changes are only printed.
 *
 * @param {string} filename - e.g. "2026-06-02.md"
 * @param {Set<string>} processedRaws - Raw lines to remove from this file
 * @param {boolean} dryRun
 */
function rewriteSourceFile(filename, processedRaws, dryRun) {
  const filePath = path.join(PATHS.dailyNotes, filename);
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const keptLines = lines.filter((line) => shouldKeepLine(line, processedRaws));

  // Check whether any unchecked items remain
  const hasUncheckedItems = keptLines.some((line) =>
    line.match(/^- \[ \] /)
  );

  if (dryRun) {
    console.log(`\n[dry-run] ${filename}`);
    if (!hasUncheckedItems) {
      console.log("  → Serait supprimée (plus d'items non cochés)");
    } else {
      const removedCount = lines.length - keptLines.length;
      console.log(`  → ${removedCount} ligne(s) retirée(s), fichier conservé`);
    }
    return;
  }

  if (!hasUncheckedItems) {
    fs.unlinkSync(filePath);
    console.log(`[writer] ${filename} supprimée.`);
  } else {
    fs.writeFileSync(filePath, keptLines.join("\n"), "utf-8");
    console.log(`[writer] ${filename} mise à jour.`);
  }
}

/**
 * Processes all source daily notes.
 * Groups processed items by source file, then rewrites each file once.
 *
 * Only two categories of items are removed from source files:
 * - auto-routed items (written to wish lists — no longer needed in sources)
 * - done (checked) items — cleanup only
 *
 * Digest items (today/soon/later) and Contacter/EN COURS items are kept in
 * their source notes — Accueil displays them as a view with [[date]] links,
 * so the user can navigate to the source to check them off.
 *
 * @param {Object} routedResult - Full output of routeItems()
 * @param {boolean} dryRun
 */
function rewriteAllSourceFiles(routedResult, dryRun) {
  const toRemove = [
    ...routedResult.autoRouted.map((r) => r.item),
    ...routedResult.done.map((r) => r.item),
  ];

  // Group raw lines by source filename
  const byFile = new Map();
  for (const item of toRemove) {
    if (item.source === "reminders-inbox.txt") continue; // handled separately
    if (!byFile.has(item.source)) {
      byFile.set(item.source, new Set());
    }
    byFile.get(item.source).add(item.raw);
  }

  for (const [filename, processedRaws] of byFile.entries()) {
    rewriteSourceFile(filename, processedRaws, dryRun);
  }
}

// ---------------------------------------------------------------------------
// TODO FILE WRITER
// ---------------------------------------------------------------------------

/**
 * Reads the existing To Do file and extracts unchecked items by section
 * (Bientôt / Plus tard), so they can be merged with new items.
 *
 * @returns {{ soon: string[], later: string[] }}
 */
function readExistingTodoItems() {
  if (!fs.existsSync(PATHS.todo)) return { soon: [], later: [] };

  const content = fs.readFileSync(PATHS.todo, "utf-8");
  const lines = content.split("\n");

  const result = { soon: [], later: [] };
  let currentSection = null;

  for (const line of lines) {
    if (line.trim() === "## 🔜 Bientôt") { currentSection = "soon"; continue; }
    if (line.trim() === "## 🗓️ Plus tard") { currentSection = "later"; continue; }
    if (line.startsWith("## ")) { currentSection = null; continue; }

    if (!currentSection) continue;

    // Keep unchecked items only
    if (line.match(/^- \[ \] /)) {
      result[currentSection].push(line);
    }
  }

  return result;
}

/**
 * Writes the To Do file with three sections: Bientôt and Plus tard.
 * Merges new items with existing unchecked ones, deduplicating by text.
 *
 * @param {{ soon: Array<{ item }>, later: Array<{ item }> }} digestResult
 * @param {boolean} dryRun
 */
function writeTodoFile(digestResult, dryRun) {
  const existing = readExistingTodoItems();

  // Helper: merge new items with existing lines, deduplicating by text
  function mergeItems(newItems, existingLines) {
    const seen = new Set();
    const result = [];

    // New items first
    for (const { item } of newItems) {
      const key = item.text.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(`- [ ] ${item.text}`);
    }

    // Then preserved existing items not already present
    for (const line of existingLines) {
      const text = line.replace(/^- \[ \] /, "").trim().toLowerCase();
      if (seen.has(text)) continue;
      seen.add(text);
      result.push(line);
    }

    return result;
  }

  const soonLines = mergeItems(digestResult.soon ?? [], existing.soon);
  const laterLines = mergeItems(digestResult.later ?? [], existing.later);

  const sections = ["# To Do", ""];

  sections.push("## 🔜 Bientôt", "");
  if (soonLines.length > 0) {
    sections.push(...soonLines);
  } else {
    sections.push("_Aucune tâche pour bientôt._");
  }

  sections.push("", "## 🗓️ Plus tard", "");
  if (laterLines.length > 0) {
    sections.push(...laterLines);
  } else {
    sections.push("_Aucune tâche pour plus tard._");
  }

  const content = sections.join("\n") + "\n";

  if (dryRun) {
    console.log("\n[dry-run] To Do.md — contenu qui serait écrit :\n");
    console.log("─".repeat(60));
    console.log(content);
    console.log("─".repeat(60) + "\n");
    return;
  }

  fs.writeFileSync(PATHS.todo, content, "utf-8");
  console.log("[writer] To Do.md mis à jour.");
}

// ---------------------------------------------------------------------------
// WISH LIST APPENDER
// ---------------------------------------------------------------------------

/**
 * Appends auto-routed items to their destination wish list files.
 * Creates the file if it does not exist.
 * Deduplicates by checking existing file content before appending.
 *
 * @param {Array<{ item, destination: string }>} autoRouted
 * @param {boolean} dryRun
 */
function writeWishListItems(autoRouted, dryRun) {
  // Group items by destination file
  const byDest = new Map();
  for (const { item, destination } of autoRouted) {
    if (!byDest.has(destination)) byDest.set(destination, []);
    byDest.get(destination).push(item);
  }

  for (const [destPath, items] of byDest.entries()) {
    const existing = fs.existsSync(destPath)
      ? fs.readFileSync(destPath, "utf-8")
      : "";

    const linesToAppend = items
      .filter((item) => !existing.includes(item.text))
      .map((item) => `- [ ] ${item.text}`);

    if (linesToAppend.length === 0) continue;

    const shortDest = destPath.split("/").slice(-2).join("/");

    if (dryRun) {
      console.log(`\n[dry-run] ${shortDest} — lignes qui seraient ajoutées :`);
      linesToAppend.forEach((l) => console.log(`  ${l}`));
      continue;
    }

    // Ensure file ends with a newline before appending
    const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
    fs.appendFileSync(destPath, separator + linesToAppend.join("\n") + "\n", "utf-8");
    console.log(`[writer] ${linesToAppend.length} item(s) ajouté(s) dans ${shortDest}`);
  }
}

// ---------------------------------------------------------------------------
// REMINDERS INBOX CLEANER
// ---------------------------------------------------------------------------

/**
 * Clears the reminders export file after the digest has processed its items.
 * Skipped reminder items are preserved.
 *
 * @param {Array<{ item }>} skippedReminders - Items the user chose to skip
 * @param {boolean} dryRun
 */
function clearRemindersInbox(skippedReminders, dryRun) {
  const { inboxExportPath } = require("../config").REMINDERS;
  if (!fs.existsSync(inboxExportPath)) return;

  if (skippedReminders.length === 0) {
    if (dryRun) {
      console.log("\n[dry-run] reminders-inbox.txt — serait vidé.");
      return;
    }
    fs.writeFileSync(inboxExportPath, "", "utf-8");
    console.log("[writer] reminders-inbox.txt vidé.");
  } else {
    const remaining = skippedReminders.map((r) => r.item.text).join("\n") + "\n";
    if (dryRun) {
      console.log(`\n[dry-run] reminders-inbox.txt — ${skippedReminders.length} item(s) ignoré(s) conservé(s).`);
      return;
    }
    fs.writeFileSync(inboxExportPath, remaining, "utf-8");
    console.log(`[writer] reminders-inbox.txt : ${skippedReminders.length} item(s) ignoré(s) conservé(s).`);
  }
}

module.exports = {
  commitVault,
  rewriteAllSourceFiles,
  writeTodoFile,
  writeWishListItems,
  clearRemindersInbox,
};