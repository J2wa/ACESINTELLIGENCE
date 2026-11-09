import {createClient} from '@libsql/client';
import {writeBackup,restoreBackup} from '../lib/backup.mjs';
const [action,source,target]=process.argv.slice(2);
if(action==='restore'&&source&&target) console.log(restoreBackup(source,target));
else if(action==='create'&&source) {
 if(!process.env.TURSO_DATABASE_URL) throw new Error('Set TURSO_DATABASE_URL to the backup source.');
 const client=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN,intMode:'bigint'});
 try{console.log(await writeBackup(client,source));}finally{client.close();}
} else throw new Error('Usage: backup.mjs create NEW_BACKUP.json | restore BACKUP.json NEW_LOCAL.db');
