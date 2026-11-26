import test from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import worker from '../public/_worker.js';
import {runtime} from '../scripts/local-runtime.mjs';
const pass='Only-for-local-tests-Change-This-123!';
const hash='test-salt:'+pbkdf2Sync(pass,'test-salt',100000,32,'sha256').toString('hex');
const origin='https://serene-test.pages.dev';
const OWNER='serenetravelvn@gmail.com';
function client(env,loginPath,ip='1.1.1.1'){
 let cookie='',csrf='';
 const j=async(path,method='GET',body)=>{
  const res=await worker.fetch(new Request(origin+'/api/'+path,{method,headers:{origin,'CF-Connecting-IP':ip,...(method==='GET'?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)}),env);
  return {status:res.status,body:await res.json().catch(()=>null),text:null};
 };
 const raw=async(path)=>{const res=await worker.fetch(new Request(origin+'/api/'+path,{headers:{origin,'CF-Connecting-IP':ip,...(cookie?{cookie}:{})}}),env);return {status:res.status,text:await res.text()}};
 const login=async(email,password)=>{cookie='';csrf='';const res=await worker.fetch(new Request(origin+'/api/'+loginPath,{method:'POST',headers:{origin,'content-type':'application/json','CF-Connecting-IP':ip},body:JSON.stringify({email,password})}),env);if(res.status===200){cookie=res.headers.get('set-cookie').split(';')[0];csrf=(await res.json()).csrf}return res.status};
 return {j,raw,login};
}
const ymd=off=>new Date(Date.now()+7*3600000+off*86400000).toISOString().slice(0,10);
const row=(room,from,to,net,extra={})=>({p:'secret-partner',room,label:'Mùa',from,to,net,sat:null,...extra});
async function setup(){
 const env=await runtime({passwordHash:hash});
 const owner=client(env,'login');assert.equal(await owner.login(OWNER,pass),200);
 // một CTV đã duyệt
 const ctv=client(env,'sales/login','8.8.8.8');
 assert.equal((await ctv.j('sales/register','POST',{name:'CTV A',phone:'0912345678',email:'a@example.com',password:'matkhau-123'})).status,201);
 const id=(await owner.j('ctv')).body.ctvs[0].id;
 assert.equal((await owner.j('ctv/'+id,'PUT',{action:'approve'})).status,200);
 assert.equal(await ctv.login('a@example.com','matkhau-123'),200);
 return {env,owner,ctv};
}
const saveHotel=(owner,name,rows,note='')=>owner.j('hotel-rates','PUT',{items:[{name,note,updated:'01/01/2027',rows}]});

test('CTV chỉ thấy giá CTV, không bao giờ thấy giá net, đối tác hay ghi chú nội bộ', async()=>{
 const {owner,ctv}=await setup();
 await saveHotel(owner,'KS Một',[
  row('Deluxe',ymd(-10),ymd(300),1234567,{sat:1345678}),
  row('Deluxe',ymd(-10),ymd(300),1250000),
  row('Hết hạn',ymd(-100),ymd(-50),999999)],'Phụ thu người lớn 400.000 đ');
 await owner.j('ctv/price','PUT',{hotel:'KS Một',rule:null,over:[{room:'Deluxe',from:ymd(-10),to:ymd(300),price:1500000,sat:null}]});
 const list=await ctv.raw('sales/hotels');
 assert.equal(list.status,200);
 const l=JSON.parse(list.text);
 assert.equal(l.hotels.length,1);assert.equal(l.hotels[0].name,'KS Một');assert.equal(l.hotels[0].from,1500000);
 const det=await ctv.raw('sales/hotel?name='+encodeURIComponent('ks một'));
 assert.equal(det.status,200);
 const d=JSON.parse(det.text).hotel;
 assert.equal(d.rows.length,1);assert.equal(d.rows[0].ctv,1500000);assert.equal(d.rows[0].ctvSat,1300000); // đêm thứ 7: lấy giá thấp nhất giữa các đối tác (1.250.000) + 50.000
 assert.equal(d.note,'Phụ thu người lớn 400.000 đ');
 for(const body of [list.text,det.text]){
  for(const bad of ['1234567','1345678','1250000','999999','secret-partner','"net"','satNet','"auto"','manual'])assert.equal(body.includes(bad),false,'lộ: '+bad);
 }
});

test('chưa đăng nhập hoặc chưa được duyệt thì không xem được giá', async()=>{
 const {env,owner}=await setup();
 await saveHotel(owner,'KS Hai',[row('R',ymd(-1),ymd(100),1000000)]);
 const anon=client(env,'sales/login','7.7.7.7');
 assert.equal((await anon.j('sales/hotels')).status,401);
 assert.equal((await anon.j('sales/hotel?name=KS Hai')).status,401);
 // CTV vừa đăng ký, chưa duyệt
 const p=client(env,'sales/login','6.6.6.6');
 await p.j('sales/register','POST',{name:'CTV B',phone:'0912345679',email:'b@example.com',password:'matkhau-123'});
 assert.equal(await p.login('b@example.com','matkhau-123'),403);
 assert.equal((await p.j('sales/hotels')).status,401);
 // nhân viên quản trị không dùng được API CTV bằng cookie quản trị
 assert.equal((await owner.j('sales/hotels')).status,401);
});

test('bật/tắt dịch vụ: tắt thì CTV không thấy, bật lại thì thấy', async()=>{
 const {owner,ctv}=await setup();
 await saveHotel(owner,'KS Ba',[row('R',ymd(-1),ymd(100),1000000)]);
 await saveHotel(owner,'KS Bốn',[row('R',ymd(-1),ymd(100),600000)]);
 let sv=await owner.j('ctv/services');
 assert.equal(sv.status,200);assert.equal(sv.body.items.length,2);assert.ok(sv.body.items.every(x=>x.visible));
 const key=sv.body.items.find(x=>x.name==='KS Ba').key;
 assert.equal((await owner.j('ctv/services','PUT',{keys:[key],visible:false})).status,200);
 assert.deepEqual((await ctv.j('sales/hotels')).body.hotels.map(h=>h.name),['KS Bốn']);
 assert.equal((await ctv.j('sales/hotel?name=KS Ba')).status,404);
 assert.equal((await owner.j('ctv/services')).body.items.find(x=>x.name==='KS Ba').visible,false);
 assert.equal((await owner.j('ctv/services','PUT',{keys:['hotel:khong-co'],visible:true})).status,400);
 assert.equal((await owner.j('ctv/services','PUT',{keys:[],visible:true})).status,400);
 assert.equal((await owner.j('ctv/services','PUT',{keys:[key],visible:'x'})).status,400);
 // tắt hàng loạt
 const all=sv.body.items.map(x=>x.key);
 await owner.j('ctv/services','PUT',{keys:all,visible:false});
 assert.equal((await ctv.j('sales/hotels')).body.hotels.length,0);
 await owner.j('ctv/services','PUT',{keys:all,visible:true});
 assert.equal((await ctv.j('sales/hotels')).body.hotels.length,2);
});

test('khách sạn chỉ có giá đã hết hạn thì không hiện cho CTV', async()=>{
 const {owner,ctv}=await setup();
 await saveHotel(owner,'KS Cũ',[row('R',ymd(-100),ymd(-1),1000000)]);
 assert.equal((await ctv.j('sales/hotels')).body.hotels.length,0);
 assert.equal((await ctv.j('sales/hotel?name=KS Cũ')).status,404);
});

test('tình trạng phòng: lưu, đọc, kiểm tra dữ liệu, bỏ ngày đã qua, CTV thấy', async()=>{
 const {owner,ctv}=await setup();
 await saveHotel(owner,'KS Năm',[row('R',ymd(-1),ymd(400),1000000)]);
 const a=ymd(5),b=ymd(6),c=ymd(7),past=ymd(-3);
 let r=await owner.j('ctv/avail','PUT',{hotel:'KS Năm',days:{[a]:{s:'o'},[b]:{s:'c',m:3},[c]:{m:2},[past]:{s:'c'}}});
 assert.equal(r.status,200);
 assert.deepEqual(r.body.days,{[a]:{s:'o'},[b]:{s:'c',m:3},[c]:{m:2}});
 r=await owner.j('ctv/avail?hotel=KS Năm');assert.deepEqual(r.body.days,{[a]:{s:'o'},[b]:{s:'c',m:3},[c]:{m:2}});
 const list=await owner.j('ctv/avail');assert.equal(list.body.hotels[0].tracked,3);
 const det=await ctv.j('sales/hotel?name=KS Năm');
 assert.deepEqual(det.body.hotel.avail,{[a]:{s:'o'},[b]:{s:'c',m:3},[c]:{m:2}});
 assert.equal((await ctv.j('sales/hotels')).body.hotels[0].tracked,true);
 for(const bad of [{[a]:{s:'x'}},{'2027-13-40':{s:'o'}},{[a]:{m:1}},{[a]:{m:31}},{[a]:'o'},{[a]:{m:2.5}}])
  assert.equal((await owner.j('ctv/avail','PUT',{hotel:'KS Năm',days:bad})).status,400,JSON.stringify(bad));
 assert.equal((await owner.j('ctv/avail','PUT',{hotel:'Không có',days:{}})).status,404);
 // xóa hết
 await owner.j('ctv/avail','PUT',{hotel:'KS Năm',days:{}});
 assert.deepEqual((await owner.j('ctv/avail?hotel=KS Năm')).body.days,{});
});

test('ảnh khách sạn: lấy theo tên album trùng tên khách sạn', async()=>{
 const {env,owner,ctv}=await setup();
 await saveHotel(owner,'KS Sáu',[row('R',ymd(-1),ymd(100),1000000)]);
 await owner.j('quick'); // tạo bảng ảnh
 const ins=(id,album,url)=>env.DB.prepare('INSERT INTO quick_photos(id,album,label,url,created,sec,grp) VALUES(?,?,?,?,?,?,?)').bind(id,album,'Phòng',url,new Date().toISOString(),'Mục','').run();
 await ins('p1','KS SÁU','/media/aaa.jpg');await ins('p2','Khách sạn khác','/media/bbb.jpg');
 const d=(await ctv.j('sales/hotel?name=KS Sáu')).body.hotel;
 assert.deepEqual(d.photos.map(p=>p.url),['/media/aaa.jpg']);
});

test('quyền: Sales sửa tình trạng phòng và dịch vụ được; người không có quyền thì không', async()=>{
 const {env,owner}=await setup();
 await saveHotel(owner,'KS Bảy',[row('R',ymd(-1),ymd(100),1000000)]);
 const mk=async(name,email,role,perms,ip)=>{const r=await owner.j('staff','POST',{name,email,password:'matkhau-tam-1',role,perms});assert.equal(r.status,201);const c=client(env,'login',ip);assert.equal(await c.login(email,'matkhau-tam-1'),200);return c};
 const sales=await mk('Sale','s@example.com','sales',undefined,'2.2.2.2');
 const none=await mk('Không','n@example.com','custom',['rates.view'],'3.3.3.3');
 assert.equal((await sales.j('ctv/services')).status,200);
 assert.equal((await sales.j('ctv/avail')).status,200);
 assert.equal((await sales.j('ctv/avail','PUT',{hotel:'KS Bảy',days:{[ymd(2)]:{s:'c'}}})).status,200);
 assert.equal((await none.j('ctv/services')).status,403);
 assert.equal((await none.j('ctv/avail')).status,403);
 assert.equal((await none.j('ctv/services','PUT',{keys:['hotel:ks bảy'],visible:false})).status,403);
 const log=(await owner.j('audit')).body.log.map(x=>x.action);
 assert.ok(log.includes('ctv.avail'));
});
