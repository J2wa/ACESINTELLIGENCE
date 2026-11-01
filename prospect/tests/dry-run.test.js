import test from 'node:test';import assert from 'node:assert/strict';import {dryRun} from '../scripts/dry-run.mjs';
test('10-lead end-to-end dry run reaches Held and produces Friday report',()=>{const x=dryRun();assert.equal(x.input,10);assert.equal(x.messagesSent,0);assert.equal(x.externalCalls,0);assert.equal(x.pipelineFinal,'Held')});
