const { SECTIONS, LABEL_ROUTING, LABEL_FALLBACK, PATHS } = require("../config");

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

/**
 * Extracts the bold label from an item's text, if present.
 * Matches the first **label** occurrence at the start of the text.
 * Returns null if no bold label is found.
 *
 * Examples:
 *   "**Article** : some link"  → "article"
 *   "**France TV** : something" → "france tv"
 *   "No label here"             → null
 *
 * @param {string} text
 * @returns {string|null} Lowercase label, or null
 */
function extractBoldLabel(text) {
  const match = text.match(/^\*\*(.+?)\*\*/);
  if (!match) return null;
  return match[1].trim().toLowerCase();
}

/**
 * Resolves the destination file path for an item from "Voir, lire, écouter".
 * Falls back to LABEL_FALLBACK if the label is unknown or absent.
 *
 * @param {string} text - Item text
 * @returns {string} Absolute path to the destination file
 */
function resolveWishListDestination(text) {
  const label = extractBoldLabel(text);
  if (label && LABEL_ROUTING[label]) {
    return LABEL_ROUTING[label];
  }
  return LABEL_FALLBACK;
}

// ---------------------------------------------------------------------------
// ROUTER
// ---------------------------------------------------------------------------

/**
 * Routes all parsed items into four buckets:
 *
 * - autoRouted:  items sent automatically to a wish list file (no digest)
 * - accueil:     items copied directly into 🏠 Accueil (Contacter, EN COURS)
 * - digest:      unchecked items requiring manual triage in the interactive CLI
 * - done:        checked items — kept for writer cleanup, never shown to user
 *
 * @param {Object} parsedSections - Output of parseAllDailyNotes()
 * @param {Array}  remindersItems - Output of parseRemindersInbox()
 * @returns {{
 *   autoRouted: Array<{ item, destination: string }>,
 *   accueil:    { contacter: Array, enCours: Array },
 *   digest:     Array<{ item }>,
 *   done:       Array<{ item }>
 * }}
 */
function routeItems(parsedSections, remindersItems = []) {
  const result = {
    autoRouted: [],
    accueil: {
      contacter: [],
      enCours: [],
    },
    digest: [],
    done: [],
  };

  for (const [sectionKey, items] of Object.entries(parsedSections)) {
    for (const item of items) {
      // Checked items go to done regardless of section — writer will clean them up
      if (item.checked) {
        result.done.push({ item });
        continue;
      }

      // --- Section: Voir, lire, écouter → auto-route to wish list files ---
      if (sectionKey === "voirLireEcouter") {
        const destination = resolveWishListDestination(item.text);
        result.autoRouted.push({ item, destination });
        continue;
      }

      // --- Section: À partager → always goes to Partages.md ---
      if (sectionKey === "aPartager") {
        result.autoRouted.push({ item, destination: PATHS.partages });
        continue;
      }

      // --- Sections: Contacter / EN COURS → copied directly to Accueil ---
      if (sectionKey === "contacter") {
        result.accueil.contacter.push({ item });
        continue;
      }

      if (sectionKey === "enCours") {
        result.accueil.enCours.push({ item });
        continue;
      }

      // --- Digest sections → manual triage ---
      if (SECTIONS.digest.includes(sectionKey) ||
          // Also catch any section key that matched a digest variant
          Object.values(SECTIONS).flat().includes(sectionKey)) {
        result.digest.push({ item });
        continue;
      }

      // Fallback: unrecognised section keys go to digest rather than being lost
      result.digest.push({ item });
    }
  }

  // Reminders inbox items always go to the interactive digest
  for (const item of remindersItems) {
    if (!item.checked) {
        result.digest.push({ item, fromReminders: true });
    }
  }

  return result;
}

module.exports = { routeItems, extractBoldLabel, resolveWishListDestination };