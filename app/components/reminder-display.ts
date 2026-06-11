import type { ReminderStatus } from "~/models/reminder.server";

type StatusInfo = {
  status: ReminderStatus;
  daysLeft: number | null;
  milesLeft: number | null;
};

export function statusBadgeClass(status: ReminderStatus): string {
  const base =
    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold";
  switch (status) {
    case "overdue":
      return `${base} bg-danger/15 text-danger`;
    case "due_soon":
      return `${base} bg-warn/15 text-warn`;
    case "done":
      return `${base} bg-sunken text-ink-muted`;
    default:
      return `${base} bg-ok/15 text-ok`;
  }
}

/** "overdue by 3 days" / "in 12 days · 300 mi left" / "done". */
export function statusLabel({
  status,
  daysLeft,
  milesLeft,
}: StatusInfo): string {
  if (status === "done") return "done";
  const parts: string[] = [];
  if (daysLeft != null) {
    if (daysLeft <= 0) {
      parts.push(daysLeft === 0 ? "due today" : `${-daysLeft}d overdue`);
    } else {
      parts.push(`in ${daysLeft}d`);
    }
  }
  if (milesLeft != null) {
    const miles = Math.round(Math.abs(milesLeft)).toLocaleString();
    parts.push(milesLeft <= 0 ? `${miles} mi past` : `${miles} mi left`);
  }
  if (parts.length === 0)
    return status === "overdue" ? "overdue" : "no due set";
  return parts.join(" · ");
}
