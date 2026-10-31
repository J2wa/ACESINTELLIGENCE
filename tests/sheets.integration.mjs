// Test Sheets requests against an in-memory fake; never sends data to Google.
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {TRACKER_HEADERS} from '../lib/tracker.mjs';
const dir=mkdtempSync(join(tmpdir(),'workhub-sheets-'));
process.env.TURSO_DATABASE_URL='file:'+join(dir,'test.db');
const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
process.env.GOOGLE_SERVICE_ACCOUNT_JSON=JSON.stringify({client_email:'test@example.com',private_key:privateKey});
const {getClient}=await import('../lib/database.ts');
const {syncTasks}=await import('../lib/sheets.ts');
const client=getClient();
const originalFetch=globalThis.fetch;
let values=[],appends=0,updates=0,failWrites=false;
globalThis.fetch=async(url,init={})=>{
 const u=String(url);
 if(u==='https://oauth2.googleapis.com/token')return Response.json({access_token:'test-token'});
 assert(u.startsWith('https://sheets.googleapis.com/v4/spreadsheets/test-sheet'));
 if(u.endsWith('?fields=sheets.properties'))return Response.json({sheets:[{properties:{title:'Task log'}}]});
 if(!init.method)return Response.json({values});
 const payload=JSON.parse(init.body);
 if(failWrites)return new Response('denied',{status:403});
 if(u.includes(':append')){values.push(payload.values[0]);appends++;}
 else if(u.includes('A1%3AP1')) values[0]=payload.values[0];
 else {values[1]=payload.values[0];updates++;}
 return Response.json({});
};
try {
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+f,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await client.execute(sql);
 await client.batch([
 "INSERT INTO users(id,name,email,role,created_at) VALUES('u','Example','u@example.com','EMPLOYEE',0)",
 "INSERT INTO projects(id,name,rate_cents,pay_basis,spreadsheet_id) VALUES('p','Example project',5000,'TASK','test-sheet')",
 "INSERT INTO accounts(id,project_id,name) VALUES('a','p','Example account')",
 "INSERT INTO task_entries(id,date,project_id,account_id,user_id,video_id,duration_seconds,status,created_at,updated_at,pay_basis,rate_cents) VALUES('t','2026-10-31','p','a','u','0001',60,'APPROVED',0,0,'TASK',5000)",
 "INSERT INTO sync_jobs(task_id,updated_at) VALUES('t',1)"
 ],'write');
 assert.equal((await syncTasks()).synced,1);
 assert.deepEqual(values[0],TRACKER_HEADERS);assert.equal(values[1][1],'0001');
 assert.equal(values[1][9],'t');assert.equal(values[1][13],50);assert.equal(values[1][14],50);
 await client.execute("UPDATE task_entries SET notes='updated',version=version+1 WHERE id='t'");
 await client.execute("UPDATE sync_jobs SET status='pending',updated_at=2 WHERE task_id='t'");
 assert.equal((await syncTasks()).synced,1);
 assert.equal(appends,1);assert.equal(updates,1);assert.equal(values[1][8],'updated');
 failWrites=true;
 await client.execute("UPDATE sync_jobs SET status='pending',updated_at=3 WHERE task_id='t'");
 assert.equal((await syncTasks()).synced,0);
 assert.equal((await client.execute("SELECT status FROM sync_jobs WHERE task_id='t'")).rows[0].status,'error');
 console.log('PASS: Sheets headers, project routing, text IDs, append/update idempotency, pay values, and failed-write retry state.');
} finally {globalThis.fetch=originalFetch;client.close();rmSync(dir,{recursive:true,force:true});}
