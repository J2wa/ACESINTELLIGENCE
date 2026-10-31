import {pbkdf2Sync,randomBytes} from 'node:crypto';
import {writeFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';import {tmpdir} from 'node:os';import {execFileSync} from 'node:child_process';
import {demoData} from '../lib/demo.mjs';
const adminEmail=process.env.SEED_ADMIN_EMAIL,adminPassword=process.env.SEED_ADMIN_PASSWORD,employeePassword=process.env.SEED_EMPLOYEE_PASSWORD;
if(!adminEmail||!adminPassword||!employeePassword||adminPassword.length<12||employeePassword.length<12)throw new Error('Set SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD and SEED_EMPLOYEE_PASSWORD (passwords: minimum 12 characters). No default credentials are supplied.');
const hash=p=>{const salt=randomBytes(32).toString('hex');return 'pbkdf2$100000$'+salt+'$'+pbkdf2Sync(p,salt,100000,32,'sha256').toString('hex');};
const q=v=>v===null||v===undefined?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const insert=(table,row)=>`INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.values(row).map(q).join(',')});`;
const data=demoData(),sql=[];
for(let i=0;i<data.users.length;i++){const u=data.users[i];sql.push(insert('users',{...u,email:i===0?adminEmail.toLowerCase():u.email,password_hash:hash(i===0?adminPassword:employeePassword),created_at:Date.now()}));}
for(const p of data.projects)sql.push(insert('projects',p));for(const a of data.accounts)sql.push(insert('accounts',a));for(const a of data.assignments)sql.push(insert('project_assignments',a));for(const a of data.account_assignments)sql.push(insert('account_assignments',a));
for(const task of data.tasks){const {spent_seconds,...row}=task;sql.push(insert('task_entries',row));}for(const row of data.times)sql.push(insert('time_entries',row));
const {createClient}=await import('@libsql/client');
if(!process.env.TURSO_DATABASE_URL)throw new Error('Set TURSO_DATABASE_URL.');
if(process.env.VERCEL || !process.env.TURSO_DATABASE_URL.startsWith('file:'))throw new Error('Sample seeding is restricted to a local development database.');
const client=createClient({url:process.env.TURSO_DATABASE_URL});
try{await client.batch(sql,'write');console.log('Seeded sample admin, 3 employees, 2 projects and sample entries.');}finally{client.close();}
