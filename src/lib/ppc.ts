/**
 * Shared Percent Plan Complete (PPC) helper.
 *
 * Definition (canonical, used everywhere):
 *   - Resolved cells = day cells whose status is one of: "Y", "N", "50", "progress".
 *     Unresolved "planned" cells and blank/weekend cells are excluded.
 *   - Completed weight: "Y" = 1.0, "50"/"progress" = 0.5, "N" = 0.
 *   - PPC = completedWeight / resolved, rounded to a whole percent.
 */

export type LineLike = {
  status_per_day?: Record<string, string> | null | any;
};

const RESOLVED_STATUSES = new Set(["Y", "N", "50", "progress"]);

export interface PPCResult {
  /** Sum of completion weights (1.0 for Y, 0.5 for 50/progress). */
  completed: number;
  /** Count of resolved cells (denominator). */
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
      if (!RESOLVED_STATUSES.has(status)) continue;
      resolved++;
      if (status === "Y") completed += 1;
      else if (status === "50" || status === "progress") completed += 0.5;
    }
  }
  const ppc = resolved > 0 ? Math.round((completed / resolved) * 100) : 0;
  return { completed, resolved, ppc };
}
