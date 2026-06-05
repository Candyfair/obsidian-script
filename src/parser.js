const fs = require("fs");
const path = require("path");
const { PATHS, DAILY_NOTES, SECTIONS } = require("../config");

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

/**
 * Normalises a raw section header to a canonical key defined in SECTIONS.
 * Returns null if the header does not match any known section.
 * @param {string} rawHeader - Header text without the leading "### "
 * @returns {string|null} - Canonical key (e.g. "voirLireEcouter") or null
 */
function normaliseSectionHeader(rawHeader) {
  const trimmed = rawHeader.trim();
  for (const [canonicalKey, variants] of Object.entries(SECTIONS)) {
    if (variants.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
      return canonicalKey;
    }
  }
  return null;
}

/**
 * Parses a single markdown list item line into a structured object.
 * Returns null if the line is not a valid markdown list item.
 * @param {string} line
 * @param {string} sourceFile - Filename of the note the item comes from
 * @returns {{ text: string, checked: boolean, raw: string, source: string }|null}
 */
function parseListItem(line, sourceFile) {
  // Matches "- [ ] text" or "- [x] text" (case-insensitive x)
  const match = line.match(/^- \[( |x)\] (.+)$/i);
  if (!match) return null;

  return {
    raw: line,
    text: match[2].trim(),
    checked: match[1].toLowerCase() === "x",
    source: sourceFile,
  };
}

// ---------------------------------------------------------------------------
// CORE PARSER
// ---------------------------------------------------------------------------

/**
 * Reads a single daily note file and extracts all list items grouped by
 * canonical section key. Checked items are included so the writer can
 * clean them up, but flagged separately.
 *
 * @param {string} filePath - Absolute path to the daily note file
 * @returns {{ [sectionKey: string]: Array<{ text, checked, raw, source }> }}
 */
function parseDailyNote(filePath) {
  const filename = path.basename(filePath);
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const sections = {};
  let currentSection = null;

  for (const line of lines) {
    // Detect section headers (### only — notes start directly with sections)
    if (line.startsWith("### ")) {
      const headerText = line.slice(4); // Remove leading "### "
      currentSection = normaliseSectionHeader(headerText);
      if (currentSection && !sections[currentSection]) {
        sections[currentSection] = [];
      }
      continue;
    }

    // Reset current section if we hit a higher-level header or a blank
    // separator that signals end of section (## or #)
    if (line.startsWith("## ") || line.startsWith("# ")) {
      currentSection = null;
      continue;
    }

    // Skip lines outside a recognised section
    if (!currentSection) continue;

    // Parse list items only — ignore plain text, sub-headers, etc.
    const item = parseListItem(line, filename);
    if (item) {
      sections[currentSection].push(item);
    }
  }

  return sections;
}

/**
 * Scans the entire daily notes folder and aggregates all extracted items
 * across all files matching the date filename pattern.
 * Files are processed in reverse chronological order (most recent first)
 * so items from newer notes appear at the top of each section.
 *
 * @returns {{ [sectionKey: string]: Array<{ text, checked, raw, source }> }}
 */
function parseAllDailyNotes() {
  const aggregated = {};

  const files = fs
    .readdirSync(PATHS.dailyNotes)
    .filter((f) => DAILY_NOTES.filePattern.test(f))
    .sort()
    .reverse(); // Most recent first

  for (const filename of files) {
    const filePath = path.join(PATHS.dailyNotes, filename);
    const sections = parseDailyNote(filePath);

    for (const [sectionKey, items] of Object.entries(sections)) {
      if (!aggregated[sectionKey]) {
        aggregated[sectionKey] = [];
      }
      aggregated[sectionKey].push(...items);
    }
  }

  return aggregated;
}

/**
 * Reads the Reminders inbox export file and returns a flat list of items.
 * Each line in the file is treated as a single untriaged item.
 * Returns an empty array if the file does not exist.
 *
 * @returns {Array<{ text: string, checked: false, raw: string, source: string }>}
 */
function parseRemindersInbox() {
  const { inboxExportPath } = require("../config").REMINDERS;

  if (!fs.existsSync(inboxExportPath)) {
    console.warn(
      `[parser] Reminders export not found at ${inboxExportPath} — skipping.`
    );
    return [];
  }

  const content = fs.readFileSync(inboxExportPath, "utf-8");
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      raw: line,
      text: line,
      checked: false,
      source: "reminders-inbox.txt",
    }));
}

module.exports = {
  parseAllDailyNotes,
  parseRemindersInbox,
};