import {authenticate,sameOrigin} from '../core/auth.js';
import {linkedinInput,startLinkedIn,getLinkedIn} from '../core/linkedin.js';
import {connect} from '../core/store.js';
import {reserveRun,recordRun,ownedRun} from '../core/provider-runs.js';
export function createLinkedInHandler(deps={}){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'POST required'});if(!sameOrigin(req))return res.status(403).json({error:'Origin not allowed'});
 let actor;try{actor=(deps.authenticate||authenticate)(req.headers)}catch{return res.status(401).json({error:'Valid research seat required'})}if(!['founder','ai1'].includes(actor.role))return res.status(403).json({error:'Research seat required'});
 let db;try{const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{};const env=deps.env||process.env;const config={enabled:env.PROSPECT_LIVE_PROVIDERS==='true',actor:env.APIFY_LINKEDIN_ACTOR_ID,token:env.APIFY_TOKEN};
 if(b.action==='validate')return res.json({input:linkedinInput(b.urls),liveEnabled:config.enabled,configured:!!config.actor&&!!config.token});
 if(!config.enabled||!config.token||!config.actor)throw Error('Configure and enable the LinkedIn provider in Vercel first.');
 if(!['start','status'].includes(b.action))throw Error('Unknown provider action');
 if(b.action==='start'){linkedinInput(b.urls);if(b.confirmPaidRun!==true)throw Error('Explicit paid run confirmation required.');db=(deps.connect||connect)();const reservation=await reserveRun(db,b.requestId,actor.id);if(reservation.existing)return res.json({reused:true,status:reservation.run.status,runId:reservation.run.run_id,notice:'This request was already recorded. An unknown result must be reconciled before starting another request.'});
 let result;try{result=await (deps.startLinkedIn||startLinkedIn)(b.urls,config)}catch{await recordRun(db,b.requestId,'unknown');return res.status(502).json({error:'Provider start could not be confirmed. Check Apify before retrying; this request ID will not start another paid run.'})}
 await recordRun(db,b.requestId,result.status,result.runId);return res.json(result);
 }
 db=(deps.connect||connect)();await ownedRun(db,b.runId,actor);return res.json(await (deps.getLinkedIn||getLinkedIn)(b.runId,config));
 }catch(e){const safe=/request|Request|Hourly|Run not found|Provide|Only canonical|Explicit|Configure|Unknown provider/.test(e.message);return res.status(400).json({error:safe?e.message:'Provider operation unavailable. Check workspace configuration.'})}finally{db?.close()}
}}
export default createLinkedInHandler();
