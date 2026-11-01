import {z} from 'zod';
import {getClient} from './database';
export const PROJECT_LINKS_SQL = `CREATE TABLE IF NOT EXISTS project_links (project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE, work_enabled INTEGER NOT NULL DEFAULT 0 CHECK(work_enabled IN (0,1)), work_url TEXT NOT NULL DEFAULT '', assistant_enabled INTEGER NOT NULL DEFAULT 0 CHECK(assistant_enabled IN (0,1)), assistant_url TEXT NOT NULL DEFAULT '')`;
const url=z.string().trim().max(2048).refine(value=>{if(!value)return true;try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}},'Enter a complete https:// or http:// URL without credentials.');
export const projectLinkFields={work_enabled:z.number().int().min(0).max(1).optional(),work_url:url.optional(),assistant_enabled:z.number().int().min(0).max(1).optional(),assistant_url:url.optional()};
export function resolveProjectLinks(input:Record<string,any>,old:Record<string,any>|null){
 const result={work_enabled:input.work_enabled??old?.work_enabled??0,work_url:input.work_url??old?.work_url??'',assistant_enabled:input.assistant_enabled??old?.assistant_enabled??0,assistant_url:input.assistant_url??old?.assistant_url??''};
 if(result.work_enabled&&!result.work_url)throw Object.assign(new Error('Add a work website URL before enabling Start working.'),{status:400});
 if(result.assistant_enabled&&!result.assistant_url)throw Object.assign(new Error('Add an AI assistant URL before enabling its button.'),{status:400});
 return result;
}
let ready:Promise<unknown>|undefined;
export async function ensureProjectLinks(){await(ready??=getClient().execute(PROJECT_LINKS_SQL).catch(e=>{ready=undefined;throw e;}));}
