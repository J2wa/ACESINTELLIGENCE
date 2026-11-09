// Foreground reloads supersede older reads; background reads never interrupt them.
export function createWorkspaceRefresh({ fetcher = fetch, getUrl = () => '/api/workspace', onData, onExpired, onLoading = (loading, background) => {}, isValidData = data => !!data?.user }) {
    let generation = 0, pending;
    function invalidate() { generation++; pending?.abort(); pending = undefined; }
    return {
        invalidate,
        async refresh(background = false) {
            if (background && pending) return;
            invalidate();
            const current = generation, controller = new AbortController();
            pending = controller; onLoading(true, background);
            const timeout = setTimeout(() => controller.abort(), 20000);
            try {
                const url = getUrl();
                const response = await fetcher(url + (background ? (url.includes('?') ? '&' : '?') + 'background=1' : ''), { cache: 'no-store', signal: controller.signal });
                if (current !== generation) return;
                if (response.status === 401) { onExpired(); return; }
                const data = await response.json();
                if (current !== generation) return;
                if (!response.ok || !isValidData(data)) throw new Error(data?.error ?? 'Unable to refresh the workspace.');
                onData(data);
            } catch (error) {
                if (current === generation) throw error;
            } finally {
                clearTimeout(timeout);
                if (current === generation) { pending = undefined; onLoading(false, background); }
            }
        },
    };
}

export function startWorkspaceUpdates({ refresh, visible = () => true, report = (message) => {}, schedule = setTimeout, cancel = clearTimeout }) {
    let stopped = false, running = false, timer, failures = 0;
    async function run() {
        if (stopped || running) return;
        cancel(timer);
        if (!visible()) { timer = schedule(run, 30000); return; }
        running = true;
        try { await refresh(); failures = 0; if (!stopped) report(''); }
        catch { failures++; if (!stopped) report('Updates paused. Reconnecting automatically…'); }
        finally {
            running = false;
            if (!stopped) timer = schedule(run, Math.min(30000, 5000 * 2 ** Math.min(failures, 3)));
        }
    }
    timer = schedule(run, 0);
    return { retry: run, stop() { stopped = true; cancel(timer); } };
}
