import test from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import worker from '../public/_worker.js/index.js';
import {runtime} from '../scripts/local-runtime.mjs';
const pass='Only-for-local-tests-Change-This-123!';
const hash='test-salt:'+pbkdf2Sync(pass,'test-salt',100000,32,'sha256').toString('hex');
const origin='https://serene-test.pages.dev';
const OWNER='serenetravelvn@gmail.com';
function client(env,ip='1.1.1.1'){
 let cookie='',csrf='';
 const j=async(path,method='GET',body)=>{
  const res=await worker.fetch(new Request(origin+'/api/'+path,{method,headers:{origin,'CF-Connecting-IP':ip,...(method==='GET'?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)}),env);
  return {status:res.status,body:await res.json().catch(()=>null)};
 };
 const login=async(email,password)=>{cookie='';csrf='';const res=await worker.fetch(new Request(origin+'/api/login',{method:'POST',headers:{origin,'content-type':'application/json','CF-Connecting-IP':ip},body:JSON.stringify({email,password})}),env);if(res.status===200){cookie=res.headers.get('set-cookie').split(';')[0];csrf=(await res.json()).csrf}return res.status};
 return {j,login};
}
const row=(room,from,to,net,extra={})=>({p:'',room,label:'Mùa',from,to,net,sat:null,...extra});
async function setup(){
 const env=await runtime({passwordHash:hash});
 const owner=client(env);assert.equal(await owner.login(OWNER,pass),200);
 return {env,owner};
}
const saveHotel=(owner,name,rows)=>owner.j('hotel-rates','PUT',{items:[{name,note:'',updated:'01/01/2027',rows}]});
const priceOf=(body,room)=>body.hotel.rows.find(r=>r.room===room);

test('công thức mặc định: dưới 500.000 cộng 10%, từ 500.000 cộng 50.000, làm tròn lên nghìn', async()=>{
 const {owner}=await setup();
 const cases=[[400000,440000],[450500,496000],[499000,549000],[499999,550000],[500000,550000],[500001,551000],[800000,850000],[2000000,2050000],[100000,110000],[50000,55000]];
 const rows=cases.map(([net],i)=>row('P'+net,'2027-01-01','2027-03-31',net));
 assert.equal((await saveHotel(owner,'Khách sạn A',rows)).status,200);
 const r=await owner.j('ctv/price?hotel='+encodeURIComponent('Khách sạn A'));
 assert.equal(r.status,200);
 for(const [net,want] of cases)assert.equal(priceOf(r.body,'P'+net).ctv,want,'net '+net);
 assert.equal(priceOf(r.body,'P400000').net,400000);
});

test('giá đêm thứ 7 tính riêng; nhiều đối tác thì lấy net thấp nhất', async()=>{
 const {owner}=await setup();
 await saveHotel(owner,'KS B',[
  row('Deluxe','2027-04-01','2027-08-31',1500000,{sat:1700000,p:'p1'}),
  row('Deluxe','2027-04-01','2027-08-31',1400000,{p:'p2'}),
  row('Suite','2027-04-01','2027-08-31',1500000,{sat:1700000})]);
 const r=await owner.j('ctv/price?hotel=KS B');
 const suite=priceOf(r.body,'Suite');
 assert.equal(suite.ctv,1550000);assert.equal(suite.ctvSat,1750000);
 const dlx=priceOf(r.body,'Deluxe');
 assert.equal(r.body.hotel.rows.filter(x=>x.room==='Deluxe').length,1);
 assert.equal(dlx.net,1400000);assert.equal(dlx.ctv,1450000);
 assert.equal(dlx.satNet,1400000);assert.equal(dlx.ctvSat,1450000);
});

test('đổi quy tắc chung và kiểm tra số liệu', async()=>{
 const {owner}=await setup();
 await saveHotel(owner,'KS C',[row('R1','2027-01-01','2027-12-31',400000),row('R2','2027-01-01','2027-12-31',2000000)]);
 const bad=[{thresh:-1,pct:10,fixed:50000,round:1000},{thresh:500000,pct:101,fixed:50000,round:1000},{thresh:500000,pct:10,fixed:-5,round:1000},{thresh:500000,pct:10,fixed:50000,round:0},{thresh:500000,pct:'abc',fixed:50000,round:1000}];
 for(const rule of bad)assert.equal((await owner.j('ctv/price','PUT',{rule})).status,400,JSON.stringify(rule));
 assert.equal((await owner.j('ctv/price','PUT',{rule:{thresh:1000000,pct:12.5,fixed:100000,round:5000}})).status,200);
 const r=await owner.j('ctv/price?hotel=KS C');
 assert.equal(priceOf(r.body,'R1').ctv,450000); // 400000 x 1,125 = 450000
 assert.equal(priceOf(r.body,'R2').ctv,2100000); // net 2.000.000 vượt ngưỡng 1.000.000 nên cộng cố định 100.000
});

test('quy tắc riêng của khách sạn và giá nhập tay', async()=>{
 const {owner}=await setup();
 await saveHotel(owner,'KS D',[row('R1','2027-01-01','2027-03-31',400000),row('R2','2027-01-01','2027-03-31',2000000,{sat:2300000})]);
 const key=(room)=>({room,from:'2027-01-01',to:'2027-03-31'});
 // luôn cộng 20%
 let r=await owner.j('ctv/price','PUT',{hotel:'KS D',rule:{type:'pct',value:20},over:[]});
 assert.equal(r.status,200);
 assert.equal(priceOf(r.body,'R1').ctv,480000);assert.equal(priceOf(r.body,'R2').ctv,2400000);assert.equal(priceOf(r.body,'R2').ctvSat,2760000);
 // luôn cộng 80.000 đ
 r=await owner.j('ctv/price','PUT',{hotel:'KS D',rule:{type:'fixed',value:80000},over:[]});
 assert.equal(priceOf(r.body,'R1').ctv,480000);assert.equal(priceOf(r.body,'R2').ctv,2080000);
 // nhập tay: thắng quy tắc, chỉ dòng đó
 r=await owner.j('ctv/price','PUT',{hotel:'KS D',rule:null,over:[{...key('R2'),price:2222000,sat:null}]});
 assert.equal(r.status,200);
 const r2=priceOf(r.body,'R2'),r1=priceOf(r.body,'R1');
 assert.equal(r2.ctv,2222000);assert.equal(r2.manual,true);assert.equal(r2.auto,2050000);assert.equal(r2.ctvSat,2350000);assert.equal(r2.manualSat,false);
 assert.equal(r1.manual,false);assert.equal(r1.ctv,440000);
 // gửi danh sách rỗng thì về tự tính
 r=await owner.j('ctv/price','PUT',{hotel:'KS D',rule:null,over:[]});
 assert.equal(priceOf(r.body,'R2').manual,false);
 // dòng không khớp bảng net, giá sai, quy tắc sai
 assert.equal((await owner.j('ctv/price','PUT',{hotel:'KS D',rule:null,over:[{room:'Không có',from:'2027-01-01',to:'2027-03-31',price:1000000}]})).status,400);
 assert.equal((await owner.j('ctv/price','PUT',{hotel:'KS D',rule:null,over:[{...key('R1'),price:-5}]})).status,400);
 assert.equal((await owner.j('ctv/price','PUT',{hotel:'KS D',rule:{type:'abc',value:1},over:[]})).status,400);
 assert.equal((await owner.j('ctv/price','PUT',{hotel:'Không có KS',rule:null,over:[]})).status,404);
 // danh sách khách sạn
 await owner.j('ctv/price','PUT',{hotel:'KS D',rule:{type:'pct',value:15},over:[{...key('R1'),price:470000}]});
 const list=await owner.j('ctv/price');
 const h=list.body.hotels.find(x=>x.name==='KS D');
 assert.equal(h.rows,2);assert.equal(h.manual,1);assert.deepEqual(h.rule,{type:'pct',value:15});
});

test('giá net đổi thì giá CTV tự tính đổi theo, dòng nhập tay không còn khớp bị bỏ qua', async()=>{
 const {owner}=await setup();
 await saveHotel(owner,'KS E',[row('R1','2027-01-01','2027-03-31',1000000)]);
 await owner.j('ctv/price','PUT',{hotel:'KS E',rule:null,over:[{room:'R1',from:'2027-01-01',to:'2027-03-31',price:1234000}]});
 await saveHotel(owner,'KS E',[row('R1','2027-01-01','2027-03-31',1100000),row('R1','2027-04-01','2027-06-30',1200000)]);
 const r=await owner.j('ctv/price?hotel=KS E');
 const rows=r.body.hotel.rows;
 assert.equal(rows.find(x=>x.from==='2027-01-01').ctv,1234000);
 assert.equal(rows.find(x=>x.from==='2027-04-01').ctv,1250000);
 // đổi ngày của mùa: dòng nhập tay cũ không khớp, giá quay về tự tính
 await saveHotel(owner,'KS E',[row('R1','2027-01-01','2027-04-30',1100000)]);
 const r2=await owner.j('ctv/price?hotel=KS E');
 assert.equal(r2.body.hotel.rows[0].ctv,1150000);
});

test('nhập file: giá khác tự tính thì thành nhập tay, bằng tự tính hoặc trống thì về tự tính', async()=>{
 const {owner}=await setup();
 await saveHotel(owner,'KS F',[row('R1','2027-01-01','2027-03-31',1000000),row('R2','2027-01-01','2027-03-31',400000,{sat:500000})]);
 await saveHotel(owner,'KS G',[row('X','2027-01-01','2027-03-31',3000000)]);
 const it=(hotel,room,price,sat,over={})=>({hotel,room,from:'2027-01-01',to:'2027-03-31',price,sat,...over});
 let r=await owner.j('ctv/price/import','POST',{items:[it('KS F','R1',1111000,null),it('ks f','r2',440000,555000),it('KS G','X',3050000,null),it('KS G','Không có',1000000,null),it('KS Lạ','X',1000000,null)]});
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal(r.body.hotels,1);assert.equal(r.body.set,2);assert.equal(r.body.errorCount,2);
 let f=(await owner.j('ctv/price?hotel=KS F')).body.hotel;
 const r1=f.rows.find(x=>x.room==='R1'),r2=f.rows.find(x=>x.room==='R2');
 assert.equal(r1.ctv,1111000);assert.equal(r1.manual,true);
 assert.equal(r2.manual,false);assert.equal(r2.manualSat,true);assert.equal(r2.ctvSat,555000);assert.equal(r2.autoSat,550000);
 // đưa lại về giá tự tính
 r=await owner.j('ctv/price/import','POST',{items:[it('KS F','R1',1050000,null),it('KS F','R2',null,null)]});
 assert.equal(r.body.cleared,2);
 f=(await owner.j('ctv/price?hotel=KS F')).body.hotel;
 assert.ok(f.rows.every(x=>!x.manual&&!x.manualSat));
 assert.equal((await owner.j('ctv/price/import','POST',{items:[]})).status,400);
 assert.equal((await owner.j('ctv/price/import','POST',{items:[it('KS F','R1',1.5,null)]})).body.errorCount,1);
});

test('xuất toàn bộ để chỉnh trong file', async()=>{
 const {owner}=await setup();
 await saveHotel(owner,'KS H',[row('R1','2027-01-01','2027-03-31',1000000)]);
 await saveHotel(owner,'KS A2',[row('R9','2027-01-01','2027-03-31',400000)]);
 const r=await owner.j('ctv/price?export=1');
 assert.equal(r.status,200);assert.equal(r.body.rows.length,2);
 assert.deepEqual(r.body.rows.map(x=>x.hotel),['KS A2','KS H']);
 assert.equal(r.body.rows[0].ctv,440000);assert.equal(r.body.rows[0].net,400000);
});

test('quyền: Sales sửa được, nhân viên không có quyền thì không; không có quyền net thì không thấy net', async()=>{
 const {env,owner}=await setup();
 await saveHotel(owner,'KS K',[row('R1','2027-01-01','2027-03-31',1000000)]);
 const mk=async(name,email,role,perms,ip)=>{const r=await owner.j('staff','POST',{name,email,password:'matkhau-tam-1',role,perms});assert.equal(r.status,201,JSON.stringify(r.body));const c=client(env,ip);assert.equal(await c.login(email,'matkhau-tam-1'),200);return c};
 const sales=await mk('Sale','s@example.com','sales',undefined,'2.2.2.2');
 const nonet=await mk('Không net','n@example.com','custom',['ctv.price'],'3.3.3.3');
 const none=await mk('Không quyền','x@example.com','custom',['rates.view'],'4.4.4.4');
 assert.equal((await none.j('ctv/price')).status,403);
 assert.equal((await none.j('ctv/price','PUT',{rule:{thresh:500000,pct:10,fixed:50000,round:1000}})).status,403);
 assert.equal((await none.j('ctv/price/import','POST',{items:[{}]})).status,403);
 const s=await sales.j('ctv/price?hotel=KS K');assert.equal(s.status,200);assert.equal(s.body.hotel.rows[0].net,1000000);
 assert.equal((await sales.j('ctv/price','PUT',{hotel:'KS K',rule:null,over:[{room:'R1',from:'2027-01-01',to:'2027-03-31',price:1100000}]})).status,200);
 const n=await nonet.j('ctv/price?hotel=KS K');
 assert.equal(n.status,200);assert.equal(n.body.hotel.rows[0].ctv,1100000);
 assert.equal('net' in n.body.hotel.rows[0],false);assert.equal('satNet' in n.body.hotel.rows[0],false);
 const ex=await nonet.j('ctv/price?export=1');assert.equal('net' in ex.body.rows[0],false);
 const log=(await owner.j('audit')).body.log.map(x=>x.action);
 assert.ok(log.includes('ctv.price'));
});
