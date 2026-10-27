import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import worker from '../public/_worker.js';
import {runtime,root} from './local-runtime.mjs';
await mkdir(resolve(root,'.wrangler'),{recursive:true});let secret=process.env.ADMIN_PASSWORD_HASH||'';
try{const vars=await readFile(resolve(root,'.dev.vars'),'utf8');secret=secret||/^ADMIN_PASSWORD_HASH\s*=\s*"?([^"\r\n]+)"?$/m.exec(vars)?.[1]||''}catch{}
const env=await runtime({database:resolve(root,'.wrangler/local.sqlite'),mediaDir:resolve(root,'.wrangler/media'),passwordHash:secret});
createServer(async(req,res)=>{try{const chunks=[];for await(const b of req)chunks.push(b);const body=Buffer.concat(chunks);const request=new Request('http://127.0.0.1:8788'+req.url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:body});const response=await worker.fetch(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))}catch{res.writeHead(500);res.end('Local server error')}}).listen(8788,'127.0.0.1',()=>console.log('Serene local preview: http://127.0.0.1:8788 ; admin: /admin/'));
