const fs = require("fs");
const { PATHS } = require("../config");

// ---------------------------------------------------------------------------
// SECTION HEADERS
// ---------------------------------------------------------------------------

const H2 = {
  tachesDuJour: "## Tâches du jour",
  projets: "## Projets à suivre",
};

const H3 = {
  aujourdhui: "### ✅ Aujourd'hui",
  ensuite: "### Ensuite",
  contacter: "### ✉️ Contacter",
  enCours: "### ACTIVITÉS EN COURS",
};

// ---------------------------------------------------------------------------
// STATIC DATAVIEW BLOCKS (projects section)
// ---------------------------------------------------------------------------
// Always written verbatim — never read from the existing file.
// featuredName is injected dynamically by writeAccueil().

/**
 * Builds the full "Projets à suivre" section as a string.
 * The featuredName parameter is injected into the bloc 3 constant.
 *
 * @param {string} featuredName - file name without .md of the featured project
 * @returns {string}
 */
function buildStaticBlock(featuredName) {
  return `## Projets à suivre

### ⚡ En cours
\`\`\`dataviewjs
const energyLabel = { focus: "⚡ Focus", medium: "〰️ Moyen", auto: "💤 Auto" };

const folders = [
    '"01 PROJETS/01 Projets IT"',
    '"01 PROJETS/02 Projets Ecriture"',
    '"01 PROJETS/03 Projets Dessin"',
    '"01 PROJETS/04 Projets Crafts"',
    '"01 PROJETS/05 Projets E-shop"'
];

const pages = folders.flatMap(f =>
    dv.pages(f)
        .where(p => !p.file.tags.includes("#index") && !p.file.tags.includes("#liste"))
        .where(p => p.type === "actif")
        .where(p => p.statut !== "Terminé")
        .array()
).sort((a, b) => {
    const aPeriode = a.période ? 0 : 1;
    const bPeriode = b.période ? 0 : 1;
    if (aPeriode !== bPeriode) return aPeriode - bPeriode;
    return (a.priority ?? 99) - (b.priority ?? 99);
});

if (pages.length === 0) {
    dv.el("p", "Aucun projet actif en ce moment.");
} else {
    pages.forEach(p => {
        const energy = energyLabel[p.energy] ?? "";
        const next = p.next_action ?? "—";
        dv.el("div", \`- [ ] \${p.file.link} : \${next} (\${energy})\`, { cls: "dv-task" });
    });
}
\`\`\`

### Projets IT à avancer
\`\`\`dataviewjs
const energyLabel = { focus: "⚡ Focus", medium: "〰️ Moyen", auto: "💤 Auto" };

const pages = dv.pages('"01 PROJETS/01 Projets IT"')
    .where(p => !p.file.tags.includes("#index") && !p.file.tags.includes("#liste"))
    .where(p => p.type === "important")
    .where(p => p.statut !== "Terminé")
    .sort(p => p.priority ?? 99, "asc")
    .array();

if (pages.length === 0) {
    dv.el("p", "Aucun projet IT en attente.");
} else {
    pages.forEach(p => {
        const energy = energyLabel[p.energy] ?? "";
        const next = p.next_action ?? "—";
        dv.el("p", \`- [[\${p.file.name}|\${p.file.name}]] : \${next} (\${energy})\`);
    });
}
\`\`\`

### Et si tu travaillais sur… ?

\`\`\`dataviewjs
const energyLabel = { focus: "⚡ Focus", medium: "〰️ Moyen", auto: "💤 Auto" };

// featuredName is updated every 2-3 days by flux-a.js
const featuredName = "${featuredName}";

const pages = dv.pages().where(p => p.file.name === featuredName);

if (!featuredName || pages.length === 0) {
    dv.el("p", "Aucun projet sélectionné — lance flux-a.js pour initialiser.");
} else {
    const p = pages[0];
    const energy = energyLabel[p.energy] ?? "";
    const next = p.next_action ?? "—";
    dv.el("div", \`- [ ] [[\${p.file.name}|\${p.file.name}]] : \${next} (\${energy})\`, { cls: "dv-task" });
}
\`\`\`

### Activités disponibles :
\`\`\`dataviewjs
const energyLabel = { focus: "⚡ Focus", medium: "〰️ Moyen", auto: "💤 Auto" };
const energyOrder = { focus: 0, medium: 1, auto: 2 };

const itPages = dv.pages('"01 PROJETS/01 Projets IT"')
    .where(p => !p.file.tags.includes("#index") && !p.file.tags.includes("#liste"))
    .where(p => (p.type === "recurrent" || p.type === "detente") && p.statut !== "Terminé")
    .sort(p => energyOrder[p.energy] ?? 99, "asc")
    .array();

const creativePages = [
    '"01 PROJETS/02 Projets Ecriture"',
    '"01 PROJETS/03 Projets Dessin"',
    '"01 PROJETS/04 Projets Crafts"',
    '"01 PROJETS/05 Projets E-shop"',
    '"04 LOISIRS/02 Détente"'
].flatMap(f =>
    dv.pages(f)
        .where(p => !p.file.tags.includes("#index") && !p.file.tags.includes("#liste"))
        .where(p => (p.type === "recurrent" || p.type === "detente") && p.statut !== "Terminé")
        .array()
).sort((a, b) => (energyOrder[a.energy] ?? 99) - (energyOrder[b.energy] ?? 99));

const renderTable = (pages) => {
    dv.table(
        ["Catégorie", "Activité", "Énergie"],
        pages.map(p => [
            p.category ?? "—",
            p.file.link,
            energyLabel[p.energy] ?? "—"
        ])
    );
};

if (itPages.length > 0) {
    dv.el("h4", "IT");
    renderTable(itPages);
}

if (creativePages.length > 0) {
    dv.el("h4", "Créatif & Loisirs");
    renderTable(creativePages);
}

if (itPages.length === 0 && creativePages.length === 0) {
    dv.el("p", "Aucune activité disponible.");
}
\`\`\``;
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

/**
 * Extracts the date portion from a daily note filename.
 * "2026-05-26.md" → "2026-05-26"
 *
 * @param {string} filename
 * @returns {string}
 */
function dateFromFilename(filename) {
  return filename.replace(/\.md$/, "");
}

/**
 * Formats an item as a markdown checkbox with an Obsidian link to its source.
 * Result: "- [ ] Task description [[2026-05-26]]"
 *
 * Items from reminders-inbox.txt have no daily note source — no link added.
 *
 * @param {{ text: string, source: string }} item
 * @returns {string}
 */
function formatItemWithLink(item) {
  if (item.source === "reminders-inbox.txt") {
    return `- [ ] ${item.text}`;
  }
  const date = dateFromFilename(item.source);
  return `- [ ] ${item.text} [[${date}]]`;
}

/**
 * Formats a list of digest items as markdown checkboxes with source links.
 * Deduplicates by text content.
 *
 * @param {Array<{ item }>} items
 * @returns {string[]}
 */
function formatItems(items) {
  const seen = new Set();
  const result = [];
  for (const { item } of items) {
    const key = item.text.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(formatItemWithLink(item));
  }
  return result;
}

// ---------------------------------------------------------------------------
// SECTION BUILDERS
// ---------------------------------------------------------------------------

function buildAujourdhuiSection(newItems) {
  const lines = formatItems(newItems);
  const out = [H3.aujourdhui];
  out.push(lines.length > 0 ? lines.join("\n") : "_Aucune tâche pour aujourd'hui._");
  return out.join("\n");
}

function buildEnsuiteSection(newItems) {
  const lines = formatItems(newItems);
  const out = [H3.ensuite];
  out.push(lines.length > 0 ? lines.join("\n") : "_Aucune tâche pour bientôt._");
  return out.join("\n");
}

function buildContacterSection(items) {
  if (items.length === 0) return "";
  const lines = items.map(({ item }) => formatItemWithLink(item));
  return [H3.contacter, ...lines].join("\n");
}

function buildEnCoursSection(items) {
  if (items.length === 0) return "";
  const lines = items.map(({ item }) => formatItemWithLink(item));
  return [H3.enCours, ...lines].join("\n");
}

// ---------------------------------------------------------------------------
// MAIN WRITER
// ---------------------------------------------------------------------------

/**
 * Rewrites 🏠 Accueil.md with the two-group structure:
 *
 * ## Tâches du jour
 *   ### ✅ Aujourd'hui
 *   ### Ensuite
 *   ### ✉️ Contacter           (omitted if empty)
 *   ### ACTIVITÉS EN COURS     (omitted if empty)
 *
 * ## Projets à suivre
 *   ### ⚡ En cours
 *   ### Projets IT à avancer
 *   ### Et si tu travaillais sur… ?   (featuredName injected dynamically)
 *   ### Activités disponibles
 *
 * @param {{
 *   today:     Array<{ item }>,
 *   soon:      Array<{ item }>,
 *   contacter: Array<{ item }>,
 *   enCours:   Array<{ item }>
 * }} sections
 * @param {string} featuredName - file name without .md of the featured project
 * @param {boolean} dryRun
 */
function writeAccueil({ today, soon, contacter, enCours }, featuredName = "", dryRun = false) {
  const aujourdhuiSection = buildAujourdhuiSection(today);
  const ensuiteSection = buildEnsuiteSection(soon);
  const contacterSection = buildContacterSection(contacter);
  const enCoursSection = buildEnCoursSection(enCours);

  const tachesDuJourBlocks = [H2.tachesDuJour, "", aujourdhuiSection, "", ensuiteSection];
  if (contacterSection) tachesDuJourBlocks.push("", contacterSection);
  if (enCoursSection) tachesDuJourBlocks.push("", enCoursSection);

  const staticBlock = buildStaticBlock(featuredName);
  const newContent = tachesDuJourBlocks.join("\n") + "\n\n---\n\n" + staticBlock + "\n";

  if (dryRun) {
    console.log("\n[dry-run] 🏠 Accueil.md — contenu qui serait écrit :\n");
    console.log("─".repeat(60));
    console.log(newContent);
    console.log("─".repeat(60) + "\n");
    return;
  }

  fs.writeFileSync(PATHS.accueil, newContent, "utf-8");
  console.log("[accueil] 🏠 Accueil.md mis à jour.");
}

/**
 * Reads the current featuredName from 🏠 Accueil.md.
 * Looks for the line: const featuredName = "...";
 * Returns an empty string if not found.
 *
 * @returns {string}
 */
function extractFeaturedName() {
  try {
    const content = fs.readFileSync(PATHS.accueil, "utf-8");
    const match = content.match(/const featuredName = "([^"]*)"/);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

module.exports = { writeAccueil, extractFeaturedName };