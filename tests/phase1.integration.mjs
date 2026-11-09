import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {hashPassword,checkPassword,passwordHashInfo} from '../lib/passwords.mjs';
const dir=mkdtempSync(join(tmpdir(),'workhub-phase1-'));
process.env.TURSO_DATABASE_URL='file:'+join(dir,'test.db');
delete process.env.ADMIN_EMAIL;delete process.env.ADMIN_PASSWORD_HASH;delete process.env.VERCEL;delete process.env.VERCEL_ENV;
const {getClient}=await import('../lib/database.ts');
const {handle}=await import('../lib/api.ts');
const {clientIp,throttleLogin}=await import('../lib/login-security.ts');
const {GET:worker}=await import('../app/api/cron/sheets/route.ts');
const client=getClient(),origin='http://workhub.test';
async function req(path,cookie='',body,status=200) {
 const response=await handle(new Request(origin+'/api/'+path,{method:body?'POST':'GET',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
 assert.equal(response.status,status,await response.clone().text());return response;
}
try {
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+f,'utf8').split('--> statement-breakpoint').filter(s=>s.trim()))await client.execute(sql);
 const password=randomBytes(24).toString('hex'),legacy=await hashPassword(password,randomBytes(32).toString('hex'),100000);
 assert(await checkPassword(password,legacy));assert(!await checkPassword('wrong',legacy));assert(!passwordHashInfo('pbkdf2$999999999$bad$bad'));assert(!await checkPassword(password,'bad'));
 for(const [id,role] of [['admin','ADMIN'],['alice','EMPLOYEE'],['bob','EMPLOYEE']])await client.execute({sql:'INSERT INTO users(id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,?,0)',args:[id,id,id+'@example.com',legacy,role]});
 const login=async user=>{const r=await req('auth/login','',{email:user+'@example.com',password});return r.headers.get('set-cookie').split(';')[0];};
 const admin=await login('admin'),alice=await login('alice');
 assert.equal(passwordHashInfo((await client.execute("SELECT password_hash FROM users WHERE id='alice'")).rows[0].password_hash).iterations,600000);
 const other=await login('alice');await req('auth/sessions/revoke-others',alice,{});await req('workspace',other,undefined,401);await req('workspace',alice);
 const spoof=new Request(origin,{headers:{'cf-connecting-ip':'192.0.2.1','x-forwarded-for':'192.0.2.2','x-vercel-forwarded-for':'192.0.2.3'}});
 process.env.TRUSTED_PROXY='none';assert.equal(clientIp(spoof),null);
 process.env.TRUSTED_PROXY='vercel';assert.equal(clientIp(spoof),'192.0.2.3');
 assert.equal(clientIp(new Request(origin,{headers:{'x-vercel-forwarded-for':'bad,192.0.2.1'}})),null);
 process.env.TRUSTED_PROXY='none';
 const concurrent=await Promise.allSettled(Array.from({length:25},()=>throttleLogin(spoof,'limited@example.com',Date.now())));
 assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,10);
 assert(concurrent.filter(r=>r.status==='rejected').every(r=>r.reason.status===429));
 // Missing IP headers do not group unrelated users into a shared local bucket.
 await Promise.all(Array.from({length:15},(_,i)=>throttleLogin(spoof,`distinct${i}@example.com`)));
 await client.execute("INSERT INTO projects(id,name,rate_cents,pay_basis) VALUES('p','Project',100,'TASK')");
 await client.execute("INSERT INTO accounts(id,project_id,name) VALUES('a','p','Account')");
 for(const who of ['alice','bob']) {
  await client.execute({sql:'INSERT INTO project_assignments VALUES(?,?)',args:['p',who]});
  await client.execute({sql:'INSERT INTO account_assignments VALUES(?,?)',args:['a',who]});
 }
 for(let i=0;i<62;i++)await client.execute({sql:"INSERT INTO task_entries(id,date,project_id,account_id,user_id,video_id,duration_seconds,status,created_at,updated_at,pay_basis,rate_cents) VALUES(?,?,'p','a',?,?,0,'PENDING',1,1,'TASK',100)",args:['task'+String(i).padStart(3,'0'),i===61?'2020-01-01':'2026-11-01',i===60?'bob':'alice','ID'+i]});
 const page=async q=>(await req('tasks?'+q,alice)).json();
 const first=await page('limit=25&page=0'),second=await page('limit=25&page=1'),third=await page('limit=25&page=2');
 assert.equal(first.total,61);assert.equal(first.tasks.length,25);assert.equal(second.tasks.length,25);assert.equal(third.tasks.length,11);
 assert.equal(new Set([...first.tasks,...second.tasks,...third.tasks].map(t=>t.id)).size,61);
 assert(first.tasks.every(t=>t.user_id==='alice'));
 assert.equal((await page('employee=bob')).total,0);
 assert.equal((await page('search=ID60')).total,0);
 assert.equal((await page('from=2026-11-01&to=2026-11-01')).total,60);
 assert.equal((await page('search=ID61')).total,1);
 assert.equal((await page('search=%27%20OR%201%3D1--')).total,0);
 await req('tasks?limit=101',alice,undefined,400);await req('tasks?sort=DROP',alice,undefined,400);
 const scoped=await (await req('workspace?scope=1&from=2026-11-01&to=2026-11-01&week=2026-10-26',alice)).json();
 assert.equal(scoped.tasks.length,60);assert(!scoped.tasks.some(t=>t.date==='2020-01-01'));
 const lastSeen=(await client.execute("SELECT last_seen FROM sessions WHERE user_id='alice'")).rows[0].last_seen;
 await req('tasks?background=1',alice);
 assert.equal((await client.execute("SELECT last_seen FROM sessions WHERE user_id='alice'")).rows[0].last_seen,lastSeen);
 const full=await (await req('workspace',alice)).json();assert.equal(full.tasks.length,61);
 const adminPage=await (await req('tasks?limit=25',admin)).json();
 assert.equal(adminPage.total,62);assert.equal(adminPage.tasks.length,25);
 assert.equal(adminPage.summaries.employee.reduce((n,r)=>n+r.tasks,0),62);
 assert.equal(adminPage.summaries.project[0].pending,62);
 const lightweight=await (await req('workspace?scope=1&view=tasks',admin)).json();
 assert.equal(lightweight.tasks.length,0);assert.equal(lightweight.invoice_items.length,0);

 // Normal task reads neither acquire the writer lock nor make one request per
 // summary/detail query. Workspace reads must also leave concurrent writers free.
 const transaction=client.transaction.bind(client), modes=[];let batches=0;
 client.transaction=async mode=>{
  modes.push(mode);const tx=await transaction(mode),batch=tx.batch.bind(tx);
  tx.batch=async statements=>{batches++;return batch(statements);};return tx;
 };
 try {
  await req('tasks?limit=25&background=1',admin);
  assert.deepEqual(modes,['read']);assert.equal(batches,2);
  await req('workspace?scope=1&view=tasks&background=1',admin);
  assert.deepEqual(modes,['read','read']);
 } finally {client.transaction=transaction;}

 // Scheduling never grants session access and preview workers cannot run.
 delete process.env.CRON_SECRET;assert.equal((await worker(new Request(origin))).status,401);
 process.env.CRON_SECRET=randomBytes(32).toString('hex');
 const cronReq=new Request(origin,{headers:{Authorization:'Bearer '+process.env.CRON_SECRET}});
 assert.equal((await worker(cronReq)).status,503);
 process.env.SHEETS_WORKER_ENABLED='true';process.env.VERCEL_ENV='preview';assert.equal((await worker(cronReq)).status,503);
 process.env.VERCEL_ENV='production';assert.equal((await worker(cronReq)).status,200);
 console.log('PASS: Phase 1 password upgrade, atomic concurrent throttling, proxy handling, session revocation, pagination/filter privacy, scoped workspace and cron authorization.');
} finally {client.close();rmSync(dir,{recursive:true,force:true});}
