import {NextResponse,type NextRequest} from 'next/server';
import {workspacePageAccess} from './lib/workspace-page-access';
export async function proxy(request:NextRequest){
 const response=await workspacePageAccess(request);
 return response??NextResponse.next();
}
export const config={matcher:['/((?!api(?:/|$)|login(?:/|$)|_next(?:/|$)|_vercel(?:/|$)|favicon\\.svg$|aces-logo(?:-dark)?\\.svg$).+)']};
