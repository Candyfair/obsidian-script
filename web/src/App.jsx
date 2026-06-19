import React, { useEffect, useMemo, useState } from "react";
import TaskItem from "./components/TaskItem.jsx";
import { fetchDigest, commitDigest } from "./api.js";

// Mirrors config.js DIGEST thresholds — kept in sync manually since the
// front has no access to the backend config module.
const MAX_TODAY = 3;
const MAX_SOON = 5;

export default function App() {
  const [status, setStatus] = useState("loading"); // loading | ready | committing | done | error
  const [error, setError] = useState(null);
  const [payload, setPayload] = useState(null); // raw GET /api/digest response
  // assignments: { [itemIndex]: "today" | "soon" | "done" }
  const [assignments, setAssignments] = useState({});
  const [commitSummary, setCommitSummary] = useState(null);

  useEffect(() => {
    fetchDigest()
      .then((data) => {
        setPayload(data);
        setStatus("ready");
      })
      .catch((err) => {
        setError(err.message);
        setStatus("error");
      });
  }, []);

  const counts = useMemo(() => {
    const result = { today: 0, soon: 0, done: 0 };
    for (const category of Object.values(assignments)) {
      result[category] += 1;
    }
    return result;
  }, [assignments]);

  function handleAssign(index, category) {
    setAssignments((prev) => {
      const next = { ...prev };
      if (next[index] === category) {
        // Tap on the already-active button → unassign (back to "later")
        delete next[index];
      } else {
        next[index] = category;
      }
      return next;
    });
  }

  async function handleValidate() {
    setStatus("committing");
    setError(null);

    const items = payload.digest;
    const today = [];
    const soon = [];
    const alreadyDone = [];

    items.forEach((entry, index) => {
      const category = assignments[index];
      if (category === "today") today.push(entry);
      else if (category === "soon") soon.push(entry);
      else if (category === "done") alreadyDone.push(entry);
      // unassigned → "later", not sent to writeAccueil, simply left in place
    });

    try {
      const result = await commitDigest({
        today,
        soon,
        alreadyDone,
        autoRouted: payload.autoRouted,
        accueil: payload.accueil,
        done: payload.done,
      });
      setCommitSummary(result.summary);
      setStatus("done");
    } catch (err) {
      setError(err.message);
      setStatus("ready"); // allow retry without losing the triage state
    }
  }

  if (status === "loading") {
    return <Centered>Chargement du digest…</Centered>;
  }

  if (status === "error" && !payload) {
    return (
      <Centered>
        <p className="error-text">Impossible de charger le digest.</p>
        <p className="error-detail">{error}</p>
      </Centered>
    );
  }

  if (status === "done") {
    return (
      <Centered>
        <p className="success-text">Digest validé.</p>
        <ul className="summary-list">
          <li>Aujourd'hui : {commitSummary.today}</li>
          <li>Bientôt : {commitSummary.soon}</li>
          <li>Déjà fait : {commitSummary.alreadyDone}</li>
        </ul>
        <p className="success-hint">Ouvre 🏠 Accueil.md dans Obsidian pour retrouver tes tâches.</p>
      </Centered>
    );
  }

  const items = payload.digest;

  return (
    <div className="app">
      <header className="app__header">
        <h1>Digest</h1>
        <div className="counters">
          <span className={counts.today >= MAX_TODAY ? "is-full" : ""}>
            Today {counts.today}/{MAX_TODAY}
          </span>
          <span className={counts.soon >= MAX_SOON ? "is-full" : ""}>
            Soon {counts.soon}/{MAX_SOON}
          </span>
          <span>Done {counts.done}</span>
        </div>
      </header>

      {error && <p className="error-banner">{error}</p>}

      {items.length === 0 ? (
        <p className="empty-state">Aucun item à trier — tout est déjà classé.</p>
      ) : (
        <ul className="task-list">
          {items.map((entry, index) => (
            <TaskItem
              key={index}
              item={entry.item}
              assignment={assignments[index] ?? null}
              onAssign={(category) => handleAssign(index, category)}
              disabled={{
                today: counts.today >= MAX_TODAY,
                soon: counts.soon >= MAX_SOON,
              }}
            />
          ))}
        </ul>
      )}

      <footer className="app__footer">
        <button
          type="button"
          className="btn-validate"
          onClick={handleValidate}
          disabled={status === "committing"}
        >
          {status === "committing" ? "Validation…" : "Valider le digest"}
        </button>
      </footer>
    </div>
  );
}

function Centered({ children }) {
  return <div className="centered-screen">{children}</div>;
}
