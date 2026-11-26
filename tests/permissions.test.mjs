import test from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import worker from '../public/_worker.js';
import {runtime} from '../scripts/local-runtime.mjs';
const pass='Only-for-local-tests-Change-This-123!';
const hash='test-salt:'+pbkdf2Sync(pass,'test-salt',100000,32,'sha256').toString('hex');
const origin='https://serene-test.pages.dev';
const OWNER='serenetravelvn@gmail.com';
const order=(id,extra={})=>({id,name:'Khách thử',phone:'0900000000',guests:'',svcs:[{name:'Phòng',price:3000000,netPrice:2000000,totalNet:2000000,qty1:1,unit1:'phòng',qty2:1,unit2:'đêm',total:3000000,partnerId:'pa',partner:'Đối tác A'}],totalAmt:3000000,created:'26/11/2026',payments:[],status:'pending',orderStatus:'processing',...extra});
function client(env){
 let cookie='',csrf='';
 const call=async(path,method='GET',body,headers={})=>{
  const res=await worker.fetch(new Request(origin+'/api/'+path,{method,headers:{origin,...(method==='GET'?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)}),env);
  return res;
 };
 const login=async(email,password)=>{cookie='';csrf='';const r=await call('login','POST',{email,password});if(r.status===200){cookie=r.headers.get('set-cookie').split(';')[0];csrf=(await r.json()).csrf}return r};
 const j=async(...a)=>{const r=await call(...a);return {status:r.status,body:await r.json().catch(()=>null)}};
 return {call,login,j};
}
async function setup(){
 const env=await runtime({passwordHash:hash});
 const owner=client(env);assert.equal((await owner.login(OWNER,pass)).status,200);
 const mk=async(name,email,role,perms)=>{const r=await owner.j('staff','POST',{name,email,password:'matkhau-tam-1',role,perms});assert.equal(r.status,201,JSON.stringify(r.body));const c=client(env);assert.equal((await c.login(email,'matkhau-tam-1')).status,200);return {c,id:r.body.staff.id}};
 const acc=await mk('Kế Toán','ketoan@example.com','accountant');
 const sa=await mk('Sale A','a@example.com','sales');
 const sb=await mk('Sale B','b@example.com','sales');
 return {env,owner,acc,sa,sb};
}
const put=(c,o)=>c.j('booking/'+o.id,'PUT',{booking:o});
const post=(c,o)=>c.j('booking','POST',{booking:o});
const list=async c=>(await c.j('booking')).body.bookings;

test('Tài khoản nhân viên: đăng nhập, sai mật khẩu, tắt tài khoản',async()=>{
 const {env,owner,sa}=await setup();
 const bad=client(env);assert.equal((await bad.login('a@example.com','sai-mat-khau')).status,401);
 assert.equal((await bad.login('khong-co@example.com','matkhau-tam-1')).status,401);
 const me=await sa.c.j('session');assert.equal(me.body.role,'sales');assert.ok(me.body.perms.includes('order.create'));assert.ok(!me.body.perms.includes('order.complete'));
 const off=await owner.j('staff/'+sa.id,'PUT',{active:false});assert.equal(off.status,200);
 assert.equal((await sa.c.j('session')).status,401,'tắt tài khoản thì phiên đang mở bị cắt ngay');
 assert.equal((await client(env).login('a@example.com','matkhau-tam-1')).status,401);
 await owner.j('staff/'+sa.id,'PUT',{active:true});assert.equal((await client(env).login('a@example.com','matkhau-tam-1')).status,200);
 assert.equal((await owner.j('staff','POST',{name:'X',email:OWNER,password:'matkhau-tam-1'})).status,400,'không tạo trùng email của Chủ');
 assert.equal((await owner.j('staff','POST',{name:'X',email:'a@example.com',password:'matkhau-tam-1'})).status,409);
 assert.equal((await owner.j('staff','POST',{name:'X',email:'x@example.com',password:'ngan'})).status,400);
});
test('Nhân viên không vào được phần website, tài khoản, nhật ký',async()=>{
 const {sa,acc}=await setup();
 for(const c of [sa.c,acc.c]){
  assert.equal((await c.j('content')).status,403);
  assert.equal((await c.j('posts')).status,403);
  assert.equal((await c.j('upload','POST',{})).status,403);
  assert.equal((await c.j('staff')).status,403);
  assert.equal((await c.j('staff','POST',{name:'Hack',email:'h@example.com',password:'matkhau-tam-1',role:'accountant'})).status,403);
  assert.equal((await c.j('audit')).status,403);
 }
});
test('Sales chỉ thấy đơn mình tạo, không sửa được đơn người khác',async()=>{
 const {owner,acc,sa,sb}=await setup();
 const o1=order('ST1001',{createdBy:'sgiamnguoi',owner:'sgiamnguoi'});
 assert.equal((await post(sa.c,o1)).status,201);
 assert.equal((await post(sb.c,order('ST1002'))).status,201);
 assert.equal((await owner.j('booking','POST',{booking:order('ST1003')})).status,201);
 const mineA=await list(sa.c);assert.deepEqual(mineA.map(b=>b.id),['ST1001']);
 assert.equal(mineA[0].createdBy,(await sa.c.j('session')).body.id,'máy chủ ghi đè người tạo, không tin máy khách');
 assert.deepEqual((await list(sb.c)).map(b=>b.id),['ST1002']);
 assert.deepEqual((await list(acc.c)).map(b=>b.id).sort(),['ST1001','ST1002','ST1003']);
 assert.deepEqual((await list(owner)).map(b=>b.id).sort(),['ST1001','ST1002','ST1003']);
 assert.equal((await put(sb.c,{...order('ST1001'),name:'Bị sửa'})).status,404,'không lộ đơn của người khác');
 assert.equal((await put(sa.c,{...mineA[0],name:'Tự sửa được'})).status,200);
 assert.equal((await put(sa.c,{...order('ST1003'),name:'Đơn của Chủ'})).status,404);
});
test('Đơn mới của Sales: chỉ Đang xử lý, phiếu thu luôn Chờ duyệt',async()=>{
 const {sa,acc}=await setup();
 assert.equal((await post(sa.c,order('ST2001',{orderStatus:'success'}))).status,403);
 assert.equal((await post(sa.c,order('ST2002',{payments:[{amount:500000,type:'Cọc',date:'26/11/2026',status:'approved'}]}))).status,201);
 const b=(await list(sa.c)).find(x=>x.id==='ST2002');assert.equal(b.payments[0].status,'pending');
 assert.equal((await post(sa.c,order('ST2003',{commission:{ctvId:'',amount:50000,paid:true}}))).status,403,'Sales không đánh dấu đã trả hoa hồng');
 assert.equal((await post(sa.c,order('ST2004',{commission:{ctvId:'',amount:50000,paid:false}}))).status,201,'Sales tự nhập hoa hồng');
 assert.equal((await post(sa.c,order('ST2005',{supPaid:{pa:{amount:1,date:'x'}}}))).status,403);
 assert.equal((await post(acc.c,order('ST2006',{orderStatus:'success'}))).status,201,'Kế toán tạo thẳng đơn Thành công được');
});
test('Thành công do Kế toán duyệt, Sales chỉ Hủy',async()=>{
 const {sa,acc}=await setup();await post(sa.c,order('ST3001'));
 let b=(await list(sa.c))[0];
 assert.equal((await put(sa.c,{...b,orderStatus:'success'})).status,403);
 assert.equal((await put(acc.c,{...b,orderStatus:'success'})).status,200);
 b=(await list(sa.c))[0];assert.equal(b.orderStatus,'success');
 assert.equal((await put(sa.c,{...b,orderStatus:'processing'})).status,403,'Sales không đưa đơn Thành công về lại');
 assert.equal((await put(sa.c,{...b,orderStatus:'cancelled'})).status,403,'đơn Thành công muốn Hủy cũng phải qua Kế toán');
 await post(sa.c,order('ST3002'));
 b=(await list(sa.c)).find(x=>x.id==='ST3002');
 assert.equal((await put(sa.c,{...b,orderStatus:'cancelled'})).status,200,'Sales hủy được đơn của mình');
});
test('Đơn Thành công bị khóa với Sales, nhưng vẫn ghi nhận thu tiền (Chờ duyệt)',async()=>{
 const {sa,acc}=await setup();await post(sa.c,order('ST4001'));
 let b=(await list(sa.c))[0];await put(acc.c,{...b,orderStatus:'success'});b=(await list(sa.c))[0];
 assert.equal((await put(sa.c,{...b,name:'Đổi tên'})).status,403,'khóa sửa thông tin');
 assert.equal((await put(sa.c,{...b,totalAmt:1,svcs:[{...b.svcs[0],price:1,total:1}]})).status,403);
 assert.equal((await put(sa.c,{...b,svcs:[{...b.svcs[0],netPrice:1,totalNet:1}]})).status,403,'khóa giá net');
 assert.equal((await put(sa.c,{...b,commission:{ctvId:'',amount:999,paid:false}})).status,403,'khóa hoa hồng');
 const withPay={...b,payments:[{amount:1000000,type:'Cọc',date:'26/11/2026',status:'approved'}]};
 assert.equal((await put(sa.c,withPay)).status,200);
 b=(await list(sa.c))[0];assert.equal(b.payments[0].status,'pending','khoản thu của Sales luôn chờ duyệt dù gửi là đã duyệt');
 assert.equal((await put(sa.c,{...b,payments:[{...b.payments[0],status:'approved'}]})).status,403,'Sales không tự duyệt');
 assert.equal((await put(sa.c,{...b,payments:[]})).status,403,'Sales không xóa phiếu thu');
 assert.equal((await put(sa.c,{...b,payments:[...b.payments,{amount:-5,type:'Hoàn',date:'x'}]})).status,403,'Sales không ghi nhận hoàn tiền');
 assert.equal((await put(acc.c,{...b,payments:[{...b.payments[0],status:'approved'}]})).status,200,'Kế toán duyệt được');
 b=(await list(sa.c))[0];assert.equal(b.payments[0].status,'approved');
 assert.equal((await put(sa.c,{...b,svcs:[{...b.svcs[0],code:'MA123'}],sent:{slip:'x'}})).status,200,'mã đặt chỗ và dấu đã gửi không bị khóa');
 assert.equal((await put(acc.c,{...b,name:'Kế toán sửa'})).status,200);
});
test('Hoa hồng và trả đối tác',async()=>{
 const {sa,acc}=await setup();await post(sa.c,order('ST5001'));
 let b=(await list(sa.c))[0];
 assert.equal((await put(sa.c,{...b,commission:{ctvId:'',amount:70000,paid:false}})).status,200);
 b=(await list(sa.c))[0];
 assert.equal((await put(sa.c,{...b,commission:{...b.commission,paid:true,paidDate:'26/11/2026'}})).status,403);
 assert.equal((await put(sa.c,{...b,supPaid:{pa:{amount:2000000,date:'26/11/2026'}}})).status,403);
 await put(acc.c,{...b,orderStatus:'success'});b=(await list(sa.c))[0];
 assert.equal((await put(acc.c,{...b,commission:{...b.commission,paid:true,paidDate:'26/11/2026'}})).status,200);
 b=(await list(sa.c))[0];
 assert.equal((await put(sa.c,{...b,commission:{...b.commission,amount:1}})).status,403,'hoa hồng đã trả không sửa được');
 assert.equal((await put(acc.c,{...b,supPaid:{pa:{amount:2000000,date:'26/11/2026'}}})).status,200);
});
test('Xóa đơn: Sales chỉ gửi yêu cầu, Kế toán hoặc Chủ duyệt',async()=>{
 const {owner,acc,sa,sb}=await setup();await post(sa.c,order('ST6001'));await post(sa.c,order('ST6002'));
 assert.equal((await sa.c.j('booking/ST6001','DELETE')).status,403);
 assert.equal((await sb.c.j('booking/ST6001','DELETE')).status,403);
 let b=(await list(sa.c)).find(x=>x.id==='ST6001');
 const r=await put(sa.c,{...b,deleteReq:{by:'sgiamnguoikhac',reason:'Khách đổi ý <b>'}});assert.equal(r.status,200);
 b=(await list(sa.c)).find(x=>x.id==='ST6001');
 assert.equal(b.deleteReq.by,(await sa.c.j('session')).body.id,'người gửi do máy chủ ghi, không tin máy khách');
 assert.equal(b.deleteReq.reason,'Khách đổi ý b','ký tự < > bị bỏ');
 const seen=(await list(acc.c)).find(x=>x.id==='ST6001');assert.ok(seen.deleteReq,'Kế toán thấy yêu cầu');
 assert.equal((await put(sa.c,{...b,deleteReq:{by:'x',reason:'đổi người gửi'}})).status,200);
 assert.equal((await list(sa.c)).find(x=>x.id==='ST6001').deleteReq.by,b.deleteReq.by,'không đổi được người gửi');
 const mine2=(await list(sa.c)).find(x=>x.id==='ST6002');
 assert.equal((await put(sa.c,{...b,deleteReq:null})).status,200,'người gửi rút được yêu cầu');
 assert.equal((await list(sa.c)).find(x=>x.id==='ST6001').deleteReq,undefined);
 await put(sa.c,{...b,deleteReq:{reason:'lại xóa'}});
 assert.equal((await acc.c.j('booking/ST6001','DELETE')).status,200,'Kế toán duyệt xóa');
 assert.equal((await list(sa.c)).some(x=>x.id==='ST6001'),false);
 assert.equal((await owner.j('booking/ST6002','DELETE')).status,200,'Chủ xóa thẳng');
 const log=(await owner.j('audit')).body.log;
 const del=log.find(x=>x.action==='order.delete'&&x.target==='ST6001');assert.ok(del&&del.detail.includes('"id":"ST6001"'),'nhật ký giữ bản lưu của đơn đã xóa');
 assert.ok(mine2);
});
test('Quyền net: không có quyền thì không thấy và không làm mất giá net',async()=>{
 const {owner,env}=await setup();
 const r=await owner.j('staff','POST',{name:'Không net',email:'nonet@example.com',password:'matkhau-tam-1',role:'custom',perms:['order.view_all','order.create','order.edit','pay.record']});
 assert.equal(r.status,201);const nn=client(env);await nn.login('nonet@example.com','matkhau-tam-1');
 await owner.j('booking','POST',{booking:order('ST7001')});
 let b=(await list(nn))[0];assert.equal(b.svcs[0].netPrice,undefined);assert.equal(b.svcs[0].totalNet,undefined);assert.equal(b.svcs[0].partnerId,undefined);
 assert.equal((await put(nn,{...b,name:'Sửa tên'})).status,200);
 const full=(await list(owner))[0];assert.equal(full.name,'Sửa tên');assert.equal(full.svcs[0].netPrice,2000000,'giá net cũ vẫn còn');assert.equal(full.svcs[0].partnerId,'pa');
 assert.equal((await post(nn,order('ST7002'))).status,201);
 const mineFull=(await owner.j('booking')).body.bookings.find(x=>x.id==='ST7002');assert.equal(mineFull.svcs[0].netPrice,undefined,'giá net gửi lên bị bỏ');
});
test('Khách hàng và lead theo phạm vi từng người',async()=>{
 const {owner,acc,sa,sb,env}=await setup();
 const c1=await sa.c.j('customers','POST',{name:'Khách của A',phone:'0911',kind:'retail',note:''});assert.equal(c1.status,201);
 const ctv=await sa.c.j('customers','POST',{name:'CTV chung',phone:'0922',kind:'ctv',note:''});assert.equal(ctv.status,201);
 await owner.j('customers','POST',{name:'Khách của Chủ',phone:'0933',kind:'retail',note:''});
 const names=async c=>(await c.j('customers')).body.customers.map(x=>x.name).sort();
 assert.deepEqual(await names(sa.c),['CTV chung','Khách của A']);
 assert.deepEqual(await names(sb.c),['CTV chung'],'B không thấy khách của A, nhưng thấy CTV chung');
 assert.deepEqual(await names(acc.c),['CTV chung','Khách của A','Khách của Chủ']);
 assert.equal((await sb.c.j('customers/'+c1.body.customer.id,'PUT',{name:'Hack',phone:'0911',kind:'retail',note:''})).status,404);
 assert.equal((await sa.c.j('customers/'+c1.body.customer.id,'DELETE')).status,403,'Sales không xóa khách');
 assert.equal((await owner.j('customers/'+c1.body.customer.id,'DELETE')).status,200);
 // Lead từ website
 const pub=await worker.fetch(new Request(origin+'/api/lead-public',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({name:'Khách web',phone:'0944000111',need:'Tour',source:'website'})}),env);
 assert.ok([200,201].includes(pub.status),'lead public '+pub.status);
 const lnames=async c=>(await c.j('leads')).body.leads.map(x=>x.name);
 assert.deepEqual(await lnames(sa.c),[],'Sales chưa được giao nên không thấy lead web');
 assert.deepEqual(await lnames(acc.c),['Khách web']);
 const lead=(await owner.j('leads')).body.leads[0];
 assert.equal((await sa.c.j('leads/'+lead.id,'PUT',{name:'Khách web',phone:lead.phone,need:'Tour',source:'website',status:'new',booking_id:'',owner:'x'})).status,404);
 const idA=(await sa.c.j('session')).body.id;
 const asg=await acc.c.j('leads/'+lead.id,'PUT',{name:lead.name,phone:lead.phone,need:lead.need,source:lead.source,status:'new',booking_id:'',owner:idA});assert.equal(asg.status,200);
 assert.deepEqual(await lnames(sa.c),['Khách web'],'được giao thì thấy');
 assert.deepEqual(await lnames(sb.c),[]);
 assert.equal((await sa.c.j('leads/'+lead.id,'PUT',{name:lead.name,phone:lead.phone,need:lead.need,source:lead.source,status:'contacted',booking_id:'',owner:''})).status,200);
 assert.deepEqual(await lnames(sa.c),['Khách web'],'Sales không tự đẩy lead đi chỗ khác');
 assert.equal((await acc.c.j('leads/'+lead.id,'PUT',{name:lead.name,phone:lead.phone,need:lead.need,source:lead.source,status:'new',booking_id:'',owner:'sffffffffffff'})).status,400,'giao cho người không tồn tại');
 const mylead=await sa.c.j('leads','POST',{name:'Lead A tự thêm',phone:'0955',need:'',source:'zalo'});assert.equal(mylead.status,201);
 assert.deepEqual(await lnames(sb.c),[]);
 assert.equal((await sa.c.j('leads/'+mylead.body.lead.id,'DELETE')).status,403);
});
test('Thiết lập: Sales xem được bảng giá nhưng không sửa; Kế toán sửa được',async()=>{
 const {sa,acc}=await setup();
 assert.equal((await sa.c.j('booking-settings')).status,200);
 assert.equal((await sa.c.j('booking-settings','PUT',{slipNote:'x'})).status,403);
 assert.equal((await acc.c.j('booking-settings','PUT',{slipNote:'ok'})).status,200);
 assert.equal((await sa.c.j('booking-units','POST',{name:'tour'})).status,403);
 assert.equal((await sa.c.j('hotel-rates')).status,200);
 assert.equal((await sa.c.j('hotel-rates','PUT',{items:[{name:'KS',note:'',updated:'',rows:[]}]})).status,403);
 assert.equal((await sa.c.j('hotel-rates?hotel=ks','DELETE')).status,403);
});
test('Nhật ký thao tác và đổi mật khẩu',async()=>{
 const {owner,sa,env}=await setup();
 await post(sa.c,order('ST8001'));let b=(await list(sa.c))[0];await put(sa.c,{...b,name:'Tên mới',totalAmt:3100000,svcs:[{...b.svcs[0],price:3100000,total:3100000}]});
 const log=(await owner.j('audit')).body.log;
 assert.ok(log.some(x=>x.action==='order.create'&&x.target==='ST8001'&&x.actor_name.includes('Sale A')));
 const up=log.find(x=>x.action==='order.update'&&x.target==='ST8001');assert.ok(up&&up.detail.includes('Tổng tiền 3000000 -> 3100000'));
 assert.ok(log.some(x=>x.action==='staff.create'));
 assert.equal((await owner.j('audit?q=ST8001')).body.log.every(x=>JSON.stringify(x).includes('ST8001')),true);
 assert.equal((await sa.c.j('me/password','POST',{current:'sai',next:'matkhau-moi-2'})).status,400);
 assert.equal((await sa.c.j('me/password','POST',{current:'matkhau-tam-1',next:'matkhau-moi-2'})).status,200);
 assert.equal((await client(env).login('a@example.com','matkhau-tam-1')).status,401);
 assert.equal((await client(env).login('a@example.com','matkhau-moi-2')).status,200);
 assert.equal((await owner.j('me/password','POST',{current:'x',next:'matkhau-moi-2'})).status,400,'Chủ đổi mật khẩu ở Cloudflare');
});
test('Kho cũ chưa có cột owner vẫn chạy (tự nâng cấp)',async()=>{
 const env=await runtime({passwordHash:hash});
 for(const sql of ['DROP TABLE customers','DROP TABLE leads',"CREATE TABLE customers (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'retail', note TEXT NOT NULL DEFAULT '', created TEXT NOT NULL, updated TEXT NOT NULL)","CREATE TABLE leads (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', need TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'new', booking_id TEXT NOT NULL DEFAULT '', created TEXT NOT NULL, updated TEXT NOT NULL)",'DROP TABLE staff','DROP TABLE staff_sessions','DROP TABLE audit_log'])await env.BOOKINGS.prepare(sql).run();
 const owner=client(env);await owner.login(OWNER,pass);
 assert.equal((await owner.j('customers','POST',{name:'Cũ',phone:'1',kind:'retail',note:''})).status,201);
 assert.equal((await owner.j('staff','POST',{name:'N',email:'n@example.com',password:'matkhau-tam-1'})).status,201);
 assert.equal((await owner.j('audit')).status,200);
});
