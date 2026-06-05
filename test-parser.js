const { parseAllDailyNotes, parseRemindersInbox } = require("./src/parser");
const { routeItems } = require("./src/router");

// ---------------------------------------------------------------------------
// TEST — parser output on real daily notes
// ---------------------------------------------------------------------------

console.log("=== DAILY NOTES (raw parser output) ===\n");

const dailySections = parseAllDailyNotes();

if (Object.keys(dailySections).length === 0) {
  console.log("No sections found. Check PATHS.dailyNotes in config.js.");
} else {
  for (const [sectionKey, items] of Object.entries(dailySections)) {
    console.log(`--- ${sectionKey} (${items.length} items) ---`);
    for (const item of items) {
      const status = item.checked ? "[x]" : "[ ]";
      console.log(`  ${status} [${item.source}] ${item.text}`);
    }
    console.log();
  }
}

console.log("=== REMINDERS INBOX ===\n");

const reminders = parseRemindersInbox();
if (reminders.length === 0) {
  console.log("No reminders found (file missing or empty — expected at this stage).\n");
} else {
  for (const item of reminders) {
    console.log(`  ${item.text}`);
  }
  console.log();
}

// ---------------------------------------------------------------------------
// TEST — router output
// ---------------------------------------------------------------------------

console.log("=== ROUTER OUTPUT ===\n");

const routed = routeItems(dailySections, reminders);

console.log(`--- AUTO-ROUTED (${routed.autoRouted.length} items) ---`);
for (const { item, destination } of routed.autoRouted) {
  // Show only the last two path segments for readability
  const shortDest = destination.split("/").slice(-2).join("/");
  console.log(`  → ${shortDest}`);
  console.log(`    ${item.text.slice(0, 80)}${item.text.length > 80 ? "…" : ""}`);
}
console.log();

console.log(`--- ACCUEIL / Contacter (${routed.accueil.contacter.length} items) ---`);
for (const { item } of routed.accueil.contacter) {
  console.log(`  ${item.text}`);
}
console.log();

console.log(`--- ACCUEIL / EN COURS (${routed.accueil.enCours.length} items) ---`);
for (const { item } of routed.accueil.enCours) {
  console.log(`  ${item.text}`);
}
console.log();

console.log(`--- DIGEST (${routed.digest.length} items) ---`);
for (const { item } of routed.digest) {
  console.log(`  [${item.source}] ${item.text.slice(0, 80)}${item.text.length > 80 ? "…" : ""}`);
}
console.log();

console.log(`--- DONE / checked (${routed.done.length} items) ---`);
console.log(`  ${routed.done.length} items will be cleaned up by the writer.`);