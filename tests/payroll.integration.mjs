// Isolated database: payment records here never touch production or transfer funds.
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
import {midnight} from '../lib/core.mjs';import {earningsTotals} from '../lib/payroll-core.mjs';
const originalNow=Date.now;let ticks=0;Date.now=()=>midnight('2026-11-01')+43200000+ticks++;
const dir=mkdtempSync(join(tmpdir(),'workhub-payroll-'));process.env.TURSO_DATABASE_URL='file:'+join(dir,'test.db');process.env.BOOTSTRAP_TOKEN=randomBytes(24).toString('hex');delete process.env.ADMIN_EMAIL;delete process.env.ADMIN_PASSWORD_HASH;
const {database:db,getClient}=await import('../lib/database.ts');const {handle}=await import('../lib/api.ts');
let checks=0;const origin='http://workhub.test';
async function req(path,body,cookie='',status=200){const r=await handle(new Request(origin+'/api/'+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},...(body?{body:JSON.stringify(body)}:{})}));const text=await r.text();assert.equal(r.status,status,`${path}: ${text.slice(0,500)}`);checks++;return{r,j:r.headers.get('content-type')?.includes('json')?JSON.parse(text):text};}
const cookie=r=>r.headers.get('set-cookie').split(';')[0];
try{
// Start with the prior deployed schema; the authenticated request must add payment tables safely.
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&!f.startsWith('0002')).sort())for(const sql of readFileSync('drizzle/'+f,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
const admin=cookie((await req('auth/setup',{name:'Coordinator',email:'admin@example.com',password:randomBytes(24).toString('hex'),bootstrap_token:process.env.BOOTSTRAP_TOKEN})).r);
await req('workspace',null,admin);assert(await db.prepare('SELECT version FROM payroll_schema_version WHERE version=1').first());
const passA=randomBytes(24).toString('hex'),passB=randomBytes(24).toString('hex');
await req('users',{name:'Alice',email:'alice@example.com',role:'EMPLOYEE',active:1,password:passA},admin);await req('users',{name:'Bob',email:'bob@example.com',role:'EMPLOYEE',active:1,password:passB},admin);
let workspace=(await req('workspace',null,admin)).j;const alice=workspace.users.find(u=>u.email==='alice@example.com').id,bob=workspace.users.find(u=>u.email==='bob@example.com').id;
const a=cookie((await req('auth/login',{email:'alice@example.com',password:passA})).r),b=cookie((await req('auth/login',{email:'bob@example.com',password:passB})).r);
const project=(await req('projects',{name:'Hourly project',time_tracking_enabled:1,description:'',status:'active',hourly_target:40,rate_cents:6000,pay_basis:'WORKING_HOUR',color:'#2563eb',employee_ids:[alice,bob]},admin)).j.id;
await req('accounts',{project_id:project,name:'Hourly account',active:1,sheet_tab:'',employee_ids:[alice,bob]},admin);workspace=(await req('workspace',null,admin)).j;const account=workspace.accounts.find(x=>x.project_id===project).id;
const taskBody={date:'2026-10-31',project_id:project,account_id:account,duration:'0:03:00',status:'PENDING',minutes:60,notes:'Original work'};
const taskA=(await req('tasks',{...taskBody,video_id:'000-ALICE'},a)).j.id,taskB=(await req('tasks',{...taskBody,date:'2026-11-01',minutes:30,video_id:'000-BOB'},b)).j.id;
const pending=(await req('tasks',{...taskBody,date:'2026-11-01',minutes:30,video_id:'UNAPPROVED'},a)).j.id;
workspace=(await req('workspace',null,admin)).j;
await req('task-hours/bulk',{tasks:[taskA,taskB].map(task_id=>({task_id,signature:workspace.tasks.find(t=>t.id===task_id).hours_signature}))},admin);
const taskProject=(await req('projects',{name:'Task project',description:'',status:'active',hourly_target:40,rate_cents:12345,pay_basis:'TASK',color:'#2563eb',employee_ids:[alice,bob]},admin)).j.id;
await req('accounts',{project_id:taskProject,name:'Task account',active:1,sheet_tab:'',employee_ids:[alice,bob]},admin);workspace=(await req('workspace',null,admin)).j;const taskAccount=workspace.accounts.find(x=>x.project_id===taskProject).id;
const pieceBody={...taskBody,project_id:taskProject,account_id:taskAccount,date:'2026-11-01',minutes:0,video_id:'PAID-PIECE'};
const piece=(await req('tasks',pieceBody,a)).j.id;await req('tasks',{...pieceBody,id:piece,version:1,status:'APPROVED'},admin);
const running=(await req('tasks',{...taskBody,date:'2026-11-01',minutes:0,video_id:'RUNNING'},a)).j.id;await req('timer',{action:'start',project_id:project,task_id:running},a);
// Standalone approved project time is also paid and locked, with its own invoice line.
const standalone=(await req('time',{project_id:project,start_ms:midnight('2026-10-22')+14400000,end_ms:midnight('2026-10-22')+18000000},a)).j.id;
await req('timesheets',{week_start:'2026-10-19',action:'submit'},a);await req('timesheets',{week_start:'2026-10-19',user_id:alice,action:'approve'},admin);
const filters={from:'2026-10-01',to:'2026-11-30',employee:'',project:'',account:'',status:''};
await req('payroll/preview',{filters},a,403);await req('payroll/preview',{filters},'',401);
let preview=(await req('payroll/preview',{filters},admin)).j;
assert.equal(preview.total_cents,27345);assert.equal(preview.people.length,2);assert.equal(preview.task_count,3);assert.equal(preview.time_count,1);
const payload={filters,signature:preview.signature,request_id:randomUUID(),reference:'PAY-REFERENCE-001',notes:'Recorded payment'};
await req('payroll/pay',payload,a,403);
await req('tasks',{...taskBody,id:taskA,version:1,video_id:'000-ALICE',notes:'Checked work',minutes:0},a);
await req('payroll/pay',payload,admin,409);assert.equal((await db.prepare('SELECT COUNT(*) count FROM payment_invoices').first()).count,0);
preview=(await req('payroll/preview',{filters},admin)).j;payload.signature=preview.signature;
// A late database error rolls back invoices, locks and audit records together.
await db.prepare("CREATE TRIGGER test_payment_failure BEFORE INSERT ON payment_invoice_items WHEN NEW.task_label='PAID-PIECE' BEGIN SELECT RAISE(ABORT,'test_payment_failure'); END").run();
await req('payroll/pay',payload,admin,500);
for(const table of ['payment_batches','payment_invoices','payment_invoice_items','payment_tasks','payment_times'])assert.equal((await db.prepare(`SELECT COUNT(*) count FROM ${table}`).first()).count,0);
await db.prepare('DROP TRIGGER test_payment_failure').run();
const paid=(await req('payroll/pay',payload,admin)).j;assert.equal(paid.invoices.length,2);
const aliceInvoice=paid.invoices.find(invoice=>invoice.user_id===alice),bobInvoice=paid.invoices.find(invoice=>invoice.user_id===bob);
assert.equal(aliceInvoice.total_cents,24345);assert.equal(bobInvoice.total_cents,3000);
const repeat=(await req('payroll/pay',payload,admin)).j;assert.equal(repeat.already_recorded,true);assert.equal((await db.prepare('SELECT COUNT(*) count FROM payment_invoices').first()).count,2);
await req('payroll/pay',{...payload,request_id:randomUUID()},admin,409);
workspace=(await req('workspace',null,a)).j;assert.equal(workspace.invoices.length,1);assert(workspace.invoice_items.every(line=>line.user_id===alice));assert(workspace.tasks.find(t=>t.id===taskA).paid_invoice_id);assert(!workspace.tasks.find(t=>t.id===pending).paid_invoice_id);assert(!workspace.tasks.find(t=>t.id===running).paid_invoice_id);
const invoice=(await req('invoices/'+aliceInvoice.id,null,a)).j;assert.equal(invoice.items.reduce((sum,line)=>sum+line.amount_cents,0),invoice.total_cents);assert(invoice.items.some(line=>line.task_label==='000-ALICE'));assert(invoice.items.some(line=>line.task_label==='Project time'));assert.equal(invoice.reference,payload.reference);assert.equal(invoice.notes,payload.notes);
await req('invoices/'+aliceInvoice.id,null,b,404);await req('invoices/'+aliceInvoice.id+'?format=csv',null,b,404);const csv=(await req('invoices/'+aliceInvoice.id+'?format=csv',null,a)).j;assert(csv.includes('000-ALICE')&&csv.includes('243.45'));
await req('invoices/'+aliceInvoice.id+'?format=pdf',null,b,404);
await req('invoices/'+aliceInvoice.id+'?format=pdf',null,'',401);
const pdf=(await req('invoices/'+aliceInvoice.id+'?format=pdf',null,a));assert(pdf.j.startsWith('%PDF-'));assert.equal(pdf.r.headers.get('content-type'),'application/pdf');assert(pdf.r.headers.get('content-disposition').includes(aliceInvoice.number+'.pdf'));assert.equal(pdf.r.headers.get('cache-control'),'private, no-store');
const ownExport=(await req('export?kind=payroll',null,a)).j;assert(!ownExport.includes('Bob'));
await req('tasks',{...taskBody,id:taskA,version:2,video_id:'000-ALICE',notes:'Forbidden edit',minutes:0},a,409);
await req('tasks',{...taskBody,id:taskA,version:2,video_id:'000-ALICE',notes:'Forbidden edit',minutes:0},admin,409);
await req('task-status',{tasks:[{id:taskA,version:2}]},admin,409);
const linked=workspace.times.find(time=>time.task_id===taskA);
await req('time',{id:linked.id,project_id:project,task_id:taskA,start_ms:linked.start_ms+60000,end_ms:linked.end_ms},a,409);
await req('time',{project_id:project,task_id:taskA,start_ms:midnight('2026-10-30')+3600000,end_ms:midnight('2026-10-30')+7200000},a,409);
await req('task-hours',{task_id:taskA,signature:workspace.tasks.find(t=>t.id===taskA).hours_signature,action:'return'},admin,409);
await req('timer',{action:'stop'},a);await req('timer',{action:'start',project_id:project,task_id:taskA},a,409);
await req('timesheets',{week_start:'2026-10-19',user_id:alice,action:'return',comment:'Paid work remains locked'},admin);
const paidTime=workspace.times.find(time=>!time.task_id&&time.paid_invoice_id);
await req('time',{id:paidTime.id,project_id:project,start_ms:paidTime.start_ms+60000,end_ms:paidTime.end_ms},a,409);
await req('tasks/delete',{id:taskA,version:2},admin,409);
await req('time/delete',{id:linked.id},a,409);
await req('time/delete',{id:paidTime.id},admin,409);
for(const sql of ["DELETE FROM task_entries WHERE id='"+taskA+"'","DELETE FROM time_entries WHERE id='"+linked.id+"'","UPDATE payment_invoices SET total_cents=1","DELETE FROM payment_tasks","DELETE FROM payment_times","DELETE FROM payment_invoice_items"]){await assert.rejects(db.prepare(sql).run(),/paid_work_locked|invoice_immutable/);checks++;}
workspace=(await req('workspace',null,a)).j;const lifetime=earningsTotals(workspace,'2026-10');assert.equal(lifetime.paid_cents,24345);assert.equal(lifetime.monthly_cents,12000);assert.equal(earningsTotals(workspace,'2026-11').monthly_cents,12345);
// Paid totals survive project/rate and employee-name changes; invoice details remain snapshots.
await db.prepare("UPDATE projects SET name='Renamed project',rate_cents=99999 WHERE id=?").bind(taskProject).run();await db.prepare("UPDATE users SET name='Renamed employee' WHERE id=?").bind(alice).run();const history=(await req('invoices/'+aliceInvoice.id,null,a)).j;assert.equal(history.employee_name,'Alice');assert(history.items.some(line=>line.project_name==='Task project'&&line.rate_cents===12345));
const empty=(await req('payroll/preview',{filters:{...filters,project:taskProject}},admin)).j;assert.equal(empty.total_cents,0);
// Concurrent payment attempts cannot create two invoices for the same work.
const nextPiece=(await req('tasks',{...pieceBody,video_id:'CONCURRENT-PAYMENT'},a)).j.id;
await req('tasks',{...pieceBody,id:nextPiece,version:1,video_id:'CONCURRENT-PAYMENT',status:'APPROVED'},admin);
const concurrentFilters={...filters,project:taskProject};
const concurrentPreview=(await req('payroll/preview',{filters:concurrentFilters},admin)).j;
const sendPayment=()=>handle(new Request(origin+'/api/payroll/pay',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:admin},body:JSON.stringify({filters:concurrentFilters,signature:concurrentPreview.signature,request_id:randomUUID(),reference:'Concurrent check',notes:''})}));
const concurrent=await Promise.all([sendPayment(),sendPayment()]);assert.deepEqual(concurrent.map(response=>response.status).sort(),[200,409]);assert.equal((await db.prepare('SELECT COUNT(*) count FROM payment_invoices').first()).count,3);checks+=2;
console.log(`PASS: ${checks} payment API checks covering additive migration, previews, stale data, atomic rollback, idempotency, paid locks, invoice privacy, CSV, immutable history, and lifetime/monthly earnings.`);
}finally{Date.now=originalNow;getClient().close();rmSync(dir,{recursive:true,force:true});}
