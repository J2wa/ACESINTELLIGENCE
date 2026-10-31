import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { TIMER_SCHEMA, ensureTimerSchema } from '../lib/timer-schema.mjs';

test('timer migration preserves old running sessions, defaults off, and is safe to repeat', async () => {
  const db = createClient({url: 'file::memory:'});
  try {
    await db.batch([
      'CREATE TABLE projects(id TEXT PRIMARY KEY,status TEXT)',
      'CREATE TABLE time_entries(id TEXT PRIMARY KEY,project_id TEXT,source TEXT,end_ms INTEGER)',
      "INSERT INTO projects VALUES('p','active')",
      "INSERT INTO time_entries VALUES('old','p','timer',NULL)",
    ], 'write');
    await Promise.all([ensureTimerSchema(db), ensureTimerSchema(db)]);
    assert.equal((await db.execute("SELECT end_ms FROM time_entries WHERE id='old'")).rows[0].end_ms, null);
    await assert.rejects(db.execute("INSERT INTO time_entries VALUES('blocked','p','timer',NULL)"), /time_tracking_disabled/);
    await db.execute("UPDATE time_entries SET end_ms=123 WHERE id='old'");
    await db.execute("INSERT INTO time_entries VALUES('manual','p','manual',123)");
    await db.execute("INSERT INTO project_time_tracking VALUES('p',1)");
    // Running the SQL migration after runtime initialization must preserve enabled projects.
    await db.batch(TIMER_SCHEMA, 'write');
    assert.equal((await db.execute("SELECT enabled FROM project_time_tracking WHERE project_id='p'")).rows[0].enabled, 1);
    await db.execute("INSERT INTO time_entries VALUES('allowed','p','timer',NULL)");
    await db.execute("UPDATE project_time_tracking SET enabled=0 WHERE project_id='p'");
    await assert.rejects(db.execute("INSERT INTO time_entries VALUES('blocked2','p','timer',NULL)"), /time_tracking_disabled/);
    await db.execute("UPDATE time_entries SET end_ms=456 WHERE id='allowed'");
    await db.execute("UPDATE project_time_tracking SET enabled=1 WHERE project_id='p'");
    await db.execute("UPDATE projects SET status='archived' WHERE id='p'");
    await assert.rejects(db.execute("INSERT INTO time_entries VALUES('archived','p','timer',NULL)"), /time_tracking_disabled/);
  } finally { db.close(); }
});

test('runtime and versioned timer migrations match', () => {
  const statements = readFileSync(new URL('../drizzle/0004_project_time_tracking.sql', import.meta.url), 'utf8')
    .split('--> statement-breakpoint').map(sql => sql.trim()).filter(Boolean);
  assert.deepEqual(statements, TIMER_SCHEMA.map(sql => sql.trim()));
});
