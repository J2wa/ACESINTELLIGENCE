'use client';
import { useRef, useState, type ClipboardEvent, type FormEvent } from 'react';
import { Upload, Plus, Trash2, X, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { STATUSES } from '@/lib/core.mjs';
import { BULK_LIMIT, BULK_COLUMNS, blankBulkRow, hasBulkContent, parseTaskClipboard, validateBulkRows } from '@/lib/bulk-tasks.mjs';

type Option = { id: string; name: string; pay_basis?: string };
type Account = Option & { project_id: string };
type TaskRow = ReturnType<typeof blankBulkRow>;
type Column = typeof BULK_COLUMNS[number];
type Errors = Record<number, Record<string, string>>;
const columnLabels: Record<string, string> = {date: 'Date · Manila', video_id: 'Task ID', duration: 'Video duration', minutes: 'Working minutes', status: 'Task status', notes: 'Notes'};

export default function BulkTaskEntry({ projects, accounts, isAdmin, annotator, userId, employees, onClose, onSaved }: {
    projects: Option[]; accounts: Account[]; isAdmin: boolean; annotator: string; userId: string; employees: Option[];
    onClose: () => void; onSaved: (message: string) => void;
}) {
    const nextKey = useRef(5);
    const submitting = useRef(false);
    const [rows, setRows] = useState<TaskRow[]>(() => Array.from({ length: 5 }, (_, index) => blankBulkRow(index)));
    const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
    const [ownerId, setOwnerId] = useState(userId);
    const basis = projects.find(project => project.id === projectId)?.pay_basis ?? 'WORKING_HOUR';
    const columns = BULK_COLUMNS.filter(column => basis === 'VIDEO_HOUR' || (column !== 'duration' && (basis !== 'TASK' || column !== 'minutes') && (basis !== 'WORKING_HOUR' || column !== 'notes')));
    const labels = columns.map(column => columnLabels[column]);
    const [accountId, setAccountId] = useState('');
    const [errors, setErrors] = useState<Errors>({});
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const choices = accounts.filter(account => account.project_id === projectId);
    const entered = rows.filter(hasBulkContent);
    const statuses = isAdmin ? STATUSES : ['PENDING', 'SKIPPED (NO CHANGES)'];
    function update(index: number, column: Column, value: string) {
        setRows(previous => previous.map((row, rowIndex) => rowIndex === index ? { ...row, [column]: value } : row));
        setErrors({}); setError('');
    }
    function addRows(count: number) {
        const added = Array.from({ length: Math.min(count, BULK_LIMIT - rows.length) }, () => blankBulkRow(nextKey.current++));
        setRows(previous => [...previous, ...added]);
    }
    function paste(event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>, startRow: number, startColumn: number) {
        const text = event.clipboardData.getData('text/plain');
        if (!/[\t\r\n]/.test(text) || (columns[startColumn] === 'notes' && !text.includes('\t'))) return;
        event.preventDefault();
        try {
            const cells = parseTaskClipboard(text);
            if (cells.length + startRow > BULK_LIMIT || cells.some(row => row.length + startColumn > columns.length)) throw new Error('The pasted selection exceeds the table. Use up to 100 rows and the displayed columns.');
            const updated = rows.map(row => ({ ...row }));
            while (updated.length < startRow + cells.length) updated.push(blankBulkRow(nextKey.current++));
            cells.forEach((row, offset) => row.forEach((value, column) => {
                const key = columns[startColumn + column];
                updated[startRow + offset] = { ...updated[startRow + offset], [key]: key === 'status' ? value.trim().toUpperCase() : value };
            }));
            setRows(updated); setErrors({}); setError('');
        } catch (failure) { setError((failure as Error).message); }
    }
    async function submit(event: FormEvent) {
        event.preventDefault();
        if (submitting.current) return;
        const issues = validateBulkRows(rows, isAdmin, basis) as Errors;
        setErrors(issues); setError('');
        if (!projectId || !accountId) { setError('Choose a project and work account for this upload.'); return; }
        if (!entered.length) { setError('Enter at least one task.'); return; }
        if (Object.keys(issues).length) { setError('Correct the highlighted rows before uploading.'); return; }
        submitting.current = true; setBusy(true);
        try {
            const response = await fetch('/api/tasks/bulk', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tasks: entered.map(({ key: _key, ...row }) => ({ ...row, user_id: ownerId, project_id: projectId, account_id: accountId, duration: basis === 'VIDEO_HOUR' ? row.duration : '0:00:00', minutes: basis === 'TASK' || row.minutes === '' ? 0 : Number(row.minutes), notes: basis === 'WORKING_HOUR' ? '' : row.notes })) }),
            });
            const result = await response.json();
            if (!response.ok) {
                // Translate the server's filled-row number back to the visible table row.
                const message = String(result.error ?? 'Unable to upload tasks.');
                setError(message.replace(/Row (\d+):/g, (match, number) => {
                    const row = entered[Number(number) - 1];
                    return row ? `Row ${rows.findIndex(candidate => candidate.key === row.key) + 1}:` : match;
                }));
                return;
            }
            onSaved(result.message + (result.warning ? ' ' + result.warning : ''));
        } catch { setError('Could not confirm the upload. Check your connection and refresh the task list before retrying.'); }
        finally { submitting.current = false; setBusy(false); }
    }
    return <div className="modal-backdrop"><section className="modal bulk-task-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-task-title" aria-describedby="bulk-task-help" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); } }}>
        <div className="modal-heading"><div><span className="eyebrow">ACES INTELLIGENCE WORKHUB</span><h2 id="bulk-task-title">Mass upload tasks</h2></div><button className="icon-button" disabled={busy} aria-label="Close bulk task entry" onClick={onClose}><X size={21}/></button></div>
        <form onSubmit={submit} noValidate><div className="modal-body">
            <p id="bulk-task-help">Enter up to 100 tasks or paste cells from Excel / Google Sheets, without a header row. Unused rows are ignored.</p>
            <div className="bulk-task-defaults"><label className="field">Project *<select autoFocus value={projectId} disabled={busy} onChange={event => { setProjectId(event.target.value); setAccountId(''); setError(''); setErrors({}); setRows(previous => previous.map(row => ({...row, duration: '', minutes: '', notes: ''}))); }}><option value="">Select project</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="field">Work account *<select value={accountId} disabled={busy} onChange={event => { setAccountId(event.target.value); setError(''); }}><option value="">Select work account</option>{choices.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><div className="bulk-task-owner"><span>Annotator</span>{isAdmin ? <select aria-label="Annotator" value={ownerId} disabled={busy} onChange={event => setOwnerId(event.target.value)}>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select> : <strong>{annotator}</strong>}<small>Project and work account apply to every row.</small></div></div>
            {!choices.length && <div className="notice"><AlertCircle size={16}/>No active work accounts are available for this project. Ask your coordinator to assign one.</div>}
            <div className="bulk-task-hint"><FileSpreadsheet size={17}/><span>Paste in this order: {labels.join(', ')}. IDs keep their leading zeroes.</span></div>
            {error && <div className="error-inline" role="alert"><AlertCircle size={16}/>{error}</div>}
            <fieldset disabled={busy} className="bulk-task-fields"><legend className="sr-only">Task details</legend><div className="table-scroll bulk-task-scroll"><table className="bulk-task-table"><thead><tr><th scope="col">#</th>{labels.map((label, index) => <th scope="col" key={label}>{label}{['date','video_id','duration','status'].includes(columns[index]) || (columns[index] === 'minutes' && basis === 'WORKING_HOUR') ? ' *' : ''}{columns[index] === 'duration' && <small className="cell-sub">h:mm:ss</small>}</th>)}<th scope="col"><span className="sr-only">Remove</span></th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.key}><th scope="row">{index + 1}</th>{columns.map((column, columnIndex) => {
                const issue = errors[index]?.[column], label = `Row ${index + 1} ${labels[columnIndex]}`, errorId = `bulk-error-${row.key}-${column}`;
                return <td key={column}><div className="bulk-task-cell">{column === 'status' ? <select aria-label={label} aria-invalid={!!issue} aria-describedby={issue ? errorId : undefined} value={row.status} onChange={event => update(index, column, event.target.value)} onPaste={event => paste(event, index, columnIndex)}>{!statuses.includes(row.status) && <option value={row.status}>{row.status || 'Select status'}</option>}{statuses.map(status => <option key={status} value={status}>{status}</option>)}</select> : column === 'notes' ? <textarea aria-label={label} aria-invalid={!!issue} aria-describedby={issue ? errorId : undefined} rows={1} maxLength={5000} value={row.notes} onChange={event => update(index, column, event.target.value)} onPaste={event => paste(event, index, columnIndex)}/> : <input aria-label={label} aria-invalid={!!issue} aria-describedby={issue ? errorId : undefined} type={column === 'date' ? 'date' : column === 'minutes' ? 'number' : 'text'} min={column === 'minutes' ? 0 : undefined} max={column === 'minutes' ? 1440 : undefined} step={column === 'minutes' ? 1 : undefined} maxLength={column === 'video_id' ? 250 : undefined} placeholder={column === 'video_id' ? '0005724' : column === 'duration' ? '0:04:32' : column === 'minutes' ? '0' : undefined} value={String(row[column as keyof TaskRow])} autoComplete="off" onChange={event => update(index, column, event.target.value)} onPaste={event => paste(event, index, columnIndex)}/>}{issue && <small id={errorId} className="bulk-task-error">{issue}</small>}</div></td>;
            })}<td><button type="button" className="icon-button" aria-label={`Remove row ${index + 1}`} disabled={rows.length === 1} onClick={() => { setRows(previous => previous.filter(candidate => candidate.key !== row.key)); setErrors({}); setError(''); }}><Trash2 size={16}/></button></td></tr>)}</tbody></table></div>
            <div className="bulk-task-toolbar"><button type="button" className="button" disabled={rows.length >= BULK_LIMIT} onClick={() => addRows(1)}><Plus size={15}/>Add row</button><button type="button" className="text-button" disabled={rows.length >= BULK_LIMIT} onClick={() => addRows(5)}>Add 5 rows</button><span>{entered.length} tasks entered · {rows.length}/{BULK_LIMIT} rows</span></div></fieldset>
            <small>{basis === 'VIDEO_HOUR' ? 'Video duration and optional working minutes are separate. ' : basis === 'WORKING_HOUR' ? 'Enter working minutes for each task. ' : 'Only task details and optional notes are needed. '}All rows must pass validation before any task is saved.</small>
        </div><div className="modal-footer"><button type="button" className="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="button primary" disabled={busy || !entered.length || !projectId || !accountId}><Upload size={16}/>{busy ? 'Uploading…' : `Upload ${entered.length || ''} task${entered.length === 1 ? '' : 's'}`}</button></div></form>
    </section></div>;
}
