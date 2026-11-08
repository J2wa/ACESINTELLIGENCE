import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {z} from 'zod';
import {claimsTransaction} from './claims';
import {fail,stmt} from './auth';
const input=z.object({account_id:z.string().min(1).max(100),action:z.enum(['read','save']),username:z.string().max(500).optional(),password:z.string().max(2000).optional(),login_url:z.union([z.literal(''),z.string().url().refine(v=>new URL(v).protocol==='https:','Use an HTTPS login URL.')]).optional()}).strict();
function key(){const value=process.env.WORK_ACCOUNT_CREDENTIALS_KEY;if(!value||!/^[a-f0-9]{64}$/i.test(value))fail('Account credential storage is not configured. Contact your administrator.',503);return Buffer.from(value!,'hex');}
function encrypt(value:unknown,account:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from(account));const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return [iv.toString('base64'),cipher.getAuthTag().toString('base64'),data.toString('base64')].join('.');}
function decrypt(value:string,account:string){const [iv,tag,data]=value.split('.');const cipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'base64'));cipher.setAAD(Buffer.from(account));cipher.setAuthTag(Buffer.from(tag,'base64'));return JSON.parse(Buffer.concat([cipher.update(Buffer.from(data,'base64')),cipher.final()]).toString('utf8'));}
export async function accountCredentials(u:{id:string;role:string},value:unknown){
 const b=input.parse(value);
 return claimsTransaction(async tx=>{
  const access=await tx.execute(stmt(`SELECT a.id FROM accounts a JOIN projects p ON p.id=a.project_id WHERE a.id=? AND a.active=1 AND p.status='active' AND NOT EXISTS(SELECT 1 FROM deleted_work_accounts WHERE account_id=a.id) AND NOT EXISTS(SELECT 1 FROM deleted_records WHERE entity='projects' AND entity_id=p.id) AND (?='ADMIN' OR (EXISTS(SELECT 1 FROM project_assignments WHERE project_id=p.id AND user_id=?) AND EXISTS(SELECT 1 FROM account_assignments WHERE account_id=a.id AND user_id=?)))`,b.account_id,u.role,u.id,u.id));
  if(!access.rows.length)fail('You do not have access to this work account.',403);
  if(b.action==='save'&&u.role!=='ADMIN')fail('Administrator access required.',403);
  await tx.execute(`CREATE TABLE IF NOT EXISTS work_account_credentials(account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,ciphertext TEXT NOT NULL)`);
  if(b.action==='save'){
   if(b.username===undefined||b.password===undefined||b.login_url===undefined)fail('Provide all credential fields.');
   await tx.execute(stmt('INSERT INTO work_account_credentials(account_id,ciphertext) VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET ciphertext=excluded.ciphertext',b.account_id,encrypt({username:b.username,password:b.password,login_url:b.login_url},b.account_id)));
   return {saved:true};
  }
  const result=await tx.execute(stmt('SELECT ciphertext FROM work_account_credentials WHERE account_id=?',b.account_id));
  return result.rows[0]?decrypt(String(result.rows[0].ciphertext),b.account_id):{username:'',password:'',login_url:''};
 });
}
