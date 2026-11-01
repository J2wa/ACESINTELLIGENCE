import test from 'node:test';
import assert from 'node:assert/strict';
import {companyProfitRows,profitSummary} from '../lib/profit-core.mjs';
test('profit uses the captured task/video/hour units and only approved work in totals',()=>{
 const tasks=[{id:'task',date:'2026-11-01',project_id:'p',user_id:'u',pay_basis:'TASK',rate_cents:15000,status:'APPROVED'},
 {id:'video',date:'2026-11-01',project_id:'p',user_id:'u',pay_basis:'VIDEO_HOUR',duration_seconds:1800,rate_cents:10000,status:'APPROVED'},
 {id:'pending',date:'2026-11-01',project_id:'p',user_id:'u',pay_basis:'TASK',rate_cents:10000,status:'PENDING'},
 {id:'skip',date:'2026-11-01',project_id:'p',user_id:'u',pay_basis:'TASK',rate_cents:10000,status:'SKIPPED (NO CHANGES)'}];
 const times=[{id:'time',project_id:'p',user_id:'u',start_ms:Date.parse('2026-11-01T23:30:00+08:00'),end_ms:Date.parse('2026-11-02T00:30:00+08:00'),pay_basis:'WORKING_HOUR',rate_cents:15000}];
 const sheets=[{user_id:'u',week_start:'2026-10-26',status:'APPROVED'},{user_id:'u',week_start:'2026-11-02',status:'APPROVED'}];
 const rates=[...tasks.map(t=>({kind:'task',work_id:t.id,rate_cents:20000})),{kind:'time',work_id:'time',rate_cents:20000}];
 const rows=companyProfitRows({tasks,times,sheets},rates);
 assert(!rows.some(r=>r.task_id==='skip'));
 const summary=profitSummary(rows,{from:'2026-11-01',to:'2026-11-01'});
 assert.equal(summary.reduce((s,r)=>s+r.revenue_cents,0),40000);
 assert.equal(summary.reduce((s,r)=>s+r.employee_cents,0),27500);
 assert.equal(summary.reduce((s,r)=>s+r.profit_cents,0),12500);
 assert.deepEqual(profitSummary(rows,{project:'other'}),[]);
});
test('missing historical rates are distinct from zero; losses stay negative and paid work counts once',()=>{
 const tasks=['missing','zero','paid'].map(id=>({id,date:'2026-11-01',project_id:'p',user_id:'u',pay_basis:'TASK',rate_cents:1000,status:'APPROVED',paid_invoice_id:id==='paid'?'invoice':null}));
 const rows=companyProfitRows({tasks,times:[],sheets:[]},[{kind:'task',work_id:'zero',rate_cents:0},{kind:'task',work_id:'paid',rate_cents:1500}]);
 const [summary]=profitSummary(rows);
 assert.equal(summary.unpriced,1);assert.equal(summary.revenue_cents,1500);assert.equal(summary.employee_cents,2000);assert.equal(summary.profit_cents,-500);
});
