const path = require("path");
const simpleGit = require("simple-git");
const { selectFeaturedProject } = require("./src/featured");
const { writeAccueil } = require("./src/accueil");
const { PATHS } = require("./config");

// ---------------------------------------------------------------------------
// FLAGS
// ---------------------------------------------------------------------------

const dryRun = process.argv.includes("--dry-run");

if (dryRun) {
  console.log("⚠️  Mode dry-run activé — aucun fichier ne sera modifié.\n");
}

// ---------------------------------------------------------------------------
// GIT SAFETY COMMIT
// ---------------------------------------------------------------------------

/**
 * Commits all current changes before any modification.
 * Non-blocking — a warning is logged if Git is not initialized.
 *
 * @returns {Promise<void>}
 */
async function safetyCommit() {
  if (dryRun) {
    console.log("[dry-run] Commit de sécurité ignoré.\n");
    return;
  }

  const git = simpleGit(PATHS.vault);

  try {
    const status = await git.status();
    if (status.files.length === 0) {
      console.log("[git] Aucun changement en attente — commit ignoré.");
      return;
    }

    await git.add("-A");
    await git.commit("chore: safety commit before flux-a run");
    console.log("[git] ✔ Commit de sécurité effectué.");
  } catch (err) {
    console.warn(`[git] ⚠ Commit de sécurité ignoré : ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// FEATURED COMMIT
// ---------------------------------------------------------------------------

/**
 * Commits the last_featured update after the rotation.
 * Only called when a new project was actually selected (not when skipped
 * due to the rotation interval).
 *
 * @param {string} featuredName
 * @returns {Promise<void>}
 */
async function featuredCommit(featuredName) {
  if (dryRun) return;

  const git = simpleGit(PATHS.vault);

  try {
    await git.add("-A");
    await git.commit(`chore: update last_featured — ${featuredName}`);
    console.log(`[git] ✔ Commit last_featured — ${featuredName}`);
  } catch (err) {
    console.warn(`[git] ⚠ Commit last_featured ignoré : ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Flux A — Gestion des projets ===\n");

  // Step 1 — Safety commit before any modification
  await safetyCommit();

  // Step 2 — Select the featured project (updates last_featured in source note)
  const featuredName = selectFeaturedProject(PATHS.vault, dryRun);

  // Step 3 — Commit the last_featured update if a rotation actually happened
  if (featuredName) {
    await featuredCommit(featuredName);
  }

  // Step 4 — Rewrite Accueil.md with the new featuredName
  // The tasks sections (today, soon, contacter, enCours) are read from the
  // existing Accueil.md and passed through unchanged — Flux A only touches
  // the projects section.
  const existingContent = require("fs").readFileSync(PATHS.accueil, "utf-8");
  const taskSections = extractTaskSections(existingContent);

  writeAccueil(taskSections, featuredName ?? "", dryRun);

  // Step 5 — Final commit for Accueil.md update
  if (!dryRun && featuredName) {
    const git = simpleGit(PATHS.vault);
    try {
      await git.add("-A");
      await git.commit(`feat: rotate featured project — ${featuredName}`);
      console.log(`[git] ✔ Commit Accueil.md — ${featuredName}`);
    } catch (err) {
      console.warn(`[git] ⚠ Commit Accueil.md ignoré : ${err.message}`);
    }
  }

  console.log("\n=== Flux A terminé ===");
}

// ---------------------------------------------------------------------------
// TASK SECTION EXTRACTOR
// ---------------------------------------------------------------------------

/**
 * Reads the existing Accueil.md and extracts the four task arrays
 * (today, soon, contacter, enCours) so that Flux A can pass them
 * through to writeAccueil() unchanged.
 *
 * Flux A only manages the projects section — it must not erase the
 * tasks written by the last Flux B run.
 *
 * Each item is returned in the shape { item: { text, source } }
 * to match the format expected by writeAccueil().
 *
 * @param {string} content - full content of Accueil.md
 * @returns {{
 *   today:     Array<{ item: { text: string, source: string } }>,
 *   soon:      Array<{ item: { text: string, source: string } }>,
 *   contacter: Array<{ item: { text: string, source: string } }>,
 *   enCours:   Array<{ item: { text: string, source: string } }>
 * }}
 */
function extractTaskSections(content) {
  // Section header patterns — must match what writeAccueil() produces
  const HEADERS = {
    today:     "### ✅ Aujourd'hui",
    soon:      "### Ensuite",
    contacter: "### ✉️ Contacter",
    enCours:   "### ACTIVITÉS EN COURS",
    projects:  "## Projets à suivre",
  };

  const lines = content.split("\n");
  const sections = { today: [], soon: [], contacter: [], enCours: [] };

  let current = null;

  for (const line of lines) {
    // Stop reading when we reach the projects section
    if (line.startsWith(HEADERS.projects)) break;

    if (line === HEADERS.today)     { current = "today";     continue; }
    if (line === HEADERS.soon)      { current = "soon";      continue; }
    if (line === HEADERS.contacter) { current = "contacter"; continue; }
    if (line === HEADERS.enCours)   { current = "enCours";   continue; }

    // Switch section on any other ## or ### header
    if (line.startsWith("##"))      { current = null; continue; }

    // Only collect checkbox lines
    if (current && line.startsWith("- [ ]")) {
      // Parse "- [ ] text [[source]]" or "- [ ] text"
      const match = line.match(/^- \[ \] (.+?) (?:\[\[(.+?)\]\])?$/);
      if (match) {
        const text = match[1].trim();
        const source = match[2] ? `${match[2]}.md` : "reminders-inbox.txt";
        sections[current].push({ item: { text, source } });
      } else {
        // Fallback — keep the line text as-is without source
        const text = line.replace(/^- \[ \] /, "").trim();
        sections[current].push({ item: { text, source: "reminders-inbox.txt" } });
      }
    }
  }

  return sections;
}

main().catch(err => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});