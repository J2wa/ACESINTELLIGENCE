// Isolated local libSQL integration tests. No production data is touched.
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {randomBytes} from 'node:crypto';import assert from 'node:assert/strict';
import {day,midnight,weekStart,addDays} from '../lib/core.mjs';
const testDir=mkdtempSync(join(tmpdir(),'workhub-test-'));
const secret=randomBytes(32).toString('hex'),pass=randomBytes(24).toString('hex'),employeePass=randomBytes(24).toString('hex');
process.env.TURSO_DATABASE_URL='file:'+join(testDir,'test.db');
process.env.BOOTSTRAP_TOKEN=secret;
delete process.env.ADMIN_EMAIL;delete process.env.ADMIN_PASSWORD_HASH;
const {handle}=await import('../lib/api.ts');
const {database,getClient}=await import('../lib/database.ts');
const dispatch=(url,init)=>handle(new Request(url,init));
let checks=0;
try{const db=database;for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()){for(const sql of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();}
const base='http://workhub.test';async function req(path,body,cookie='',expected=200){const r=await dispatch(base+'/api/'+path,{method:body?'POST':'GET',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},...(body?{body:JSON.stringify(body)}:{})});const text=await r.text();assert.equal(r.status,expected,`${path}: ${text.slice(0,400)}`);checks++;return {r,j:(r.headers.get('content-type')??'').includes('json')?JSON.parse(text):text};}
await req('workspace',null,'',401);const setup=await req('auth/setup',{name:'QA Admin',email:'admin@example.com',password:pass,bootstrap_token:secret}),admin=setup.r.headers.get('set-cookie').split(';')[0];await req('auth/setup',{name:'Other',email:'other@example.com',password:pass,bootstrap_token:secret},'',409);
// A hard refresh restores the same authenticated session without another login.
const {restoreWorkspace}=await import('../lib/workspace-session.mjs');
for(let refresh=0;refresh<3;refresh++) {
 const restored=await restoreWorkspace((path)=>dispatch(base+path,{headers:{Cookie:admin}}));
 assert.equal(restored.auth.user.id,setup.j.user.id);assert.equal(restored.data.user.id,setup.j.user.id);checks++;
}
await req('users',{name:'QA Employee',email:'employee@example.com',role:'EMPLOYEE',active:1,password:employeePass},admin);let snapshot=(await req('workspace',null,admin)).j;const employeeId=snapshot.users.find(u=>u.email==='employee@example.com').id;const p=(await req('projects',{name:'QA Project',description:'',status:'active',hourly_target:40,rate_cents:15000,color:'#647c45',employee_ids:[employeeId]},admin)).j.id;
await req('accounts',{project_id:p,name:'cococrunch',active:1,sheet_tab:'',employee_ids:[employeeId]},admin);snapshot=(await req('workspace',null,admin)).j;const account=snapshot.accounts[0].id;const er=await req('auth/login',{email:'employee@example.com',password:employeePass}),employee=er.r.headers.get('set-cookie').split(';')[0];
const own=(await req('workspace',null,employee)).j;assert.equal(own.users.length,1);assert.equal(own.users[0].id,employeeId);await req('projects',{name:'forbidden'},employee,403);
const otherProject=(await req('projects',{name:'Unassigned project',description:'',status:'active',hourly_target:null,rate_cents:10000,color:'#647c45',employee_ids:[]},admin)).j.id;
await req('timer',{action:'start',project_id:otherProject},employee,403);
await db.prepare("INSERT INTO users(id,name,email,role,created_at) VALUES('other','Other employee','other@example.com','EMPLOYEE',0)").run();
await db.prepare("INSERT INTO task_entries(id,date,project_id,account_id,user_id,video_id,duration_seconds,created_at,updated_at) VALUES('private-task',?,?,?,?,?,60,0,0)").bind(day(),p,account,'other','PRIVATE-ID').run();
assert(!(await req('workspace',null,employee)).j.tasks.some(t=>t.id==='private-task'));
await req('audit?task=private-task',null,employee,403);
const date=day(),body={date,project_id:p,account_id:account,video_id:'000QA-ID',duration:'0:04:32',status:'PENDING',notes:'Synthetic test',minutes:0};await req('tasks',{...body,id:'private-task',version:1},employee,403);const task=(await req('tasks',body,employee)).j.id;assert(task);const dupe=(await req('tasks',body,employee,409)).j;assert.equal(dupe.existing_id,task);await req('tasks',{...body,video_id:'bad-status',status:'APPROVED'},employee,403);await req('tasks',{...body,video_id:'bad-duration',duration:'0:99:00'},employee,400);
await req('tasks',{...body,id:task,version:1,status:'APPROVED'},admin);await req('tasks',{...body,id:task,version:1},employee,409);
const start=midnight(date)+3600000,end=start+3600000;await req('time',{project_id:p,task_id:task,start_ms:start,end_ms:end},employee);await req('time',{project_id:p,start_ms:start+60000,end_ms:end+60000},employee,409);
const minutesTask=(await req('tasks',{...body,date:addDays(date,-1),video_id:'MINUTES-ONLY',minutes:409},employee)).j.id;
const minutesWorkspace=(await req('workspace',null,employee)).j;
const allocated=minutesWorkspace.times.filter(t=>t.task_id===minutesTask);
assert.equal(allocated.reduce((sum,t)=>sum+t.end_ms-t.start_ms,0),409*60000);
assert(allocated.every(t=>day(t.start_ms)===addDays(date,-1)));
const reviewTask=minutesWorkspace.tasks.find(t=>t.id===minutesTask);
await req('task-hours',{task_id:minutesTask,signature:reviewTask.hours_signature,action:'approve'},employee,403);
await req('task-hours',{task_id:minutesTask,signature:'stale',action:'approve'},admin,409);
await req('task-hours',{task_id:minutesTask,signature:reviewTask.hours_signature,action:'approve'},admin);
assert.equal((await req('workspace',null,admin)).j.tasks.find(t=>t.id===minutesTask).hours_status,'APPROVED');
const changed=allocated[0];
await req('time',{id:changed.id,project_id:p,task_id:minutesTask,start_ms:changed.start_ms+60000,end_ms:changed.end_ms},employee);
const afterEdit=(await req('workspace',null,admin)).j.tasks.find(t=>t.id===minutesTask);
assert.equal(afterEdit.hours_status,'PENDING');
await req('task-hours',{task_id:minutesTask,signature:reviewTask.hours_signature,action:'approve'},admin,409);
await req('task-hours',{task_id:minutesTask,signature:afterEdit.hours_signature,action:'return'},admin);
assert.equal((await req('workspace',null,employee)).j.tasks.find(t=>t.id===minutesTask).hours_status,'RETURNED');
// Change the project model, while earlier time keeps its working-hour basis.
await req('projects',{id:p,name:'QA Project',description:'',status:'active',hourly_target:40,rate_cents:5000,pay_basis:'TASK',color:'#647c45',employee_ids:[employeeId]},admin);
const perTask=(await req('tasks',{...body,video_id:'PER-TASK',minutes:0},employee)).j.id;
let payTask=(await req('workspace',null,admin)).j.tasks.find(t=>t.id===perTask);
assert.equal(payTask.pay_basis,'TASK');assert.equal(payTask.rate_cents,5000);
await req('projects',{id:p,name:'QA Project',description:'',status:'active',hourly_target:40,rate_cents:20000,pay_basis:'VIDEO_HOUR',color:'#647c45',employee_ids:[employeeId]},admin);
const perVideo=(await req('tasks',{...body,video_id:'PER-VIDEO',duration:'0:30:00',minutes:0},employee)).j.id;
await req('tasks',{...body,id:perVideo,version:1,video_id:'PER-VIDEO',duration:'0:30:00',status:'APPROVED'},admin);
payTask=(await req('workspace',null,admin)).j.tasks.find(t=>t.id===perTask);
assert.equal(payTask.pay_basis,'TASK');assert.equal(payTask.rate_cents,5000);
const payroll=(await req('export?kind=payroll',null,admin)).j;
assert(payroll.includes('Per video hour') && payroll.includes('Per task'));
await req('tasks',{...body,date:addDays(date,-1),id:minutesTask,version:1,video_id:'MINUTES-ONLY',minutes:1},employee,400);
// Single and batch task-status approval preserve data and reject stale or unauthorized requests.
const approvalDate=addDays(date,-14);
const approvalA=(await req('tasks',{...body,date:approvalDate,video_id:'APPROVAL-A'},employee)).j.id;
const approvalB=(await req('tasks',{...body,date:approvalDate,video_id:'APPROVAL-B'},employee)).j.id;
const statusPayload={tasks:[{id:approvalA,version:1},{id:approvalB,version:1}]};
await req('task-status',statusPayload,employee,403);
await req('task-status',{tasks:[]},admin,400);
await req('task-status',{tasks:[statusPayload.tasks[0],statusPayload.tasks[0]]},admin,400);
await req('task-status',{tasks:[statusPayload.tasks[0],{id:approvalB,version:9}]},admin,409);
assert.equal((await db.prepare('SELECT status FROM task_entries WHERE id=?').bind(approvalA).first()).status,'PENDING');
await req('task-status',statusPayload,admin);
for(const selected of statusPayload.tasks){const row=await db.prepare('SELECT * FROM task_entries WHERE id=?').bind(selected.id).first();assert.equal(row.status,'APPROVED');assert.equal(row.version,2);assert.equal(row.notes,'Synthetic test');assert(await db.prepare("SELECT id FROM audit_log WHERE entity_id=? AND action='approved'").bind(selected.id).first());assert(await db.prepare('SELECT task_id FROM sync_jobs WHERE task_id=?').bind(selected.id).first());checks++;}
await req('task-status',statusPayload,admin,409);
const approvalC=(await req('tasks',{...body,date:approvalDate,video_id:'APPROVAL-C'},employee)).j.id;
await req('task-status',{tasks:[{id:approvalC,version:1}]},admin);
assert.equal((await req('workspace',null,employee)).j.tasks.find(t=>t.id===approvalC).status,'APPROVED');
await req('timer',{action:'start',project_id:p},employee);await req('timer',{action:'start',project_id:p},employee,409);await req('timesheets',{week_start:weekStart(date),action:'submit'},employee,400);await req('timer',{action:'stop'},employee);
await req('timesheets',{week_start:weekStart(date),action:'submit'},employee);await req('task-status',{tasks:[{id:task,version:2}]},admin,409);await req('time',{project_id:p,start_ms:start-3600000,end_ms:start},employee,409);await req('timesheets',{week_start:weekStart(date),user_id:employeeId,action:'approve'},admin);await req('timesheets',{week_start:weekStart(date),user_id:employeeId,action:'return',comment:'Check hours'},admin);await req('time',{project_id:p,start_ms:start-3600000,end_ms:start},employee);
const exp=await dispatch(base+'/api/export?format=xlsx',{headers:{Cookie:employee}});assert.equal(exp.status,200);assert.equal((new Uint8Array(await exp.arrayBuffer()))[0],80);checks++;const history=(await req('audit?task='+task,null,employee)).j;assert(history.length>=2);
const csrf=await dispatch(base+'/api/timer',{method:'POST',headers:{Origin:'https://invalid.example','Content-Type':'application/json',Cookie:employee},body:JSON.stringify({action:'start',project_id:p})});assert.equal(csrf.status,403);checks++;
await req('auth/password',{current_password:employeePass,password:randomBytes(24).toString('hex')},employee);await req('workspace',null,employee,401);
// Environment bootstrap creates only missing accounts; sign-out revokes the server session.
const {hashPassword}=await import('../lib/auth.ts');
const envPass=randomBytes(24).toString('hex');
process.env.ADMIN_EMAIL='env-admin@example.com';process.env.ADMIN_PASSWORD_HASH=await hashPassword(envPass);
await req('auth/me');
const envLogin=await req('auth/login',{email:process.env.ADMIN_EMAIL,password:envPass});
const envCookie=envLogin.r.headers.get('set-cookie').split(';')[0];
assert.equal(envLogin.j.user.role,'ADMIN');
await req('auth/logout',{},envCookie);await req('workspace',null,envCookie,401);
const signedOut=await restoreWorkspace((path)=>dispatch(base+path,{headers:{Cookie:envCookie}}));assert.equal(signedOut.auth.user,null);assert.equal(signedOut.data,null);checks++;
process.env.ADMIN_EMAIL='employee@example.com';
await req('auth/me');
assert.equal((await db.prepare('SELECT role FROM users WHERE email=?').bind(process.env.ADMIN_EMAIL).first()).role,'EMPLOYEE');
checks++;
console.log(`PASS: ${checks} Node/libSQL API checks including RBAC, bootstrap, assignment, hashing/login, duplicate conflict, stale edits, timer/overlap, timesheet workflow, XLSX, audit, CSRF and session revocation.`);
}finally{getClient().close();rmSync(testDir,{recursive:true,force:true});}
