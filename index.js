const { PATHS } = require("./config");
const { parseAllDailyNotes, parseRemindersInbox } = require("./src/parser");
const { routeItems } = require("./src/router");
const { runDigest } = require("./src/interactive");
const { writeAccueil, extractFeaturedName } = require("./src/accueil");
const {
  commitVault,
  rewriteAllSourceFiles,
  deleteEmptyDailyNotes,
  writeWishListItems,
  clearRemindersInbox,
  injectRemindersInDailyNote,
} = require("./src/writer");

// ---------------------------------------------------------------------------
// FLAGS
// ---------------------------------------------------------------------------

const DRY_RUN = process.argv.includes("--dry-run");

if (DRY_RUN) {
  console.log("\n⚠️  Mode dry-run — aucun fichier ne sera modifié.\n");
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function main() {
  // Step 1 — Parse all sources
  console.log("[1/6] Lecture des notes quotidiennes...");
  const dailySections = parseAllDailyNotes();

  console.log("[2/6] Lecture des Rappels iPhone...");
  const remindersItems = parseRemindersInbox();

  const targetFile = injectRemindersInDailyNote(remindersItems, DRY_RUN);
  if (targetFile) {
    remindersItems.forEach(item => { item.source = targetFile; });
  }

  // Step 2 — Route items into buckets
  console.log("[3/6] Routage des items...");
  const routed = routeItems(dailySections, remindersItems);

  const totalAutoRouted = routed.autoRouted.length;
  const totalDigest = routed.digest.length;
  const totalDone = routed.done.length;
  const totalContacter = routed.accueil.contacter.length;
  const totalEnCours = routed.accueil.enCours.length;

  console.log(`       → ${totalAutoRouted} item(s) routé(s) automatiquement`);
  console.log(`       → ${totalDigest} item(s) à trier dans le digest`);
  console.log(`       → ${totalContacter} item(s) Contacter`);
  console.log(`       → ${totalEnCours} item(s) EN COURS`);
  console.log(`       → ${totalDone} item(s) cochés à nettoyer`);

  // Step 3 — Interactive digest
  console.log("\n[4/6] Lancement du digest interactif...");
  const digestResult = await runDigest(routed.digest);

  // Step 4 — Safety commit before any file modification
  if (!DRY_RUN) {
    console.log("[5/6] Commit Git de sécurité...");
    const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    await commitVault(`digest: sauvegarde avant traitement (${timestamp})`);
  } else {
    console.log("[5/6] Commit Git ignoré en mode dry-run.");
  }

  // Step 5 — Write all outputs
  console.log("\n[6/6] Écriture des fichiers...");

  writeWishListItems(routed.autoRouted, DRY_RUN);

  const featuredName = extractFeaturedName();

  writeAccueil(
    {
      today: digestResult.today,
      soon: digestResult.soon,
      contacter: routed.accueil.contacter,
      enCours: routed.accueil.enCours,
    },
    featuredName,
    DRY_RUN
  );

  rewriteAllSourceFiles(routed, DRY_RUN);
  deleteEmptyDailyNotes(DRY_RUN);

  clearRemindersInbox([], DRY_RUN);

  // Step 6 — Summary
  console.log("\n" + "─".repeat(60));
  console.log("  Digest terminé");
  console.log("─".repeat(60));
  console.log(`  Auto-routés       : ${totalAutoRouted} item(s)`);
  console.log(`  Aujourd'hui       : ${digestResult.today.length} item(s)`);
  console.log(`  Ensuite           : ${digestResult.soon.length} item(s)`);
  console.log(`  Plus tard         : ${digestResult.later.length} item(s)`);
  console.log(`  Cochés nettoyés   : ${totalDone} item(s)`);
  if (DRY_RUN) {
    console.log("\n  ⚠️  Dry-run : aucun fichier modifié.");
  }
  console.log("─".repeat(60) + "\n");
}

main().catch((err) => {
  console.error("\n[erreur fatale]", err.message);
  process.exit(1);
});