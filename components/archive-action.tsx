'use client';
import {useState,useCallback} from 'react';
import {Trash2,Archive,RotateCcw,Download,Check} from 'lucide-react';
import ActionDialog from './action-dialog';
export default function ArchiveAction({action,ids,disabled,onReload,onNotice}:{action:'archive'|'restore'|'empty';ids:string[];disabled?:boolean;onReload:()=>Promise<void>;onNotice:(s:string)=>void}) {
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[receipt,setReceipt]=useState(''),[saved,setSaved]=useState(false),[confirmation,setConfirmation]=useState(''),[step,setStep]=useState(1);
 const close=useCallback(()=>setOpen(false),[]);
 const empty=action==='empty';
 async function exportPdf(){
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/admin/project-archive/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});
   if(!response.ok)throw new Error((await response.json()).error||'PDF export failed.');
   const blob=await response.blob(),token=response.headers.get('X-Archive-Receipt');
   if(!token||!blob.size)throw new Error('PDF export was incomplete. Try again.');
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='workhub-archive-backup.pdf';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
   setReceipt(token);setSaved(false);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function apply(){
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/admin/project-archive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,ids,confirmation:empty?confirmation:undefined,receipt:empty?receipt:undefined})});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to update archive.');
   onNotice(result.message);setOpen(false);await onReload();
  }catch(e){setError((e as Error).message);if(empty){setReceipt('');setSaved(false);setStep(1);}}finally{setBusy(false);}
 }
 return <><button type="button" className={empty?'button danger-button':'button row-action'} disabled={disabled||!ids.length} onClick={()=>{setOpen(true);setError('');setReceipt('');setSaved(false);setConfirmation('');setStep(1);}}>{empty?<Trash2 size={15}/>:action==='archive'?<Archive size={15}/>:<RotateCcw size={15}/>} {empty?'Empty archive':action==='archive'?'Archive project':'Restore project'}</button>{open&&<ActionDialog title={empty?(step===1?'Export before permanent deletion':'Permanently delete archive?'):action==='archive'?'Archive project?':'Restore project?'} busy={busy} onClose={close} footer={<><button type="button" className="button" disabled={busy} onClick={close}>Cancel</button>{empty&&step===1?<button type="button" className="button primary" disabled={busy||!receipt||!saved} onClick={()=>setStep(2)}>Continue to confirmation</button>:<button type="button" className={'button '+(empty?'danger-button':'primary')} disabled={busy||(empty&&(!receipt||!saved||confirmation!=='EMPTY ARCHIVE'))} onClick={apply}>{busy?'Saving…':empty?'Delete permanently':action==='archive'?'Archive project':'Restore project'}</button>}</>}>
 {empty?<><p>{ids.length} archived project(s) and their tasks, hours, accounts and assignments will be permanently removed, including paid work and locked timesheet entries.</p><p>Payment invoices remain as historical records. Affected submitted or approved timesheets return for review of the remaining hours.</p>{step===1?<div className="export-required"><b>1. Save your PDF backup</b><p>Export the current records first. The export expires after 15 minutes; changed records require a new export.</p><button type="button" className="button primary" disabled={busy} onClick={exportPdf}>{receipt?<Check size={16}/>:<Download size={16}/>} {busy?'Preparing PDF…':receipt?'Download PDF again':'Export PDF backup'}</button>{receipt&&<label className="confirmation-check"><input type="checkbox" checked={saved} onChange={e=>setSaved(e.target.checked)}/>I saved and checked the PDF backup.</label>}</div>:<label className="field">2. Type EMPTY ARCHIVE to confirm<input autoComplete="off" spellCheck={false} value={confirmation} onChange={e=>setConfirmation(e.target.value)} placeholder="EMPTY ARCHIVE"/><small>This action cannot be undone.</small></label>}</>:<p>{action==='archive'?'New work will be disabled. All existing records are preserved, and you can restore the project later.':'The project will be active again and available for assigned employees.'}</p>}
 {error&&<div className="error-inline" role="alert">{error}</div>}
 </ActionDialog>}</>;
}
