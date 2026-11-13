import {redis,allowedOrigin,rateLimit,limitedBody} from '../lib/storage.js';
export async function handleEvents(request,{env=process.env,execute=redis,limit=rateLimit}={}){
 const done=status=>new Response(null,{status,headers:{'Cache-Control':'no-store'}});
 if(request.method!=='POST')return done(405);
 if(!allowedOrigin(request,env))return done(403);
 if(env.ANALYTICS_ENABLED!=='true'||!env.FORMS_REDIS_URL||!env.FORMS_REDIS_TOKEN||!env.RATE_LIMIT_SECRET)return done(204);
 try{
  const raw=await limitedBody(request,512),data=JSON.parse(Buffer.from(raw).toString());
  if(!['cta_click','form_start','form_submit'].includes(data.event)||!['inquiry','application','agents','enterprise'].includes(data.context)||Object.keys(data).some(k=>!['event','context'].includes(k)))return done(400);
  if(!await limit(request,'events',60,env,execute))return done(429);
  const key=`aces:metrics:${new Date().toISOString().slice(0,10)}:${data.event}:${data.context}`;
  await execute(['EVAL',"local n=redis.call('INCR',KEYS[1]); redis.call('EXPIRE',KEYS[1],7776000); return n",'1',key],env);return done(204);
 }catch{return done(503);}
}
export default {fetch:handleEvents};
