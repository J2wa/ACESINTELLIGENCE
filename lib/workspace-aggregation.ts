import {taskHours} from './core.mjs';
import type {all} from './auth';
type Row = Awaited<ReturnType<typeof all>>[number];
export function enrichTaskHours(tasks: Row[], times: Row[], reviews: Row[], sheets: Row[]) {
  const linked = new Map<string,Row[]>(), byUser = new Map<string,Row[]>();
  for(const time of times) {const rows=linked.get(time.task_id)??[];rows.push(time);linked.set(time.task_id,rows);}
  for(const sheet of sheets) {const rows=byUser.get(sheet.user_id)??[];rows.push(sheet);byUser.set(sheet.user_id,rows);}
  const byTask = new Map(reviews.map(r=>[r.task_id,r]));
  return tasks.map(t=>taskHours(t,linked.get(t.id)??[],byTask.get(t.id),byUser.get(t.user_id)??[]));
}
