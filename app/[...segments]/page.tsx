import {headers} from 'next/headers';
import {notFound,redirect} from 'next/navigation';
import {session} from '@/lib/auth';
import {routeIdentity} from '@/lib/workspace-route-server';
import {VIEW_PATHS,taskSegment,safeReturnPath} from '@/lib/workspace-routes.mjs';
export const dynamic='force-dynamic';
export default async function WorkspacePage({params,searchParams}:{params:Promise<{segments:string[]}>,searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const {segments}=await params, query=await searchParams;
 const account=typeof query.account==='string'?query.account:'';
 const path='/'+segments.map((s,i)=>i===2?taskSegment(s.startsWith('~')?s.slice(1):s):encodeURIComponent(s)).join('/');
 const suffix=account?'?'+new URLSearchParams({account}):'';
 const user=await session(new Request('http://workhub.internal',{headers:await headers()}),false);
 if(!user)redirect('/login?'+new URLSearchParams({returnTo:safeReturnPath(path+suffix)}));
 if(segments.length===1&&Object.values(VIEW_PATHS).includes(path)) {
  if(user.role!=='ADMIN'&&['/team','/profit'].includes(path))notFound();
  return null;
 }
 if(segments.length>3)notFound();
 const task=segments[2]?.startsWith('~')?segments[2].slice(1):segments[2];
 const resolved=await routeIdentity(user,{project:segments[0],employee:segments[1],task,account});
 if(!resolved)notFound();
 if(resolved.project.slug!==segments[0])redirect('/'+[resolved.project.slug,...segments.slice(1).map((s,i)=>i===1?taskSegment(task!):encodeURIComponent(s))].join('/')+suffix);
 return null;
}
