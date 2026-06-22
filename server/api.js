const path = require("path");
const express = require("express");

const { parseAllDailyNotes, parseRemindersInbox } = require("../src/parser");
const { routeItems } = require("../src/router");
const { writeAccueil, extractFeaturedName } = require("../src/accueil");
const {
  commitVault,
  markItemsAsChecked,
  rewriteAllSourceFiles,
  deleteEmptyDailyNotes,
  writeWishListItems,
  clearRemindersInbox,
  injectRemindersInDailyNote,
} = require("../src/writer");

const app = express();
const PORT = process.env.PORT || 4242;

// DRY_RUN can be forced via `DRY_RUN=1 node server/api.js` for local testing
const FORCE_DRY_RUN = process.env.DRY_RUN === "1";

app.use(express.json({ limit: "2mb" }));

// ---------------------------------------------------------------------------
// GET /api/digest
// ---------------------------------------------------------------------------
// Mirrors index.js steps [1/6] to [3/6]. Stateless: returns everything the
// front needs to run the two-pass triage itself, with no server-side
// session — see the "stateless" decision made with the user.

app.get("/api/digest", (req, res) => {
  try {
    console.log("[GET /api/digest] Lecture des notes quotidiennes...");
    const dailySections = parseAllDailyNotes();

    console.log("[GET /api/digest] Lecture des Rappels iPhone...");
    const remindersItems = parseRemindersInbox();

    const { targetFile, injectedItems } = injectRemindersInDailyNote(remindersItems, FORCE_DRY_RUN);
    if (targetFile) {
      injectedItems.forEach((item) => {
        item.source = targetFile;
      });
    }

    const routed = routeItems(dailySections, injectedItems);

    console.log(`       → ${routed.autoRouted.length} item(s) routé(s) automatiquement`);
    console.log(`       → ${routed.digest.length} item(s) à trier dans le digest`);
    console.log(`       → ${routed.accueil.contacter.length} item(s) Contacter`);
    console.log(`       → ${routed.accueil.enCours.length} item(s) EN COURS`);
    console.log(`       → ${routed.done.length} item(s) cochés à nettoyer`);

    res.json({
      digest: routed.digest,
      autoRouted: routed.autoRouted,
      accueil: {
        contacter: routed.accueil.contacter,
        enCours: routed.accueil.enCours,
      },
      done: routed.done,
    });
  } catch (err) {
    console.error("[GET /api/digest] Erreur :", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/commit
// ---------------------------------------------------------------------------
// Mirrors index.js steps [4/6] to [6/6] (minus the interactive CLI itself,
// replaced by the React triage UI). The full triage state produced by the
// front is sent back in the request body — the server holds no state
// between /api/digest and /api/commit.

app.post("/api/commit", async (req, res) => {
  const dryRun = FORCE_DRY_RUN || req.body.dryRun === true;

  try {
    const {
      today = [],
      soon = [],
      alreadyDone = [],
      autoRouted = [],
      accueil = { contacter: [], enCours: [] },
      done = [],
    } = req.body;

    console.log(`[POST /api/commit] today=${today.length} soon=${soon.length} alreadyDone=${alreadyDone.length} dryRun=${dryRun}`);

    // Step 1 — Safety commit, before any modification (mirrors index.js [5/6])
    if (!dryRun) {
      const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      await commitVault(`digest web: sauvegarde avant traitement (${timestamp})`);
    } else {
      console.log("[POST /api/commit] Commit Git ignoré en mode dry-run.");
    }

    // Step 2 — Mark "Déjà fait" items as checked in their source notes.
    // Must run BEFORE rewriteAllSourceFiles(), see writer.js doc comment.
    markItemsAsChecked(alreadyDone, dryRun);

    // Step 3 — Write all outputs (mirrors index.js [6/6])
    writeWishListItems(autoRouted, dryRun);

    const featuredName = extractFeaturedName();

    writeAccueil(
      {
        today,
        soon,
        contacter: accueil.contacter,
        enCours: accueil.enCours,
      },
      featuredName,
      dryRun
    );

    // alreadyDone items are merged into "done" here — once marked as checked
    // above, they must be cleaned up from their source file exactly like any
    // other checked item. rewriteAllSourceFiles() itself is unchanged.
    rewriteAllSourceFiles(
      { autoRouted, done: [...done, ...alreadyDone] },
      dryRun
    );

    deleteEmptyDailyNotes(dryRun);
    clearRemindersInbox([], dryRun);

    res.json({
      ok: true,
      dryRun,
      summary: {
        today: today.length,
        soon: soon.length,
        alreadyDone: alreadyDone.length,
        autoRouted: autoRouted.length,
      },
    });
  } catch (err) {
    console.error("[POST /api/commit] Erreur :", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// STATIC FRONTEND
// ---------------------------------------------------------------------------
// Serves the React build (npm run build in web/). Placed after the API
// routes so they always take priority over the static fallback.

app.use(express.static(path.join(__dirname, "../web/dist")));

app.get("/*splat", (req, res) => {
  res.sendFile(path.join(__dirname, "../web/dist/index.html"));
});

// ---------------------------------------------------------------------------
// START
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`\n[server] Digest web disponible sur http://localhost:${PORT}`);
  if (FORCE_DRY_RUN) {
    console.log("[server] ⚠️  DRY_RUN=1 actif — aucun fichier ne sera modifié.\n");
  }
});