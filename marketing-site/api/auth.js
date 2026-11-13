import {handleAuth,configured,LOGIN} from '../lib/team-auth.js';
export default {fetch(request){
 const url=new URL(request.url);
 if(url.pathname==='/api/auth-status') return Response.json({configured:configured()},{headers:{'Cache-Control':'no-store'}});
 return handleAuth(request);
}};
