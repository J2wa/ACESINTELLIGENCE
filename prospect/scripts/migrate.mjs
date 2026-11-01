import {connect,initialize} from '../core/store.js';
if(process.env.PROSPECT_MIGRATION_APPROVED!=='yes')throw Error('Do not migrate production until founder approves datastore choice and migration. Set PROSPECT_MIGRATION_APPROVED=yes only after approval.');
const db=connect();try{await initialize(db);console.log('Additive prospect_state migration complete; no existing tables or data changed.')}finally{db.close()}
