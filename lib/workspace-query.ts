import {z} from 'zod';
import {fail} from './auth';
import {day, weekStart, midnight, addDays} from './core.mjs';
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  try { return day(midnight(value)) === value; } catch { return false; }
});
export function workspaceRange(q?: URLSearchParams) {
  if (q?.get('scope') !== '1') return null;
  const from = date.parse(q.get('from') || '1970-01-01');
  const to = date.parse(q.get('to') || '2100-01-01');
  const week = date.parse(q.get('week') || weekStart());
  if (from > to) fail('Choose a valid date range.');
  return {from,to,start:midnight(from),end:midnight(addDays(to,1)),weekStart:midnight(week),weekEnd:midnight(addDays(week,7))};
}
export function taskQuery(q: URLSearchParams, actor: {id:string;role:string}) {
  const input = z.object({
    page:z.coerce.number().int().min(0).max(1000000).default(0),
    limit:z.coerce.number().int().min(1).max(100).default(25),
    from:date.optional(),to:date.optional(),
    employee:z.string().max(100).optional(),project:z.string().max(100).optional(),account:z.string().max(100).optional(),
    status:z.enum(['PENDING','APPROVED','RETURNED','SKIPPED (NO CHANGES)']).optional(),
    search:z.string().max(250).default(''),
    sort:z.enum(['date','video_id','annotator','account_id','duration_seconds','spent_seconds','status']).default('date'),
    reverse:z.enum(['true','false']).default('true'),
  }).parse(Object.fromEntries([...q].filter(([,v])=>v!=='')));
  if (input.from && input.to && input.from > input.to) fail('Choose a valid date range.');
  const where:string[] = [], args:unknown[] = [];
  const condition = (sql:string,value:unknown) => {where.push(sql);args.push(value);};
  if(actor.role !== 'ADMIN') condition('t.user_id=?',actor.id);
  if(input.from) condition('t.date>=?',input.from);
  if(input.to) condition('t.date<=?',input.to);
  for(const [key,column] of [['employee','user_id'],['project','project_id'],['account','account_id'],['status','status']] as const)
    if(input[key]) condition(`t.${column}=?`,input[key]);
  if(input.search) condition("instr(lower(t.video_id || ' ' || t.notes || ' ' || u.name || ' ' || a.name),lower(?))>0",input.search);
  const columns = {date:'t.date',video_id:'t.video_id',annotator:'u.name',account_id:'t.account_id',duration_seconds:'t.duration_seconds',spent_seconds:'spent_seconds',status:'t.status'};
  const direction = input.reverse === 'true' ? 'DESC' : 'ASC';
  return {...input,where:where.length?' WHERE '+where.join(' AND '):'',args,order:`${columns[input.sort]} ${direction},t.created_at ${direction},t.id ${direction}`};
}
