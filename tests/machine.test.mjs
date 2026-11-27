import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,pbkdf2Sync} from 'node:crypto';
import worker from '../public/_worker.js/index.js';
import {runtime} from '../scripts/local-runtime.mjs';
const origin='https://serene-test.pages.dev';
const pass='Only-for-local-tests-Change-This-123!';
const hash='test-salt:'+pbkdf2Sync(pass,'test-salt',100000,32,'sha256').toString('hex');
const claudeKey='C'.repeat(43),makeKey='M'.repeat(43);
const sha=s=>createHash('sha256').update(s).digest('hex');
const vn=ms=>new Date(ms+7*3600000).toISOString().slice(0,16).replace('T',' ');
function mcall(env,path,method='GET',body,key,type='application/json'){
 const headers={...(key?{authorization:'Bearer '+key}:{}),...(body!==undefined?{'content-type':type}:{})};
 return worker.fetch(new Request(origin+'/api/machine/'+path,{method,headers,body:body===undefined?undefined:(type==='application/json'?JSON.stringify(body):body)}),env)}
test('Machine API: keys, scopes, drafts from Claude, due list and results for Make',async()=>{
 const env=await runtime({passwordHash:hash});
 try{
  const now=new Date().toISOString();
  await env.DB.prepare('INSERT INTO machine_tokens(name,scope,hash,created) VALUES(?,?,?,?)').bind('claude','claude',sha(claudeKey),now).run();
  await env.DB.prepare('INSERT INTO machine_tokens(name,scope,hash,created) VALUES(?,?,?,?)').bind('make','make',sha(makeKey),now).run();
  // No key / wrong key / cookie-less browser
  assert.equal((await mcall(env,'posts')).status,401);
  assert.equal((await mcall(env,'posts','GET',undefined,'X'.repeat(43))).status,401);
  assert.equal((await mcall(env,'posts','GET',undefined,'short')).status,401);
  // Scopes: Make cannot create or read drafts, Claude cannot read due or report results
  assert.equal((await mcall(env,'posts','POST',{platform:'FACEBOOK',body:'x'},makeKey)).status,404);
  assert.equal((await mcall(env,'due','GET',undefined,claudeKey)).status,404);
  // Claude creates a draft (waiting for review) with two photos, keeps the original
  const up=await mcall(env,'upload','POST',Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.from('rest')]),claudeKey,'image/png');
  assert.equal(up.status,200);const url=(await up.json()).url;assert.match(url,/^\/media\//);
  assert.equal((await mcall(env,'upload','POST',Buffer.from('not an image'),claudeKey,'image/png')).status,400);
  const made=await mcall(env,'posts','POST',{platform:'FACEBOOK',body:'Bài do Claude soạn',source:'Amiana',image:[url,'/media/b.jpg']},claudeKey);
  assert.equal(made.status,201);const id=(await made.json()).id;
  assert.equal((await mcall(env,'posts','POST',{platform:'FACEBOOK',image:'https://evil.test/a.jpg'},claudeKey)).status,400);
  assert.equal((await mcall(env,'posts','POST',{platform:'TIKTOK'},claudeKey)).status,400);
  // Status cannot be forced from outside: always a draft
  const forced=await mcall(env,'posts','POST',{platform:'FACEBOOK',body:'y',status:'ĐÃ DUYỆT',scheduled_at:vn(Date.now()+5*3600000)},claudeKey);
  assert.equal(forced.status,201);
  const list=await (await mcall(env,'posts','GET',undefined,claudeKey)).json();
  assert.equal(list.posts.length,2);assert.ok(list.posts.every(p=>p.status==='NHÁP'));
  // Nothing is due until the post is approved
  assert.deepEqual((await (await mcall(env,'due','GET',undefined,makeKey)).json()).posts,[]);
  const row=await env.DB.prepare('SELECT original_body,image FROM posts WHERE id=?').bind(id).first();
  assert.equal(row.original_body,'Bài do Claude soạn');assert.equal(row.image,url+'\n/media/b.jpg');
  // Approve like the web page does, then Make sees it
  const when=vn(Date.now()+5*3600000);
  await env.DB.prepare("UPDATE posts SET status='ĐÃ DUYỆT',scheduled_at=? WHERE id=?").bind(when,id).run();
  const due=await (await mcall(env,'due','GET',undefined,makeKey)).json();
  assert.equal(due.posts.length,1);assert.equal(due.posts[0].id,id);assert.equal(due.posts[0].scheduled_at,when);
  assert.deepEqual(due.posts[0].images,[origin+url,origin+'/media/b.jpg']);
  assert.deepEqual(due.posts[0].photos,[{type:'url',url:origin+url},{type:'url',url:origin+'/media/b.jpg'}]);
  assert.ok(Math.abs(Date.parse(due.posts[0].scheduled_at_iso)-(Date.now()+5*3600000))<120000);
  // Result: success, repeat is harmless, unknown id, error path
  assert.equal((await mcall(env,'result/'+id,'POST',{ok:true,post_url:'https://facebook.com/x/1'},makeKey)).status,200);
  assert.equal((await mcall(env,'result/'+id,'POST',{ok:false,error:'late'},makeKey)).status,200);
  const done=await env.DB.prepare('SELECT status,post_url FROM posts WHERE id=?').bind(id).first();
  assert.equal(done.status,'ĐÃ ĐĂNG');assert.equal(done.post_url,'https://facebook.com/x/1');
  assert.equal((await mcall(env,'result/Pabcdefg','POST',{ok:true},makeKey)).status,404);
  const second=(await (await mcall(env,'posts','GET',undefined,claudeKey)).json()).posts.find(p=>p.id!==id).id;
  assert.equal((await mcall(env,'result/'+second,'POST',{ok:true},makeKey)).status,409);
  await env.DB.prepare("UPDATE posts SET status='ĐÃ DUYỆT',scheduled_at=? WHERE id=?").bind(when,second).run();
  assert.equal((await mcall(env,'result/'+second,'POST',{ok:false,error:'Token hết hạn'},makeKey)).status,200);
  const bad=await env.DB.prepare('SELECT status,error FROM posts WHERE id=?').bind(second).first();
  assert.equal(bad.status,'LỖI');assert.equal(bad.error,'Token hết hạn');
  // Style samples readable by Claude only
  await env.DB.prepare('INSERT INTO style_samples(post_id,day,platform,source,original,edited,note,updated) VALUES(?,?,?,?,?,?,?,?)').bind('Pstyle01','2026-11-17','FACEBOOK','A','gốc','sửa','',now).run();
  assert.equal((await (await mcall(env,'style','GET',undefined,claudeKey)).json()).samples.length,1);
  assert.equal((await mcall(env,'style','GET',undefined,makeKey)).status,404);
 }finally{env.close()}
});
