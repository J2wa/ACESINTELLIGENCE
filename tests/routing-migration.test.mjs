import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,rmSync,readdirSync}from'node:fs';import{tmpdir}from'node:os';import{join,resolve}from'node:path';import{execFileSync}from'node:child_process';import{createClient}from'@libsql/client';
test('numbered migration backfills existing names, reserves collisions, and reruns safely',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'route-migration-')),url='file:'+join(dir,'db.sqlite');mkdirSync(join(dir,'drizzle'));const script=resolve('scripts/migrate.mjs');const env={...process.env,TURSO_DATABASE_URL:url};delete env.TURSO_AUTH_TOKEN;
 let db;
 try {
  for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&!f.startsWith('0011')))copyFileSync(join('drizzle',f),join(dir,'drizzle',f));
  execFileSync(process.execPath,[script],{cwd:dir,env,stdio:'pipe'});db=createClient({url});
  await db.execute("INSERT INTO projects(id,name) VALUES('a','Same Name'),('b','Same Name'),('c','tasks')");
  copyFileSync('drizzle/0011_workspace_routes.sql',join(dir,'drizzle/0011_workspace_routes.sql'));
  execFileSync(process.execPath,[script],{cwd:dir,env,stdio:'pipe'});
  const rows=(await db.execute('SELECT slug FROM project_urls ORDER BY project_id')).rows;assert.deepEqual(rows.map(r=>r.slug),['same-name','same-name-2','tasks-project']);
  execFileSync(process.execPath,[script],{cwd:dir,env,stdio:'pipe'});assert.deepEqual((await db.execute('SELECT slug FROM project_urls ORDER BY project_id')).rows,rows);
 }finally{db?.close();rmSync(dir,{recursive:true,force:true});}
});
