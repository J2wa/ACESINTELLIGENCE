import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceRefresh, startWorkspaceUpdates } from '../lib/workspace-updates.mjs';
const response = (status, data) => ({status, ok:status===200, json:async()=>data});
test('slow task pages survive repeated workspace polls and query changes discard stale rows', async () => {
 const requests=[], received=[], loading=[];
 let url='/api/tasks?page=0';
 const loader=createWorkspaceRefresh({getUrl:()=>url,fetcher:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve})),isValidData:data=>Array.isArray(data?.tasks),onData:data=>received.push(data),onLoading:(active,background)=>loading.push({active,background}),onExpired:()=>assert.fail('unexpected expiry')});
 const first=loader.refresh();
 for(let i=0;i<5;i++)await loader.refresh(true);
 assert.equal(requests.length,1);assert.equal(requests[0].options.signal.aborted,false);
 requests[0].resolve(response(200,{tasks:[{id:'first'}],total:1}));await first;
 assert.equal(received[0].tasks[0].id,'first');
 const poll=loader.refresh(true);url='/api/tasks?search=new';
 const search=loader.refresh();assert(requests[1].options.signal.aborted);
 requests[2].resolve(response(200,{tasks:[{id:'new'}],total:1}));await search;
 requests[1].resolve(response(200,{tasks:[{id:'stale'}],total:1}));await poll;
 assert.deepEqual(received.map(r=>r.tasks[0].id),['first','new']);
 assert(loading.some(x=>x.background));assert.equal(loading.at(-1).active,false);
});
test('new foreground snapshots supersede stale polls and background reads never overlap', async () => {
 const requests=[], received=[];
 const loader=createWorkspaceRefresh({fetcher:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve})),onData:data=>received.push(data),onExpired:()=>assert.fail('unexpected expiry')});
 const old=loader.refresh(true);await loader.refresh(true);assert.equal(requests.length,1);
 const fresh=loader.refresh();assert.equal(requests.length,2);assert(requests[0].options.signal.aborted);
 requests[1].resolve(response(200,{user:{id:'employee'},tasks:[{status:'APPROVED'}]}));await fresh;
 requests[0].resolve(response(200,{user:{id:'employee'},tasks:[{status:'PENDING'}]}));await old;
 assert.equal(received.length,1);assert.equal(received[0].tasks[0].status,'APPROVED');assert.equal(requests[0].url,'/api/workspace?background=1');
});
test('network failures retain data, expiry is explicit, and cleanup rejects late responses', async () => {
 let expire=0, data=0, finish;
 const loader=createWorkspaceRefresh({fetcher:async()=>response(503,{error:'offline'}),onData:()=>data++,onExpired:()=>expire++});
 await assert.rejects(loader.refresh(),/offline/);assert.equal(expire,0);assert.equal(data,0);
 const expired=createWorkspaceRefresh({fetcher:async()=>response(401,{}),onData:()=>data++,onExpired:()=>expire++});await expired.refresh();assert.equal(expire,1);
 const stale=createWorkspaceRefresh({fetcher:()=>new Promise(r=>finish=r),onData:()=>data++,onExpired:()=>expire++});const pending=stale.refresh();stale.invalidate();finish(response(200,{user:{id:'old'}}));await pending;assert.equal(data,0);
});
test('updates recur, pause while hidden, recover after errors, and stop on cleanup', async () => {
 let next,delay,visible=true,calls=0,fail=false;const reports=[];
 const loop=startWorkspaceUpdates({refresh:async()=>{calls++;if(fail)throw Error('offline');},visible:()=>visible,report:m=>reports.push(m),schedule:(fn,ms)=>{next=fn;delay=ms;return 1;},cancel:()=>{next=null;}});
 await next();assert.equal(calls,1);assert.equal(delay,5000);
 visible=false;await next();assert.equal(calls,1);assert.equal(delay,30000);
 visible=true;fail=true;await loop.retry();assert.equal(delay,10000);assert.match(reports.at(-1),/Reconnecting/);
 fail=false;await loop.retry();assert.equal(delay,5000);assert.equal(reports.at(-1),'');loop.stop();assert.equal(next,null);await loop.retry();assert.equal(calls,3);
});
