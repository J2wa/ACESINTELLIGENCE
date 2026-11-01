import test from 'node:test';
import assert from 'node:assert/strict';
import {datePreset} from '../lib/date-presets.mjs';
import {day} from '../lib/core.mjs';
test('date presets use Manila calendar boundaries and unbounded lifetime',()=>{
 const manila=day(Date.parse('2026-10-31T16:30:00Z'));
 assert.equal(manila,'2026-11-01');
 assert.deepEqual(datePreset('today',manila),{from:'2026-11-01',to:'2026-11-01'});
 assert.deepEqual(datePreset('week',manila),{from:'2026-10-26',to:'2026-11-01'});
 assert.deepEqual(datePreset('month',manila),{from:'2026-11-01',to:'2026-11-01'});
 assert.deepEqual(datePreset('lifetime',manila),{from:'',to:''});
});
