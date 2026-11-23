/**
 * @file Report and certificate exports (FR-20, FR-28) — CSV and branded PDF, generated in the browser.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate, todayIso } from '@shared/time';
import type { HourLog, ReportResult } from '@shared/types';

/** Brand colors used in PDFs (RGB). */
const INK: [number, number, number] = [20, 32, 46];
const KIT: [number, number, number] = [242, 182, 0];
const COBALT: [number, number, number] = [31, 79, 209];

/**
 * Escapes one CSV cell (RFC 4180) and neutralizes spreadsheet formula injection.
 * @param value - Cell value.
 * @returns The escaped cell.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Builds CSV text.
 * @param headers - Column headers.
 * @param rows - Row values.
 * @returns CSV string with CRLF line endings.
 */
export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/**
 * Triggers a file download. The browser saves it to Downloads (or asks where, per its settings).
 * @param filename - Suggested file name.
 * @param blob - File contents.
 */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Turns a title into a safe file name.
 * @param title - Human title.
 * @returns A slug like `volunteer-hours-by-site-2026-11-21`.
 */
export function fileSlug(title: string): string {
  return `${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}-${todayIso()}`;
}

/**
 * Exports a report as CSV.
 * @param report - Computed report.
 * @param groupLabel - Header for the group column.
 */
export function exportReportCsv(report: ReportResult, groupLabel: string): void {
  const csv = toCsv(
    [groupLabel, `Value (${report.unit})`, 'Records'],
    [...report.rows.map((r) => [r.group, r.value, r.count]), ['Total', report.total, '']],
  );
  downloadBlob(
    `${fileSlug(report.title)}.csv`,
    new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }),
  );
}

/**
 * Rasterizes the first SVG inside an element (the Recharts chart) to a PNG data URL.
 * @param container - Element containing the chart.
 * @returns PNG data URL with its pixel size, or null if no chart is present.
 */
export async function chartToPng(
  container: HTMLElement | null,
): Promise<{ url: string; width: number; height: number } | null> {
  const svg = container?.querySelector('svg.recharts-surface') as SVGSVGElement | null;
  if (!svg) return null;
  const { width, height } = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  // Inline the CSS variables the chart uses so the image renders the same colors in the PDF.
  const styles = getComputedStyle(document.documentElement);
  let markup = new XMLSerializer().serializeToString(clone);
  markup = markup.replace(
    /var\((--[a-z0-9-]+)\)/g,
    (_, name: string) => styles.getPropertyValue(name).trim() || '#000',
  );
  const img = new Image();
  const blobUrl = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('chart render failed'));
      img.src = blobUrl;
    });
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { url: canvas.toDataURL('image/png'), width, height };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/**
 * Draws the Onboard header band on a PDF page, branded for the issuing organization.
 * @param doc - The PDF.
 * @param orgName - Organization issuing the document.
 * @param title - Document title.
 * @param subtitle - Second line (filters, date).
 */
function pdfHeader(doc: jsPDF, orgName: string, title: string, subtitle: string): void {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...INK);
  doc.rect(0, 0, w, 70, 'F');
  doc.setFillColor(...KIT);
  doc.roundedRect(40, 24, 44, 16, 8, 8, 'F');
  doc.setFillColor(...INK);
  [52, 62, 72].forEach((x) => doc.circle(x, 32, 3.4, 'F'));
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`Onboard · ${orgName}`, 96, 37);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Generated ${formatDate(todayIso())}`, w - 40, 37, { align: 'right' });
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(title, 40, 108);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(75, 90, 107);
  doc.text(subtitle, 40, 126);
}

/**
 * Exports a report as a branded PDF with chart, table, totals and the filters used (FR-28).
 * @param report - Computed report.
 * @param groupLabel - Header for the group column.
 * @param filtersText - Human description of the filters.
 * @param chartEl - Element containing the rendered chart (optional).
 */
export async function exportReportPdf(
  report: ReportResult,
  groupLabel: string,
  filtersText: string,
  chartEl: HTMLElement | null,
): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  pdfHeader(doc, report.orgName, report.title, `Filters: ${filtersText}`);
  doc.setFontSize(12);
  doc.setTextColor(...COBALT);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total: ${report.total.toLocaleString()} ${report.unit}`, 40, 150);
  let y = 166;
  const png = await chartToPng(chartEl);
  if (png) {
    const maxW = doc.internal.pageSize.getWidth() - 80;
    const h = Math.min(260, (png.height / png.width) * maxW);
    doc.addImage(png.url, 'PNG', 40, y, (png.width / png.height) * h, h);
    y += h + 16;
  }
  autoTable(doc, {
    startY: y,
    head: [[groupLabel, `Value (${report.unit})`, 'Records']],
    body: report.rows.map((r) => [r.group, r.value.toLocaleString(), String(r.count)]),
    foot: [['Total', report.total.toLocaleString(), '']],
    headStyles: { fillColor: INK },
    footStyles: { fillColor: [238, 241, 244], textColor: INK },
    styles: { fontSize: 10 },
    margin: { left: 40, right: 40 },
  });
  doc.save(`${fileSlug(report.title)}.pdf`);
}

/**
 * Generates a service-hours certificate for ONE organization (approved hours only, FR-20).
 * @param volunteer - The person.
 * @param orgName - Organization issuing the certificate.
 * @param logs - Their hour logs (non-approved are filtered out here as a safeguard).
 */
export function exportCertificate(
  volunteer: { firstName: string; lastName: string },
  orgName: string,
  logs: Array<HourLog & { session?: { site: { name: string } } }>,
): void {
  const approved = logs
    .filter((l) => l.status === 'APPROVED')
    .sort((a, b) => a.date.localeCompare(b.date));
  const total = approved.reduce((s, l) => s + l.hours, 0);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const w = doc.internal.pageSize.getWidth();
  pdfHeader(doc, orgName, 'Certificate of Volunteer Service', `Issued ${formatDate(todayIso())}`);
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text('This certifies that', w / 2, 180, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.text(`${volunteer.firstName} ${volunteer.lastName}`, w / 2, 220, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text('has completed', w / 2, 250, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(40);
  doc.setTextColor(...COBALT);
  doc.text(`${total} hours`, w / 2, 298, { align: 'center' });
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text('of approved volunteer service', w / 2, 326, {
    align: 'center',
  });
  doc.text(`with ${orgName}.`, w / 2, 344, { align: 'center' });
  autoTable(doc, {
    startY: 380,
    head: [['Date', 'Activity', 'Location', 'Hours']],
    body: approved.map((l) => [
      l.date,
      l.description,
      l.session?.site.name ?? 'Outreach / other',
      String(l.hours),
    ]),
    headStyles: { fillColor: INK },
    styles: { fontSize: 9 },
    margin: { left: 40, right: 40 },
  });
  const end = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 600;
  const sigY = Math.min(doc.internal.pageSize.getHeight() - 60, end + 60);
  doc.setDrawColor(...INK);
  doc.line(40, sigY, 240, sigY);
  doc.setFontSize(10);
  doc.text(`Authorized leader, ${orgName}`, 40, sigY + 14);
  doc.save(
    `service-hours-${volunteer.firstName}-${volunteer.lastName}-${todayIso()}.pdf`.toLowerCase(),
  );
}
