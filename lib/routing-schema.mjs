import {slugify,uniqueSlug,RESERVED} from './workspace-routes.mjs';
export const ROUTING_SCHEMA = [
 `CREATE TABLE IF NOT EXISTS project_urls (project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE, slug TEXT NOT NULL UNIQUE)`,
 `CREATE TABLE IF NOT EXISTS project_slug_history (slug TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE)`,
 `CREATE TABLE IF NOT EXISTS employee_urls (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, slug TEXT NOT NULL UNIQUE)`,
 `CREATE TABLE IF NOT EXISTS account_urls (account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE, slug TEXT NOT NULL UNIQUE)`
];
// Call inside a write transaction. No existing identifier is ever regenerated.
export async function backfillRoutes(tx) {
 const used=new Set((await tx.execute('SELECT slug FROM project_slug_history')).rows.map(r=>r.slug));
 for(const p of (await tx.execute('SELECT id,name FROM projects WHERE id NOT IN (SELECT project_id FROM project_urls) ORDER BY id')).rows) {
  let base=slugify(p.name); if(RESERVED.has(base))base+='-project'; const slug=uniqueSlug(base,used);used.add(slug);
  await tx.execute({sql:'INSERT INTO project_urls VALUES(?,?)',args:[p.id,slug]});
  await tx.execute({sql:'INSERT INTO project_slug_history VALUES(?,?)',args:[slug,p.id]});
 }
 for(const [source,target,column] of [['users','employee_urls','user_id'],['accounts','account_urls','account_id']]) {
  const occupied=new Set((await tx.execute(`SELECT slug FROM ${target}`)).rows.map(r=>r.slug));
  for(const row of (await tx.execute(`SELECT id,name FROM ${source} WHERE id NOT IN (SELECT ${column} FROM ${target}) ORDER BY id`)).rows) {
   const suffix=String(row.id).replace(/[^a-zA-Z0-9]/g,'').slice(0,8).toLowerCase()||'id';
   const slug=uniqueSlug(slugify(row.name)+'-'+suffix,occupied);occupied.add(slug);
   await tx.execute({sql:`INSERT INTO ${target} VALUES(?,?)`,args:[row.id,slug]});
  }
 }
}
export async function ensureRoutingSchema(client) {
 const tx=await client.transaction('write');
 try {for(const sql of ROUTING_SCHEMA)await tx.execute(sql);await backfillRoutes(tx);await tx.commit();}catch(e){await tx.rollback();throw e;}finally{tx.close();}
}
