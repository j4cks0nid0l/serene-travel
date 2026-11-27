import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,pbkdf2Sync} from 'node:crypto';
import worker from '../public/_worker.js/index.js';
import {runtime} from '../scripts/local-runtime.mjs';
const origin='https://serene-test.pages.dev';
const hash='test-salt:'+pbkdf2Sync('x','test-salt',100000,32,'sha256').toString('hex');
const clockKey='K'.repeat(43),makeKey='M'.repeat(43);
const sha=s=>createHash('sha256').update(s).digest('hex');
const vn=ms=>new Date(ms+7*3600000).toISOString().slice(0,16).replace('T',' ');
const call=(env,path,method,key)=>worker.fetch(new Request(origin+'/api/machine/'+path,{method,headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:method==='POST'?JSON.stringify({ok:true,post_url:'https://facebook.com/1'}):undefined}),env);
async function add(env,id,status,at,extra={}){
 const t=new Date().toISOString();
 await env.DB.prepare('INSERT INTO posts(id,platform,kind,body,image,scheduled_at,status,created,updated) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,'FACEBOOK',extra.image?'CÓ ẢNH':'CHỮ THUẦN','Nội dung '+id,extra.image||'',at,status,t,extra.updated||t).run()}
const status=async(env,id)=>(await env.DB.prepare('SELECT status,error FROM posts WHERE id=?').bind(id).first());
test('Tick: đăng thẳng bài tới giờ, không gửi trùng, xử lý lỗi',async()=>{
 const env=await runtime({passwordHash:hash});
 const realFetch=globalThis.fetch,sent=[];let reply=200;
 globalThis.fetch=async(url,init)=>{sent.push({url,body:JSON.parse(init.body)});return new Response('Accepted',{status:reply})};
 try{
  const t=new Date().toISOString();
  await env.DB.prepare('INSERT INTO machine_tokens(name,scope,hash,created) VALUES(?,?,?,?)').bind('clock','clock',sha(clockKey),t).run();
  await env.DB.prepare('INSERT INTO machine_tokens(name,scope,hash,created) VALUES(?,?,?,?)').bind('make','make',sha(makeKey),t).run();
  // Quyền: đồng hồ chỉ gọi tick; Make không gọi được tick
  assert.equal((await call(env,'tick','POST',makeKey)).status,404);
  assert.equal((await call(env,'due','GET',clockKey)).status,404);
  assert.equal((await worker.fetch(new Request(origin+'/api/machine/tick',{method:'POST'}),env)).status,401);
  // Chưa cài địa chỉ Make: không đụng vào bài nào
  await add(env,'Pdue0001','ĐÃ DUYỆT',vn(Date.now()-60000),{image:'/media/a.jpg\n/media/b.jpg'});
  assert.equal((await call(env,'tick','POST',clockKey)).status,503);
  assert.equal((await status(env,'Pdue0001')).status,'ĐÃ DUYỆT');
  env.MAKE_WEBHOOK_URL='https://hook.make.test/abc';
  await add(env,'Pfuture1','ĐÃ DUYỆT',vn(Date.now()+3600000));
  await add(env,'Pdraft01','NHÁP',vn(Date.now()-60000));
  await add(env,'Pold0001','ĐÃ DUYỆT',vn(Date.now()-2*3600000));
  await add(env,'Pstuck01','ĐANG ĐĂNG',vn(Date.now()-3600000),{updated:new Date(Date.now()-20*60000).toISOString()});
  await add(env,'Pbusy001','ĐANG ĐĂNG',vn(Date.now()-60000));
  let r=await (await call(env,'tick','POST',clockKey)).json();
  assert.deepEqual(r,{ok:true,sent:1,expired:1,stuck:1,failed:0});
  assert.equal(sent.length,1);assert.equal(sent[0].url,'https://hook.make.test/abc');
  assert.equal(sent[0].body.id,'Pdue0001');assert.equal(sent[0].body.kind,'CÓ ẢNH');
  assert.deepEqual(sent[0].body.photos,[{type:'url',url:origin+'/media/a.jpg'},{type:'url',url:origin+'/media/b.jpg'}]);
  assert.equal((await status(env,'Pdue0001')).status,'ĐANG ĐĂNG');
  assert.equal((await status(env,'Pfuture1')).status,'ĐÃ DUYỆT');
  assert.equal((await status(env,'Pdraft01')).status,'NHÁP');
  assert.equal((await status(env,'Pold0001')).status,'LỖI');
  assert.equal((await status(env,'Pstuck01')).status,'LỖI');
  assert.equal((await status(env,'Pbusy001')).status,'ĐANG ĐĂNG');
  // Phút sau: không gửi lại bài đang đăng
  r=await (await call(env,'tick','POST',clockKey)).json();assert.equal(r.sent,0);assert.equal(sent.length,1);
  // Make báo kết quả
  assert.equal((await call(env,'result/Pdue0001','POST',makeKey)).status,200);
  assert.equal((await status(env,'Pdue0001')).status,'ĐÃ ĐĂNG');
  // Make từ chối: bài quay về hàng chờ để thử lại phút sau
  await add(env,'Pretry01','ĐÃ DUYỆT',vn(Date.now()-60000));
  reply=500;r=await (await call(env,'tick','POST',clockKey)).json();
  assert.equal(r.failed,1);assert.equal((await status(env,'Pretry01')).status,'ĐÃ DUYỆT');
  reply=200;r=await (await call(env,'tick','POST',clockKey)).json();
  assert.equal(r.sent,1);assert.equal((await status(env,'Pretry01')).status,'ĐANG ĐĂNG');
  // Quá thời gian chờ Make: không tự thử lại (tránh đăng đôi)
  await add(env,'Ptimeou1','ĐÃ DUYỆT',vn(Date.now()-60000));
  globalThis.fetch=async()=>{throw new DOMException('timeout','TimeoutError')};
  r=await (await call(env,'tick','POST',clockKey)).json();
  assert.equal(r.failed,1);assert.equal((await status(env,'Ptimeou1')).status,'LỖI');
 }finally{globalThis.fetch=realFetch;env.close()}
});
