const inquirer = require("inquirer");
const { DIGEST } = require("../config");

// ---------------------------------------------------------------------------
// DISPLAY HELPERS
// ---------------------------------------------------------------------------

/**
 * Strips markdown formatting from item text for cleaner terminal display.
 * Removes bold (**text**), italic (*text*), and inline links [label](url)
 * while keeping the label text visible.
 *
 * @param {string} text
 * @returns {string}
 */
function stripMarkdown(text) {
  return text
    .replace(/\[(.+?)\]\(https?:\/\/[^\)]+\)/g, "$1") // [label](url) → label
    .replace(/\*\*(.+?)\*\*/g, "$1")                   // **bold** → bold
    .replace(/\*(.+?)\*/g, "$1")                        // *italic* → italic
    .replace(/_(.+?)_/g, "$1");                         // _italic_ → italic
}

/**
 * Builds an inquirer checkbox choice list from an array of digest items.
 *
 * @param {Array<{ item: { text, source } }>} items
 * @returns {Array} inquirer choice objects
 */
function buildCheckboxChoices(items) {
  return items.map(({ item }, index) => ({
    name: `[${item.source}] ${stripMarkdown(item.text)}`,
    value: index, // Use index as value to reliably map back to original items
    short: stripMarkdown(item.text).slice(0, 50),
  }));
}

// ---------------------------------------------------------------------------
// INTERACTIVE DIGEST
// ---------------------------------------------------------------------------

/**
 * Runs the interactive CLI digest in two checkbox passes:
 * - Pass 1: select up to DIGEST.maxToday items for "Aujourd'hui"
 * - Pass 2: select up to DIGEST.maxSoon items for "Bientôt" from remaining
 * - Everything else goes automatically to "Plus tard"
 *
 * @param {Array<{ item: { text, source, raw } }>} digestItems
 * @returns {Promise<{
 *   today:  Array<{ item }>,
 *   soon:   Array<{ item }>,
 *   later:  Array<{ item }>
 * }>}
 */
async function runDigest(digestItems) {
  const result = {
    today: [],
    soon: [],
    later: [],
  };

  if (digestItems.length === 0) {
    console.log("\nAucun item à trier. Le digest est vide.\n");
    return result;
  }

  console.log("\n" + "─".repeat(60));
  console.log(`  DIGEST — ${digestItems.length} item(s) à trier`);
  console.log("─".repeat(60) + "\n");

  // ---------------------------------------------------------------------------
  // PASS 1 — Aujourd'hui (max DIGEST.maxToday)
  // ---------------------------------------------------------------------------

  console.log(`Passe 1 / 2 — Aujourd'hui (max ${DIGEST.maxToday})\n`);

  const { todayIndexes } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "todayIndexes",
      message: `Sélectionne jusqu'à ${DIGEST.maxToday} tâche(s) à faire aujourd'hui :`,
      choices: buildCheckboxChoices(digestItems),
      pageSize: 20,
      validate(selected) {
        if (selected.length > DIGEST.maxToday) {
          return `Maximum ${DIGEST.maxToday} item(s) pour aujourd'hui.`;
        }
        return true;
      },
    },
  ]);

  const todaySet = new Set(todayIndexes);
  result.today = todayIndexes.map((i) => digestItems[i]);

  // Remaining items after pass 1
  const remainingAfterPass1 = digestItems.filter((_, i) => !todaySet.has(i));

  // ---------------------------------------------------------------------------
  // PASS 2 — Bientôt (max DIGEST.maxSoon)
  // ---------------------------------------------------------------------------

  console.log(`\nPasse 2 / 2 — Bientôt (max ${DIGEST.maxSoon})\n`);

  const { soonIndexes } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "soonIndexes",
      message: `Sélectionne jusqu'à ${DIGEST.maxSoon} tâche(s) pour bientôt :`,
      choices: buildCheckboxChoices(remainingAfterPass1),
      pageSize: 20,
      validate(selected) {
        if (selected.length > DIGEST.maxSoon) {
          return `Maximum ${DIGEST.maxSoon} item(s) pour bientôt.`;
        }
        return true;
      },
    },
  ]);

  const soonSet = new Set(soonIndexes);
  result.soon = soonIndexes.map((i) => remainingAfterPass1[i]);

  // Everything not selected in either pass goes to later
  result.later = remainingAfterPass1.filter((_, i) => !soonSet.has(i));

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------

  console.log("\n" + "─".repeat(60));
  console.log("  Résumé du digest");
  console.log("─".repeat(60));
  console.log(`  Aujourd'hui : ${result.today.length} item(s)`);
  console.log(`  Bientôt     : ${result.soon.length} item(s)`);
  console.log(`  Plus tard   : ${result.later.length} item(s)`);
  console.log("─".repeat(60) + "\n");

  return result;
}

module.exports = { runDigest, stripMarkdown };