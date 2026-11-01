import {createHash,timingSafeEqual} from 'node:crypto';
export const ROLES=['founder','va1','va2','ai1','ai2'];
export function authenticate(headers,config=process.env.PROSPECT_SEATS_JSON){
 if(!config)throw Error('Team access is not configured.');let seats;try{seats=JSON.parse(config)}catch{throw Error('Team configuration invalid')};
 const token=String(headers.authorization||'').replace(/^Bearer /,'');if(token.length<24||token.length>256)throw Error('Invalid workspace token.');const hash=createHash('sha256').update(token).digest('hex');
 const seat=seats.find(s=>ROLES.includes(s.role)&&typeof s.tokenHash==='string'&&s.tokenHash.length===64&&timingSafeEqual(Buffer.from(s.tokenHash),Buffer.from(hash))&&!s.disabled);
 if(!seat)throw Error('Invalid workspace token.');return {id:seat.id,role:seat.role};
}
export function sameOrigin(req){if(!req.headers.origin)return true;try{return new URL(req.headers.origin).host===req.headers.host}catch{return false}}
