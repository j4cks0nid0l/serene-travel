import test from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import worker from '../public/_worker.js';
import {runtime} from '../scripts/local-runtime.mjs';
const pass='Only-for-local-tests-Change-This-123!';
const hash='test-salt:'+pbkdf2Sync(pass,'test-salt',100000,32,'sha256').toString('hex');
const origin='https://serene-test.pages.dev';
const KEY='test-access-key-not-real';
const order=(id,extra={})=>({id,name:'Khách thử',phone:'0900000000',guests:'',svcs:[{name:'Phòng',price:1000000,qty1:1,unit1:'phòng',qty2:1,unit2:'đêm',total:1000000}],totalAmt:1000000,created:'14/11/2026',payments:[],status:'pending',...extra});
test('Booking API (own database): login + CSRF, one row per order, no overwrite, validation',async()=>{
 const env=await runtime({passwordHash:hash});
 let cookie='',csrf='';
 async function call(path,method='GET',body,options={}){const headers={origin,...(method==='GET'?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{}),...options.headers};return worker.fetch(new Request(origin+'/api/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env)}
 try{
  // Not logged in: nothing readable or writable
  assert.equal((await call('booking')).status,401);
  assert.equal((await call('booking','POST',{booking:order('ST26111401')})).status,401);
  assert.equal((await call('booking/ST26111401','DELETE')).status,401);
  const login=await call('login','POST',{email:'serenetravelvn@gmail.com',password:pass});assert.equal(login.status,200);
  cookie=login.headers.get('set-cookie').split(';')[0];csrf=(await login.json()).csrf;
  // Empty at first
  assert.deepEqual((await (await call('booking')).json()).bookings,[]);
  // CSRF is required to write
  assert.equal((await call('booking','POST',{booking:order('ST26111401')},{headers:{'x-csrf-token':'bad'}})).status,403);
  // Create two orders; order of creation is kept
  assert.equal((await call('booking','POST',{booking:order('ST26111401')})).status,201);
  assert.equal((await call('booking','POST',{booking:order('ST26111402',{name:'Khách hai'})})).status,201);
  let list=(await (await call('booking')).json()).bookings;assert.deepEqual(list.map(x=>x.id),['ST26111401','ST26111402']);
  // The same id can never overwrite an existing order
  const dup=await call('booking','POST',{booking:order('ST26111401',{name:'Người khác'})});assert.equal(dup.status,409);
  assert.equal((await (await call('booking')).json()).bookings[0].name,'Khách thử');
  // Update one order only
  assert.equal((await call('booking/ST26111402','PUT',{booking:order('ST26111402',{name:'Khách hai (sửa)',status:'partial'})})).status,200);
  list=(await (await call('booking')).json()).bookings;assert.equal(list[1].name,'Khách hai (sửa)');assert.equal(list[0].name,'Khách thử');
  // Update of a missing order, or id that does not match the URL
  assert.equal((await call('booking/ST26111499','PUT',{booking:order('ST26111499')})).status,404);
  assert.equal((await call('booking/ST26111401','PUT',{booking:order('ST26111402')})).status,400);
  // Invalid data is refused
  for(const bad of [undefined,'x',[],{...order('ST26111403'),id:'abc'},{...order('ST26111403'),svcs:'no'},{...order('ST26111403'),totalAmt:'1'},{...order('ST26111403'),payments:[{amount:'x'}]},{...order('ST26111403'),name:'a'.repeat(300)}])assert.equal((await call('booking','POST',{booking:bad})).status,400);
  assert.equal((await call('booking/not-an-id','DELETE')).status,404);
  // Delete
  assert.equal((await call('booking/ST26111401','DELETE')).status,200);
  assert.deepEqual((await (await call('booking')).json()).bookings.map(x=>x.id),['ST26111402']);
  // Booking data lives in its own database, not in website content
  assert.equal((await (await call('public')).json()).items.length>=0,true);
  assert.equal((await env.DB.prepare("SELECT name FROM sqlite_master WHERE name='bookings'").first()),null);
  // Not connected: fail closed
  const bare={...env};delete bare.BOOKINGS;
  assert.equal((await worker.fetch(new Request(origin+'/api/booking',{headers:{origin,cookie}}),bare)).status,503);
 }finally{env.close()}
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
