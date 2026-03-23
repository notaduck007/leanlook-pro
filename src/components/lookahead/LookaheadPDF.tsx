import { LookaheadLineData } from "./LookaheadRow";
import { DayStatus } from "./StatusCell";
import { format, parseISO } from "date-fns";

function statusSymbol(s: DayStatus): string {
  switch (s) {
    case "Y": return "✓";
    case "N": return "✕";
    case "50": return "50%";
    case "planned": return "○";
    case "progress": return "→";
    default: return "";
  }
}

export function generateLookaheadPDF(
  projectName: string,
  weekStart: string,
  superName: string,
  lines: LookaheadLineData[],
  dates: string[]
): void {
  // Build an HTML table and print to PDF via window.print
  const html = buildPrintHTML(projectName, weekStart, superName, lines, dates);
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 500);
}

function buildPrintHTML(
  projectName: string,
  weekStart: string,
  superName: string,
  lines: LookaheadLineData[],
  dates: string[]
): string {
  const dateHeaders = dates
    .map((d) => {
      const dt = parseISO(d);
      return `<th style="text-align:center;font-size:9px;padding:2px 3px;border:1px solid #ccc;min-width:32px;">
        ${format(dt, "EEE")}<br/>${format(dt, "M/d")}
      </th>`;
    })
    .join("");

  const rows = lines
    .map((line) => {
      const cells = dates
        .map((d) => {
          const s = (line.status_per_day[d] as DayStatus) || "";
          const sym = statusSymbol(s);
          let bg = "#fff";
          let color = "#333";
          if (s === "Y") { bg = "#dcfce7"; color = "#166534"; }
          if (s === "N") { bg = "#fecaca"; color = "#991b1b"; }
          if (s === "50") { bg = "#fef9c3"; color = "#854d0e"; }
          if (s === "planned") { bg = "#dbeafe"; color = "#1e40af"; }
          if (s === "progress") { bg = "#fed7aa"; color = "#9a3412"; }
          return `<td style="text-align:center;font-size:10px;font-weight:bold;padding:3px;border:1px solid #ccc;background:${bg};color:${color};">${sym}</td>`;
        })
        .join("");

      return `<tr>
        <td style="padding:4px 6px;border:1px solid #ccc;font-size:11px;white-space:nowrap;">${line.task_name}</td>
        <td style="padding:4px 4px;border:1px solid #ccc;font-size:10px;">${line.assigned_trade || ""}</td>
        ${cells}
        <td style="padding:4px 4px;border:1px solid #ccc;font-size:10px;">${line.notes || ""}</td>
        <td style="padding:4px 4px;border:1px solid #ccc;font-size:10px;">${line.materials_needed || ""}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <title>2-Week Look-Ahead — ${projectName}</title>
  <style>
    @page { size: landscape; margin: 0.5in; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
    h1 { font-size: 18px; margin: 0 0 4px 0; color: #0f172a; }
    .meta { font-size: 12px; color: #64748b; margin-bottom: 12px; }
    table { border-collapse: collapse; width: 100%; }
    th { background: #f1f5f9; font-size: 10px; padding: 4px; border: 1px solid #ccc; }
    .legend { font-size: 10px; color: #64748b; margin-top: 8px; }
  </style>
</head>
<body>
  <h1>${projectName} — 2-Week Look-Ahead</h1>
  <div class="meta">
    Week of ${format(parseISO(weekStart), "MMMM d, yyyy")} · Superintendent: ${superName}
  </div>
  <table>
    <thead>
      <tr>
        <th style="text-align:left;min-width:160px;">Task</th>
        <th style="text-align:left;min-width:60px;">Trade</th>
        ${dateHeaders}
        <th style="text-align:left;min-width:100px;">Notes</th>
        <th style="text-align:left;min-width:80px;">Materials</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <div class="legend">
    ✓ = Complete &nbsp;&nbsp; ✕ = Not Done &nbsp;&nbsp; 50% = Partial &nbsp;&nbsp; ○ = Planned &nbsp;&nbsp; → = In Progress
  </div>
</body>
</html>`;
}
