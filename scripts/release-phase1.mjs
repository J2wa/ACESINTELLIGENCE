// Additive release upgrade for existing installations. Never replay legacy
// CREATE TABLE migrations against a database bootstrapped by earlier releases.
import {createClient} from '@libsql/client';
import {readFileSync} from 'node:fs';
if(process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
 console.log('Phase 1 release migration skipped outside production.');
} else {
 if(!process.env.TURSO_DATABASE_URL) throw new Error('Set TURSO_DATABASE_URL for the release migration.');
 const client=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
 try {
  for(const name of ['task_entries','time_entries','payment_invoice_items','sync_jobs','login_attempts']) {
   const result=await client.execute({sql:"SELECT name FROM sqlite_master WHERE type='table' AND name=?",args:[name]});
   if(!result.rows.length) throw new Error('Initialize the existing WorkHub schema before applying Phase 1.');
  }
  const statements=readFileSync(new URL('../drizzle/0015_phase1_indexes.sql',import.meta.url),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);
  if(statements.some(sql=>!/^CREATE (INDEX|TABLE) IF NOT EXISTS /i.test(sql))) throw new Error('Phase 1 release must remain additive.');
  await client.batch(statements,'write');
  const expected=['task_date_created','task_project_date','time_task','invoice_items_task','invoice_items_time','sync_pending','login_reset','sync_retry'];
  for(const name of expected) if(!(await client.execute({sql:'SELECT name FROM sqlite_master WHERE name=?',args:[name]})).rows.length) throw new Error('Phase 1 schema verification failed.');
  console.log('Phase 1 schema verified: seven query indexes and persistent sync retry storage. Existing work and payment records retained.');
 } finally {client.close();}
}
