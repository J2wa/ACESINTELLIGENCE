export const CLAIM_DETAILS_SCHEMA = `CREATE TABLE IF NOT EXISTS task_pool_details (
 pool_id TEXT PRIMARY KEY REFERENCES task_pool(id) ON DELETE CASCADE,
 english_subtitles INTEGER CHECK(english_subtitles IN (0,1)),
 extension_hours INTEGER, extension_reason TEXT, extension_status TEXT,
 requested_by TEXT REFERENCES users(id)
)`;
const initialized=new WeakMap();
export async function ensureClaimDetailsSchema(client){
 if(!initialized.has(client))initialized.set(client,client.execute(CLAIM_DETAILS_SCHEMA).catch(e=>{initialized.delete(client);throw e;}));
 await initialized.get(client);
}
