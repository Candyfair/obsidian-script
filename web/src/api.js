// All fetch calls to the Express API live here, so App.jsx stays focused
// on UI state and components stay focused on rendering.

/**
 * Fetches the full digest payload: items to triage, plus the
 * auto-routed/contacter/enCours data needed later for the commit step.
 *
 * @returns {Promise<{ digest, autoRouted, accueil, done }>}
 */
export async function fetchDigest() {
  const res = await fetch("/api/digest");
  if (!res.ok) {
    throw new Error(`Échec du chargement du digest (${res.status})`);
  }
  return res.json();
}

/**
 * Sends the full triage result back to the server for writing.
 *
 * @param {{
 *   today: Array, soon: Array, alreadyDone: Array,
 *   autoRouted: Array, accueil: { contacter: Array, enCours: Array },
 *   done: Array, dryRun?: boolean
 * }} payload
 * @returns {Promise<{ ok: boolean, summary: Object }>}
 */
export async function commitDigest(payload) {
  const res = await fetch("/api/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Échec de la validation (${res.status})`);
  }
  return res.json();
}
