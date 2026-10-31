import PDFDocument from 'pdfkit';
import { join } from 'node:path';
import { PAY_BASES } from './core.mjs';

export type InvoiceLine = { work_date: string; task_label: string; project_name: string; account_name: string; pay_basis: string; units: number; rate_cents: number; amount_cents: number };
export type Invoice = { number: string; employee_name: string; employee_email: string; paid_at: number; total_cents: number; reference: string; notes: string; items: InvoiceLine[] };
const currency = (cents: number) => (cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Render immutable invoice snapshots. Authorization remains in the invoice API. */
export async function invoicePdf(invoice: Invoice): Promise<Buffer> {
    const font = join(process.cwd(), 'node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff');
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, font, info: { Title: invoice.number, Author: 'Aces Intelligence', Subject: 'Paid work invoice' } });
    const chunks: Buffer[] = [];
    const complete = new Promise<Buffer>((resolve, reject) => {
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
    });
    const width = doc.page.width - 80;
    doc.fillColor('#2563eb').fontSize(11).text('ACES INTELLIGENCE', { align: 'center' });
    doc.fillColor('#172b4d').fontSize(24).text('Payment invoice', { align: 'center' });
    doc.fontSize(10).text(invoice.number, { align: 'center' }).moveDown(1.5);
    doc.fontSize(12).text(invoice.employee_name);
    doc.fontSize(9).text(invoice.employee_email).moveDown();
    doc.text('Paid on: ' + new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(invoice.paid_at)) + ' (Manila)');
    doc.fontSize(20).fillColor('#2563eb').text('PHP ' + currency(invoice.total_cents) + ' paid').moveDown(0.5);
    doc.fontSize(9).fillColor('#172b4d');
    if (invoice.reference) doc.text('Payment reference: ' + invoice.reference, { width }).moveDown(0.5);
    if (invoice.notes) doc.text('Notes: ' + invoice.notes, { width }).moveDown(0.5);
    doc.text('Payment recorded. Included tasks and hours are locked.').moveDown();

    const columns = [58, 85, 125, 64, 44, 65, width - 441];
    const labels = ['Work date', 'Task ID', 'Project / account', 'Pay basis', 'Units', 'Rate PHP', 'Paid PHP'];
    let y = doc.y + 10;
    const row = (cells: string[], header = false) => {
        doc.fontSize(8);
        const height = Math.max(...cells.map((text, i) => doc.heightOfString(text, { width: columns[i] - 12 }))) + 18;
        if (y + height > doc.page.height - 65) {
            doc.addPage(); y = 40;
            if (!header) row(labels, true);
        }
        if (header) doc.rect(40, y, width, height).fill('#eaf1ff');
        doc.fillColor('#172b4d');
        let x = 40;
        cells.forEach((text, i) => {
            doc.text(text, x + 6, y + 8, { width: columns[i] - 12, align: i >= 4 ? 'right' : 'left' });
            x += columns[i];
        });
        y += height;
        doc.moveTo(40, y).lineTo(40 + width, y).strokeColor('#e3eaf5').stroke();
    };
    row(labels, true);
    for (const line of invoice.items) row([
        line.work_date, line.task_label, [line.project_name, line.account_name].filter(Boolean).join('\n'),
        PAY_BASES[line.pay_basis as keyof typeof PAY_BASES] ?? line.pay_basis,
        line.units.toFixed(line.pay_basis === 'TASK' ? 0 : 4), currency(line.rate_cents), currency(line.amount_cents),
    ]);
    if (y + 50 > doc.page.height - 65) { doc.addPage(); y = 40; }
    doc.fontSize(12).text('Total paid: PHP ' + currency(invoice.total_cents), 40, y + 16, { width, align: 'right' });
    const pages = doc.bufferedPageRange();
    for (let index = pages.start; index < pages.start + pages.count; index++) {
        doc.switchToPage(index);
        doc.fontSize(8).fillColor('#64748b').text(`${invoice.number}  |  Page ${index + 1} of ${pages.count}`, 40, doc.page.height - 54, { width, align: 'center', lineBreak: false });
    }
    doc.end();
    return complete;
}
