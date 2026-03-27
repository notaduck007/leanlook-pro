import { LookaheadLineData } from "./LookaheadRow";
import { DayStatus } from "./StatusCell";

import { format, parseISO } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function statusSymbol(s: DayStatus): string {
  switch (s) {
    case "Y": return "Y";
    case "N": return "X";
    case "50": return "50";
    case "planned": return "P";
    case "progress": return "IP";
    default: return "";
  }
}

function statusColors(s: DayStatus): { fill: [number, number, number]; text: [number, number, number] } | null {
  switch (s) {
    case "Y": return { fill: [220, 252, 231], text: [22, 101, 52] };
    case "N": return { fill: [254, 202, 202], text: [153, 27, 27] };
    case "50": return { fill: [254, 249, 195], text: [133, 77, 14] };
    case "planned": return { fill: [219, 234, 254], text: [30, 64, 175] };
    case "progress": return { fill: [254, 215, 170], text: [154, 52, 18] };
    default: return null;
  }
}

interface PDFRow {
  task: string;
  trade: string;
  notes: string;
  materials: string;
  isParent: boolean;
  isSubtask: boolean;
  [dateKey: string]: string | boolean;
}

function buildHierarchicalRows(
  lines: LookaheadLineData[],
  dates: string[]
): PDFRow[] {
  // Group by parent
  const parentLines: LookaheadLineData[] = [];
  const childrenByParent = new Map<string, LookaheadLineData[]>();

  lines.forEach((l) => {
    if (l.parent_line_id) {
      const existing = childrenByParent.get(l.parent_line_id) || [];
      existing.push(l);
      childrenByParent.set(l.parent_line_id, existing);
    } else {
      parentLines.push(l);
    }
  });

  const rows: PDFRow[] = [];

  for (const parent of parentLines) {
    const taskName = parent.task_name || parent.custom_text || "";

    const parentRow: PDFRow = {
      task: taskName,
      trade: parent.assigned_trade || "",
      notes: parent.notes || "",
      materials: parent.materials_needed || "",
      isParent: childrenByParent.has(parent.id),
      isSubtask: false,
    };

    dates.forEach((d) => {
      parentRow[d] = statusSymbol((parent.status_per_day[d] as DayStatus) || "");
    });

    rows.push(parentRow);

    // Add children
    const children = childrenByParent.get(parent.id) || [];
    children.sort((a, b) => a.sort_order - b.sort_order);
    for (const child of children) {
      const childName = (child.task_name || child.custom_text || "").replace(/^↳\s*/, "");
      const childRow: PDFRow = {
        task: "    " + childName,
        trade: child.assigned_trade || "",
        notes: child.notes || "",
        materials: child.materials_needed || "",
        isParent: false,
        isSubtask: true,
      };
      dates.forEach((d) => {
        childRow[d] = statusSymbol((child.status_per_day[d] as DayStatus) || "");
      });
      rows.push(childRow);
    }
  }

  return rows;
}

