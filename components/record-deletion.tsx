'use client';
import { useState } from 'react';
import { Trash2, RotateCcw } from 'lucide-react';
export default function RecordDeletion({ entity, id, label, deleted, onReload, onNotice }: {
    entity:'projects'|'users'|'invoices'; id:string; label:string; deleted:boolean;
    onReload:()=>Promise<void>; onNotice:(message:string)=>void;
}) {
    const [busy,setBusy] = useState(false), [error,setError] = useState('');
    async function change() {
        const explanation = entity === 'invoices' ? 'The payment stays recorded. Paid totals and locked work will not change.' : entity === 'users' ? 'This employee will lose access. Their work and payment history will remain.' : 'This project will be hidden and closed to new work. Existing logs and payments will remain.';
        if (!window.confirm(deleted ? `Restore ${label}?` : `Delete ${label}?\n\n${explanation}\nYou can restore it using Show deleted.`)) return;
        setBusy(true); setError('');
        try {
            const response = await fetch('/api/admin/deletion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entity,id,action:deleted?'restore':'delete'})});
            const result = await response.json();
            if (!response.ok) throw new Error(result.error ?? 'Unable to change this record.');
            onNotice(result.message);
            try { await onReload(); } catch { setError('Saved. Refresh Workhub to see the updated list.'); }
        } catch (failure) { setError((failure as Error).message); }
        finally { setBusy(false); }
    }
    return <span><button type="button" className="text-button" disabled={busy} onClick={change} aria-label={`${deleted?'Restore':'Delete'} ${label}`}>{deleted?<RotateCcw size={14}/>:<Trash2 size={14}/>} {busy?'Saving…':deleted?'Restore':'Delete'}</button>{error&&<span className="error-inline" role="alert">{error}</span>}</span>;
}
