import {authenticate,sameOrigin} from '../core/auth.js';
import {connect,read,write} from '../core/store.js';
import {apply,report,callBrief} from '../core/crm.js';
import {FACT_SHEET} from '../core/prompts.js';
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');if(!sameOrigin(req))return res.status(403).json({error:'Origin not allowed'});let actor;try{actor=authenticate(req.headers)}catch(e){return res.status(401).json({error:e.message})}let client;try{client=connect();const {state,revision}=await read(client);state.config.approvedClaims=FACT_SHEET.approvedClaims;
 if(req.method==='GET')return res.json({actor,state,revision,report:report(state),sendingEnabled:false});
 if(req.method!=='POST')return res.status(405).json({error:'GET or POST required'});
 const b=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!b||JSON.stringify(b).length>250000)return res.status(400).json({error:'Invalid or oversized request'});
 if(b.type==='brief'){const lead=state.leads.find(l=>l.id===b.leadId);if(!lead)return res.status(404).json({error:'Lead not found'});return res.json({brief:callBrief(lead,new Date().toISOString())})}
 if(b.revision!==revision)return res.status(409).json({error:'CRM changed. Reload before applying this operation.'});
 const updated=apply(state,b,actor);const next=await write(client,revision,updated);return res.json({state:updated,revision:next,actor,report:report(updated),sendingEnabled:false});
 }catch(e){const msg=e.message;return res.status(/configured|migration/.test(msg)?503:400).json({error:/SQL|token|database.*failed/i.test(msg)?'CRM unavailable. Check server configuration.':msg})}finally{client?.close()}}
