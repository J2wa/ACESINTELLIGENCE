import {session} from './auth';
import {routeIdentity} from './workspace-route-server';
import {parseRoute,VIEW_PATHS,safeReturnPath,taskSegment} from './workspace-routes.mjs';
const privateHeaders={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'};
export const missingPage=()=>new Response('<!doctype html><html lang="en"><head><meta name="robots" content="noindex,nofollow"><title>Workhub</title></head><body><main><h1>404</h1><p>This page could not be found.</p></main></body></html>',{status:404,headers:{...privateHeaders,'Content-Type':'text/html; charset=utf-8'}});
// Before React streaming begins, give denied and nonexistent URLs the same HTTP 404.
export async function workspacePageAccess(req:Request):Promise<Response|null> {
 const url=new URL(req.url),user=await session(req,false);
 if(!user)return new Response(null,{status:307,headers:{...privateHeaders,Location:'/login?'+new URLSearchParams({returnTo:safeReturnPath(url.pathname+url.search)})}});
 const view=Object.entries(VIEW_PATHS).find(([,path])=>path===url.pathname)?.[0];
 if(view)return user.role!=='ADMIN'&&['Team','Company profit'].includes(view)?missingPage():null;
 const route=parseRoute(url.pathname,url.searchParams.get('account')??'');
 const resolved=await routeIdentity(user,route);
 if(!resolved)return missingPage();
 if(resolved.project.slug!==route!.project){
  const path='/'+resolved.project.slug+(route!.employee?'/'+encodeURIComponent(route!.employee):'')+(route!.task!==undefined?'/'+taskSegment(route!.task):'');
  return new Response(null,{status:307,headers:{...privateHeaders,Location:path+url.search}});
 }
 return null;
}
