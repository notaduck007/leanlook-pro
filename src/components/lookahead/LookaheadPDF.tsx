import { LookaheadLineData } from "./LookaheadRow";
import { DayStatus } from "./StatusCell";
import { ComparisonData } from "./WeekComparison";
import { format, parseISO } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function statusSymbol(s: DayStatus): string {
  switch (s) {
    case "Y": return "✓";
    case "N": return "✕";
    case "50": return "%";
    case "planned": return "○";
    case "progress": return "→";
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

export async function generateLookaheadPDF(
  projectName: string,
  weekStart: string,
  superName: string,
  lines: LookaheadLineData[],
  dates: string[],
  comparisonData?: ComparisonData | null
): Promise<void> {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(`${projectName} — 2-Week Look-Ahead`, 40, 36);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Week of ${format(parseISO(weekStart), "MMMM d, yyyy")}  ·  Superintendent: ${superName}  ·  Generated ${format(new Date(), "MMM d, yyyy h:mm a")}`,
    40, 50
  );

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

  // Build rows
  const lineKey = (taskId: string | null, customText: string | null) => taskId || customText || "";

  const rows = lines.map((line) => {
    const row: Record<string, string> = {
      task: line.task_name || line.custom_text || "",
      trade: line.assigned_trade || "",
      notes: line.notes || "",
      materials: line.materials_needed || "",
    };
    // Add comparison badge to task name
    if (comparisonData) {
      const key = lineKey(line.task_id, line.custom_text);
      if (key && comparisonData.newLineKeys.has(key)) {
        row.task = "[NEW] " + row.task;
      }
    }
    dates.forEach((d) => {
      row[d] = statusSymbol((line.status_per_day[d] as DayStatus) || "");
    });
    return row;
  });

  // Column widths
  const taskColWidth = 110;
  const tradeColWidth = 52;
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
      // Color status cells
      if (data.section === "body" && dates.includes(data.column.dataKey)) {
        const raw = data.cell.raw as string;
        let status: DayStatus = "";
        if (raw === "✓") status = "Y";
        else if (raw === "✕") status = "N";
        else if (raw === "%") status = "50";
        else if (raw === "○") status = "planned";
        else if (raw === "→") status = "progress";

        const colors = statusColors(status);
        if (colors) {
          data.cell.styles.fillColor = colors.fill;
          data.cell.styles.textColor = colors.text;
        }
      }

      // New task highlight - blue left border on task cell
      if (data.section === "body" && data.column.dataKey === "task") {
        const raw = data.cell.raw as string;
        if (raw.startsWith("[NEW] ")) {
          data.cell.styles.textColor = [30, 64, 175];
          data.cell.styles.fontStyle = "bold";
        }
      }

      // Weekend shading for header
      if (data.section === "head" && dates.includes(data.column.dataKey)) {
        const dt = parseISO(data.column.dataKey);
        const day = dt.getDay();
        if (day === 0 || day === 6) {
          data.cell.styles.fillColor = [226, 232, 240];
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
  doc.text("✓ Complete    ✕ Not Done    % Partial    ○ Planned    → In Progress", 40, legendY);
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
    doc.text(`• ${comparisonData.carriedOverCount} tasks carried over from last week`, 50, finalY);
    finalY += 11;
    doc.text(`• ${comparisonData.newCount} new tasks added this week`, 50, finalY);
    finalY += 11;
    doc.text(`• ${comparisonData.removedCount} tasks completed/removed since last week`, 50, finalY);
    if (comparisonData.previousPPC !== null) {
      finalY += 11;
      doc.text(`• Last week's PPC: ${comparisonData.previousPPC}%`, 50, finalY);
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
        doc.text(`  – ${line.task_name}${line.assigned_trade ? ` (${line.assigned_trade})` : ""}`, 56, finalY);
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
