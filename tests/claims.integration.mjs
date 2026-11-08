import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {day,midnight} from '../lib/core.mjs';
import {CLAIMS_SCHEMA,ensureClaimsSchema} from '../lib/claims-schema.mjs';
process.env.WORK_ACCOUNT_CREDENTIALS_KEY='11'.repeat(32);
const dir=mkdtempSync(join(tmpdir(),'workhub-claims-'));process.env.TURSO_DATABASE_URL='file:'+join(dir,'db.sqlite');delete process.env.TURSO_AUTH_TOKEN;delete process.env.ADMIN_EMAIL;delete process.env.ADMIN_PASSWORD_HASH;delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const {getClient}=await import('../lib/database.ts'),db=getClient();const {handle}=await import('../lib/api.ts');const {sha}=await import('../lib/auth.ts');const {expireOverdueClaims}=await import('../lib/claims.ts');
let now=Date.parse('2026-11-15T15:30:00Z');const realNow=Date.now;Date.now=()=>now;let checks=0;
const sql=async(s,...args)=>(await db.execute({sql:s,args})).rows;
const one=async(s,...args)=>(await sql(s,...args))[0];
async function req(path,who='admin',body,status=200){const r=await handle(new Request('https://test/api/'+path,{method:body?'POST':'GET',headers:{Origin:'https://test',Cookie:who?'aces_session='+who:'','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));const j=await r.json();assert.equal(r.status,status,`${path}: ${JSON.stringify(j)}`);checks++;return j;}
let seq=0;
async function pool(label='id'+(++seq),account='a') {await req('claims/pool','admin',{action:'add',project_id:'p',account_id:account,items:[{video_id:label,duration_seconds:180,notes:'pool notes'}]});return one('SELECT * FROM task_pool WHERE video_id=? AND account_id=?',label,account);}
async function claim(p,who='u'){await req('claims/claim',who,{id:p.id,version:p.version});return one('SELECT * FROM task_pool WHERE id=?',p.id);}
async function selected(p){const r=await one('SELECT * FROM task_pool WHERE id=?',p.id);return {id:r.id,version:r.version};}
async function sweep(){const tx=await db.transaction('write');try{await expireOverdueClaims(now,tx);await tx.commit();}finally{tx.close();}}
try{
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&!f.startsWith('0012')).sort())for(const s of readFileSync('drizzle/'+f,'utf8').split('--> statement-breakpoint').filter(s=>s.trim()))await db.execute(s);
 const triggers=await sql("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name");
 assert.equal(readFileSync('drizzle/0012_task_claiming.sql','utf8'),CLAIMS_SCHEMA.join(';\n--> statement-breakpoint\n')+';\n');
 await ensureClaimsSchema(db);await db.batch(CLAIMS_SCHEMA,'write');
 for(const t of triggers)assert.deepEqual(await one('SELECT name,sql FROM sqlite_master WHERE name=?',t.name),t);checks++;
 for(const [id,role] of [['admin','ADMIN'],['u','EMPLOYEE'],['v','EMPLOYEE'],['outsider','EMPLOYEE'],['inactive','EMPLOYEE']]){await sql('INSERT INTO users(id,name,email,role,active,created_at) VALUES(?,?,?,?,?,?)',id,id,id+'@example.test',role,id==='inactive'?0:1,now);await sql('INSERT INTO sessions VALUES(?,?,?,?)',await sha(id),id,now,now+100*86400000);}
 await sql("INSERT INTO projects(id,name,status,pay_basis,rate_cents,spreadsheet_id) VALUES('p','Claim QA','active','VIDEO_HOUR',12000,'sandbox-sheet')");
 await sql("INSERT INTO accounts(id,project_id,name,active,sheet_tab) VALUES('a','p','Account A',1,'Test'),('b','p','Account B',1,'Test B')");
 for(const u of ['u','v','inactive']){await sql('INSERT INTO project_assignments VALUES(?,?)','p',u);for(const a of ['a','b'])await sql('INSERT INTO account_assignments VALUES(?,?)',a,u);}
 await req('workspace');
 const settings={id:'p',name:'Claim QA',status:'active',pay_basis:'VIDEO_HOUR',rate_cents:12000,spreadsheet_id:'sandbox-sheet',hourly_target:40,employee_ids:['u','v','inactive'],claiming_enabled:1,claim_deadline_hours:24,claim_max_active:100};
 await req('accounts/credentials','admin',{action:'save',account_id:'a',username:'work-login',password:'test-only-password',login_url:'https://work.example.test'});
 assert(!JSON.stringify(await sql('SELECT * FROM work_account_credentials')).includes('test-only-password'));
 const creds=await req('accounts/credentials','u',{action:'read',account_id:'a'});assert.equal(creds.username,'work-login');assert.equal(creds.password,'test-only-password');
 await req('accounts/credentials','outsider',{action:'read',account_id:'a'},403);
 await req('accounts/credentials','u',{action:'save',account_id:'a',username:'x',password:'x',login_url:''},403);
 await req('accounts/credentials','admin',{action:'save',account_id:'a',username:'x',password:'x',login_url:'javascript:alert(1)'},400);
 assert(!JSON.stringify(await req('workspace','u')).includes('test-only-password'));
 await sql("DELETE FROM account_assignments WHERE user_id='v' AND account_id='a'");
 await req('accounts/credentials','v',{action:'read',account_id:'a'},403);
 await sql("INSERT INTO account_assignments VALUES('a','v')");
 const p=await pool('000001');
 assert.equal((await req('workspace')).task_pool.find(x=>x.id===p.id).display_number,1);
 const numberedSecond=await pool('NUMBER-TWO');
 const separateAccount=await pool('NUMBER-ONE-B','b');
 const numberedView=await req('workspace');
 assert.equal(numberedView.task_pool.find(x=>x.id===numberedSecond.id).display_number,2);
 assert.equal(numberedView.task_pool.find(x=>x.id===separateAccount.id).display_number,1);
 await req('claims/claim','u',{id:p.id,version:1},403); // off by default
 await req('projects','admin',settings);
 for(const patch of [{claim_deadline_hours:0},{claim_deadline_hours:721},{claim_deadline_hours:1.2},{claim_max_active:0}])await req('projects','admin',{...settings,...patch},400);
 await req('claims/claim','outsider',{id:p.id,version:1},403);await req('claims/claim','inactive',{id:p.id,version:1},401);
 await sql("DELETE FROM account_assignments WHERE user_id='v' AND account_id='a'");await req('claims/claim','v',{id:p.id,version:1},403);await sql("INSERT INTO account_assignments VALUES('a','v')");
 await sql("UPDATE accounts SET active=0 WHERE id='a'");await req('claims/claim','u',{id:p.id,version:1},403);await sql("UPDATE accounts SET active=1 WHERE id='a'");
 await req('claims/pool','u',{action:'add',project_id:'p',account_id:'a',items:[{video_id:'no'}]},403);
 // Concurrent requests compete for one conditional update in serialized write transactions.
 const race=await Promise.all(['u','v'].map(async who=>{const r=await handle(new Request('https://test/api/claims/claim',{method:'POST',headers:{Origin:'https://test',Cookie:'aces_session='+who,'Content-Type':'application/json'},body:JSON.stringify({id:p.id,version:1})}));return {status:r.status,body:await r.json()};}));
 assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);assert.equal(Number((await one('SELECT COUNT(*) n FROM task_entries WHERE video_id=?','000001')).n),1);checks++;
 const c=await one('SELECT * FROM task_pool WHERE id=?',p.id),owner=c.claimed_by,other=owner==='u'?'v':'u';
 assert.equal(c.deadline_at,now+24*3600000);assert.equal(day(c.deadline_at),'2026-11-16');
 const task=await one('SELECT * FROM task_entries WHERE id=?',c.task_entry_id);assert.equal(task.video_id,'000001');assert.equal(task.rate_cents,12000);assert.equal(task.date,'2026-11-15');assert.equal(task.duration_seconds,180);assert(await one('SELECT 1 FROM sync_jobs WHERE task_id=?',task.id));
 await req('claims/claim',other,{id:c.id,version:1},409);
 const privateView=await req('workspace',other);assert.equal(privateView.task_pool.find(x=>x.id===numberedSecond.id).display_number,2);assert(!privateView.task_pool.some(x=>x.id===c.id));assert(!JSON.stringify(privateView).includes('profit_rows'));assert(privateView.tasks.every(t=>t.user_id===other));
 await req('claims/release',other,{id:c.id,version:c.version},404);
 await req('claims/admin',other,{id:c.id,version:c.version,action:'extend',hours:1,reason:'no'},403);
 await req('claims/admin','admin',{id:c.id,version:c.version,action:'extend',hours:1,reason:''},400);
 await req('tasks/delete',owner,{id:task.id,version:1},409);
 await req('tasks',owner,{id:task.id,version:1,date:task.date,project_id:'p',account_id:'b',video_id:task.video_id,duration:'0:03:00',status:'PENDING'},409);
 // Pool/task collision in both directions and bulk atomicity.
 const free=await pool('RESERVED');
 await req('tasks','u',{date:day(now),project_id:'p',account_id:'a',video_id:'RESERVED',duration:'0:00:00',status:'PENDING'},409);
 await req('claims/pool','admin',{action:'add',project_id:'p',account_id:'a',items:[{video_id:'ROLLBACK'},{video_id:'000001'}]},409);assert(!await one("SELECT 1 FROM task_pool WHERE video_id='ROLLBACK'"));
 await req('tasks','u',{date:day(now),project_id:'p',account_id:'a',video_id:'MANUAL',duration:'0:00:00',status:'PENDING'});
 await req('claims/pool','admin',{action:'add',project_id:'p',account_id:'a',items:[{video_id:'MANUAL'}]},409);
 await req('claims/pool','admin',{action:'add',project_id:'p',account_id:'a',items:Array.from({length:101},(_,i)=>({video_id:'n'+i}))},400);
 await req('claims/pool','admin',{action:'cancel',...await selected(free)});await req('claims/claim','u',await selected(free),409);
 // Limits are per project and include overdue claims.
 await req('projects','admin',{...settings,claim_max_active:1});const limit=await pool();await req('claims/claim',owner,await selected(limit),409);
 await req('projects','admin',{...settings,claiming_enabled:0,claim_deadline_hours:48});assert.equal((await one('SELECT deadline_at FROM task_pool WHERE id=?',c.id)).deadline_at,c.deadline_at);
 await req('claims/claim',other,await selected(limit),403);
 await req('claims/complete',owner,await selected(c));assert.equal((await one('SELECT status FROM task_entries WHERE id=?',task.id)).status,'PENDING');
 await req('projects','admin',settings);
 // Voluntary release creates durable Sheets removal and allows a new owner.
 const rel=await claim(await pool());await req('claims/release','u',await selected(rel));assert(!await one('SELECT 1 FROM task_entries WHERE id=?',rel.task_entry_id));assert(await one('SELECT 1 FROM deleted_task_sync WHERE task_id=?',rel.task_entry_id));assert(!await one('SELECT 1 FROM sync_jobs WHERE task_id=?',rel.task_entry_id));await claim(await one('SELECT * FROM task_pool WHERE id=?',rel.id),'v');
 // Untouched expiry, edited tasks, time, approval, invoice and week protection.
 const untouched=await claim(await pool()),edited=await claim(await pool()),timed=await claim(await pool()),approved=await claim(await pool()),paid=await claim(await pool()),locked=await claim(await pool()),reviewed=await claim(await pool()),running=await claim(await pool());
 await sql("UPDATE task_entries SET notes='edited',version=version+1 WHERE id=?",edited.task_entry_id);
 await sql("INSERT INTO time_entries(id,project_id,user_id,task_id,start_ms,end_ms,rate_cents,source,notes,created_at,pay_basis) VALUES('logged','p','u',?,?,?,12000,'manual','',?,'VIDEO_HOUR')",timed.task_entry_id,now-600000,now-300000,now);
 await req('claims/release','u',await selected(timed),409);await req('claims/admin','admin',{...await selected(timed),action:'release',reason:'should not remove logged time'},409);
 await sql("UPDATE task_entries SET status='APPROVED',version=version+1 WHERE id=?",approved.task_entry_id);
 await sql("INSERT INTO payment_batches VALUES('batch','admin',?)",now);await sql("INSERT INTO payment_invoices(id,number,batch_id,user_id,employee_name,employee_email,paid_at,total_cents,created_by) VALUES('invoice','INV','batch','u','u','u@example.test',?,1,'admin')",now);await sql("INSERT INTO payment_tasks VALUES(?,'invoice')",paid.task_entry_id);
 await sql("INSERT INTO task_hour_reviews VALUES(?,'review-signature','APPROVED','admin',?)",reviewed.task_entry_id,now);
 await req('claims/release','u',await selected(reviewed),409);
 await sql("INSERT INTO time_entries(id,project_id,user_id,task_id,start_ms,end_ms,rate_cents,source,notes,created_at,pay_basis) VALUES('running','p','u',?,?,NULL,12000,'manual','',?,'VIDEO_HOUR')",running.task_entry_id,now,now);
 await req('claims/release','u',await selected(running),409);
 await req('claims/complete','u',await selected(running),409);
 await req('claims/release','u',await selected(approved),409);
 await req('claims/release','u',await selected(paid),409);
 // Only one task is placed in a locked historic week.
 await sql("UPDATE task_entries SET date='2026-11-01',version=version+1 WHERE id=?",locked.task_entry_id);
 await sql("INSERT INTO timesheets(id,user_id,week_start,start_ms,end_ms,status,updated_at) VALUES('locked','u','2026-10-26',?,?,'SUBMITTED',?)",midnight('2026-10-26'),midnight('2026-11-02'),now);
 await req('claims/release','u',await selected(locked),409);
 now+=25*3600000;await sql('UPDATE sessions SET last_seen=?',now);
 await req('workspace','u'); // expires inside snapshot transaction
 assert.equal((await one('SELECT status FROM task_pool WHERE id=?',untouched.id)).status,'AVAILABLE');assert(!await one('SELECT 1 FROM task_entries WHERE id=?',untouched.task_entry_id));
 for(const p of [edited,timed,approved,paid,locked,reviewed,running]){const current=await one('SELECT * FROM task_pool WHERE id=?',p.id);assert.equal(current.status,'CLAIMED');assert.equal(current.overdue,1);assert(await one('SELECT 1 FROM task_entries WHERE id=?',p.task_entry_id));}
 const auditCount=Number((await one("SELECT COUNT(*) n FROM audit_log WHERE entity='task_pool'")).n);await sweep();await sweep();assert.equal(Number((await one("SELECT COUNT(*) n FROM audit_log WHERE entity='task_pool'")).n),auditCount);
 assert.equal((await one('SELECT status FROM task_pool WHERE id=?',c.id)).status,'COMPLETED');
 await req('claims/complete','u',await selected(timed),409);
 await req('claims/admin','admin',{...await selected(timed),action:'extend',hours:2,reason:'Allow completion of logged work'});
 await req('claims/complete','u',await selected(timed));
 const adminView=await req('workspace');assert(adminView.claim_counts.overdue>=4);assert(adminView.claim_counts.expired>=1);
 const old=await selected(edited);await req('claims/admin','admin',{...old,action:'extend',hours:1,reason:'QA extension'});await req('claims/admin','admin',{...old,action:'extend',hours:1,reason:'stale'},409);
 // An empty claim can expire across month boundaries, unlike normal task deletion.
 await req('projects','admin',{...settings,claim_deadline_hours:1});now=Date.parse('2026-11-30T15:30:00Z');await sql('UPDATE sessions SET last_seen=?',now);const month=await claim(await pool());assert.equal(day(month.deadline_at),'2026-12-01');now+=3600000;await sql('UPDATE sessions SET last_seen=?',now);await req('workspace','u');assert.equal((await one('SELECT status FROM task_pool WHERE id=?',month.id)).status,'AVAILABLE');
 const forbidden=await handle(new Request('https://test/api/claims/claim',{method:'POST',headers:{Origin:'https://evil.test',Cookie:'aces_session=u'},body:JSON.stringify({id:month.id,version:3})}));assert.equal(forbidden.status,403);
 console.log(`PASS: ${checks} claim API/schema checks, concurrent claim, identity reservations, isolation, expiry, locks, outbox and Manila boundaries.`);
}finally{Date.now=realNow;db.close();rmSync(dir,{recursive:true,force:true});}
