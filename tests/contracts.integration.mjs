import {mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import assert from 'node:assert/strict';import {randomBytes,createHash} from 'node:crypto';import {PDFDocument} from 'pdf-lib';
const dir=mkdtempSync(join(tmpdir(),'aces-contract-tests-'));process.env.TURSO_DATABASE_URL='file:'+join(dir,'test.db');process.env.BOOTSTRAP_TOKEN=randomBytes(32).toString('hex');delete process.env.ADMIN_EMAIL;delete process.env.ADMIN_PASSWORD_HASH;
const {handle}=await import('../lib/api.ts');const {getClient}=await import('../lib/database.ts');const {ensureContracts,TEMPLATE_HASH,renderContract}=await import('../lib/contracts.ts');const db=getClient();let checks=0;const base='http://test.local';
async function req(path,body,cookie='',expected=200){const r=await handle(new Request(base+'/api/'+path,{method:body?'POST':'GET',headers:{Origin:base,Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));assert.equal(r.status,expected,`${path}: ${r.status===expected?'':await r.text()}`);checks++;return r;}
const cookie=r=>r.headers.get('set-cookie').split(';')[0];const password=randomBytes(20).toString('hex');
try{
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+f,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.execute(sql);
 const admin=cookie(await req('auth/setup',{name:'Admin',email:'admin@example.test',password,bootstrap_token:process.env.BOOTSTRAP_TOKEN}));await ensureContracts();
 const body={users:[{name:'First Contractor',email:'first@example.test'},{name:'Second Contractor',email:'second@example.test'}],initial_password:password};
 await req('users/bulk',body,'',401);let result=await(await req('users/bulk',body,admin)).json();assert.equal(result.created.length,2);
 const first=cookie(await req('auth/login',{email:'first@example.test',password})),second=cookie(await req('auth/login',{email:'second@example.test',password}));
 await req('users/bulk',body,first,403);await req('users/bulk',{...body,users:[body.users[0],body.users[0]]},admin,400);
 result=await(await req('users/bulk',{...body,initial_password:'different-password-987'},admin)).json();assert.equal(result.created.length,0);assert.equal(result.existing.length,2);await req('auth/login',{email:'first@example.test',password});
 await req('contracts/templates',{pdf_base64:'aGVsbG8gd29ybGQ=',confirm_all_employees:true},admin,400);await req('contracts/templates',{pdf_base64:'aGVsbG8gd29ybGQ=',confirm_all_employees:true},first,403);
 let template;
 if(process.env.CONTRACT_TEMPLATE_TEST){template=readFileSync(process.env.CONTRACT_TEMPLATE_TEST);assert.equal(createHash('sha256').update(template).digest('hex'),TEMPLATE_HASH);await req('contracts/templates',{pdf_base64:template.toString('base64'),confirm_all_employees:true},admin);await req('contracts/templates',{pdf_base64:template.toString('base64'),confirm_all_employees:true},admin);}
 else{const pdf=await PDFDocument.create();for(let i=0;i<23;i++)pdf.addPage([596,842]);template=Buffer.from(await pdf.save());const adminId=(await db.execute("SELECT id FROM users WHERE role='ADMIN'")).rows[0].id;await db.execute({sql:'INSERT INTO contract_templates VALUES(?,?,?,?,?,?)',args:['test-template','Test agreement',template.toString('base64'),TEMPLATE_HASH,adminId,Date.now()]});}
 let d=await(await req('contracts',null,first)).json();assert.equal(d.contracts.length,1);assert(d.requires_password_change);const assignment=d.contracts[0];const other=(await(await req('contracts',null,second)).json()).contracts[0];
 assert.equal((await(await req('contracts',null,admin)).json()).contracts.length,2);
 const beforeOnboarding = await (await req('workspace',null,first)).json();
 assert.deepEqual(beforeOnboarding.onboarding, {requires_password_change:true,requires_contract_signature:true});
 assert.deepEqual(Object.keys(beforeOnboarding).sort(), ['onboarding','user']);
 await req('tasks',null,first,403);
 await req('presence',{},first,403);
 assert(Array.isArray((await (await req('workspace',null,admin)).json()).tasks));
 const inlinePreview = await req('contracts/document?id='+assignment.id,null,first);
 assert.equal(inlinePreview.headers.get('content-type'),'application/pdf');
 assert.match(inlinePreview.headers.get('content-disposition'),/^inline/);
 assert.equal(inlinePreview.headers.get('cache-control'),'private, no-store');
 assert.equal((await PDFDocument.load(await inlinePreview.arrayBuffer())).getPageCount(),23);
 await db.execute({sql:'DELETE FROM user_onboarding WHERE user_id=?',args:[other.user_id]});
 assert.deepEqual((await (await req('workspace',null,second)).json()).onboarding, {requires_password_change:true,requires_contract_signature:true});

 await req('contracts/document?id='+other.id,null,first,404);await req('contracts/preview',{assignment_id:other.id,address:'Somewhere in Manila'},first,404);await req('contracts/document?id='+assignment.id+'&signed=1',null,first,409);
 const signing={assignment_id:assignment.id,address:'123 Example Street, Quezon City',method:'typed',consent:true,template_sha256:TEMPLATE_HASH,password};
 await req('contracts/sign',signing,first,403);
 await req('auth/password',{current_password:password,password},first,400);
 const personal=randomBytes(20).toString('hex');const personalCookie=cookie(await req('auth/password',{current_password:password,password:personal},first));await req('contracts',null,first,401);
 d=await(await req('contracts',null,personalCookie)).json();assert.equal(d.requires_password_change,false);
 await db.execute({sql:'DELETE FROM user_onboarding WHERE user_id=?',args:[assignment.user_id]});
 assert.deepEqual((await (await req('workspace',null,personalCookie)).json()).onboarding, {requires_password_change:false,requires_contract_signature:true});
 await req('tasks',null,personalCookie,403);

 await req('contracts/sign',{...signing,password:personal,consent:false},personalCookie,400);await req('contracts/sign',{...signing,password:personal,template_sha256:'0'.repeat(64)},personalCookie,409);await req('contracts/sign',{...signing,password:'incorrect'},personalCookie,403);await req('contracts/sign',{...signing,password:personal,method:'uploaded',signature_png:'invalid'},personalCookie,400);
 await req('contracts/sign',{...signing,password:personal,assignment_id:other.id},personalCookie,404);await req('contracts/sign',signing,admin,403);
 const preview=await req('contracts/preview',{assignment_id:assignment.id,address:signing.address},personalCookie);assert.equal((await PDFDocument.load(await preview.arrayBuffer())).getPageCount(),23);
 const signed=await(await req('contracts/sign',{...signing,password:personal},personalCookie)).json();assert.equal(signed.signed,true);
 const unlocked = await (await req('workspace',null,personalCookie)).json();
 assert.equal(unlocked.onboarding,undefined);
 assert(Array.isArray(unlocked.tasks));
 await req('tasks',null,personalCookie);

 const download=await req('contracts/document?id='+assignment.id+'&signed=1',null,personalCookie);assert.equal(download.headers.get('cache-control'),'private, no-store');const bytes=Buffer.from(await download.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),signed.document_sha256);assert.equal((await PDFDocument.load(bytes)).getPageCount(),24);
 if(process.env.CONTRACT_TEMPLATE_TEST)writeFileSync('/tmp/aces-signed-test.pdf',bytes);
 await req('contracts/sign',{...signing,password:personal},personalCookie,409);await req('contracts/document?id='+assignment.id+'&signed=1',null,admin);
 await assert.rejects(()=>db.execute({sql:'UPDATE contract_signatures SET signer_name=? WHERE assignment_id=?',args:['Tamper',assignment.id]}));await assert.rejects(()=>db.execute('UPDATE contract_templates SET title=\'Tamper\''));
 await req('users/bulk',{users:[{name:'Future Contractor',email:'future@example.test'}],initial_password:password},admin);const future=cookie(await req('auth/login',{email:'future@example.test',password}));assert.equal((await(await req('contracts',null,future)).json()).contracts.length,1);
 for(const [who,session,mode] of [['second',second,'drawn'],['future',future,'uploaded']]){
  const newPassword=randomBytes(20).toString('hex');const signedIn=cookie(await req('auth/password',{current_password:password,password:newPassword},session));
  const own=(await(await req('contracts',null,signedIn)).json()).contracts[0];
  await req('contracts/sign',{...signing,assignment_id:own.id,password:newPassword,method:mode,signature_png:'iVBORw0KGgoAAAANSUhEUgAAAlgAAACgCAYAAADQOBKBAAAFbUlEQVR4nO3czW3cShCFUY/hFBSEIlHMjsRBOAh68x40pkfk/Fyyu6vPWWkhwAORUH8ulnhZluUbAAA531t/AACAagQWAECYwAIACBNYAABhAgsAIExgAQCECSwAgDCBBQAQJrAAAMIEFgBAmMACAAgTWAAAYQILACBMYAEAhAksAIAwgQUAECawAADCBBYAQJjAOsHb+8fS+jMAAOe5LIuz/0jruPr96+el1WcBAM5hgnUgkysAmJPAOoi4AoB5CayTCS8AqE9gHcDeFQDMTWCFmVABAAIr6FZcmV4BwHwEVsheXF1/bcoFALUJrACTKwDgmsB6kbgCANYEVpi4AgAE1gu8jgEAuEVgPemZRXWL7gAwB4H1BHtXAMAWgfUgcQUA7BFYDxBXAMA9BNadUnFlDwsA6hNYTzK5AgC+IrDu4HUMAMAjBNYOj/EAgEcJrA2W2gGAZwisLxwZVxbdAaA2gXWDyRUA8AqBtSKuAIBXCawd4goAeJTAunLm6xjsYQFAXQLrPyIHAEgRWN/sXQEAWdMHlrgCANKmDixxBQAcYdrA6iGuLLoDQE3TBtaayRUAkDJlYJ35OgYAYD7TBZZHcQDA0aYKrB72rrb+ffEHADVME1g9xhUAUNMUgSWuAIAzlQ8scQUAnK18YK2JKwDgaKUDa5TXMVh0H5/rBsC1H60/wFEceJzh+j67/rrXmAfgHCUDy94VR9sL+FGmpwAco1xgiSuOdO/9tf4+0y2AuVyWpc6TtNHjyiHcr1furb1pl2sNUE+ZCdbocUWfEvfV+vtNtwDqKxNYaw4qXnFksG/91ajdLYAaSgSWQ4mUsyehplsANQ0fWF7HQEIvj5hNtwBqGHrJvZdDMcnE4lwj3UNb/5no9TMDzGrYCdZIByP9GfH+Md0CGMeQgTXi4Ugfqtw7drcA+jZcYFU5IDlX9fvGdAugL8PtYM1wWJg+5FQPq3vY3QI431ATrBniigxh9cl0C+B8wwSW1zFwD2G1ze4WwDmGCCyHJnvcI88x3QI4RveB5eBki/sjx3QLIKfrJfeZD0+H2baZ740W9h7R+9kD/K3bCZYDlFvcF22YbgE8ptvAWvNLe27Cqi92twC2dRlYfkHzP2HVv73pFsCMutvBcqB+mvmxi/ughrf3j8V1A2bU1QTLoYp7oBbXDphVN4HlYJ2b6w9AJV0ElsN1Xq49ABU1DywH7JxcdwAqa77k7i8Gt1VbdBdWAMyg6QRLXM1DWAEwk2aB5V05cxBWAMyoSWA5dOtzjQGYWbMdrGq7RUca6WclrACg4SPC379+XrzluQ5hBQCfmi65O4DHJ6wA4F/N34PFmIQVAHxNYPEQYQUA+5q/aJT7tF50F1YAcD8TLDYJKwB4nMDiJmEFAM8TWPxFWAHA6+xgDeTIPSxhBQA5JliTE1YAkCewJiWsAOA4AmsywgoAjiewJiGsAOA8ltwH8+iiu7ACgPOZYBUlrACgHYFVjLACgPYEVhHCCgD6YQdrQLdi6pqwAoC2TLAKEVYA0AeBVYCwAoC+eEQ4qLf3j0VYAUCfBBYAQNj31h8AAKAagQUAECawAADCBBYAQJjAAgAIE1gAAGECCwAgTGABAIQJLACAMIEFABAmsAAAwgQWAECYwAIACBNYAABhAgsAIExgAQCECSwAgDCBBQAQJrAAAMIEFgBAmMACAAgTWAAAYQILACBMYAEAhAksAIAwgQUAECawAADCBBYAQJjAAgAIE1gAAGECCwAgTGABAIQJLACAMIEFABAmsAAAwgQWAECYwAIACBNYAABhAgsAIExgAQCECSwAgDCBBQAQJrAAAMIEFgBAmMACAAgTWAAAYQILACDsD1KizgcM8UlqAAAAAElFTkSuQmCC'},signedIn);
  const file=await req('contracts/document?id='+own.id+'&signed=1',null,signedIn);assert.equal((await PDFDocument.load(await file.arrayBuffer())).getPageCount(),24);
 }
 const audits=(await db.execute('SELECT after_json FROM audit_log')).rows.map(r=>r.after_json).join('');assert(!audits.includes(password)&&!audits.includes(personal));
 console.log(`PASS: ${checks} contract/onboarding API checks plus PDF structure, hash, immutability, password privacy, and future employee coverage.`);
}finally{db.close();rmSync(dir,{recursive:true,force:true});}
