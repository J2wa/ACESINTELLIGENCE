import test from 'node:test';
import assert from 'node:assert/strict';
import {blankBulkRow, hasBulkContent, parseTaskClipboard, validateBulkRows} from '../lib/bulk-tasks.mjs';
const row=(id='000123')=>({...blankBulkRow(0),date:'2026-10-26',video_id:id,duration:'0:04:32'});
test('clipboard preserves leading zeroes, tabs and quoted multiline notes',()=>{
 const cells=parseTaskClipboard('2026-10-26\t000123\t0:04:32\t12\tPENDING\t"One\nTwo ""quoted"""\r\n2026-10-27\t000124\t0:01:00\t\tPENDING\t');
 assert.equal(cells.length,2);assert.equal(cells[0][1],'000123');assert.equal(cells[0][5],'One\nTwo "quoted"');assert.equal(cells[1][5],'');
});
test('clipboard rejects oversized selections and malformed quotes',()=>{
 assert.throws(()=>parseTaskClipboard('id\n'.repeat(101)),/100 rows/);
 assert.throws(()=>parseTaskClipboard('"unclosed'),/unclosed/);
});
test('blank rows are ignored and optional minutes become zero',()=>{
 assert.equal(hasBulkContent(blankBulkRow(1)),false);
 assert.deepEqual(validateBulkRows([row(),blankBulkRow(1)],false),{});
});
test('required details, dates, durations, minutes and duplicate IDs are validated',()=>{
 const errors=validateBulkRows([row(),{...row(),date:'2026-02-30',duration:'4:99:00',minutes:'1.5'},{...row(''),notes:'Note'}],false);
 assert(errors[1].date);assert(errors[1].duration);assert(errors[1].minutes);assert(errors[1].video_id);assert(errors[2].video_id);
 assert.deepEqual(validateBulkRows([row('000123'),row('123')],false),{});
});
test('employees cannot approve tasks through pasted statuses',()=>{
 const approved={...row(),status:'APPROVED'};
 assert(validateBulkRows([approved],false)[0].status);
 assert.deepEqual(validateBulkRows([approved],true),{});
});
