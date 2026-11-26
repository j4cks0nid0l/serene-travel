import test from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import worker from '../public/_worker.js';
import {runtime} from '../scripts/local-runtime.mjs';
const pass='Only-for-local-tests-Change-This-123!';
const hash='test-salt:'+pbkdf2Sync(pass,'test-salt',100000,32,'sha256').toString('hex');
const origin='https://serene-test.pages.dev';
const OWNER='serenetravelvn@gmail.com';

// Máy khách giả lập: giữ cookie và mã CSRF. cookieName là serene_session (quản trị) hoặc serene_ctv (CTV)
function client(env,loginPath,cookieName,ip='1.1.1.1'){
 let cookie='',csrf='';
 const j=async(path,method='GET',body)=>{
  const res=await worker.fetch(new Request(origin+'/api/'+path,{method,headers:{origin,'CF-Connecting-IP':ip,...(method==='GET'?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)}),env);
  return {status:res.status,body:await res.json().catch(()=>null),headers:res.headers};
 };
 const login=async(email,password)=>{
  cookie='';csrf='';
  const r=await j(loginPath,'POST',{email,password});
  if(r.status===200){cookie=r.headers.get('set-cookie').split(';')[0];assert.ok(cookie.startsWith(cookieName+'='));csrf=r.body.csrf}
  return r;
 };
 return {j,login,cookie:()=>cookie};
}
const admin=(env,ip)=>client(env,'login','serene_session',ip);
const ctvClient=(env,ip)=>client(env,'sales/login','serene_ctv',ip);
const reg=(over={})=>({name:'Trần Văn A',phone:'0912345678',zalo:'0912345678',email:'a@example.com',password:'matkhau-123',...over});

async function setup(){
 const env=await runtime({passwordHash:hash});
 const owner=admin(env);assert.equal((await owner.login(OWNER,pass)).status,200);
 return {env,owner};
}
const withMail=env=>{
 env.RESEND_API_KEY='re_test';env.MAIL_FROM='Serene <no-reply@serenetravel.vn>';
 const sent=[],real=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{
  if(String(url).startsWith('https://api.resend.com/')){const b=JSON.parse(init.body);sent.push({to:b.to[0],code:/\b(\d{6})\b/.exec(b.subject)?.[1]});return new Response('{}',{status:200})}
  return real(url,init)
 };
 return {sent,restore:()=>{globalThis.fetch=real}};
};

test('đăng ký khi chưa bật OTP: chờ duyệt, Chủ duyệt rồi mới đăng nhập được', async()=>{
 const {env,owner}=await setup();const c=ctvClient(env);
 const r=await c.j('sales/register','POST',reg());
 assert.equal(r.status,201);assert.equal(r.body.next,'wait');
 let l=await c.login('a@example.com','matkhau-123');
 assert.equal(l.status,403);assert.match(l.body.error,/chờ/);
 assert.equal((await c.login('a@example.com','sai-mat-khau')).status,401);
 const list=await owner.j('ctv');
 assert.equal(list.status,200);assert.equal(list.body.pending,1);assert.equal(list.body.otp,false);
 const id=list.body.ctvs[0].id;
 assert.equal((await owner.j('ctv/'+id,'PUT',{action:'approve'})).status,200);
 l=await c.login('a@example.com','matkhau-123');assert.equal(l.status,200);
 const me=await c.j('sales/me');assert.equal(me.status,200);assert.equal(me.body.name,'Trần Văn A');
 assert.equal((await c.j('sales/logout','POST')).status,200);
 assert.equal((await c.j('sales/me')).status,401);
});

test('kiểm tra dữ liệu đăng ký và email trùng', async()=>{
 const {env}=await setup();const c=ctvClient(env);
 for(const bad of [{name:''},{phone:'123'},{email:'khong-phai-email'},{password:'ngan'},{email:OWNER}])
  assert.equal((await c.j('sales/register','POST',reg(bad))).status,400,JSON.stringify(bad));
 assert.equal((await c.j('sales/register','POST',reg())).status,201);
 assert.equal((await c.j('sales/register','POST',reg({email:'A@Example.com'}))).status,409);
 const hp=await c.j('sales/register','POST',reg({email:'bot@example.com',website:'x'}));
 assert.equal(hp.status,200);
});

test('OTP qua email: nhập đúng mã mới sang chờ duyệt, sai 5 lần thì phải gửi lại', async()=>{
 const {env,owner}=await setup();const m=withMail(env);
 try{
  const c=ctvClient(env);
  const r=await c.j('sales/register','POST',reg());
  assert.equal(r.status,201);assert.equal(r.body.next,'verify');
  assert.equal(m.sent.length,1);assert.equal(m.sent[0].to,'a@example.com');assert.match(m.sent[0].code,/^\d{6}$/);
  const l=await c.login('a@example.com','matkhau-123');assert.equal(l.status,403);assert.equal(l.body.needVerify,true);
  // chưa xác nhận email thì Chủ chưa duyệt được
  const id=(await owner.j('ctv')).body.ctvs[0].id;
  assert.equal((await owner.j('ctv/'+id,'PUT',{action:'approve'})).status,400);
  const real=m.sent[0].code,wrong=real==='000000'?'111111':'000000';
  for(let i=0;i<5;i++)assert.equal((await c.j('sales/verify','POST',{email:'a@example.com',code:wrong})).status,400);
  assert.equal((await c.j('sales/verify','POST',{email:'a@example.com',code:real})).status,429);
  // gửi lại mã bị chặn trong 60 giây đầu
  await c.j('sales/resend','POST',{email:'a@example.com'});assert.equal(m.sent.length,1);
  await env.BOOKINGS.prepare('UPDATE ctv_accounts SET otp_sent=0').run();
  await c.j('sales/resend','POST',{email:'a@example.com'});assert.equal(m.sent.length,2);
  const v=await c.j('sales/verify','POST',{email:'a@example.com',code:m.sent[1].code});
  assert.equal(v.status,200);assert.equal(v.body.next,'wait');
  assert.equal((await c.login('a@example.com','matkhau-123')).status,403);
  assert.equal((await owner.j('ctv/'+id,'PUT',{action:'approve'})).status,200);
  assert.equal((await c.login('a@example.com','matkhau-123')).status,200);
 }finally{m.restore()}
});

test('mã OTP hết hạn thì không dùng được', async()=>{
 const {env}=await setup();const m=withMail(env);
 try{
  const c=ctvClient(env);await c.j('sales/register','POST',reg());
  await env.BOOKINGS.prepare('UPDATE ctv_accounts SET otp_expires=1').run();
  assert.equal((await c.j('sales/verify','POST',{email:'a@example.com',code:m.sent[0].code})).status,400);
 }finally{m.restore()}
});

test('khóa, mở khóa, đặt lại mật khẩu, xóa CTV', async()=>{
 const {env,owner}=await setup();const c=ctvClient(env);
 await c.j('sales/register','POST',reg());
 const id=(await owner.j('ctv')).body.ctvs[0].id;
 await owner.j('ctv/'+id,'PUT',{action:'approve'});
 assert.equal((await c.login('a@example.com','matkhau-123')).status,200);
 assert.equal((await owner.j('ctv/'+id,'DELETE')).status,400);
 assert.equal((await owner.j('ctv/'+id,'PUT',{action:'lock'})).status,200);
 assert.equal((await c.j('sales/me')).status,401);
 assert.equal((await c.login('a@example.com','matkhau-123')).body.error.includes('khóa'),true);
 assert.equal((await owner.j('ctv/'+id,'PUT',{action:'unlock'})).status,200);
 assert.equal((await c.login('a@example.com','matkhau-123')).status,200);
 assert.equal((await owner.j('ctv/'+id,'PUT',{action:'password',password:'ngan'})).status,400);
 assert.equal((await owner.j('ctv/'+id,'PUT',{action:'password',password:'mat-khau-moi-1'})).status,200);
 assert.equal((await c.j('sales/me')).status,401);
 assert.equal((await c.login('a@example.com','matkhau-123')).status,401);
 assert.equal((await c.login('a@example.com','mat-khau-moi-1')).status,200);
 assert.equal((await owner.j('ctv/'+id,'PUT',{action:'lock'})).status,200);
 assert.equal((await owner.j('ctv/'+id,'DELETE')).status,200);
 assert.equal((await owner.j('ctv')).body.ctvs.length,0);
 const log=(await owner.j('audit')).body.log.map(x=>x.action);
 for(const a of ['ctv.approve','ctv.lock','ctv.unlock','ctv.password','ctv.delete'])assert.ok(log.includes(a),a);
});

test('CTV tự đổi mật khẩu', async()=>{
 const {env,owner}=await setup();const c=ctvClient(env);
 await c.j('sales/register','POST',reg());
 await owner.j('ctv/'+(await owner.j('ctv')).body.ctvs[0].id,'PUT',{action:'approve'});
 await c.login('a@example.com','matkhau-123');
 assert.equal((await c.j('sales/password','POST',{current:'sai',next:'mat-khau-moi-1'})).status,400);
 assert.equal((await c.j('sales/password','POST',{current:'matkhau-123',next:'mat-khau-moi-1'})).status,200);
 assert.equal((await c.login('a@example.com','mat-khau-moi-1')).status,200);
});

test('quyền: Kế toán duyệt được, Sales thì không; CTV không vào được quản trị', async()=>{
 const {env,owner}=await setup();
 for(const [name,email,role] of [['Kế Toán','ketoan@example.com','accountant'],['Sale A','a2@example.com','sales']])
  assert.equal((await owner.j('staff','POST',{name,email,password:'matkhau-tam-1',role})).status,201);
 const acc=admin(env,'2.2.2.2'),sale=admin(env,'3.3.3.3');
 assert.equal((await acc.login('ketoan@example.com','matkhau-tam-1')).status,200);
 assert.equal((await sale.login('a2@example.com','matkhau-tam-1')).status,200);
 const c=ctvClient(env);await c.j('sales/register','POST',reg());
 assert.equal((await sale.j('ctv')).status,403);
 const list=await acc.j('ctv');assert.equal(list.status,200);
 const id=list.body.ctvs[0].id;
 assert.equal((await sale.j('ctv/'+id,'PUT',{action:'approve'})).status,403);
 assert.equal((await acc.j('ctv/'+id,'PUT',{action:'approve'})).status,200);
 await c.login('a@example.com','matkhau-123');
 // Cookie CTV không có giá trị gì ở các đường dẫn quản trị
 for(const p of ['booking','ctv','staff','content'])assert.equal((await c.j(p)).status,401,p);
 // Quyền mới có trong danh mục và trong vai trò mẫu
 const st=await owner.j('staff');
 const keys=st.body.catalog.map(x=>x.key);
 for(const k of ['ctv.manage','ctv.price','ctv.avail'])assert.ok(keys.includes(k),k);
 assert.ok(st.body.roles.accountant.includes('ctv.manage'));
 assert.ok(!st.body.roles.sales.includes('ctv.manage'));
 assert.ok(st.body.roles.sales.includes('ctv.price')&&st.body.roles.sales.includes('ctv.avail'));
});

test('đăng nhập sai quá nhiều lần thì bị chặn; CSRF bắt buộc khi gửi', async()=>{
 const {env,owner}=await setup();const c=ctvClient(env,'9.9.9.9');
 await c.j('sales/register','POST',reg());
 await owner.j('ctv/'+(await owner.j('ctv')).body.ctvs[0].id,'PUT',{action:'approve'});
 let last=0;for(let i=0;i<12;i++)last=(await c.j('sales/login','POST',{email:'a@example.com',password:'sai-'+i})).status;
 assert.equal(last,429);
 const env2=(await setup()).env;const d=ctvClient(env2);
 await d.j('sales/register','POST',reg());
 const o2=admin(env2);await o2.login(OWNER,pass);await o2.j('ctv/'+(await o2.j('ctv')).body.ctvs[0].id,'PUT',{action:'approve'});
 await d.login('a@example.com','matkhau-123');
 const res=await worker.fetch(new Request(origin+'/api/sales/logout',{method:'POST',headers:{origin,cookie:d.cookie()}}),env2);
 assert.equal(res.status,403);
});

test('trang /sales không cho công cụ tìm kiếm lập chỉ mục', async()=>{
 const {env}=await setup();
 const res=await worker.fetch(new Request(origin+'/sales/',{headers:{origin}}),env);
 assert.equal(res.headers.get('x-robots-tag'),'noindex, nofollow');
});
