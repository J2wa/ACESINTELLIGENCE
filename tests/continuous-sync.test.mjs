import test from 'node:test';
import assert from 'node:assert/strict';
import { startContinuousSync } from '../lib/continuous-sync.mjs';

function harness(request) {
    let next, delay;
    const reports = [];
    const controller = startContinuousSync({ request, report: r => reports.push(r), schedule: (fn, ms) => { next = fn; delay = ms; return 1; }, cancel: () => { next = null; } });
    return { controller, reports, get delay() { return delay; }, tick: async () => { const fn = next; next = null; await fn(); }, hasTimer: () => !!next };
}
test('drains multiple batches then watches for newly queued work', async () => {
    const results = [{synced:3,pending:true},{synced:3,pending:true},{synced:1,pending:false},{synced:1,pending:false}];
    const h = harness(async () => results.shift());
    await h.tick(); assert.equal(h.delay,10000);
    await h.tick(); await h.tick(); assert.equal(h.delay,30000);
    await h.tick(); assert.equal(h.reports.reduce((s,r)=>s+r.synced,0),8);
    h.controller.stop(); assert.equal(h.hasTimer(),false);
});
test('backs off unsuccessful batches and network errors; stops at session expiry', async () => {
    let call = 0;
    const h = harness(async () => { call++; if (call === 2) throw new Error('offline'); return call === 3 ? {unauthorized:true} : {synced:0,pending:true}; });
    await h.tick(); assert.equal(h.delay,30000);
    await h.tick(); assert.equal(h.delay,60000);
    await h.tick(); assert.equal(h.hasTimer(),false);
    h.controller.retry(); assert.equal(call,3);
});
test('does not overlap requests or update an unmounted workspace', async () => {
    let finish, calls = 0;
    const h = harness(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
    const pending = h.tick(); h.controller.retry(); assert.equal(calls,1);
    h.controller.stop(); finish({synced:3,pending:true}); await pending;
    assert.equal(h.reports.length,0); assert.equal(h.hasTimer(),false);
});
