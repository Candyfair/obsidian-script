import React from "react";
import { Check, CheckCheck, X } from "lucide-react";

// Strips the most common markdown markers for cleaner display — mirrors
// stripMarkdown() in src/interactive.js, kept here since the front never
// imports backend code directly.
function stripMarkdown(text) {
  return text
    .replace(/\[(.+?)\]\(https?:\/\/[^)]+\)/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1");
}

// "2026-06-02.md" → "2 juin" (no year — same-vault notes are always recent)
function formatSourceDate(filename) {
  if (!filename || filename === "reminders-inbox.txt") return null;
  const match = filename.match(/^(\d{4})-(\d{2})-(\d{2})\.md$/);
  if (!match) return null;
  const [, , month, day] = match;
  const monthNames = [
    "janv.", "févr.", "mars", "avr.", "mai", "juin",
    "juil.", "août", "sept.", "oct.", "nov.", "déc.",
  ];
  return `${parseInt(day, 10)} ${monthNames[parseInt(month, 10) - 1]}`;
}

// Each category maps to a fixed Lucide icon — icon colour never changes
// (always --color-cream, both active and inactive), only the button's
// background colour changes.
const ICONS = { today: Check, soon: CheckCheck, done: X };

/**
 * @param {{
 *   item: { text: string, source: string },
 *   assignment: "today" | "soon" | "done" | null,
 *   onAssign: (category: "today"|"soon"|"done") => void,
 *   disabled: { today: boolean, soon: boolean }
 * }} props
 */
export default function TaskItem({ item, assignment, onAssign, disabled }) {
  const dateLabel = formatSourceDate(item.source);

  return (
    <li className={`task-item${assignment ? ` is-${assignment}` : ""}`}>
      <div className="task-item__text">
        <p>{stripMarkdown(item.text)}</p>
        {dateLabel && <span className="task-item__date">{dateLabel}</span>}
      </div>
      <div className="task-item__actions">
        {(["today", "soon", "done"]).map((category) => {
          const isActive = assignment === category;
          // "done" never gets disabled — there is no maxDone limit
          const isDisabled = category !== "done" && !isActive && disabled[category];
          const Icon = ICONS[category];
          return (
            <button
              key={category}
              type="button"
              className={`btn-assign btn-assign--${category}${isActive ? " is-active" : ""}`}
              disabled={isDisabled}
              onClick={() => onAssign(category)}
              aria-pressed={isActive}
              aria-label={category}
            >
              <Icon size={18} strokeWidth={2.5} />
            </button>
          );
        })}
      </div>
    </li>
  );
}
