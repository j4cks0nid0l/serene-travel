import test from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import worker from '../public/_worker.js/index.js';
import {runtime} from '../scripts/local-runtime.mjs';
const pass='Only-for-local-tests-Change-This-123!';
const hash='test-salt:'+pbkdf2Sync(pass,'test-salt',100000,32,'sha256').toString('hex');
const origin='https://serene-test.pages.dev';
const order=(id,extra={})=>({id,name:'Khách thử',phone:'0900000000',guests:'',svcs:[{name:'Phòng',price:1000000,qty1:1,unit1:'phòng',qty2:1,unit2:'đêm',total:1000000}],totalAmt:1000000,created:'25/11/2026',payments:[],status:'pending',...extra});
async function session(){
 const env=await runtime({passwordHash:hash});let cookie='',csrf='';
 async function call(path,method='GET',body,options={}){const headers={origin,...(method==='GET'?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{}),...options.headers};return worker.fetch(new Request(origin+'/api/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env)}
 const login=async()=>{const r=await call('login','POST',{email:'serenetravelvn@gmail.com',password:pass});cookie=r.headers.get('set-cookie').split(';')[0];csrf=(await r.json()).csrf};
 return {env,call,login};
}

test('Khách hàng: cần đăng nhập, thêm/sửa/xóa, kiểm tra dữ liệu, không xóa khách đã có đơn hoặc hoa hồng',async()=>{
 const {env,call,login}=await session();
 try{
  assert.equal((await call('customers')).status,401);
  assert.equal((await call('customers','POST',{name:'An'})).status,401);
  await login();
  assert.deepEqual((await (await call('customers')).json()).customers,[]);
  const r=await call('customers','POST',{name:'  Nguyễn   An ',phone:'0901 234 567',kind:'retail',note:'Khách quen'});assert.equal(r.status,201);
  const c=(await r.json()).customer;assert.match(c.id,/^c[a-z0-9]{12}$/);assert.equal(c.name,'Nguyễn An');assert.equal(c.kind,'retail');
  const r2=await call('customers','POST',{name:'Lan CTV',phone:'0911',kind:'ctv'});const ctv=(await r2.json()).customer;assert.equal(ctv.kind,'ctv');
  // Dữ liệu sai bị từ chối
  for(const bad of [undefined,'x',[],{},{name:''},{name:'a<b'},{name:'An',phone:'abc'},{name:'An',kind:'vip'},{name:'x'.repeat(101)},{name:'An',note:'x'.repeat(301)}])assert.equal((await call('customers','POST',bad)).status,400);
  // Sửa
  const up=await call('customers/'+c.id,'PUT',{name:'Nguyễn An (sửa)',phone:'0901234567',kind:'ctv',note:''});assert.equal(up.status,200);assert.equal((await up.json()).customer.kind,'ctv');
  assert.equal((await call('customers/c0000000000','PUT',{name:'X'})).status,404);
  assert.equal((await call('customers/'+c.id,'PUT',{name:''})).status,400);
  // Đơn dùng khách này thì không xóa được
  assert.equal((await call('booking','POST',{booking:order('ST26112501',{customerId:c.id})})).status,201);
  assert.equal((await call('customers/'+c.id,'DELETE')).status,409);
  // Cộng tác viên đang nhận hoa hồng cũng không xóa được
  assert.equal((await call('booking','POST',{booking:order('ST26112502',{commission:{ctvId:ctv.id,amount:100000,paid:false}})})).status,201);
  assert.equal((await call('customers/'+ctv.id,'DELETE')).status,409);
  // Khách chưa có đơn thì xóa được
  const free=(await (await call('customers','POST',{name:'Tự do'})).json()).customer;
  assert.equal((await call('customers/'+free.id,'DELETE')).status,200);
  assert.equal((await (await call('customers')).json()).customers.length,2);
  // Chưa kết nối kho thì báo lỗi rõ ràng
  const bare={...env};delete bare.BOOKINGS;
  const cookieHeader=(await (async()=>{const r=await call('login','POST',{email:'serenetravelvn@gmail.com',password:pass});return r.headers.get('set-cookie').split(';')[0]})());
  assert.equal((await worker.fetch(new Request(origin+'/api/customers',{headers:{origin,cookie:cookieHeader}}),bare)).status,503);
 }finally{env.close()}
});

test('Lead: thêm, đổi trạng thái, gắn đơn, xóa; kiểm tra dữ liệu',async()=>{
 const {env,call,login}=await session();
 try{
  assert.equal((await call('leads')).status,401);
  await login();
  const r=await call('leads','POST',{name:'Chị Hoa',phone:'0988 111 222',need:'Phòng Vinpearl 3 đêm 20/12',source:'Facebook'});assert.equal(r.status,201);
  const lead=(await r.json()).lead;assert.equal(lead.status,'new');assert.match(lead.id,/^l[a-z0-9]{12}$/);
  for(const bad of [{},{name:'A',status:'xong'},{name:'A',booking_id:'abc'},{name:'A',need:'x'.repeat(501)},{name:'A<'}])assert.equal((await call('leads','POST',bad)).status,400);
  const up=await call('leads/'+lead.id,'PUT',{name:lead.name,phone:lead.phone,need:lead.need,source:lead.source,status:'ordered',booking_id:'ST26112501'});assert.equal(up.status,200);
  const got=(await (await call('leads')).json()).leads[0];assert.equal(got.status,'ordered');assert.equal(got.booking_id,'ST26112501');
  assert.equal((await call('leads/lzzzzzzzzzzz','PUT',{name:'A'})).status,404);
  assert.equal((await call('leads/'+lead.id,'DELETE')).status,200);
  assert.deepEqual((await (await call('leads')).json()).leads,[]);
 }finally{env.close()}
});

test('Đơn hàng: trường mới được kiểm tra, đơn cũ không có trường mới vẫn lưu được, người tạo được ghi tự động',async()=>{
 const {env,call,login}=await session();
 try{
  await login();
  assert.equal((await call('booking','POST',{booking:order('ST26112510')})).status,201);
  const full=order('ST26112511',{orderStatus:'processing',customerId:'cabc123def456',commission:{ctvId:'cabc123def456',amount:150000,paid:false,paidDate:'',note:'Trả khi khách đặt'},payments:[{amount:100000,type:'Tiền cọc',date:'25/11/2026',status:'pending',code:'PT26112501'}]});
  assert.equal((await call('booking','POST',{booking:full})).status,201);
  const list=(await (await call('booking')).json()).bookings;
  const a=list.find(x=>x.id==='ST26112510'),b=list.find(x=>x.id==='ST26112511');
  assert.equal(a.createdBy,'serenetravelvn@gmail.com');assert.equal(a.orderStatus,undefined);
  assert.equal(b.commission.amount,150000);assert.equal(b.payments[0].status,'pending');
  // Sửa đơn: giữ người tạo, ghi người sửa
  assert.equal((await call('booking/ST26112510','PUT',{booking:{...a,name:'Đổi tên'}})).status,200);
  const a2=(await (await call('booking')).json()).bookings.find(x=>x.id==='ST26112510');
  assert.equal(a2.createdBy,'serenetravelvn@gmail.com');assert.equal(a2.updatedBy,'serenetravelvn@gmail.com');
  // Giá trị sai bị từ chối
  const bads=[{orderStatus:'xong'},{customerId:'ABC'},{customerId:5},{commission:'100'},{commission:{amount:-1}},{commission:{amount:'1'}},{commission:{amount:1e11}},{commission:{amount:5,ctvId:'x'}},{commission:{amount:5,paid:'yes'}},{commission:{amount:5,note:'<b>'}},{payments:[{amount:1,status:'lạ'}]},{payments:[{amount:1,code:'<x>'}]},{owner:'a<b'}];
  for(const bad of bads)assert.equal((await call('booking','POST',{booking:order('ST26112519',bad)})).status,400,JSON.stringify(bad));
 }finally{env.close()}
});

test('Lead từ website: không cần đăng nhập, kiểm tra dữ liệu, bẫy bot, không trùng số',async()=>{
 const {env,call,login}=await session();
 let n=0;const lead=(body)=>call('lead-public','POST',body,{headers:{'CF-Connecting-IP':'10.0.0.'+(++n)}});
 try{
  const good={from:'contact',name:'  Chị   Hoa ',phone:'0901 234 567',service:'Tour đảo',destination:'Nha Trang',date:'2026-12-20',adults:'2',children:'1',message:'Đi 3 ngày'};
  assert.equal((await lead(good)).status,201);
  await login();
  let leads=(await (await call('leads')).json()).leads;
  assert.equal(leads.length,1);assert.equal(leads[0].name,'Chị Hoa');assert.equal(leads[0].phone,'0901234567');assert.equal(leads[0].status,'new');
  assert.equal(leads[0].source,'Website: form liên hệ');assert.match(leads[0].need,/Tour đảo/);assert.match(leads[0].need,/Người lớn: 2/);
  // Cùng số trong 24 giờ: báo thành công nhưng không tạo thêm
  assert.equal((await lead(good)).status,200);
  assert.equal((await (await call('leads')).json()).leads.length,1);
  // Ô bẫy bot có chữ: giả vờ thành công, không lưu
  assert.equal((await lead({...good,phone:'0912345678',website:'http://spam'})).status,200);
  assert.equal((await (await call('leads')).json()).leads.length,1);
  // Dữ liệu sai bị từ chối
  for(const bad of [{...good,phone:'12345'},{...good,phone:'0201234567'},{...good,name:''},{...good,name:'a<b'},{...good,phone:'0987654321',date:'20/12/2026'},{...good,phone:'0987654321',adults:'abc'},{...good,phone:'0987654321',message:'x'.repeat(1001)},{...good,phone:'0987654321',service:{x:1}},[],'x'])
   assert.equal((await lead(bad)).status,400);
  // Số +84 và đăng ký ưu đãi
  assert.equal((await lead({from:'news',name:'Khách đăng ký ưu đãi',phone:'+84 987 654 321'})).status,201);
  leads=(await (await call('leads')).json()).leads;assert.equal(leads.length,2);assert.equal(leads[1].source,'Website: đăng ký ưu đãi');
  // Gửi từ trang khác bị chặn
  assert.equal((await call('lead-public','POST',good,{headers:{origin:'https://evil.example','CF-Connecting-IP':'10.9.9.9'}})).status,403);
 }finally{await env.close?.()}
});

test('Lead từ website: một IP gửi quá 10 lần mỗi giờ bị chặn, IP khác vẫn gửi được',async()=>{
 const {env,call}=await session();
 const from=(ip,phone)=>call('lead-public','POST',{name:'An',phone},{headers:{'CF-Connecting-IP':ip}});
 try{
  for(let k=0;k<10;k++)assert.equal((await from('9.9.9.9','09012345'+String(10+k))).status,201);
  assert.equal((await from('9.9.9.9','0901234599')).status,429);
  assert.equal((await from('8.8.8.8','0901234588')).status,201);
 }finally{await env.close?.()}
});
