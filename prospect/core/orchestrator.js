import {apply} from './crm.js';
// Provider-neutral dry-run orchestration. A production scheduler must persist checkpoints
// after each provider result before enabling paid integrations.
export async function dailyBatch(state,date,providers,now=new Date().toISOString()){
 const key=`research:${date}`;if(state.jobs.some(j=>j.key===key&&j.status==='completed'))return state;
 let s=structuredClone(state),actor={id:'ai1-job',role:'ai1'};
 for(const [track,limit] of [['A',35],['B',15]]){
  const candidates=await providers.discover({track,limit,date});s=apply(s,{type:'import',leads:candidates.slice(0,limit).map(l=>({...l,track}))},actor,now);
 }
 for(const l of s.leads.filter(l=>l.stage==='Target'&&l.workable&&!l.doNotContact)){
  const v=await providers.verify(l);if(!v?.verified)continue;
  try{s=apply(s,{type:'verify',leadId:l.id,emailStatus:'verified',evidence:v.evidence,linkedinConfirmed:v.linkedinConfirmed,linkedinActive:v.linkedinActive},actor,now);s=apply(s,{type:'advance',leadId:l.id,stage:'Verified'},actor,now);s=apply(s,{type:'draft',leadId:l.id},{id:'ai2-job',role:'ai2'},now)}catch(error){s.events.push({id:crypto.randomUUID(),type:'verification-held',leadId:l.id,at:now,actor:actor.id,reason:error.message})}
 }
 s.jobs.push({key,status:'completed',at:now,mode:'provider-injected; no built-in live scheduler'});return s;
}
