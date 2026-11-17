import test from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import worker from '../public/_worker.js';
import {runtime} from '../scripts/local-runtime.mjs';
const pass='Only-for-local-tests-Change-This-123!';
const hash='test-salt:'+pbkdf2Sync(pass,'test-salt',100000,32,'sha256').toString('hex');
const origin='https://serene-test.pages.dev';
const vn=ms=>new Date(ms+7*3600000).toISOString().slice(0,16).replace('T',' ');
const inHours=h=>vn(Date.now()+h*3600000);
async function session(env){
 let cookie='',csrf='';
 async function call(path,method='GET',body,options={}){const headers={origin,...(method==='GET'?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{}),...options.headers};return worker.fetch(new Request(origin+'/api/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env)}
 return {call,async login(){const r=await call('login','POST',{email:'serenetravelvn@gmail.com',password:pass});cookie=r.headers.get('set-cookie').split(';')[0];csrf=(await r.json()).csrf}}}
test('Posts API: login required, create, edit, schedule rules, style samples',async()=>{
 const env=await runtime({passwordHash:hash});
 const s=await session(env),call=s.call;
 try{
  assert.equal((await call('posts')).status,401);
  assert.equal((await call('posts','POST',{data:{platform:'FACEBOOK'}})).status,401);
  await s.login();
  assert.deepEqual((await (await call('posts')).json()).posts,[]);
  assert.equal((await call('posts','POST',{data:{platform:'FACEBOOK',body:'x'}},{headers:{'x-csrf-token':'bad'}})).status,403);
  // Validation
  for(const bad of [undefined,{},{platform:'TIKTOK'},{platform:'FACEBOOK',body:5},{platform:'FACEBOOK',body:'a'.repeat(9000)},{platform:'FACEBOOK',image:'https://evil.test/a.jpg'},{platform:'FACEBOOK',scheduled_at:'31/12/2026 10:00'},{platform:'FACEBOOK',scheduled_at:'2026-02-31 10:00'}])assert.equal((await call('posts','POST',{data:bad})).status,400,JSON.stringify(bad));
  // A post written by Claude keeps its original text
  const created=await call('posts','POST',{from_claude:true,data:{platform:'FACEBOOK',body:'Bài gốc của Claude.',source:'Azerai La Residence Huế',stt:'12'}});
  assert.equal(created.status,201);const id=(await created.json()).id;
  let post=(await (await call('posts')).json()).posts[0];
  assert.equal(post.status,'NHÁP');assert.equal(post.kind,'CHỮ THUẦN');assert.equal(post.has_original,true);
  assert.equal('original_body' in post,false);
  // Edit saves a style sample (original vs edited), one per post
  assert.equal((await call('posts/'+id,'PUT',{data:{body:'Bài đã sửa.'}})).status,200);
  assert.equal(env.DB&&(await env.DB.prepare('SELECT original,edited FROM style_samples WHERE post_id=?').bind(id).first()).edited,'Bài đã sửa.');
  assert.equal((await call('posts/'+id,'PUT',{data:{body:'Bài sửa lần hai.'}})).status,200);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM style_samples WHERE post_id=?').bind(id).first()).n,1);
  assert.equal((await env.DB.prepare('SELECT edited,original FROM style_samples WHERE post_id=?').bind(id).first()).original,'Bài gốc của Claude.');
  // Approve needs a time at least 45 minutes ahead
  assert.equal((await call('posts/'+id,'PUT',{action:'approve',data:{}})).status,400);
  assert.equal((await call('posts/'+id,'PUT',{action:'approve',data:{scheduled_at:inHours(0.2)}})).status,400);
  assert.equal((await call('posts/'+id,'PUT',{action:'approve',data:{scheduled_at:vn(Date.now()-3600000)}})).status,400);
  assert.equal((await call('posts/'+id,'PUT',{action:'approve',data:{body:'  ',scheduled_at:inHours(5)}})).status,400);
  const when=inHours(5);
  const ok=await call('posts/'+id,'PUT',{action:'approve',data:{scheduled_at:when}});assert.equal(ok.status,200);assert.equal((await ok.json()).status,'ĐÃ DUYỆT');
  post=(await (await call('posts')).json()).posts[0];assert.equal(post.status,'ĐÃ DUYỆT');assert.equal(post.scheduled_at,when);
  // Scheduled post is locked until unscheduled
  assert.equal((await call('posts/'+id,'PUT',{data:{body:'Sửa khi đang hẹn giờ'}})).status,409);
  assert.equal((await call('posts/'+id,'DELETE')).status,409);
  assert.equal((await call('posts/'+id,'PUT',{action:'unapprove',data:{}})).status,200);
  assert.equal((await (await call('posts')).json()).posts[0].status,'NHÁP');
  assert.equal((await call('posts/'+id,'PUT',{action:'unapprove',data:{}})).status,409);
  // Posts that need a photo must have one
  assert.equal((await call('posts/'+id,'PUT',{data:{image:'/media/abc.jpg'}})).status,200);
  assert.equal((await (await call('posts')).json()).posts[0].kind,'CÓ ẢNH');
  // Several photos: kept in order, max 10, no duplicates, only /media paths
  const ten=Array.from({length:10},(_,i)=>'/media/p'+i+'.jpg');
  assert.equal((await call('posts/'+id,'PUT',{data:{image:ten.join('\n')}})).status,200);
  assert.equal((await (await call('posts')).json()).posts[0].image,ten.join('\n'));
  assert.equal((await call('posts/'+id,'PUT',{data:{image:[...ten,'/media/p10.jpg'].join('\n')}})).status,400);
  assert.equal((await call('posts/'+id,'PUT',{data:{image:'/media/a.jpg\n/media/a.jpg'}})).status,400);
  assert.equal((await call('posts/'+id,'PUT',{data:{image:'/media/a.jpg\nhttps://evil.test/x.jpg'}})).status,400);
  assert.equal((await call('posts/'+id,'PUT',{data:{image:''}})).status,200);
  assert.equal((await (await call('posts')).json()).posts[0].kind,'CHỮ THUẦN');
  // Posted posts are final
  assert.equal((await call('posts/'+id,'PUT',{action:'posted',data:{}})).status,200);
  assert.equal((await call('posts/'+id,'PUT',{data:{body:'Không được sửa'}})).status,409);
  // Unknown ids and bad ids
  assert.equal((await call('posts/Pabcdefg','PUT',{data:{body:'x'}})).status,404);
  assert.equal((await call('posts/not-an-id','DELETE')).status,404);
  assert.equal((await call('posts/'+id,'PUT',{action:'hack',data:{}})).status,400);
  // Delete a draft
  const second=await (await call('posts','POST',{data:{platform:'THREADS',body:'Nháp Threads'}})).json();
  assert.equal((await call('posts/'+second.id,'DELETE')).status,200);
  assert.equal((await (await call('posts')).json()).posts.length,1);
 }finally{env.close()}
});
test('Posts API: approving a Claude draft without edits records "OK nguyên bản"; manual posts record nothing',async()=>{
 const env=await runtime({passwordHash:hash});
 const s=await session(env),call=s.call;
 try{
  await s.login();
  const a=(await (await call('posts','POST',{from_claude:true,data:{platform:'THREADS',body:'Giữ nguyên.',source:'Ibala Nha Trang'}})).json()).id;
  assert.equal((await call('posts/'+a,'PUT',{action:'approve',data:{scheduled_at:inHours(3)}})).status,200);
  const sample=await env.DB.prepare('SELECT * FROM style_samples WHERE post_id=?').bind(a).first();
  assert.equal(sample.note,'OK nguyên bản');assert.equal(sample.original,sample.edited);assert.equal(sample.source,'Ibala Nha Trang');
  const b=(await (await call('posts','POST',{data:{platform:'FACEBOOK',body:'Bài tự viết'}})).json()).id;
  assert.equal((await call('posts/'+b,'PUT',{data:{body:'Bài tự viết, sửa'}})).status,200);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM style_samples WHERE post_id=?').bind(b).first()).n,0);
  // Editing back to the original removes the "edited" sample
  const c=(await (await call('posts','POST',{from_claude:true,data:{platform:'FACEBOOK',body:'Gốc'}})).json()).id;
  await call('posts/'+c,'PUT',{data:{body:'Sửa'}});assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM style_samples WHERE post_id=?').bind(c).first()).n,1);
  await call('posts/'+c,'PUT',{data:{body:'Gốc'}});assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM style_samples WHERE post_id=?').bind(c).first()).n,0);
 }finally{env.close()}
});
test('Posts API: clear message when the tables have not been created yet',async()=>{
 const env=await runtime({passwordHash:hash});
 const s=await session(env);
 try{
  await s.login();
  await env.DB.prepare('DROP TABLE posts').run();
  const r=await s.call('posts');assert.equal(r.status,503);assert.match((await r.json()).error,/schema-posts\.sql/);
 }finally{env.close()}
});
