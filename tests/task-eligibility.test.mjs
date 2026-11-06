import {test} from 'node:test';
import assert from 'node:assert/strict';
import {taskMutationReason} from '../lib/task-eligibility.mjs';
const user={id:'owner',role:'EMPLOYEE'},task={id:'task',user_id:'owner',date:'2024-02-29',status:'PENDING'};
test('Manila month boundary includes leap day and changes at UTC 16:00',()=>{
 assert.equal(taskMutationReason(task,user,[],[],true,Date.parse('2024-02-29T15:59:59Z')),'');
 assert.match(taskMutationReason(task,user,[],[],true,Date.parse('2024-02-29T16:00:00Z')),/month/);
 assert.equal(taskMutationReason(task,user,[],[],false,Date.parse('2024-02-29T16:00:00Z')),'');
});
test('deletion selection excludes approval, invoices, time locks and other owners',()=>{
 const now=Date.parse('2024-02-20T00:00:00Z');
 for(const extra of [{status:'APPROVED'},{paid_invoice_id:'invoice'},{invoice_locked:1},{review_approved:1},{user_id:'other'},{removal_pending:1}]) assert.notEqual(taskMutationReason({...task,...extra},user,[],[],true,now),'');
 assert.match(taskMutationReason(task,user,[{task_id:'task',end_ms:null}],[],true,now),/timers/);
 const eligible=Array.from({length:30},(_,i)=>({...task,id:String(i)}));
 const visible=eligible.slice(0,25);
 const selected=visible.filter(t=>!taskMutationReason(t,user,[],[],true,now));
 assert.equal(selected.length,25);assert(!selected.some(t=>t.id==='25'));
});
