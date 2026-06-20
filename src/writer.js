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
// "DÉJÀ FAIT" MARKER (web digest only)
// ---------------------------------------------------------------------------

/**
 * Rewrites "- [ ] <text>" lines into "- [x] <text>" in their source daily
 * note, for items marked "Déjà fait" in the web digest.
 *
 * Must run BEFORE rewriteAllSourceFiles(), and the caller must merge these
 * items into routedResult.done afterwards — from that point on they are
 * cleaned up exactly like any other manually checked item. This mirrors
 * what would have happened had the user checked the box by hand in
 * Obsidian, and leaves a trace in the Git history (the line appears
 * checked in one commit before disappearing in the next) rather than
 * disappearing in a single irreversible step.
 *
 * Matching is done on item.raw (exact original line), mirroring the
 * matching strategy already used by shouldKeepLine().
 *
 * @param {Array<{ item: { text, raw, source } }>} alreadyDoneItems
 * @param {boolean} dryRun
 */
function markItemsAsChecked(alreadyDoneItems, dryRun) {
  if (alreadyDoneItems.length === 0) return;

  // Group by source file — several items can come from the same note
  const byFile = new Map();
  for (const { item } of alreadyDoneItems) {
    if (item.source === "reminders-inbox.txt") continue; // not applicable
    if (!byFile.has(item.source)) byFile.set(item.source, []);
    byFile.get(item.source).push(item);
  }

  for (const [filename, items] of byFile.entries()) {
    const filePath = path.join(PATHS.dailyNotes, filename);
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, "utf-8");
    let updatedContent = content;

    for (const item of items) {
      const checkedLine = item.raw.replace(/^- \[ \] /, "- [x] ");
      updatedContent = updatedContent.replace(item.raw, checkedLine);
    }

    if (dryRun) {
      console.log(`\n[dry-run] ${filename} — ${items.length} item(s) qui seraient coché(s) :`);
      items.forEach((i) => console.log(`  - [x] ${i.text}`));
      continue;
    }

    fs.writeFileSync(filePath, updatedContent, "utf-8");
    console.log(`[writer] ${items.length} item(s) coché(s) dans ${filename} (via "Déjà fait").`);
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
 * Returns true if the file has no meaningful content —
 * only section headers (lines starting with #) and blank lines.
 *
 * @param {string[]} lines
 * @returns {boolean}
 */
function isEmptyNote(lines) {
  return lines.every(line => line.trim() === "" || line.startsWith("#"));
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

  const hasUncheckedItems = keptLines.some((line) => line.match(/^- \[ \] /));
  const isEmpty = isEmptyNote(keptLines);
  const shouldDelete = !hasUncheckedItems || isEmpty;

  if (dryRun) {
    console.log(`\n[dry-run] ${filename}`);
    if (shouldDelete) {
      const reason = isEmpty ? "note vide (titres et lignes blanches uniquement)" : "plus d'items non cochés";
      console.log(`  → Serait supprimée (${reason})`);
    } else {
      const removedCount = lines.length - keptLines.length;
      console.log(`  → ${removedCount} ligne(s) retirée(s), fichier conservé`);
    }
    return;
  }

  if (shouldDelete) {
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
 * Two categories of items are removed from source files:
 * - auto-routed items (written to wish lists — no longer needed in sources)
 * - done (checked) items — cleanup only
 *
 * Items marked "Déjà fait" in the web digest must be merged into
 * routedResult.done by the CALLER (see server/api.js) after calling
 * markItemsAsChecked() — at that point they are functionally identical
 * to any other checked item, so this function's signature and behaviour
 * stay unchanged for index.js (CLI flow), which never produces
 * "Déjà fait" items.
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

/**
 * Scans all daily notes and deletes those that contain only
 * section headers and blank lines (no actionable content).
 *
 * @param {boolean} dryRun
 */
function deleteEmptyDailyNotes(dryRun) {
  const files = fs.readdirSync(PATHS.dailyNotes)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));

  for (const filename of files) {
    const filePath = path.join(PATHS.dailyNotes, filename);
    const lines = fs.readFileSync(filePath, "utf-8").split("\n");

    if (!isEmptyNote(lines)) continue;

    if (dryRun) {
      console.log(`[dry-run] ${filename} — serait supprimée (note vide)`);
      continue;
    }

    fs.unlinkSync(filePath);
    console.log(`[writer] ${filename} supprimée (note vide).`);
  }
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

// ---------------------------------------------------------------------------
// REMINDERS INJECTOR
// ---------------------------------------------------------------------------

/**
 * Injects reminder items into the most recent daily note under
 * "### À la maison - autres". Creates the section if absent.
 * Skips items already present in the file (deduplication by text).
 *
 * @param {Array<{ text: string, raw: string, source: string }>} remindersItems
 * @param {boolean} dryRun
 */
function injectRemindersInDailyNote(remindersItems, dryRun) {
  if (remindersItems.length === 0) return;

  // Find the most recent daily note
  const files = fs
    .readdirSync(PATHS.dailyNotes)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse();

  // If today's note doesn't exist, fall back to the most recent one
  const today = new Date().toISOString().slice(0, 10);
  const todayFile = `${today}.md`;
  let targetFile = files.includes(todayFile) ? todayFile : files[0];

  if (!targetFile) {
    if (dryRun) {
      console.log(`\n[dry-run] Aucune note quotidienne trouvée — ${todayFile} serait créée.`);
      return todayFile;  // ← on s'arrête ici en dry-run, le fichier n'existe pas
    }

    const template = [
      "### À faire - projets IT",
      "",
      "",
      "### À faire - projets créatifs",
      "",
      "",
      "### À la maison - sur l'ordi",
      "",
      "",
      "### À la maison - autres",
      "",
      "",
      "### Contacter",
      "",
      "",
      "### Voir, Lire, Ecouter",
      "",
      "",
      "### À partager",
      "",
      "",
      "### EN COURS",
      "",
      "",
    ].join("\n");

    fs.writeFileSync(path.join(PATHS.dailyNotes, todayFile), template, "utf-8");
    console.log(`[writer] Note quotidienne ${todayFile} créée.`);
    targetFile = todayFile;
  }

  const filePath = path.join(PATHS.dailyNotes, targetFile);
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  // Deduplicate: skip items already present in the file
  const itemsToInject = remindersItems.filter(
    (item) => !content.includes(item.text)
  );

  if (itemsToInject.length === 0) {
    console.log("[writer] Rappels déjà présents dans la note quotidienne — injection ignorée.");
    return;
  }

  const newLines = itemsToInject.map((item) => `- [ ] ${item.text}`);

  // Find the index of "### À la maison - autres"
  const sectionIndex = lines.findIndex((line) =>
    line.trim().toLowerCase() === "### à la maison - autres"
  );

  let updatedLines;

  if (sectionIndex !== -1) {
    // Insert after the section header, before the next non-empty line or next section
    let insertAt = sectionIndex + 1;
    // Skip any existing items in the section
    while (
      insertAt < lines.length &&
      !lines[insertAt].startsWith("###") &&
      !lines[insertAt].startsWith("##")
    ) {
      insertAt++;
    }
    updatedLines = [
      ...lines.slice(0, insertAt),
      ...newLines,
      ...lines.slice(insertAt),
    ];
  } else {
    // Section absent — append it at the end of the file
    updatedLines = [
      ...lines,
      "",
      "### À la maison - autres",
      ...newLines,
    ];
  }

  if (dryRun) {
    console.log(`\n[dry-run] ${targetFile} — ${itemsToInject.length} rappel(s) qui seraient injectés sous "### À la maison - autres" :`);
    newLines.forEach((l) => console.log(`  ${l}`));
    return;
  }

  fs.writeFileSync(filePath, updatedLines.join("\n"), "utf-8");
  console.log(`[writer] ${itemsToInject.length} rappel(s) injecté(s) dans ${targetFile}.`);

  return targetFile;
}

module.exports = {
  commitVault,
  markItemsAsChecked,
  rewriteAllSourceFiles,
  deleteEmptyDailyNotes,
  writeWishListItems,
  clearRemindersInbox,
  injectRemindersInDailyNote,
};
