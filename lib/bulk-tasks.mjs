import { day, midnight, parseDuration, STATUSES } from './core.mjs';
export const BULK_LIMIT = 100;
export const BULK_COLUMNS = ['date', 'video_id', 'duration', 'minutes', 'status', 'notes'];
export function blankBulkRow(key) {
    return { key, date: day(), video_id: '', duration: '', minutes: '', status: 'PENDING', notes: '' };
}
export function hasBulkContent(row) {
    return Boolean(row.video_id.trim() || row.duration.trim() || String(row.minutes).trim() || row.notes.trim());
}
// Excel/Sheets clipboard data uses tabs and quoted cells, including multiline notes.
export function parseTaskClipboard(text) {
    if (text.length > 1000000) throw new Error('Paste a smaller selection (up to 100 rows).');
    const rows = [], row = [];
    let cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const character = text[i];
        if (character === '"') {
            if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
            else if (quoted || !cell) quoted = !quoted;
            else cell += character;
        } else if (!quoted && (character === '\t' || character === '\n' || character === '\r')) {
            row.push(cell); cell = '';
            if (character !== '\t') {
                rows.push([...row]); row.length = 0;
                if (character === '\r' && text[i + 1] === '\n') i++;
            }
        } else cell += character;
    }
    if (quoted) throw new Error('The pasted selection has an unclosed quoted cell.');
    row.push(cell);
    if (row.some(value => value !== '')) rows.push([...row]);
    if (rows.length > BULK_LIMIT) throw new Error('Paste up to 100 rows at a time.');
    return rows;
}
export function validateBulkRows(rows, isAdmin) {
    const errors = {}, seen = new Set();
    rows.forEach((row, index) => {
        if (!hasBulkContent(row)) return;
        const issues = {};
        try { midnight(row.date); } catch { issues.date = 'Use a valid date (YYYY-MM-DD).'; }
        if (!row.video_id.trim()) issues.video_id = 'Task ID is required.';
        else if (row.video_id.length > 250) issues.video_id = 'Task ID must be at most 250 characters.';
        else if (seen.has(row.video_id)) issues.video_id = 'This task ID is repeated in the table.';
        seen.add(row.video_id);
        try { parseDuration(row.duration); } catch { issues.duration = 'Use h:mm:ss, for example 0:04:32.'; }
        const minutes = row.minutes === '' ? 0 : Number(row.minutes);
        if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) issues.minutes = 'Use whole minutes from 0 to 1440.';
        if (!(isAdmin ? STATUSES : ['PENDING', 'SKIPPED (NO CHANGES)']).includes(row.status)) issues.status = 'Select an allowed task status.';
        if (row.notes.length > 5000) issues.notes = 'Notes must be at most 5,000 characters.';
        if (Object.keys(issues).length) errors[index] = issues;
    });
    return errors;
}
