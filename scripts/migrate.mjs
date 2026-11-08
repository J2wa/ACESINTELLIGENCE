import {backfillRoutes} from '../lib/routing-schema.mjs';
import { createClient } from '@libsql/client';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
if (!process.env.TURSO_DATABASE_URL) throw new Error('Set TURSO_DATABASE_URL.');
const client = createClient({url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN});
try {
  await client.execute('CREATE TABLE IF NOT EXISTS workhub_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL)');
  for (const name of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) {
    const source = readFileSync('drizzle/' + name, 'utf8');
    const checksum = createHash('sha256').update(source).digest('hex');
    const previous = await client.execute({sql:'SELECT checksum FROM workhub_migrations WHERE name=?',args:[name]});
    if (previous.rows.length) {
      if (previous.rows[0].checksum !== checksum) throw new Error('Applied migration changed: ' + name);
      continue;
    }
    const statements = source.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);
    const tx=await client.transaction('write');
    try { for(const sql of statements) await tx.execute(sql);
      if(name==='0011_workspace_routes.sql')await backfillRoutes(tx);
      await tx.execute({sql:'INSERT INTO workhub_migrations VALUES(?,?,?)',args:[name,checksum,Date.now()]});await tx.commit();
    } catch(e){await tx.rollback();throw e;}finally{tx.close();}
    console.log('Applied ' + name);
  }
} finally { client.close(); }
