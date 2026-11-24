import {createHash} from 'node:crypto';
import {PDFDocument, rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';
import {getClient} from './database';
import {all,one,stmt,id,audit,fail,hashPassword,checkPassword} from './auth';
import {throttleLogin} from './login-security';
export const TEMPLATE_HASH='58b5b8449a2d626b01ae3ee2bb3872713503a204717bb6ff9b22a698b96c1a3f';
export const CONSENT='I have reviewed the complete agreement and its annexes. I voluntarily agree to its terms and consent to use this electronic signature to sign this agreement.';
export const CONTRACT_SCHEMA=[
`CREATE TABLE IF NOT EXISTS contract_templates(id TEXT PRIMARY KEY,title TEXT NOT NULL,pdf_base64 TEXT NOT NULL,sha256 TEXT NOT NULL UNIQUE,created_by TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL)`,
`CREATE TABLE IF NOT EXISTS contract_assignments(id TEXT PRIMARY KEY,template_id TEXT NOT NULL REFERENCES contract_templates(id),user_id TEXT NOT NULL REFERENCES users(id),assigned_at INTEGER NOT NULL,UNIQUE(template_id,user_id))`,
`CREATE TABLE IF NOT EXISTS contract_signatures(assignment_id TEXT PRIMARY KEY REFERENCES contract_assignments(id),signer_name TEXT NOT NULL,signer_email TEXT NOT NULL,address TEXT NOT NULL,method TEXT NOT NULL CHECK(method IN ('typed','drawn','uploaded')),consent TEXT NOT NULL,signed_at INTEGER NOT NULL,document_sha256 TEXT NOT NULL,pdf_base64 TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS user_onboarding(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,require_password_change INTEGER NOT NULL DEFAULT 1)`,
`CREATE TRIGGER IF NOT EXISTS immutable_contract_signature BEFORE UPDATE ON contract_signatures BEGIN SELECT RAISE(ABORT,'Signed agreements cannot be changed'); END`,
`CREATE TRIGGER IF NOT EXISTS immutable_contract_template BEFORE UPDATE ON contract_templates BEGIN SELECT RAISE(ABORT,'Contract versions cannot be changed'); END`
];
let ready:Promise<unknown>|undefined;
export async function ensureContracts(){await(ready??=getClient().batch(CONTRACT_SCHEMA,'write').catch(e=>{ready=undefined;throw e;}));}
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const json=(value:unknown)=>Response.json(value,{headers:{'Cache-Control':'private, no-store'}});
const pdf=(bytes:Uint8Array,name:string,download=false)=>new Response(Buffer.from(bytes),{headers:{'Content-Type':'application/pdf','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`${download?'attachment':'inline'}; filename="${name}"`}});
async function input(req:Request){if(Number(req.headers.get('content-length')??0)>2_000_000)fail('File is too large.',413);const raw=await req.text();if(raw.length>2_000_000)fail('File is too large.',413);return JSON.parse(raw);}
const details=z.object({assignment_id:z.string().min(1).max(100),address:z.string().trim().min(8).max(180)});
async function assignment(user:any,assignmentId:string){const a=await one('SELECT a.*,t.title,t.pdf_base64,t.sha256,u.name,u.email FROM contract_assignments a JOIN contract_templates t ON t.id=a.template_id JOIN users u ON u.id=a.user_id WHERE a.id=?',assignmentId);if(!a||(user.role!=='ADMIN'&&a.user_id!==user.id))fail('Contract not found.',404);return a;}
async function assignAll(){await stmt(`INSERT OR IGNORE INTO contract_assignments(id,template_id,user_id,assigned_at) SELECT lower(hex(randomblob(16))),t.id,u.id,? FROM contract_templates t CROSS JOIN users u WHERE u.role='EMPLOYEE' AND NOT EXISTS(SELECT 1 FROM deleted_records d WHERE d.entity='users' AND d.entity_id=u.id)`,Date.now()).run();}
export async function renderContract(a:any,address:string,signature?:{method:string;image?:string;time:number}){
 const doc=await PDFDocument.load(Buffer.from(a.pdf_base64,'base64'));
 doc.registerFontkit(fontkit);
 const font=await doc.embedFont(await readFile(join(process.cwd(),'node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff')),{subset:true}),italic=await doc.embedFont(await readFile(join(process.cwd(),'node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-italic.woff')),{subset:true});
 const pages=doc.getPages();
 const line=(page:number,text:string,x:number,top:number,maxWidth=480,size=11)=>{let fs=size;while(font.widthOfTextAtSize(text,fs)>maxWidth&&fs>8)fs-=0.25;if(font.widthOfTextAtSize(text,fs)>maxWidth)fail('The name or address is too long to fit the contract.');pages[page].drawText(text,{x,y:842-top,size:fs,font});};
 line(0,`${a.name}, of legal age, Filipino, and residing at`,56.7,375);
 line(0,address||'[Contractor residential address to be entered before signing]',56.7,390);
 line(0,'hereinafter referred to as the "Contractor."',56.7,405);
 line(1,a.name,157.2,162.3,375);
 line(21,`Name: ${a.name}`,56.7,449.3);
 const signedDate=signature?new Date(signature.time).toLocaleDateString('en-PH',{timeZone:'Asia/Manila',year:'numeric',month:'long',day:'numeric'}):'Date signed by the Contractor';
 line(21,`Date: ${signedDate}`,56.7,482);
 if(signature){
  if(signature.method==='typed')pages[21].drawText(a.name,{x:300,y:842-454,font:italic,size:Math.min(17,215/italic.widthOfTextAtSize(a.name,1)),color:rgb(.05,.15,.3)});
  else {const image=await doc.embedPng(Buffer.from(signature.image!,'base64'));const fitted=image.scaleToFit(220,55);pages[21].drawImage(image,{x:300,y:842-466,width:fitted.width,height:fitted.height});}
  line(21,'Contractor electronic signature',300,480,220,9);
  const record=doc.addPage([596,842]);let y=780;
  const text=(value:string,size=11)=>{record.drawText(value,{x:48,y,font,size,maxWidth:500,lineHeight:16});y-=Math.max(24,Math.ceil(font.widthOfTextAtSize(value,size)/500)*16+8);};
  text('ELECTRONIC SIGNATURE RECORD',16);text('Attached to the 23-page Independent Contractor Agreement');text(`Record: ${a.id}`);text(`Signer: ${a.name}`);text(`Account: ${a.email}`);text(`Signed: ${new Date(signature.time).toISOString()} (UTC)`);text(`Effective date: ${signedDate} (Asia/Manila)`);text(`Signature method: ${signature.method}`);text('Authentication: account password verified at signing.');text(CONSENT);text(`Template SHA-256: ${a.sha256}`,9);text('The contractor signature was applied to the execution page.');text('Agency signature, witness signature, and notarization are not completed by this electronic signing process.');
 }
 return doc.save();
}
export async function contractRoute(req:Request,u:any,path:string):Promise<Response>{
 await ensureContracts();const method=req.method;
 if(path==='users/bulk'&&method==='POST'){
  if(u.role!=='ADMIN')fail('Administrator access required.',403);
  const b=z.object({users:z.array(z.object({name:z.string().trim().min(1).max(150),email:z.string().trim().email().max(254).transform(s=>s.toLowerCase())}).strict()).min(1).max(50),initial_password:z.string().min(12).max(128)}).strict().parse(await input(req));
  if(new Set(b.users.map(x=>x.email)).size!==b.users.length)fail('Each email must appear only once.');
  const existing=await all('SELECT email FROM users WHERE email IN ('+b.users.map(()=>'?').join(',')+')',...b.users.map(x=>x.email));const present=new Set(existing.map(x=>x.email));
  const created=b.users.filter(x=>!present.has(x.email)),statements=[];
  for(const row of created){const uid=id();statements.push(stmt("INSERT INTO users(id,name,email,password_hash,role,active,created_at) VALUES(?,?,?,?,'EMPLOYEE',1,?)",uid,row.name,row.email,await hashPassword(b.initial_password),Date.now()),stmt('INSERT INTO user_onboarding(user_id) VALUES(?)',uid),audit(u,'users',uid,'created',null,{name:row.name,email:row.email,role:'EMPLOYEE',active:1}));}
  if(statements.length)await getClient().batch(statements,'write');await assignAll();
  return json({created:created.map(x=>x.email),existing:existing.map(x=>x.email),message:`Created ${created.length} employee accounts; ${existing.length} existing accounts kept unchanged.`});
 }
 if(path==='contracts/templates'&&method==='POST'){
  if(u.role!=='ADMIN')fail('Administrator access required.',403);
  const b=z.object({pdf_base64:z.string().min(10).max(1_500_000),confirm_all_employees:z.literal(true)}).strict().parse(await input(req));const bytes=Buffer.from(b.pdf_base64,'base64');
  if(digest(bytes)!==TEMPLATE_HASH)fail('Upload the prepared ACES agreement with the approved agency details.');
  const old=await one('SELECT id FROM contract_templates WHERE sha256=?',TEMPLATE_HASH);const templateId=old?.id??id();
  if(!old)await getClient().batch([stmt('INSERT INTO contract_templates VALUES(?,?,?,?,?,?)',templateId,'Independent Contractor Agreement',b.pdf_base64,TEMPLATE_HASH,u.id,Date.now()),audit(u,'contract_templates',templateId,'published',null,{sha256:TEMPLATE_HASH,audience:'All employee accounts'})],'write');
  await assignAll();return json({saved:true,template_id:templateId});
 }
 if(path==='contracts'&&method==='GET'){
  await assignAll();const contracts=await all(`SELECT a.id,a.user_id,t.title,t.sha256,u.name,u.email,a.assigned_at,s.signed_at,s.method,s.document_sha256 FROM contract_assignments a JOIN contract_templates t ON t.id=a.template_id JOIN users u ON u.id=a.user_id LEFT JOIN contract_signatures s ON s.assignment_id=a.id WHERE ${u.role==='ADMIN'?'1=1':'a.user_id=?'} ORDER BY u.name,a.assigned_at DESC`,...(u.role==='ADMIN'?[]:[u.id]));
  return json({contracts,consent:CONSENT,requires_password_change:!!(await one('SELECT 1 FROM user_onboarding WHERE user_id=? AND require_password_change=1',u.id)),template_published:!!(await one('SELECT id FROM contract_templates LIMIT 1'))});
 }
 if(path==='contracts/preview'&&method==='POST'){
  const b=details.strict().parse(await input(req)),a=await assignment(u,b.assignment_id);return pdf(await renderContract(a,b.address),'contract-preview.pdf');
 }
 if(path==='contracts/sign'&&method==='POST'){
  const b=details.extend({method:z.enum(['typed','drawn','uploaded']),signature_png:z.string().max(500_000).optional(),consent:z.literal(true),template_sha256:z.string().length(64),password:z.string().min(1).max(128)}).strict().parse(await input(req));
  const a=await assignment(u,b.assignment_id);if(a.user_id!==u.id)fail('Only the assigned contractor may sign.',403);
  if(await one('SELECT 1 FROM user_onboarding WHERE user_id=? AND require_password_change=1',u.id))fail('Choose a personal password in Settings before signing.',403);
  if(a.sha256!==b.template_sha256)fail('The contract version changed. Review it again.',409);
  if(await one('SELECT 1 FROM contract_signatures WHERE assignment_id=?',a.id))fail('This contract is already signed.',409);
  await throttleLogin(req,'contract-sign:'+u.email);
  const account=await one('SELECT password_hash FROM users WHERE id=?',u.id);if(!await checkPassword(b.password,account.password_hash))fail('Password is incorrect.',403);
  if(b.method!=='typed'){
   const image=Buffer.from(b.signature_png??'','base64');if(image.length<100||image.length>350000||image.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')fail('Provide a PNG signature.');
   const w=image.readUInt32BE(16),h=image.readUInt32BE(20);if(w<20||h<10||w>1800||h>800)fail('Signature image dimensions are not supported.');
  }
  const now=Date.now(),bytes=await renderContract(a,b.address,{method:b.method,image:b.signature_png,time:now}),hash=digest(bytes);
  await getClient().batch([stmt('INSERT INTO contract_signatures VALUES(?,?,?,?,?,?,?,?,?)',a.id,u.name,u.email,b.address,b.method,CONSENT,now,hash,Buffer.from(bytes).toString('base64')),audit(u,'contract_signatures',a.id,'signed',null,{template_sha256:a.sha256,document_sha256:hash,method:b.method,signed_at:now})],'write');
  return json({signed:true,document_sha256:hash,signed_at:now});
 }
 if(path==='contracts/document'&&method==='GET'){
  const q=new URL(req.url).searchParams,a=await assignment(u,q.get('id')??''),signed=await one('SELECT pdf_base64 FROM contract_signatures WHERE assignment_id=?',a.id);
  if(q.get('signed')==='1'&&!signed)fail('This contract has not been signed.',409);
  const bytes=signed?Buffer.from(signed.pdf_base64,'base64'):await renderContract(a,'');return pdf(bytes,signed?'signed-contract.pdf':'contract.pdf',q.get('download')==='1');
 }
 fail('Not found.',404);throw new Error('unreachable');
}
