import type { Invoice } from './invoice-pdf';
import type { Client, InStatement } from '@libsql/client';
import { getClient } from './database';
import { PAYROLL_SCHEMA } from './payroll-schema.mjs';
import { taskHours, day } from './core.mjs';
import { payableWork } from './payroll-core.mjs';
import { sha, id, fail } from './auth';

type Row = Record<string, any>;
type Reader = Pick<Client, 'execute'>;
let schemaReady: Promise<void> | undefined;
export function ensurePayrollSchema() {
    if (!schemaReady) schemaReady = (async () => {
        const client = getClient();
        await client.execute(PAYROLL_SCHEMA[0]);
        if (!(await client.execute('SELECT version FROM payroll_schema_version WHERE version=1')).rows.length) await client.batch(PAYROLL_SCHEMA, 'write');
    })().catch(error => { schemaReady = undefined; throw error; });
    return schemaReady;
}
const rows = async (reader: Reader, sql: string, args: any[] = []) => (await reader.execute({ sql, args })).rows as Row[];
export async function payrollData(user: Row, reader: Reader = getClient()) {
    const suffix = user.role === 'ADMIN' ? '' : ' WHERE t.user_id=?', args = user.role === 'ADMIN' ? [] : [user.id];
    const tasks = await rows(reader, 'SELECT t.*,p.invoice_id AS paid_invoice_id FROM task_entries t LEFT JOIN payment_tasks p ON p.task_id=t.id' + suffix, args);
    const times = await rows(reader, 'SELECT t.*,p.invoice_id AS paid_invoice_id FROM time_entries t LEFT JOIN payment_times p ON p.time_entry_id=t.id' + suffix, args);
    const sheets = await rows(reader, 'SELECT t.* FROM timesheets t' + suffix, args);
    const reviews = await rows(reader, 'SELECT r.* FROM task_hour_reviews r JOIN task_entries t ON t.id=r.task_id' + suffix, args);
    return { tasks: tasks.map(task => taskHours(task, times, reviews.find(review => review.task_id === task.id), sheets)), times, sheets,
        users: await rows(reader, 'SELECT id,name,email FROM users' + (user.role === 'ADMIN' ? '' : ' WHERE id=?'), args),
        projects: await rows(reader, 'SELECT * FROM projects'), accounts: await rows(reader, 'SELECT * FROM accounts') };
}
export async function paymentPreview(user: Row, filters: Row, reader: Reader = getClient()) {
    const preview = payableWork(await payrollData(user, reader), filters);
    return { ...preview, signature: await sha(JSON.stringify(preview.items)) };
}
export async function recordPayment(user: Row, input: Row) {
    const tx = await getClient().transaction('write');
    try {
        const previous = (await rows(tx, 'SELECT * FROM payment_batches WHERE id=?', [input.request_id]))[0];
        if (previous) {
            if (previous.created_by !== user.id) fail('This payment request is already in use.', 409);
            const invoices = await rows(tx, 'SELECT * FROM payment_invoices WHERE batch_id=? ORDER BY number', [input.request_id]);
            await tx.commit();
            return { saved: true, invoices, already_recorded: true };
        }
        // The write transaction holds the data stable between checking the preview and recording payment.
        const preview = await paymentPreview(user, input.filters, tx);
        if (preview.signature !== input.signature) fail('Approved pay changed. Review a fresh payment preview before paying.', 409);
        if (!Number.isSafeInteger(preview.total_cents) || preview.items.some(item => item.lines.some((line: Row) => !Number.isSafeInteger(line.cents) || line.cents < 0))) fail('The payment amount is outside the supported range.');
        if (!preview.total_cents) fail('There is no unpaid approved pay in this selection.', 409);
        const now = Date.now(), statements: InStatement[] = [{ sql:'INSERT INTO payment_batches(id,created_by,created_at) VALUES(?,?,?)', args:[input.request_id,user.id,now] }];
        const invoices: Row[] = [];
        for (const person of preview.people) {
            const invoiceId = id(), number = `ACES-${day(now).replaceAll('-','')}-${invoiceId.replaceAll('-','').slice(0,12).toUpperCase()}`;
            const invoice = { id:invoiceId, number, batch_id:input.request_id, user_id:person.user_id, employee_name:person.name, employee_email:person.email, paid_at:now, total_cents:person.total_cents, reference:input.reference, notes:input.notes, created_by:user.id };
            invoices.push(invoice);
            statements.push({ sql:'INSERT INTO payment_invoices(id,number,batch_id,user_id,employee_name,employee_email,paid_at,total_cents,reference,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)', args:Object.values(invoice) });
            for (const item of preview.items.filter(item => item.user_id === person.user_id)) {
                for (const line of item.lines) statements.push({ sql:'INSERT INTO payment_invoice_items(id,invoice_id,user_id,task_id,time_entry_id,work_date,project_id,project_name,account_id,account_name,task_label,task_status,pay_basis,units,rate_cents,amount_cents) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', args:[id(),invoiceId,person.user_id,line.task_id??null,line.time_entry_id??null,line.date,line.project_id,line.project_name,line.account_id,line.account_name,line.task_label,line.task_status,line.pay_basis,line.units,line.rate_cents,line.cents] });
                statements.push(item.task_id ? { sql:'INSERT INTO payment_tasks(task_id,invoice_id) VALUES(?,?)', args:[item.task_id,invoiceId] } : { sql:'INSERT INTO payment_times(time_entry_id,invoice_id) VALUES(?,?)', args:[item.time_entry_id!,invoiceId] });
                if (item.task_id) statements.push({ sql:"INSERT INTO sync_jobs(task_id,status,updated_at) VALUES(?,'pending',?) ON CONFLICT(task_id) DO UPDATE SET status='pending',updated_at=excluded.updated_at", args:[item.task_id,now] });
            }
            statements.push({ sql:"INSERT INTO audit_log(id,actor_id,entity,entity_id,action,before_json,after_json,created_at) VALUES(?,?,'payment_invoice',?,'paid',NULL,?,?)", args:[id(),user.id,invoiceId,JSON.stringify(invoice),now] });
        }
        await tx.batch(statements);
        await tx.commit();
        return { saved:true, invoices, already_recorded:false };
    } catch (error) { if (!tx.closed) await tx.rollback(); throw error; }
    finally { tx.close(); }
}
export async function invoiceDetail(user: Row, invoiceId: string): Promise<Invoice & {id:string}> {
    const invoice = (await rows(getClient(), 'SELECT * FROM payment_invoices WHERE id=?' + (user.role === 'ADMIN' ? '' : ' AND user_id=?'), user.role === 'ADMIN' ? [invoiceId] : [invoiceId,user.id]))[0];
    if (!invoice) fail('Invoice not found.', 404);
    return { ...invoice, items:await rows(getClient(), 'SELECT * FROM payment_invoice_items WHERE invoice_id=? ORDER BY work_date,task_label,id', [invoiceId]) } as Invoice & {id:string};
}
