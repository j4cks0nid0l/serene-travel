import test from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import worker from '../public/_worker.js';
import {runtime} from '../scripts/local-runtime.mjs';
const pass='Only-for-local-tests-Change-This-123!';
const hash='test-salt:'+pbkdf2Sync(pass,'test-salt',100000,32,'sha256').toString('hex');
const origin='https://serene-test.pages.dev';
const KEY='test-access-key-not-real';
test('Booking API: needs login and CSRF, validates data, keeps the key on the server',async()=>{
 const env=await runtime({passwordHash:hash});env.JSONBIN_KEY=KEY;env.JSONBIN_BIN_ID='abcdef123456';
 let cookie='',csrf='';const calls=[];let stored={bookings:[{id:'ST26111401',name:'Khách thử'}]};
 const realFetch=globalThis.fetch;
 globalThis.fetch=async(url,init={})=>{calls.push({url:String(url),method:init.method||'GET',key:init.headers?.['X-Access-Key']});
  if(String(url).startsWith('https://api.jsonbin.io/v3/b/abcdef123456')){if(init.method==='PUT'){stored=JSON.parse(init.body);return new Response('{}',{status:200})}return new Response(JSON.stringify({record:stored}),{status:200})}
  throw Error('Unexpected outbound request: '+url)};
 try{
  async function call(path,method='GET',body,options={}){const headers={origin,...(method==='GET'?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{}),...options.headers};return worker.fetch(new Request(origin+'/api/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env)}
  // Not logged in: no read, no write, and nothing leaves the server
  assert.equal((await call('booking')).status,401);
  assert.equal((await call('booking','PUT',{bookings:[]})).status,401);
  assert.equal(calls.length,0);
  const login=await call('login','POST',{email:'serenetravelvn@gmail.com',password:pass});assert.equal(login.status,200);
  cookie=login.headers.get('set-cookie').split(';')[0];csrf=(await login.json()).csrf;
  // Read
  const got=await call('booking');assert.equal(got.status,200);const body=await got.text();assert.ok(!body.includes(KEY));assert.deepEqual(JSON.parse(body).bookings,stored.bookings);
  assert.equal(calls.at(-1).key,KEY);
  // Write needs the CSRF token
  assert.equal((await call('booking','PUT',{bookings:[]},{headers:{'x-csrf-token':'bad'}})).status,403);
  // Invalid data is refused before reaching the store
  const before=calls.length;
  assert.equal((await call('booking','PUT',{bookings:'nope'})).status,400);
  assert.equal((await call('booking','PUT',{bookings:[1,2]})).status,400);
  assert.equal((await call('booking','PUT',{})).status,400);
  assert.equal(calls.length,before);
  // Valid write
  const next=[{id:'ST26111401',name:'Khách thử'},{id:'ST26111402',name:'Khách hai'}];
  assert.equal((await call('booking','PUT',{bookings:next})).status,200);assert.deepEqual(stored.bookings,next);
  // Unsupported method
  assert.equal((await call('booking','DELETE',{})).status,405);
  // Store failure is reported, not hidden
  globalThis.fetch=async()=>new Response('{}',{status:500});
  assert.equal((await call('booking')).status,502);
  assert.equal((await call('booking','PUT',{bookings:next})).status,502);
  // Missing settings fail closed
  delete env.JSONBIN_KEY;assert.equal((await call('booking')).status,503);
 }finally{globalThis.fetch=realFetch;env.close()}
});
test('Booking page gets the extra CSP; the rest of /admin and the site keep the strict one',async()=>{
 const env=await runtime({passwordHash:hash});env.ASSETS={fetch:async()=>new Response('ok',{headers:{'content-type':'text/html'}})};
 const csp=async p=>(await worker.fetch(new Request(origin+p),env)).headers.get('content-security-policy');
 const booking=await csp('/admin/booking/');assert.match(booking,/img\.vietqr\.io/);assert.match(booking,/cdn\.jsdelivr\.net/);
 for(const p of ['/','/admin/','/admin/admin.js']){const c=await csp(p);assert.ok(!c.includes('vietqr')&&!c.includes('jsdelivr'),p)}
 env.close()});
test('QR proxy: needs login, checks input, only talks to VietQR',async()=>{
 const env=await runtime({passwordHash:hash});
 let cookie='';const urls=[];const realFetch=globalThis.fetch;
 globalThis.fetch=async url=>{urls.push(String(url));return new Response(new Uint8Array([137,80,78,71]),{status:200,headers:{'content-type':'image/png'}})};
 try{
  const call=(path)=>worker.fetch(new Request(origin+'/api/'+path,{headers:{origin,...(cookie?{cookie}:{})}}),env);
  assert.equal((await call('booking-qr?amount=1000&info=ST1')).status,401);assert.equal(urls.length,0);
  const login=await worker.fetch(new Request(origin+'/api/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:'serenetravelvn@gmail.com',password:pass})}),env);
  cookie=login.headers.get('set-cookie').split(';')[0];
  const ok=await call('booking-qr?amount=1700000&info=ST26092901');assert.equal(ok.status,200);assert.equal(ok.headers.get('content-type'),'image/png');
  assert.match(urls[0],/^https:\/\/img\.vietqr\.io\/image\/970422-0327818196-compact2\.png\?/);assert.match(urls[0],/amount=1700000/);assert.match(urls[0],/addInfo=ST26092901/);
  const before=urls.length;
  for(const bad of ['amount=abc&info=x','amount=1&info=%3Cscript%3E','amount=99999999999&info=x','amount=1&info='+'a'.repeat(51)])assert.equal((await call('booking-qr?'+bad)).status,400,bad);
  assert.equal(urls.length,before);
  globalThis.fetch=async()=>new Response('{}',{status:500});assert.equal((await call('booking-qr?amount=1&info=ST1')).status,502);
  globalThis.fetch=async()=>new Response('<html>',{status:200,headers:{'content-type':'text/html'}});assert.equal((await call('booking-qr?amount=1&info=ST1')).status,502);
 }finally{globalThis.fetch=realFetch;env.close()}
});
