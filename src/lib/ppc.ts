/**
 * Shared Percent Plan Complete (PPC) helper.
 *
 * Canonical Lean / Last Planner definition — strictly BINARY:
 *   - Planned cells = day cells whose status is one of: "Y", "N", "50", "progress", "planned".
 *     Every planned commitment counts as 1 toward the denominator.
 *   - Completed = ONLY cells whose status is "Y" (fully complete).
 *     "50" / "progress" (in-progress / partial) do NOT contribute partial credit.
 *   - PPC = completed / planned, rounded to a whole percent.
 */

export type LineLike = {
  status_per_day?: Record<string, string> | null | any;
};

const PLANNED_STATUSES = new Set(["Y", "N", "50", "progress", "planned"]);

export interface PPCResult {
  /** Count of fully-completed cells (status === "Y"). */
  completed: number;
  /** Count of planned cells (denominator). */
  resolved: number;
  /** Whole-number percent (0-100). */
  ppc: number;
}

export function computePPC(lines: LineLike[]): PPCResult {
  let completed = 0;
  let resolved = 0;
  for (const line of lines) {
    const spd = (line.status_per_day || {}) as Record<string, string>;
    for (const status of Object.values(spd)) {
      if (!PLANNED_STATUSES.has(status)) continue;
      resolved++;
      if (status === "Y") completed += 1;
    }
  }
  const ppc = resolved > 0 ? Math.round((completed / resolved) * 100) : 0;
  return { completed, resolved, ppc };
}
