import { payrollRows, day } from './core.mjs';

const matches = (item, filters) => (!filters.employee || item.user_id === filters.employee) && (!filters.project || item.project_id === filters.project) && (!filters.account || item.account_id === filters.account) && (!filters.status || item.status === filters.status);
export function payableWork(data, filters = {}) {
    const grouped = new Map();
    for (const line of payrollRows(data)) {
        const key = line.task_id ? 'task:' + line.task_id : 'time:' + line.time_entry_id;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(line);
    }
    const items = [];
    for (const [key, lines] of grouped) {
        const first = lines[0], task = data.tasks.find(task => task.id === first.task_id), time = data.times.find(time => time.id === first.time_entry_id);
        const source = task ?? time;
        if (!source || source.paid_invoice_id || !matches(source, filters) || lines.some(line => line.status !== 'APPROVED') || lines.reduce((sum, line) => sum + line.cents, 0) <= 0) continue;
        if (task && data.times.some(time => time.task_id === task.id && time.end_ms === null)) continue;
        const dates = task ? [task.date] : lines.map(line => line.date);
        if (dates.some(date => (filters.from && date < filters.from) || (filters.to && date > filters.to))) continue;
        const person = data.users.find(user => user.id === source.user_id);
        items.push({ key, user_id: source.user_id, employee_name: person?.name ?? 'Employee', employee_email: person?.email ?? '', task_id: task?.id ?? null, time_entry_id: task ? null : time.id,
            version: task?.version ?? null, signature: task?.hours_signature ?? JSON.stringify([time.id,time.start_ms,time.end_ms,time.rate_cents,time.pay_basis]),
            lines: lines.map(line => ({ ...line, task_label: task?.video_id ?? 'Project time', task_status: task?.status ?? 'APPROVED', project_name: data.projects.find(project => project.id === line.project_id)?.name ?? '', account_id: task?.account_id ?? null, account_name: data.accounts.find(account => account.id === task?.account_id)?.name ?? '' })).sort((a,b) => (a.date + (a.time_entry_id ?? '')).localeCompare(b.date + (b.time_entry_id ?? ''))) });
    }
    items.sort((a,b) => a.key.localeCompare(b.key));
    const people = [];
    for (const item of items) {
        let person = people.find(person => person.user_id === item.user_id);
        if (!person) { person = { user_id:item.user_id, name:item.employee_name, email:item.employee_email, total_cents:0, task_count:0, time_count:0 }; people.push(person); }
        person.total_cents += item.lines.reduce((sum,line) => sum + line.cents, 0);
        if (item.task_id) person.task_count++; else person.time_count++;
    }
    return { items, people, total_cents: people.reduce((sum,person) => sum + person.total_cents, 0), task_count:items.filter(item=>item.task_id).length, time_count:items.filter(item=>!item.task_id).length };
}
export function earningsTotals(data, month = day().slice(0,7), employee = '') {
    const outstanding = payrollRows(data).filter(line => !line.paid_invoice_id && (!employee || line.user_id === employee));
    const paid = (data.invoice_items ?? []).filter(line => !employee || line.user_id === employee);
    const approved = outstanding.reduce((sum,line) => sum + line.approved_cents,0);
    const totalPaid = paid.reduce((sum,line)=>sum+line.amount_cents,0);
    return { lifetime_cents: totalPaid+approved, monthly_cents:paid.filter(line=>line.work_date.startsWith(month)).reduce((sum,line)=>sum+line.amount_cents,0)+outstanding.filter(line=>line.date.startsWith(month)).reduce((sum,line)=>sum+line.approved_cents,0), paid_cents:totalPaid, unpaid_cents:approved };
}
