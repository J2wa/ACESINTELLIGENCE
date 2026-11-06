'use client';
import {useEffect,useRef} from 'react';
export default function TaskDeleteDialog({tasks,busy,error,onCancel,onConfirm}:{tasks:{id:string;video_id:string}[];busy:boolean;error:string;onCancel:()=>void;onConfirm:()=>void}) {
    const dialog = useRef<HTMLDialogElement>(null);
    useEffect(()=>{dialog.current?.showModal();},[]);
    return <dialog ref={dialog} className="modal task-delete-dialog" aria-labelledby="delete-title" onCancel={e=>{e.preventDefault();if(!busy)onCancel();}}>
        <div className="modal-heading"><h2 id="delete-title">Delete {tasks.length} task{tasks.length===1?'':'s'}?</h2></div>
        <div className="modal-body"><p>Associated unpaid working-time records will also be removed. This cannot be undone.</p>
        <ul>{tasks.map(t=><li key={t.id}>{t.video_id}</li>)}</ul>
        <p>If any selected task is no longer eligible, none will be deleted.</p>
        {error && <p role="alert" className="notice">{error}</p>}
        </div><div className="modal-footer"><button className="button" autoFocus disabled={busy} onClick={onCancel}>Cancel</button><button className="button danger-button" disabled={busy} onClick={onConfirm}>{busy?'Deleting…':`Delete ${tasks.length} task${tasks.length===1?'':'s'}`}</button></div>
    </dialog>;
}
