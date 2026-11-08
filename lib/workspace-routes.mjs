export const VIEW_PATHS = { Overview:'/overview', 'Task log':'/tasks', Timesheets:'/timesheets', Projects:'/projects', Team:'/team', Payroll:'/payroll', 'Company profit':'/profit', Settings:'/settings' };
export const RESERVED = new Set(['api','login','logout','auth','overview','tasks','timesheets','projects','team','payroll','profit','settings','_next','_vercel','admin','favicon','robots','sitemap']);
export function slugify(name) { return String(name).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100).replace(/-$/,'') || 'project'; }
export function validProjectSlug(slug) { return typeof slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 120 && !RESERVED.has(slug); }
export function uniqueSlug(base, used) { let value=base, n=2; while(used.has(value)) value=`${base}-${n++}`; return value; }
export function safeReturnPath(value) {
 if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u0020\u007f]/.test(value)) return '/overview';
 try { const decoded=decodeURIComponent(value); if(decoded.startsWith('//')||/[\\\u0000-\u001f\u007f]/.test(decoded))return '/overview'; const url=new URL(value,'https://workhub.invalid'); if(url.origin!=='https://workhub.invalid'||['/login','/api'].some(p=>url.pathname===p||url.pathname.startsWith(p+'/')))return '/overview'; return url.pathname+url.search+url.hash; } catch {return '/overview';}
}
// Encode exactly once. Dot-only IDs need an escape prefix because browsers normalize dot segments.
export function taskSegment(id) { return id==='.'||id==='..'||id.startsWith('~') ? '~'+encodeURIComponent(id) : encodeURIComponent(id); }
export function decodeTaskSegment(segment) { const value=decodeURIComponent(segment); return value.startsWith('~') ? value.slice(1) : value; }
export function projectHref(project) { return '/'+project.slug; }
export function employeeHref(project,employee) { return projectHref(project)+'/'+employee.slug; }
export function taskHref(data,task) {
 const p=data.projects.find(p=>p.id===task.project_id), u=data.users.find(u=>u.id===task.user_id), a=data.accounts.find(a=>a.id===task.account_id);
 return p?.slug&&u?.slug ? employeeHref(p,u)+'/'+taskSegment(task.video_id)+(a?.slug?'?'+new URLSearchParams({account:a.slug}):'') : '/tasks';
}
export function parseRoute(pathname, account='') {
 try { const parts=pathname.split('/').slice(1); if(parts.length>3||parts.some(p=>!p))return null; return {project:decodeURIComponent(parts[0]),employee:parts[1]?decodeURIComponent(parts[1]):undefined,task:parts[2]!==undefined?decodeTaskSegment(parts[2]):undefined,account}; } catch {return null;}
}
export function resolveRoute(data, route) {
 if(!data?.user||!route)return null;
 const admin=data.user.role==='ADMIN';
 const project=data.projects.find(p=>p.slug===route.project || p.slug_aliases?.includes(route.project));
 if(!project || (!admin&&!data.assignments.some(a=>a.project_id===project.id&&a.user_id===data.user.id)))return null;
 if(!route.employee)return {kind:'project',project};
 const employee=data.users.find(u=>u.slug===route.employee);
 if(!employee||(!admin&&employee.id!==data.user.id))return null;
 if(!data.assignments.some(a=>a.project_id===project.id&&a.user_id===employee.id)&&!data.tasks.some(t=>t.project_id===project.id&&t.user_id===employee.id))return null;
 if(route.task===undefined)return {kind:'employee',project,employee};
 const matches=data.tasks.filter(t=>t.project_id===project.id&&t.user_id===employee.id&&t.video_id===route.task&&(!route.account||data.accounts.some(a=>a.id===t.account_id&&a.slug===route.account)));
 if(!matches.length)return null;
 return matches.length===1?{kind:'task',project,employee,task:matches[0]}:{kind:'chooser',project,employee,matches};
}