export async function generateLookaheadPDF(
  projectName: string,
  weekStart: string,
  superName: string,
  lines: LookaheadLineData[],
  dates: string[]
): Promise<void> {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(`${projectName} -- 2-Week Look-Ahead`, 40, 36);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Week of ${format(parseISO(weekStart), "MMMM d, yyyy")}  |  Superintendent: ${superName}  |  Generated ${format(new Date(), "MMM d, yyyy h:mm a")}`,
    40, 50
  );

  // Build hierarchical rows
  const rows = buildHierarchicalRows(lines, dates);

  // Build columns
  const columns = [
    { header: "Task", dataKey: "task" },
    { header: "Trade", dataKey: "trade" },
    ...dates.map((d) => {
      const dt = parseISO(d);
      return { header: `${format(dt, "EEE")}\n${format(dt, "M/d")}`, dataKey: d };
    }),
    { header: "Notes", dataKey: "notes" },
    { header: "Materials", dataKey: "materials" },
  ];

  // Column widths
  const taskColWidth = 140;
  const tradeColWidth = 60;
  const notesColWidth = 72;
  const materialsColWidth = 64;
  const fixedWidth = taskColWidth + tradeColWidth + notesColWidth + materialsColWidth;
  const availableForDates = pageWidth - 80 - fixedWidth;
  const dateColWidth = Math.max(24, Math.floor(availableForDates / dates.length));

  const columnStyles: Record<string, any> = {
    task: { cellWidth: taskColWidth, fontSize: 7.5, halign: "left" },
    trade: { cellWidth: tradeColWidth, fontSize: 7, halign: "left" },
    notes: { cellWidth: notesColWidth, fontSize: 7, halign: "left" },
    materials: { cellWidth: materialsColWidth, fontSize: 7, halign: "left" },
  };

  dates.forEach((d) => {
    columnStyles[d] = { cellWidth: dateColWidth, fontSize: 8, halign: "center", fontStyle: "bold" };
  });

  autoTable(doc, {
    startY: 60,
    columns,
    body: rows,
    styles: {
      fontSize: 7.5,
      cellPadding: 2.5,
      lineColor: [200, 200, 200],
      lineWidth: 0.5,
      overflow: "ellipsize",
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [51, 65, 85],
      fontSize: 7,
      fontStyle: "bold",
      halign: "center",
      valign: "middle",
      cellPadding: 2,
    },
    columnStyles,
    alternateRowStyles: { fillColor: [249, 250, 251] },
    didParseCell: (data: any) => {
      if (data.section !== "body") {
        // Weekend shading for header
        if (data.section === "head" && dates.includes(data.column.dataKey)) {
          const dt = parseISO(data.column.dataKey);
          const day = dt.getDay();
          if (day === 0 || day === 6) {
            data.cell.styles.fillColor = [226, 232, 240];
          }
        }
        return;
      }

      const rowData = rows[data.row.index];
      if (!rowData) return;

      // Parent task styling: bold, darker background
      if (rowData.isParent && data.column.dataKey === "task") {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 8;
      }

      // Parent row background
      if (rowData.isParent) {
        data.cell.styles.fillColor = [230, 237, 246];
      }

      // Subtask styling: lighter text, indented (already has spaces in name)
      if (rowData.isSubtask) {
        data.cell.styles.fillColor = [245, 247, 250];
        if (data.column.dataKey === "task") {
          data.cell.styles.textColor = [100, 116, 139];
          data.cell.styles.fontSize = 7;
        }
      }

      // Color status cells
      if (dates.includes(data.column.dataKey)) {
        const raw = data.cell.raw as string;
        let status: DayStatus = "";
        if (raw === "Y") status = "Y";
        else if (raw === "X") status = "N";
        else if (raw === "50") status = "50";
        else if (raw === "P") status = "planned";
        else if (raw === "IP") status = "progress";

        const colors = statusColors(status);
        if (colors) {
          data.cell.styles.fillColor = colors.fill;
          data.cell.styles.textColor = colors.text;
        }
      }

      // New task highlight
      if (data.column.dataKey === "task") {
        const raw = data.cell.raw as string;
        if (raw.startsWith("[NEW] ")) {
          data.cell.styles.textColor = [30, 64, 175];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
    margin: { left: 40, right: 40 },
  });

  // Legend at bottom
  let finalY = (doc as any).lastAutoTable?.finalY || 500;
  const legendY = finalY + 14;
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("Y = Complete    X = Not Done    50 = Partial    P = Planned    IP = In Progress", 40, legendY);
  finalY = legendY;

  // Week-over-week comparison summary
  if (comparisonData) {
    finalY += 20;
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text("Week-Over-Week Summary", 40, finalY);

    finalY += 14;
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`- ${comparisonData.carriedOverCount} tasks carried over from last week`, 50, finalY);
    finalY += 11;
    doc.text(`- ${comparisonData.newCount} new tasks added this week`, 50, finalY);
    finalY += 11;
    doc.text(`- ${comparisonData.removedCount} tasks completed/removed since last week`, 50, finalY);
    if (comparisonData.previousPPC !== null) {
      finalY += 11;
      doc.text(`- Last week's PPC: ${comparisonData.previousPPC}%`, 50, finalY);
    }

    // List removed tasks
    if (comparisonData.removedLines.length > 0) {
      finalY += 16;
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("Completed/Removed Tasks:", 50, finalY);
      comparisonData.removedLines.forEach((line) => {
        finalY += 10;
        if (finalY > doc.internal.pageSize.getHeight() - 40) {
          doc.addPage();
          finalY = 40;
        }
        doc.text(`  - ${line.task_name}${line.assigned_trade ? ` (${line.assigned_trade})` : ""}`, 56, finalY);
      });
    }
  }

  // Page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - 40,
      doc.internal.pageSize.getHeight() - 20,
      { align: "right" }
    );
  }

  // Download
  const safeName = projectName.replace(/[^a-zA-Z0-9]/g, "_");
  const dateStr = format(parseISO(weekStart), "yyyy-MM-dd");
  doc.save(`${safeName}_LookAhead_${dateStr}.pdf`);
}
