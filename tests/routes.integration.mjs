import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'workhub-routes-'));process.env.TURSO_DATABASE_URL='file:'+join(dir,'test.db');delete process.env.ADMIN_EMAIL;delete process.env.ADMIN_PASSWORD_HASH;
const {getClient}=await import('../lib/database.ts');const {handle}=await import('../lib/api.ts');const {sha}=await import('../lib/auth.ts');const {ensureRoutingSchema}=await import('../lib/routing-schema.mjs');const db=getClient();let checks=0;
async function req(path,cookie='',body,status=200){const r=await handle(new Request('http://test/api/'+path,{method:body?'POST':'GET',headers:{Cookie:cookie,Origin:'http://test','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));const j=await r.json();assert.equal(r.status,status,JSON.stringify(j));checks++;return j;}
try {
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint').filter(s=>s.trim()))await db.execute(sql);
 for(const [id,role] of [['admin','ADMIN'],['owner','EMPLOYEE'],['other','EMPLOYEE'],['unassigned','EMPLOYEE']]){await db.execute({sql:'INSERT INTO users(id,name,email,role,created_at) VALUES(?,?,?,?,?)',args:[id,id,id+'@example.test',role,Date.now()]});await db.execute({sql:'INSERT INTO sessions VALUES(?,?,?,?)',args:[await sha(id),id,Date.now(),Date.now()+3600000]});}
 for(const id of ['p','p2'])await db.execute({sql:"INSERT INTO projects(id,name,pay_basis) VALUES(?,'Same name','TASK')",args:[id]});
 await db.execute("INSERT INTO project_assignments VALUES('p','owner'),('p','other')");
 await db.execute("INSERT INTO accounts(id,project_id,name) VALUES('a','p','First'),('b','p','Second')");
 for(const [id,account] of [['t1','a'],['t2','b']])await db.execute({sql:"INSERT INTO task_entries(id,date,project_id,account_id,user_id,video_id,duration_seconds,status,created_at,updated_at,pay_basis) VALUES(?,'2026-11-01','p',?,'owner','00001',0,'PENDING',?,?,'TASK')",args:[id,account,Date.now(),Date.now()]});
 const triggers=(await db.execute("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name")).rows;
 await ensureRoutingSchema(db);const before=(await db.execute('SELECT * FROM project_urls ORDER BY project_id')).rows;assert.deepEqual(before.map(r=>r.slug),['same-name','same-name-2']);
 await ensureRoutingSchema(db);assert.deepEqual((await db.execute('SELECT * FROM project_urls ORDER BY project_id')).rows,before);assert.deepEqual((await db.execute("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name")).rows,triggers);
 const {workspacePageAccess}=await import('../lib/workspace-page-access.ts');
 const ownerSlug=(await db.execute("SELECT slug FROM employee_urls WHERE user_id='owner'")).rows[0].slug;
 const pagePath='/same-name/'+ownerSlug+'/00001';
 async function page(path,who=''){return workspacePageAccess(new Request('http://test'+path,{headers:{Cookie:who?'aces_session='+who:''}}));}
 assert.equal(await page(pagePath,'owner'),null);assert.equal(await page(pagePath,'admin'),null);
 const denied=await page(pagePath,'other'),missing=await page('/missing','other');assert.equal(denied.status,404);assert.equal(await denied.text(),await missing.text());assert.equal(denied.headers.get('Cache-Control'),'private, no-store');assert.equal(denied.headers.get('X-Robots-Tag'),'noindex, nofollow');
 const login=await page(pagePath+'?account=first-a');assert.equal(login.status,307);assert.equal(new URL(login.headers.get('Location'),'http://test').searchParams.get('returnTo'),pagePath+'?account=first-a');
 const q='resolve?'+new URLSearchParams({project:'same-name',employee:ownerSlug,task:'00001'});
 for(const who of ['owner','admin']){assert.equal((await req(q,'aces_session='+who)).kind,'chooser');assert.equal((await req(q+'&account=first-a','aces_session='+who)).task.id,'t1');}
 for(const who of ['other','unassigned','']){const denied=await req(q,who?'aces_session='+who:'',undefined,404);assert.deepEqual(denied,await req('resolve?project=missing',who?'aces_session='+who:'',undefined,404));}
 await req(q.replace('00001','1'),'aces_session=owner',undefined,404);
 const snapshot=await req('workspace','aces_session=owner');assert.equal(snapshot.users.length,1);assert.ok(!('profit_rows'in snapshot));assert.ok(snapshot.projects.every(p=>!('client_rate_cents'in p)));assert.ok(snapshot.tasks.every(t=>t.user_id==='owner'));assert.ok(!JSON.stringify(await req(q,'aces_session=owner')).includes('@'));
 const body={name:'Renamed project',id:'p',slug:'renamed',status:'active',pay_basis:'TASK',hourly_target:40,rate_cents:0,employee_ids:['owner','other']};await req('projects','aces_session=admin',body);assert.equal((await req(q,'aces_session=owner')).project.slug,'renamed');assert.equal((await page(pagePath+'?account=first-a','owner')).headers.get('Location'),'/renamed/'+ownerSlug+'/00001?account=first-a');
 await req('projects','aces_session=admin',{...body,slug:undefined,name:'Name changes only'});assert.equal((await req(q,'aces_session=owner')).project.slug,'renamed');
 await req('projects','aces_session=admin',{...body,id:undefined,slug:'same-name'},409);
 for(const slug of ['api','overview','login','_next','invalid/path'])await req('projects','aces_session=admin',{...body,id:undefined,slug},400);
 await req('projects','aces_session=admin',{...body,id:undefined,slug:undefined,name:'tasks'},400);
 await db.execute("UPDATE users SET name='A different name' WHERE id='owner'");await ensureRoutingSchema(db);assert.equal((await db.execute("SELECT slug FROM employee_urls WHERE user_id='owner'")).rows[0].slug,ownerSlug);
 await db.execute("DELETE FROM project_assignments WHERE user_id='owner'");await req(q,'aces_session=owner',undefined,404);
 console.log(`Route integration passed (${checks} API checks, backfill idempotence, immutable identities, trigger preservation).`);
}finally{db.close();rmSync(dir,{recursive:true,force:true});}
