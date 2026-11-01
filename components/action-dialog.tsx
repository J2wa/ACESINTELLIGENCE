'use client';
import {useEffect,useRef,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
export default function ActionDialog({title,onClose,busy,children,footer}:{title:string;onClose:()=>void;busy?:boolean;children:ReactNode;footer:ReactNode}) {
 const ref=useRef<HTMLElement>(null);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  ref.current?.focus();
  const keyboard=(e:KeyboardEvent)=>{
   if(e.key==='Escape'&&!busy){e.preventDefault();onClose();}
   if(e.key==='Tab'){
    const items=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]')??[]);
    const first=items[0],last=items.at(-1);
    if(e.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===ref.current)){e.preventDefault();first?.focus();}
   }
  };
  document.addEventListener('keydown',keyboard);
  return()=>{document.removeEventListener('keydown',keyboard);document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
 },[busy,onClose]);
 return createPortal(<div className="modal-backdrop action-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><section ref={ref} tabIndex={-1} className="modal action-dialog" role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><h2>{title}</h2><button type="button" className="icon-button" disabled={busy} onClick={onClose} aria-label="Close dialog"><X size={20}/></button></div><div className="modal-body">{children}</div><div className="modal-footer">{footer}</div></section></div>,document.body);
}
