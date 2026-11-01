'use client';
import { useState, useCallback } from 'react';
import ActionDialog from './action-dialog';
import { Trash2, RotateCcw } from 'lucide-react';
export default function RecordDeletion({ entity, id, label, deleted, onReload, onNotice }: {
    entity:'projects'|'users'|'invoices'; id:string; label:string; deleted:boolean;
    onReload:()=>Promise<void>; onNotice:(message:string)=>void;
}) {
    const [busy,setBusy] = useState(false), [error,setError] = useState('');
    const [open,setOpen] = useState(false);
    const close = useCallback(()=>setOpen(false),[]);
    const explanation = entity === 'invoices' ? 'The payment stays recorded. Paid totals and locked work will not change.' : entity === 'users' ? 'This employee will lose access. Their work and payment history will remain.' : 'This project will be hidden and closed to new work. Existing logs and payments will remain.';
    async function change() {
        setBusy(true); setError('');
        try {
            const response = await fetch('/api/admin/deletion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entity,id,action:deleted?'restore':'delete'})});
            const result = await response.json();
            if (!response.ok) throw new Error(result.error ?? 'Unable to change this record.');
            onNotice(result.message); setOpen(false);
            try { await onReload(); } catch { setError('Saved. Refresh Workhub to see the updated list.'); }
        } catch (failure) { setError((failure as Error).message); }
        finally { setBusy(false); }
    }
    return <span className="record-action"><button type="button" className={'button row-action '+(deleted?'':'danger-button')} disabled={busy} onClick={()=>{setError('');setOpen(true);}} aria-label={`${deleted?'Restore':'Delete'} ${label}`}>{deleted?<RotateCcw size={14}/>:<Trash2 size={14}/>} {deleted?'Restore':'Delete'}</button>{open&&<ActionDialog title={deleted?'Restore record?':'Delete record?'} onClose={close} busy={busy} footer={<><button className="button" disabled={busy} onClick={close}>Cancel</button><button className={'button '+(deleted?'primary':'danger-button')} disabled={busy} onClick={change}>{busy?'Saving…':deleted?'Restore':'Delete'}</button></>}><p className="delete-record-name">{label}</p><p>{deleted?'This record will be restored.':explanation}</p>{!deleted&&<p className="muted">You can restore it using Show deleted.</p>}{error&&<div className="error-inline" role="alert">{error}</div>}</ActionDialog>}</span>;
}
