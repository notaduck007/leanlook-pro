import { differenceInCalendarDays, parseISO } from "date-fns";

export const CONSTRAINT_TYPES: { key: string; label: string }[] = [
  { key: "rfi", label: "RFI" },
  { key: "submittal", label: "Submittal" },
  { key: "material", label: "Material" },
  { key: "access", label: "Access" },
  { key: "design", label: "Design" },
  { key: "manpower", label: "Manpower" },
  { key: "permit", label: "Permit" },
  { key: "other", label: "Other" },
];

export const CONSTRAINT_STATUSES: { key: "open" | "in_progress" | "closed"; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "closed", label: "Closed" },
];

export function typeLabel(key?: string | null): string {
  if (!key) return "—";
  return CONSTRAINT_TYPES.find((t) => t.key === key)?.label || key;
}

export function statusLabel(key?: string | null): string {
  if (!key) return "—";
  return CONSTRAINT_STATUSES.find((s) => s.key === key)?.label || key;
}

/** Returns 'overdue' | 'soon' | 'ok' | null */
export function needByUrgency(date?: string | null, status?: string | null): "overdue" | "soon" | "ok" | null {
  if (!date) return null;
  if (status === "closed") return null;
  const days = differenceInCalendarDays(parseISO(date), new Date());
  if (days < 0) return "overdue";
  if (days <= 3) return "soon";
  return "ok";
}

export type ProjectConstraint = {
  id: string;
  project_id: string;
  company_id: string;
  type: string;
  description: string;
  owner_name: string | null;
  owner_user_id: string | null;
  need_by_date: string | null;
  status: "open" | "in_progress" | "closed" | string;
  created_by: string | null;
  created_at: string;
  resolved_at: string | null;
  lookahead_line_id: string | null;
  rank: number | null;
};