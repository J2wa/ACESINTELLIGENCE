// One request at a time. Small, paced batches respect Sheets quotas.
export function startContinuousSync({ request, report, schedule = setTimeout, cancel = clearTimeout }) {
    let stopped = false, running = false, timer, failures = 0;
    async function run() {
        if (stopped || running) return;
        running = true;
        let delay = 30000;
        try {
            const result = await request();
            if (stopped) return;
            report(result);
            if (result.unauthorized) { stopped = true; return; }
            failures = result.pending && !result.synced ? failures + 1 : 0;
            delay = failures ? Math.min(300000, 30000 * 2 ** Math.min(failures - 1, 4)) : result.pending ? 10000 : 30000;
        } catch {
            if (stopped) return;
            failures++;
            delay = Math.min(300000, 30000 * 2 ** Math.min(failures - 1, 4));
            report({ pending: true, message: 'Connection interrupted. Sync will retry automatically.' });
        } finally {
            running = false;
            if (!stopped) timer = schedule(run, delay);
        }
    }
    timer = schedule(run, 0);
    return {
        retry() { if (!stopped && !running) { cancel(timer); failures = 0; void run(); } },
        stop() { stopped = true; cancel(timer); },
    };
}
