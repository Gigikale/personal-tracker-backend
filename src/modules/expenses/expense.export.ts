import PDFDocument from 'pdfkit';

import { currencySymbol } from '../../lib/currency';

type ExportableExpense = {
  date: Date;
  description: string | null;
  amount: unknown;
  category: { name: string };
};

export interface ExportMeta {
  appName: string;
  preparedFor: string;
  periodLabel: string;
  currency: string;
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatDateLabel(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatAmount(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function buildPeriodLabel(
  from: Date | undefined,
  to: Date | undefined,
  expenses: { date: Date }[],
): string {
  if (from && to) return `${formatDateLabel(from)} to ${formatDateLabel(to)}`;
  if (from) return `From ${formatDateLabel(from)}`;
  if (to) return `Through ${formatDateLabel(to)}`;
  if (expenses.length === 0) return 'All time';

  const times = expenses.map((e) => e.date.getTime());
  const min = new Date(Math.min(...times));
  const max = new Date(Math.max(...times));
  return min.getTime() === max.getTime() ? formatDateLabel(min) : `${formatDateLabel(min)} to ${formatDateLabel(max)}`;
}

export function expensesToCsv(expenses: ExportableExpense[], meta: ExportMeta): string {
  const symbol = currencySymbol(meta.currency);
  const infoLines = [[meta.appName], [`Prepared for: ${meta.preparedFor}`], [`Period: ${meta.periodLabel}`], []];
  const header = ['Date', 'Category', 'Description', `Amount (${symbol})`];
  const rows = expenses.map((e) => [
    e.date.toISOString().slice(0, 10),
    e.category.name,
    e.description ?? '',
    Number(e.amount).toFixed(2),
  ]);
  return [...infoLines, header, ...rows]
    .map((row) => row.map((cell) => csvEscape(String(cell))).join(','))
    .join('\r\n') + '\r\n';
}

export function expensesToPdfBuffer(expenses: ExportableExpense[], meta: ExportMeta): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const symbol = currencySymbol(meta.currency);
    const columns = [
      { label: 'Date', width: 70 },
      { label: 'Category', width: 110 },
      { label: 'Description', width: 200 },
      { label: `Amount (${symbol})`, width: 80 },
    ];
    const startX = doc.page.margins.left;

    doc.fontSize(18).font('Helvetica-Bold').text(meta.appName, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#555').text(`Prepared for: ${meta.preparedFor}`, { align: 'center' });
    doc.text(`Period: ${meta.periodLabel}`, { align: 'center' });
    doc.fillColor('#000');
    doc.moveDown(1.2);
    let y = doc.y;

    const drawRow = (cells: string[], bold: boolean) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
      let x = startX;
      cells.forEach((cell, i) => {
        doc.text(cell, x, y, { width: columns[i].width, align: i === 3 ? 'right' : 'left' });
        x += columns[i].width;
      });
      y += 18;
      if (y > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
      }
    };

    drawRow(columns.map((c) => c.label), true);
    doc.moveTo(startX, y - 4).lineTo(startX + 460, y - 4).stroke();

    let total = 0;
    for (const expense of expenses) {
      const amount = Number(expense.amount);
      total += amount;
      drawRow(
        [expense.date.toISOString().slice(0, 10), expense.category.name, expense.description ?? '', formatAmount(amount)],
        false,
      );
    }

    y += 6;
    doc.moveTo(startX, y - 4).lineTo(startX + 460, y - 4).stroke();
    drawRow(['', '', 'Total', formatAmount(total)], true);

    doc.end();
  });
}
