const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

// Folders containing non-IT projects eligible for featured rotation
const CREATIVE_FOLDERS = [
    "01 PROJETS/02 Projets Ecriture",
    "01 PROJETS/03 Projets Dessin",
    "01 PROJETS/04 Projets Crafts",
    "01 PROJETS/05 Projets E-shop",
    "04 LOISIRS/02 Détente"
];

// Number of days before a featured project becomes eligible again
const ROTATION_INTERVAL_DAYS = 1;

/**
 * Parses a date value into a Date object.
 * Accepts either:
 *   - a string in ISO format yyyy-mm-dd
 *   - a Date object (gray-matter auto-converts ISO dates in YAML frontmatter)
 * Returns null if the value is empty or invalid.
 */
function parseDate(value) {
    if (!value) return null;

    // gray-matter parses ISO date strings as Date objects automatically
    if (value instanceof Date) {
        return isNaN(value.getTime()) ? null : value;
    }

    if (typeof value !== "string") return null;
    const parts = value.trim().split("-");
    if (parts.length !== 3) return null;
    const [year, month, day] = parts.map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
    return new Date(year, month - 1, day);
}

/**
 * Formats a Date object as yyyy-mm-dd (ISO format).
 * Dataview and Obsidian handle this format unambiguously.
 */
function formatDate(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Reads all markdown files from a folder and returns parsed candidates.
 * A candidate is a project with type "important" and statut !== "Terminé".
 */
function readCandidatesFromFolder(folderPath) {
    if (!fs.existsSync(folderPath)) return [];

    return fs.readdirSync(folderPath)
        .filter(f => f.endsWith(".md"))
        .map(f => {
            const filePath = path.join(folderPath, f);
            const raw = fs.readFileSync(filePath, "utf8");
            const { data } = matter(raw);
            return { filePath, fileName: f.replace(".md", ""), frontmatter: data };
        })
        .filter(p => {
            const tags = p.frontmatter.tags ?? [];
            if (tags.includes("#index") || tags.includes("#liste")) return false;
            if (p.frontmatter.type !== "important") return false;
            if (p.frontmatter.statut === "Terminé") return false;
            return true;
        });
}

/**
 * Selects the candidate with the oldest last_featured date.
 * Projects with an empty last_featured are treated as never featured (highest priority).
 * If multiple projects have the same date (or all are empty), the first one alphabetically is picked.
 */
function selectCandidate(candidates) {
    return candidates.sort((a, b) => {
        const dateA = parseDate(a.frontmatter.last_featured);
        const dateB = parseDate(b.frontmatter.last_featured);

        // null (never featured) always comes first
        if (!dateA && !dateB) return a.fileName.localeCompare(b.fileName);
        if (!dateA) return -1;
        if (!dateB) return 1;

        // Oldest date comes first
        return dateA - dateB;
    })[0];
}

/**
 * Checks whether the selected candidate was already featured recently
 * (within ROTATION_INTERVAL_DAYS). Used to skip the update in dry-run
 * diagnostics, not to block selection — we always want to show something.
 */
function isTooRecent(candidate) {
    const lastFeatured = parseDate(candidate.frontmatter.last_featured);
    if (!lastFeatured) return false;
    const now = new Date();
    const diffDays = (now - lastFeatured) / (1000 * 60 * 60 * 24);
    return diffDays < ROTATION_INTERVAL_DAYS;
}

/**
 * Writes the current date into the last_featured field of the note's frontmatter.
 * Preserves all other frontmatter fields and the full file body.
 */
function updateLastFeatured(filePath, dryRun) {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = matter(raw);
    const today = formatDate(new Date());

    // Replace only the last_featured line to avoid reformatting the entire YAML block
    const updatedContent = raw.replace(
        /^last_featured:.*$/m,
        `last_featured: ${today}`
    );

    if (dryRun) {
        console.log(`[dry-run] Would update last_featured → ${today} in ${path.basename(filePath)}`);
        return;
    }

    fs.writeFileSync(filePath, updatedContent, "utf8");
    console.log(`✔ last_featured mis à jour → ${today} dans ${path.basename(filePath)}`);
}

/**
 * Main function. Returns the file name (without .md) of the selected featured project,
 * or null if no eligible candidate was found.
 */
function selectFeaturedProject(vaultPath, dryRun = false) {
    const candidates = CREATIVE_FOLDERS.flatMap(folder =>
        readCandidatesFromFolder(path.join(vaultPath, folder))
    );

    if (candidates.length === 0) {
        console.log("ℹ Aucun projet créatif/loisirs au statut 'important' trouvé.");
        return null;
    }

    const selected = selectCandidate(candidates);

    if (isTooRecent(selected)) {
        console.log(`ℹ Le projet "${selected.fileName}" a été mis en avant il y a moins de ${ROTATION_INTERVAL_DAYS} jours — pas de rotation nécessaire.`);
        return selected.fileName;
    }

    updateLastFeatured(selected.filePath, dryRun);
    console.log(`⭐ Projet sélectionné : ${selected.fileName}`);

    return selected.fileName;
}

module.exports = { selectFeaturedProject };