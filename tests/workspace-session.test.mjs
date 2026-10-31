import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreWorkspace } from '../lib/workspace-session.mjs';

const user = { id: 'employee', role: 'EMPLOYEE' };
const json = (body, status = 200) => Response.json(body, { status });
test('refresh waits for session and workspace before restoring the user', async () => {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const calls = [];
    const restoring = restoreWorkspace(async (url, options) => {
        calls.push(url);
        assert.deepEqual(options, { credentials: 'same-origin', cache: 'no-store' });
        if (url === '/api/auth/me') { await pending; return json({ user }); }
        return json({ user, tasks: [] });
    });
    assert.deepEqual(calls, ['/api/auth/me']);
    release();
    assert.deepEqual(await restoring, { auth: { user }, data: { user, tasks: [] } });
    assert.deepEqual(calls, ['/api/auth/me', '/api/workspace']);
});
test('confirmed signed-out users see login without requesting workspace', async () => {
    assert.deepEqual(await restoreWorkspace(async url => {
        assert.equal(url, '/api/auth/me');
        return json({ user: null });
    }), { auth: { user: null }, data: null });
});
test('expiry between session check and workspace opens login', async () => {
    const result = await restoreWorkspace(async url => url === '/api/auth/me' ? json({ user }) : json({ error: 'Expired' }, 401));
    assert.equal(result.auth.user, null);
    assert.equal(result.data, null);
});
test('temporary server or network failures do not become a signed-out result', async () => {
    await assert.rejects(restoreWorkspace(async () => { throw new TypeError('Offline'); }));
    await assert.rejects(restoreWorkspace(async () => json({ error: 'Unavailable' }, 503)));
    await assert.rejects(restoreWorkspace(async url => url === '/api/auth/me' ? json({ user }) : json({}, 503)));
});
test('malformed responses do not become a signed-out result', async () => {
    await assert.rejects(restoreWorkspace(async () => json({ error: 'Unexpected' })));
    await assert.rejects(restoreWorkspace(async url => url === '/api/auth/me' ? json({ user }) : json({ user: { id: 'other' } })));
});
