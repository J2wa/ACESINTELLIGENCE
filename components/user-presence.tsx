'use client';
import {useEffect,useState} from 'react';
type Member={id:string;name:string;email:string;role:string;active:number;online:number;last_active_at:number|null};
export function PresenceHeartbeat({userId}:{userId?:string}){
 useEffect(()=>{
  if(!userId)return;
  let pending=true,stopped=false,running=false;
  const mark=()=>{if(document.visibilityState==='visible')pending=true;};
  const controller=new AbortController();
  async function send(){
   if(stopped||running||!pending||document.visibilityState!=='visible')return;
   pending=false;running=true;
   try{const r=await fetch('/api/presence',{method:'POST',signal:controller.signal});if(r.status===401)stopped=true;else if(!r.ok)pending=true;}catch{pending=true;}finally{running=false;}
  }
  const events=['pointerdown','keydown','scroll','touchstart'];
  events.forEach(e=>window.addEventListener(e,mark,{passive:true}));
  document.addEventListener('visibilitychange',mark);window.addEventListener('focus',mark);
  void send();const timer=setInterval(()=>void send(),30000);
  return()=>{stopped=true;controller.abort();clearInterval(timer);events.forEach(e=>window.removeEventListener(e,mark));document.removeEventListener('visibilitychange',mark);window.removeEventListener('focus',mark);};
 },[userId]);
 return null;
}
const date=new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'});
export default function UserPresence(){
 const [data,setData]=useState<{users:Member[];checked_at:number}|null>(null),[error,setError]=useState(''),[filter,setFilter]=useState('all');
 useEffect(()=>{
  let stopped=false,running=false;const controller=new AbortController();
  async function refresh(){
   if(stopped||running||document.visibilityState!=='visible')return;
   running=true;
   try{const r=await fetch('/api/admin/presence',{cache:'no-store',signal:controller.signal});if(!r.ok)throw new Error();const j=await r.json();if(!stopped){setData(j);setError('');}}
   catch{if(!stopped)setError('Status updates unavailable. Retrying automatically; displayed statuses may be out of date.');}finally{running=false;}
  }
  void refresh();const timer=setInterval(()=>void refresh(),30000);const visible=()=>void refresh();document.addEventListener('visibilitychange',visible);
  return()=>{stopped=true;controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[]);
 const online=data?.users.filter(u=>u.online).length??0;
 return <section className="card presence-panel" aria-labelledby="presence-title"><div className="card-title"><div><h2 id="presence-title">Team activity</h2><p>Online means activity within the last 2 minutes. Refreshes every 30 seconds.</p></div><label>Show users <select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All users</option><option value="online">Online</option><option value="offline">Offline</option></select></label></div>{error&&<p className="error-inline" role="status">{error}</p>}{data?<><div className="presence-summary"><b>{online} online</b><b>{data.users.length-online} offline</b><small>Checked {date.format(data.checked_at)} · Manila</small></div><div className="table-scroll"><table><thead><tr><th>Team member</th><th>Activity status</th><th>Last online · Manila</th></tr></thead><tbody>{data.users.filter(u=>filter==='all'||(filter==='online'?u.online:!u.online)).map(u=><tr key={u.id}><td><b>{u.name}</b><small className="cell-sub">{u.email}{!u.active?' · Account disabled':''}</small></td><td><span className={'presence-status '+(u.online?'is-online':'is-offline')}><span aria-hidden="true"/>{u.online?'Online':'Offline'}</span></td><td>{u.last_active_at?<time dateTime={new Date(u.last_active_at).toISOString()}>{date.format(u.last_active_at)}</time>:'No activity recorded yet'}</td></tr>)}</tbody></table></div></>:<p role="status">Loading user activity…</p>}<p className="presence-note">Activity tracking starts with this update. Idle or closed browsers become offline after 2 minutes. This is not a record of hours worked.</p></section>;
}
