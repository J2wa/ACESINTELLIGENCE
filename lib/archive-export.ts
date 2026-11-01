import PDFDocument from 'pdfkit';
import { join } from 'node:path';
import type { Transaction } from '@libsql/client';
import { getClient } from './database';
import { fail, sha, token } from './auth';
import { ARCHIVE_EXPORT_SCHEMA } from './archive-export-schema';

let ready: Promise<void> | undefined;
export function ensureArchiveExportSchema() {
    return ready ??= (async () => {
        const tx=await getClient().transaction('write');
        try {
            await tx.execute(ARCHIVE_EXPORT_SCHEMA[0]);
            if (!(await tx.execute('SELECT version FROM archive_export_schema WHERE version=1')).rows.length) {
                for (const sql of ARCHIVE_EXPORT_SCHEMA.slice(1)) await tx.execute(sql);
            }
            await tx.commit();
        } catch(error) { await tx.rollback(); throw error; } finally { tx.close(); }
    })().catch(error=>{ready=undefined;throw error;});
}
export async function archiveSnapshot(tx:Transaction, ids:string[]) {
    if (!ids.length || new Set(ids).size!==ids.length) fail('Choose projects and refresh the archive.');
    const result:Record<string,unknown>[]=[];
    for (const projectId of [...ids].sort()) {
        const rows=async(sql:string)=>(await tx.execute({sql,args:[projectId]})).rows;
        const project=(await rows('SELECT * FROM projects WHERE id=?'))[0];
        if (!project || project.status!=='archived') fail('The archive changed. Refresh and export again.',409);
        const times=await rows('SELECT * FROM time_entries WHERE project_id=? ORDER BY id');
        if (times.some(t=>t.end_ms===null)) fail('Stop running project timers before exporting for deletion.',409);
        result.push({project,
            project_links:await rows('SELECT * FROM project_links WHERE project_id=?'),
            tasks:await rows('SELECT * FROM task_entries WHERE project_id=? ORDER BY id'),times,
            accounts:await rows('SELECT * FROM accounts WHERE project_id=? ORDER BY id'),
            assignments:await rows('SELECT * FROM project_assignments WHERE project_id=? ORDER BY user_id'),
            account_assignments:await rows('SELECT a.* FROM account_assignments a JOIN accounts b ON b.id=a.account_id WHERE b.project_id=? ORDER BY a.account_id,a.user_id'),
            employees:await rows('SELECT DISTINCT u.id,u.name,u.email FROM users u WHERE u.id IN (SELECT user_id FROM task_entries WHERE project_id=?1 UNION SELECT user_id FROM time_entries WHERE project_id=?1) ORDER BY u.id'),
            timesheets:await rows(`SELECT DISTINCT s.* FROM timesheets s WHERE EXISTS(SELECT 1 FROM task_entries t WHERE t.project_id=?1 AND t.user_id=s.user_id AND t.date>=s.week_start AND t.date<date(s.week_start,'+7 days')) OR EXISTS(SELECT 1 FROM time_entries t WHERE t.project_id=?1 AND t.user_id=s.user_id AND t.start_ms<s.end_ms AND t.end_ms>s.start_ms) ORDER BY s.id`),
            invoice_items:await rows('SELECT * FROM payment_invoice_items WHERE project_id=? ORDER BY id'),
            invoices:await rows('SELECT * FROM payment_invoices WHERE id IN (SELECT invoice_id FROM payment_invoice_items WHERE project_id=?) ORDER BY id'),
            hour_reviews:await rows('SELECT * FROM task_hour_reviews WHERE task_id IN (SELECT id FROM task_entries WHERE project_id=?) ORDER BY task_id'),
        });
    }
    return result;
}
export async function exportArchive(actor:{id:string;role:string},ids:string[]) {
    if(actor.role!=='ADMIN') fail('Admin access required.',403);
    await ensureArchiveExportSchema();
    const tx=await getClient().transaction('read');
    let snapshot;
    try { snapshot=await archiveSnapshot(tx,ids); await tx.commit(); } finally {tx.close();}
    const hash=await sha(JSON.stringify(snapshot));
    const doc=new PDFDocument({size:'A4',margin:40,font:join(process.cwd(),'node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff'),info:{Title:'Workhub archive deletion backup',Author:'Aces Intelligence'}});
    const chunks:Buffer[]=[];
    const complete=new Promise<Buffer>((resolve,reject)=>{doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
    doc.fontSize(19).fillColor('#174a99').text('Aces Intelligence Workhub');
    doc.fontSize(14).text('Archive deletion backup').moveDown();
    doc.fontSize(9).fillColor('#172b4d').text('Exported: '+new Date().toLocaleString('en-PH',{timeZone:'Asia/Manila'})+' (Asia/Manila)');
    doc.text('Snapshot SHA-256: '+hash).moveDown();
    doc.text('Contains project details, work records, affected timesheets and invoice snapshots. Payment invoices remain in Workhub. Affected locked timesheets are returned for review when work is deleted.').moveDown();
    for (const project of snapshot) {
        for (const [section,records] of Object.entries(project)) {
            doc.fontSize(12).fillColor('#174a99').text(section.replaceAll('_',' ').toUpperCase()).moveDown(.3);
            const list=Array.isArray(records)?records:[records];
            if(!list.length) doc.fontSize(8).fillColor('#172b4d').text('None');
            for (const record of list) {
                doc.fontSize(8).fillColor('#172b4d');
                for (const [key,value] of Object.entries(record as Record<string,unknown>)) doc.text(`${key}: ${value??'—'}`);
                doc.moveDown();
            }
        }
    }
    doc.end();
    const pdf=await complete, receipt=token();
    await getClient().batch([
        {sql:'DELETE FROM archive_export_receipts WHERE expires_at<?',args:[Date.now()]},
        {sql:'INSERT INTO archive_export_receipts(token_hash,actor_id,snapshot_hash,expires_at) VALUES(?,?,?,?)',args:[await sha(receipt),actor.id,hash,Date.now()+15*60000]},
    ],'write');
    return {pdf,receipt};
}
export async function authorizeArchivePurge(tx:Transaction,actorId:string,ids:string[],receipt?:string) {
    if (!receipt) fail('Export and save the archive PDF before permanently deleting protected work.',409);
    const hash=await sha(receipt!);
    const row=(await tx.execute({sql:'SELECT * FROM archive_export_receipts WHERE token_hash=? AND actor_id=? AND expires_at>?',args:[hash,actorId,Date.now()]})).rows[0];
    if(!row) fail('The PDF export expired or was already used. Export again.',409);
    if(row.snapshot_hash!==await sha(JSON.stringify(await archiveSnapshot(tx,ids)))) fail('Records changed after the PDF export. Export a new PDF before deleting.',409);
    await tx.execute({sql:'DELETE FROM archive_export_receipts WHERE token_hash=?',args:[hash]});
    for(const projectId of ids) await tx.execute({sql:'INSERT INTO archive_purge_scope(project_id) VALUES(?)',args:[projectId]});
}
