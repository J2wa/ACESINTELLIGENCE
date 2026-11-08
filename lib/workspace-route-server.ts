import {all} from './auth';
import {getClient} from './database';
import {ensureRoutingSchema} from './routing-schema.mjs';
import {resolveRoute} from './workspace-routes.mjs';
export async function routeIdentity(user:{id:string;role:string}|null, route:{project:string|null;employee?:string;task?:string|null;account?:string}|null) {
 if(!user||!route)return null;
 await ensureRoutingSchema(getClient());
 // Only identifiers needed for authorization; no rates, emails, notes or profit data.
 const projects=await all('SELECT p.id,r.slug FROM projects p JOIN project_urls r ON r.project_id=p.id JOIN project_slug_history h ON h.project_id=p.id WHERE h.slug=?',route.project);
 if(!projects.length)return null;
 const p=projects[0];p.slug_aliases=[route.project];
 const assignments=await all('SELECT project_id,user_id FROM project_assignments WHERE project_id=?',p.id);
 if(user.role!=='ADMIN'&&!assignments.some(a=>a.user_id===user.id))return null;
 const users=route.employee?await all('SELECT u.id,r.slug FROM users u JOIN employee_urls r ON r.user_id=u.id WHERE r.slug=?'+(user.role==='ADMIN'?'':' AND u.id=?'),route.employee,...(user.role==='ADMIN'?[]:[user.id])):[];
 if(route.employee&&!users.length)return null;
 const tasks=route.employee?await all('SELECT id,project_id,account_id,user_id,video_id FROM task_entries WHERE project_id=? AND user_id=?',p.id,users[0].id):[];
 const accounts=route.account?await all('SELECT a.id,r.slug FROM accounts a JOIN account_urls r ON r.account_id=a.id WHERE a.project_id=? AND r.slug=?',p.id,route.account):[];
 return resolveRoute({user,projects,assignments,users,tasks,accounts},route);
}
