import {DatabaseSync} from 'node:sqlite';
import {writeFileSync,readFileSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
const quote = name => '"'+name.replaceAll('"','""')+'"';
const encode = value => typeof value === 'bigint' ? {$integer:String(value)} : value instanceof ArrayBuffer || ArrayBuffer.isView(value) ? {$blob:Buffer.from(value instanceof ArrayBuffer?value:value.buffer,value.byteOffset??0,value.byteLength).toString('base64')} : value;
const decode = value => value && typeof value==='object' ? '$blob' in value ? Buffer.from(value.$blob,'base64') : '$integer' in value ? BigInt(value.$integer) : value : value;
const digest = payload => createHash('sha256').update(JSON.stringify(payload)).digest('hex');
// Read-only consistent snapshot. No production migrations or writes.
export async function writeBackup(client, destination) {
  const tx = await client.transaction('read');
  try {
    const schema = (await tx.execute("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name")).rows.map(row=>({type:row.type,name:row.name,sql:row.sql}));
    const tables=[];
    for(const table of schema.filter(row=>row.type==='table')) {
      const result=await tx.execute('SELECT * FROM '+quote(table.name));
      tables.push({name:table.name,columns:result.columns,rows:result.rows.map(row=>result.columns.map(column=>encode(row[column])))});
    }
    const payload={format:'workhub-logical-backup-v1',schema,tables};
    writeFileSync(destination,JSON.stringify({checksum:digest(payload),payload}),{flag:'wx',mode:0o600});
    await tx.commit();
    return {tables:tables.length,rows:tables.reduce((n,t)=>n+t.rows.length,0)};
  } catch(error) {await tx.rollback();throw error;} finally {tx.close();}
}
// Restores ONLY to a new local SQLite file. Never overwrite or target a remote DB.
export function restoreBackup(source, destination) {
  if(/^[a-z]+:/i.test(destination)) throw new Error('Restore requires a new local file path.');
  const envelope=JSON.parse(readFileSync(source,'utf8'));
  const {payload,checksum}=envelope;
  if(payload?.format!=='workhub-logical-backup-v1'||digest(payload)!==checksum) throw new Error('Backup checksum or format is invalid.');
  closeSync(openSync(destination,'wx',0o600));
  const db=new DatabaseSync(destination);
  try {
    db.exec('PRAGMA foreign_keys=OFF; BEGIN');
    for(const item of payload.schema.filter(row=>row.type==='table')) db.exec(item.sql);
    for(const table of payload.tables) {
      const insert=db.prepare('INSERT INTO '+quote(table.name)+'('+table.columns.map(quote).join(',')+') VALUES('+table.columns.map(()=>'?').join(',')+')');
      for(const row of table.rows) insert.run(...row.map(decode));
      if(Number(db.prepare('SELECT count(*) n FROM '+quote(table.name)).get().n)!==table.rows.length) throw new Error('Restore row count mismatch.');
    }
    for(const item of payload.schema.filter(row=>row.type!=='table')) db.exec(item.sql);
    if(db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Restored foreign keys are invalid.');
    if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok') throw new Error('Restored integrity check failed.');
    db.exec('COMMIT; PRAGMA foreign_keys=ON');
    return {tables:payload.tables.length,rows:payload.tables.reduce((n,t)=>n+t.rows.length,0)};
  } catch(error) {try{db.exec('ROLLBACK');}catch{}db.close();unlinkSync(destination);throw error;}
  finally {try{db.close();}catch{}}
}
