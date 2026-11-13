import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {handleSubmission} from '../lib/submissions.js';
import {handleEvents} from '../api/events.js';
const root=new URL('../public/',import.meta.url).pathname;
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost'),name=decodeURIComponent(url.pathname);
  if(name==='/api/submit'||name==='/api/events'){
   const request=new Request(url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:req,duplex:'half'})});
   const result=await(name==='/api/submit'?handleSubmission(request):handleEvents(request));res.writeHead(result.status,Object.fromEntries(result.headers));return res.end(Buffer.from(await result.arrayBuffer()));
  }
  const relative=name==='/'?'index.html':name.slice(1)+(path.extname(name)?'':'.html'),file=path.resolve(root,relative);
  if(!file.startsWith(root))throw Error('invalid_path');
  const body=await fs.readFile(file),type={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml','.png':'image/png','.xml':'application/xml','.txt':'text/plain'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'Content-Type':type});res.end(body);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(Number(process.env.PORT||process.argv[process.argv.indexOf('--port')+1])||3000,'0.0.0.0',()=>console.log('Marketing preview ready'));
