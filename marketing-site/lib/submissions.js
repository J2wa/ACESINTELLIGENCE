import { createHash, randomUUID } from 'node:crypto';
import { redis, allowedOrigin, rateLimit, limitedBody } from './storage.js';
export const SERVICES=['RLHF & model evaluation','Multimodal data annotation','Agentic AI & workflow development','AI Agent VA & digital employee','Domain expertise & other inquiries'];
export const EXPERTISE=['Medical & healthcare','Legal & policy','Finance & business','Engineering & technology','Education & languages','Multimedia & human data','Other'];
const MAX_FILE=3*1024*1024, MAX_BODY=MAX_FILE+65536;
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function reply(request,message,status=200,extra={}) {
 const headers={'Cache-Control':'no-store',...(status===429?{'Retry-After':'600'}:{})};
 if(request.headers.get('accept')?.includes('application/json'))return Response.json({...(status<400?{ok:true,message}:{error:message}),...extra},{status,headers});
 return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Submission status — Aces Intelligence</title><link rel="stylesheet" href="/site.css"><main class="shell" style="padding-top:60px"><h1>${status<400?'Thank you':'Submission not completed'}</h1><p>${escape(message)}</p>${extra.reference?`<p>Reference: ${escape(extra.reference)}</p>`:''}<p><a href="/inquiry">Return to inquiries</a> · <a href="/careers">Return to careers</a> · <a href="https://www.linkedin.com/company/aces-intelligence">Contact Aces on LinkedIn</a></p></main></html>`,{status,headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
}
export async function handleSubmission(request, {env=process.env,execute=redis,limit=rateLimit}={}) {
 if(request.method!=='POST')return new Response('Method not allowed',{status:405,headers:{Allow:'POST','Cache-Control':'no-store'}});
 if(!allowedOrigin(request,env))return reply(request,'Please submit from the ACES website.',403);
 const type=request.headers.get('content-type')||'';
 if(!type.startsWith('multipart/form-data')&&!type.startsWith('application/x-www-form-urlencoded'))return reply(request,'Unsupported form format.',415);
 let form;
 try{const body=await limitedBody(request,MAX_BODY);form=await new Request(request.url,{method:'POST',headers:{'Content-Type':type},body}).formData();}
 catch(error){return reply(request,error.message==='too_large'?'Upload a PDF no larger than 3 MB.':'The form could not be read.',error.message==='too_large'?413:400);}
 if(String(form.get('website')||'').trim())return reply(request,'Submission could not be accepted. Please contact us through LinkedIn.',400);
 const values={};
 for(const [key,max] of Object.entries({kind:20,name:120,email:254,company:150,service:100,message:5000,phone:35,specialty:100,otherExpertise:150,projectInterest:150,modality:150,languages:250,volume:150,timeline:150,budget:150})){
  const raw=form.get(key);if(raw!==null&&typeof raw!=='string')return reply(request,'Please check the form fields.',400);
  values[key]=(raw||'').trim();if(values[key].length>max)return reply(request,`Please shorten the ${key} field.`,400);
 }
 if(!['inquiry','application'].includes(values.kind)||values.name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)||form.get('consent')!=='yes')return reply(request,'Enter your name, a valid email address and your consent.',400);
 if(values.kind==='inquiry'&&(!SERVICES.includes(values.service)||values.message.length<20))return reply(request,'Choose a service and describe your project in at least 20 characters.',400);
 if(values.kind==='application'&&(!EXPERTISE.includes(values.specialty)||(values.specialty==='Other'&&!values.otherExpertise)))return reply(request,'Choose your expertise and specify it if you selected Other.',400);
 let resume;
 if(values.kind==='application'){
  const file=form.get('resume');if(!file||typeof file==='string'||!file.size||file.size>MAX_FILE||!file.name.toLowerCase().endsWith('.pdf')||(file.type&&file.type!=='application/pdf'))return reply(request,'Upload a PDF résumé no larger than 3 MB.',400);
  const bytes=Buffer.from(await file.arrayBuffer());if(bytes.subarray(0,5).toString()!=='%PDF-')return reply(request,'The uploaded file is not a PDF.',400);
  // Stored privately. Do not render PDFs inline or serve them from public URLs.
  resume={name:'resume.pdf',contentType:'application/pdf',content:bytes.toString('base64')};
 }
 const days=Number(env[values.kind==='application'?'APPLICATION_RETENTION_DAYS':'INQUIRY_RETENTION_DAYS']);
 if(env.FORMS_ENABLED!=='true'||!env.FORMS_REDIS_URL?.startsWith('https://')||!env.FORMS_REDIS_TOKEN||!env.RATE_LIMIT_SECRET||!Number.isInteger(days)||days<1||days>3650)return reply(request,'Online submissions are awaiting configuration. Please contact ACES through the LinkedIn link on this page; your submission has not been saved.',503);
 try{
  if(!await limit(request,'forms',5,env,execute))return reply(request,'Too many attempts. Please try again in 10 minutes.',429);
  const payload={...values,resume,consentVersion:'2026-11-10',consent:true};
  const digest=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const rawId=form.get('submissionId');const id=typeof rawId==='string'&&/^[\da-f-]{36}$/i.test(rawId)?rawId:randomUUID();
  const reference='ACES-'+id;const key='aces:submission:'+id;
  const record={...payload,reference,createdAt:new Date().toISOString(),digest};
  const result=await execute(['SET',key,JSON.stringify(record),'EX',String(days*86400),'NX'],env);
  if(result!== 'OK'){
   const existing=await execute(['GET',key],env);
   if(!existing||JSON.parse(existing).digest!==digest)return reply(request,'This submission reference was already used. Refresh and try again.',409);
  }
  return reply(request,'Your submission has been received. Keep your reference for follow-up.',200,{reference});
 }catch{console.error('submission_storage_failed');return reply(request,'We could not confirm receipt. Please retry with the same details or contact ACES through LinkedIn.',503);}
}
