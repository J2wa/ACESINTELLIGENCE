import {day, midnight} from './core.mjs';
// Presentation hint only; every mutation revalidates under a write transaction.
export function taskMutationReason(task, user, times, sheets, deleting = true, now = Date.now()) {
    if (user.role !== 'ADMIN' && task.user_id !== user.id) return 'You can only change your own tasks.';
    if (task.paid_invoice_id || task.invoice_locked) return 'This task is included in an invoice.';
    if ((deleting || user.role !== 'ADMIN') && task.status === 'APPROVED') return 'This task is already approved.';
    if (deleting && task.date.slice(0,7) !== day(now).slice(0,7)) return 'This task is outside the current Manila month.';
    if (task.review_approved || task.hours_status === 'APPROVED') return 'This task has approved working hours.';
    const linked = times.filter(t=>t.task_id===task.id);
    if (linked.some(t=>t.paid_invoice_id)) return 'Linked working time is included in an invoice.';
    if (linked.some(t=>t.end_ms===null)) return 'Stop linked timers before changing this task.';
    if (sheets.some(s=>s.user_id===task.user_id && ['SUBMITTED','APPROVED'].includes(s.status) && ((s.start_ms < midnight(task.date)+1 && s.end_ms > midnight(task.date)) || linked.some(t=>s.start_ms<t.end_ms && s.end_ms>t.start_ms)))) return 'This week is locked. Ask your coordinator to return the timesheet.';
    if (deleting && task.removal_pending) return 'Previous spreadsheet removal is still queued. Retry after sync finishes.';
    return '';
}
