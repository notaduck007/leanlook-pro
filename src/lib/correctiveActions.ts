import { differenceInCalendarDays, parseISO } from "date-fns";

export type CorrectiveActionStatus = "open" | "in_progress" | "done";

export const CORRECTIVE_ACTION_STATUSES: { key: CorrectiveActionStatus; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Done" },
];

export type CorrectiveAction = {
  id: string;
  company_id: string;
  project_id: string;
  lookahead_line_id: string | null;
  variance_reason: string | null;
  root_cause: string | null;
  action: string;
  owner_name: string | null;
  due_date: string | null;
  status: CorrectiveActionStatus | string;
  created_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export function actionStatusLabel(key?: string | null): string {
  if (!key) return "—";
  return CORRECTIVE_ACTION_STATUSES.find((s) => s.key === key)?.label || key;
}

/** Returns 'overdue' | 'soon' | 'ok' | null */
export function dueUrgency(date?: string | null, status?: string | null): "overdue" | "soon" | "ok" | null {
  if (!date) return null;
  if (status === "done") return null;
  const days = differenceInCalendarDays(parseISO(date), new Date());
  if (days < 0) return "overdue";
  if (days <= 3) return "soon";
  return "ok";
}