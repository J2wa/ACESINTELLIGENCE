import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDuration,duration,day,midnight,weekStart,duplicateEntry,overlaps,splitDays,csv,xlsx} from '../lib/core.mjs';
test('duration parsing distinguishes video length from work time',()=>{assert.equal(parseDuration('1:02:03'),3723);assert.equal(duration(3723),'1:02:03');assert.equal(parseDuration('0:00:00'),0);assert.equal(parseDuration('125:59:59'),453599);});
test('invalid durations are rejected',()=>{for(const value of ['1:60:00','1:00:60','-1:00:00','1:2:3','01:22',' 1:02:03','1.5:00:00','123456:00:00'])assert.throws(()=>parseDuration(value));});
test('duplicate scope is exact project, account and text ID',()=>{const entries=[{id:'one',project_id:'p',account_id:'a',video_id:'00012'}];assert.equal(duplicateEntry(entries,'p','a','00012').id,'one');for(const [p,a,v]of [['p2','a','00012'],['p','b','00012'],['p','a','12'],['p','a','00012 ']])assert.equal(duplicateEntry(entries,p,a,v),undefined);assert.equal(duplicateEntry(entries,'p','a','00012','one'),undefined);});
test('half-open intervals allow adjacency but reject overlap and active timers',()=>{assert.equal(overlaps({start_ms:0,end_ms:10},{start_ms:10,end_ms:20}),false);assert.equal(overlaps({start_ms:0,end_ms:11},{start_ms:10,end_ms:20}),true);assert.equal(overlaps({start_ms:0,end_ms:null},{start_ms:10,end_ms:20}),true);});
test('Manila date and Monday boundary use UTC+08 even on UTC Sunday',()=>{assert.equal(day(Date.parse('2026-10-25T16:01:00Z')),'2026-10-26');assert.equal(weekStart('2026-11-01'),'2026-10-26');assert.equal(weekStart('2026-11-02'),'2026-11-02');assert.throws(()=>midnight('2026-02-30'));});
test('overnight time is split accurately for daily and payroll totals',()=>{const parts=splitDays(Date.parse('2026-10-30T23:30:00+08:00'),Date.parse('2026-10-31T01:00:00+08:00'));assert.deepEqual(parts,[{date:'2026-10-30',seconds:1800},{date:'2026-10-31',seconds:3600}]);});
test('CSV escapes quoting and neutralizes formulas',()=>{assert.ok(csv([['=cmd','00012','a"b']]).includes('"\'=cmd","00012","a""b"'));});
test('XLSX produces a ZIP package containing inline text IDs',()=>{const bytes=xlsx([{name:'Tasks',rows:[['VIDEO ID'],['00012']]}]);assert.equal(bytes[0],80);assert.equal(bytes[1],75);assert.ok(new TextDecoder().decode(bytes).includes('00012</t>'));});

test('409 task minutes need no start time and remain on the selected date', async () => {
 const {allocateTaskTime}=await import('../lib/core.mjs');
 const now=Date.parse('2026-10-31T20:34:00+08:00');
 const slots=allocateTaskTime('2026-10-31',409,[],now);
 assert.equal(slots.reduce((sum,t)=>sum+t.end_ms-t.start_ms,0),409*60000);
 assert.equal(slots.at(-1).end_ms,now);
 assert(slots.every(t=>day(t.start_ms)==='2026-10-31'));
});
test('task minutes fit gaps without overlapping timers or crossing dates', async () => {
 const {allocateTaskTime}=await import('../lib/core.mjs');
 const a=midnight('2026-10-30'), now=a+2*86400000;
 const existing=[{start_ms:a+3600000,end_ms:a+3*3600000},{start_ms:a+4*3600000,end_ms:null}];
 const slots=allocateTaskTime('2026-10-30',120,existing,now);
 assert.equal(slots.length,2);
 assert.equal(slots.reduce((sum,t)=>sum+t.end_ms-t.start_ms,0),120*60000);
 assert(slots.every(t=>!existing.some(e=>overlaps(t,e))));
 assert.throws(()=>allocateTaskTime('2026-10-30',121,existing,now),/Not enough unlogged time/);
 assert.deepEqual(allocateTaskTime('2026-10-30',0,existing,now),[]);
 assert.throws(()=>allocateTaskTime('2026-11-03',1,[],now),/today or an earlier/);
 assert.throws(()=>allocateTaskTime('2026-10-30',1.5,[],now),/whole minutes/);
});

test('payroll applies one captured pay basis and uses the right approval', async () => {
 const {payrollRows}=await import('../lib/core.mjs');
 const a=midnight('2026-10-30');
 const tasks=[
 {id:'task',date:'2026-10-30',user_id:'u',project_id:'p',pay_basis:'TASK',rate_cents:5000,duration_seconds:3600,status:'APPROVED'},
 {id:'video',date:'2026-10-30',user_id:'u',project_id:'p',pay_basis:'VIDEO_HOUR',rate_cents:20000,duration_seconds:1800,status:'PENDING'},
 {id:'work',date:'2026-10-30',user_id:'u',project_id:'p',pay_basis:'WORKING_HOUR',rate_cents:10000,duration_seconds:999,status:'PENDING',hours_status:'APPROVED'}
 ];
 const times=tasks.map((t,i)=>({id:t.id,task_id:t.id,user_id:'u',project_id:'p',pay_basis:t.pay_basis,rate_cents:t.rate_cents,start_ms:a+i*3600000,end_ms:a+(i+1)*3600000}));
 const rows=payrollRows({tasks,times,sheets:[]});
 assert.equal(rows.length,3);
 assert.equal(rows.reduce((s,r)=>s+r.cents,0),25000);
 assert.equal(rows.reduce((s,r)=>s+r.approved_cents,0),15000);
 assert.equal(payrollRows({tasks,times,sheets:[]},{employee:'someone-else'}).length,0);
});
test('changing linked hours invalidates an approval', async () => {
 const {taskHours,hoursSignature}=await import('../lib/core.mjs');
 const task={id:'t',date:'2026-10-30',user_id:'u',project_id:'p'};
 const times=[{id:'r',task_id:'t',start_ms:1,end_ms:60001,rate_cents:100,user_id:'u',project_id:'p'}];
 const review={status:'APPROVED',signature:hoursSignature(task,times)};
 assert.equal(taskHours(task,times,review).hours_status,'APPROVED');
 assert.equal(taskHours(task,[{...times[0],end_ms:120001}],review).hours_status,'PENDING');
 assert.equal(taskHours(task,[{...times[0],end_ms:null}],review).hours_status,'RUNNING');
});
