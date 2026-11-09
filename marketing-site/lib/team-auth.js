import { Auth } from '@auth/core';
import Google from '@auth/core/providers/google';
export const LOGIN = 'https://login.acesintelligence.xyz';
export const WORKPLACE = 'https://workplace.acesintelligence.xyz';
const allowed = new Set((process.env.AUTH_ALLOWED_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean));
export function allowedProfile(profile) { return profile?.email_verified === true && typeof profile.email === 'string' && allowed.has(profile.email.toLowerCase()); }
export function configured(env=process.env) { return Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET && env.AUTH_SECRET); }
export async function handleAuth(request) {
 const url = new URL(request.url);
 if(url.origin !== LOGIN) return new Response('Use the team login domain.',{status:403});
 if(!configured()) return Response.json({error:'Google sign-in is awaiting configuration.'},{status:503,headers:{'Cache-Control':'no-store'}});
 return Auth(request, {basePath:'/api/auth',trustHost:true,secret:process.env.AUTH_SECRET,session:{strategy:'jwt',maxAge:28800},providers:[Google({clientId:process.env.AUTH_GOOGLE_ID,clientSecret:process.env.AUTH_GOOGLE_SECRET,authorization:{params:{scope:'openid email profile',prompt:'select_account'}}})],callbacks:{signIn:({account,profile})=>account?.provider==='google' && allowedProfile(profile),redirect:({url})=>url===WORKPLACE?WORKPLACE:LOGIN},pages:{error:LOGIN+'/team-login?error=signin'},logger:{error:()=>console.error('team_auth_failed')}});
}
