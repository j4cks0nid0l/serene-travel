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
