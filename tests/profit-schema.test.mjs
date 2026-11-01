import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {PROFIT_SCHEMA} from '../lib/profit-schema.mjs';
test('client rates capture once, follow reassigned time, and preserve unpriced history',()=>{
 const db=new DatabaseSync(':memory:');
 try {
  db.exec("CREATE TABLE projects(id TEXT PRIMARY KEY); CREATE TABLE task_entries(id TEXT PRIMARY KEY,project_id TEXT); CREATE TABLE time_entries(id TEXT PRIMARY KEY,project_id TEXT,task_id TEXT,end_ms INTEGER); INSERT INTO projects VALUES('p'),('q'); INSERT INTO task_entries VALUES('legacy','p');");
  for(let repeat=0;repeat<2;repeat++)for(const sql of PROFIT_SCHEMA)db.exec(sql);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM work_client_rates').get().n,0);
  db.exec("INSERT INTO project_client_rates VALUES('p',20000),('q',30000); INSERT INTO task_entries VALUES('new','p'); UPDATE project_client_rates SET rate_cents=25000 WHERE project_id='p'; INSERT INTO time_entries VALUES('linked','p','new',NULL),('old-linked','p','legacy',NULL),('standalone','p',NULL,NULL);");
  const rate=id=>db.prepare("SELECT rate_cents FROM work_client_rates WHERE kind='time' AND work_id=?").get(id).rate_cents;
  assert.equal(rate('linked'),20000);assert.equal(rate('old-linked'),null);assert.equal(rate('standalone'),25000);
  db.exec("UPDATE time_entries SET end_ms=42 WHERE id='linked';");assert.equal(rate('linked'),20000);
  db.exec("UPDATE time_entries SET project_id='q' WHERE id='standalone';");assert.equal(rate('standalone'),30000);
  db.exec("DELETE FROM time_entries WHERE id='standalone'; DELETE FROM task_entries WHERE id='new';");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM work_client_rates WHERE work_id IN ('standalone','new')").get().n,0);
 } finally {db.close();}
});
test('runtime schema matches the versioned migration',()=>{
 const migration=readFileSync('drizzle/0006_company_profit.sql','utf8').split('--> statement-breakpoint').map(s=>s.trim().replace(/;$/,'')).filter(Boolean);
 assert.deepEqual(migration,PROFIT_SCHEMA);
});
