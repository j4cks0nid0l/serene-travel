import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {pbkdf2Sync} from 'node:crypto';
import worker from '../public/_worker.js/index.js';
import {runtime} from '../scripts/local-runtime.mjs';
const sandbox={module:{exports:{}}};
vm.runInNewContext(fs.readFileSync(new URL('../public/admin/booking/calc.js',import.meta.url),'utf8'),sandbox);
const BK=sandbox.module.exports;
const svc=(pid,net,extra={})=>({name:'Phòng',partnerId:pid,partner:pid?('Đối tác '+pid):'',total:net+200000,totalNet:net,...extra});
const ord=(id,created,svcs,extra={})=>({id,name:'Khách '+id,phone:'0900',guests:'',svcs,totalAmt:1000000,created,payments:[],status:'pending',...extra});
const partners=[{id:'pa',name:'Đối tác pa',cycle:'week'},{id:'pb',name:'Đối tác pb'}];

test('Kỳ trả: tuần tính từ thứ Hai đến Chủ nhật, tháng theo tháng; ngày sai thì vào "không rõ"',()=>{
 // 25/11/2026 là thứ Tư, tuần 23/11 - 29/11
 assert.equal(BK.periodOf(BK.parseVnDate('25/11/2026'),'week').label,'Tuần 23/11 - 29/11/2026');
 assert.equal(BK.periodOf(BK.parseVnDate('29/11/2026'),'week').key,BK.periodOf(BK.parseVnDate('23/11/2026'),'week').key);
 assert.notEqual(BK.periodOf(BK.parseVnDate('30/11/2026'),'week').key,BK.periodOf(BK.parseVnDate('29/11/2026'),'week').key);
 assert.equal(BK.periodOf(BK.parseVnDate('25/11/2026'),'month').label,'Tháng 11/2026');
 assert.equal(BK.parseVnDate('31/02/2026'),null);
 assert.equal(BK.periodOf(null,'month').key,'x');
 assert.equal(BK.cycleOf({}),'month');assert.equal(BK.cycleOf({cycle:'week'}),'week');
});

test('Công nợ đối tác: net tính ngay cả đơn Đang xử lý, đơn Hủy bị bỏ, đã trả được trừ',()=>{
 const bs=[
  ord('ST1','24/11/2026',[svc('pa',800000),svc('pa',500000)],{orderStatus:'processing'}),
  ord('ST2','26/11/2026',[svc('pa',300000)]),
  ord('ST3','02/12/2026',[svc('pa',100000)]),
  ord('ST4','25/11/2026',[svc('pa',900000)],{orderStatus:'cancelled'}),
  ord('ST5','25/11/2026',[svc('pb',400000)],{supPaid:{pb:{amount:400000,date:'26/11/2026'}}}),
 ];
 const rows=BK.supplierLedger(bs,partners);
 const pa=rows.find(r=>r.id==='pa'),pb=rows.find(r=>r.id==='pb');
 assert.equal(pa.cycle,'week');
 assert.equal(pa.plist.length,2);
 const w1=pa.plist.find(q=>q.label.startsWith('Tuần 23/11'));
 assert.equal(w1.total,1600000);            // ST1 1.300.000 + ST2 300.000, không có ST4 (hủy)
 assert.equal(w1.orders.map(o=>o.id).join(),'ST1,ST2');
 assert.equal(pa.total,1700000);assert.equal(pa.owed,1700000);
 assert.equal(pb.cycle,'month');assert.equal(pb.paid,400000);assert.equal(pb.owed,0);
 assert.equal(rows[0].id,'pa');             // nợ nhiều nhất lên đầu
});

test('Công nợ đối tác: đơn hủy đã trả thì báo cần đòi lại; thiếu net và chưa chọn đối tác được đếm riêng',()=>{
 const bs=[
  ord('ST1','25/11/2026',[svc('pa',900000)],{orderStatus:'cancelled',supPaid:{pa:{amount:900000,date:'26/11/2026'}}}),
  ord('ST2','25/11/2026',[svc('pa',0),svc('',250000)]),
 ];
 const rows=BK.supplierLedger(bs,partners);
 const pa=rows.find(r=>r.id==='pa'),none=rows.find(r=>r.id==='_none');
 assert.equal(pa.refund,900000);assert.equal(pa.owed,0);assert.equal(pa.missing,1);
 assert.equal(none.name,'Chưa chọn đối tác');assert.equal(none.owed,250000);
});

test('Trả dư khi net giảm sau khi đã trả (số âm, không bị làm tròn về 0)',()=>{
 const rows=BK.supplierLedger([ord('ST1','25/11/2026',[svc('pb',300000)],{supPaid:{pb:{amount:400000,date:'26/11/2026'}}})],partners);
 assert.equal(rows[0].owed,-100000);
});

test('Đối tác giữ chu kỳ khi chuẩn hóa, giá trị lạ bị bỏ',()=>{
 const l=BK.normalizePartners([{id:'pa',name:'A',cycle:'week',cats:[]},{id:'pb',name:'B',cycle:'lạ',cats:[]},{id:'pc',name:'C',cats:[]}]);
 assert.equal(l[0].cycle,'week');assert.equal('cycle' in l[1],false);assert.equal('cycle' in l[2],false);
});

const pass='Only-for-local-tests-Change-This-123!';
const hash='test-salt:'+pbkdf2Sync(pass,'test-salt',100000,32,'sha256').toString('hex');
const origin='https://serene-test.pages.dev';
test('Máy chủ: lưu trả đối tác và chu kỳ, từ chối dữ liệu sai',async()=>{
 const env=await runtime({passwordHash:hash});let cookie='',csrf='';
 const call=async(path,method='GET',body)=>worker.fetch(new Request(origin+'/api/'+path,{method,headers:{origin,...(method==='GET'?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{})},body:body?JSON.stringify(body):undefined}),env);
 try{
  const r=await call('login','POST',{email:'serenetravelvn@gmail.com',password:pass});cookie=r.headers.get('set-cookie').split(';')[0];csrf=(await r.json()).csrf;
  const base={id:'ST26112601',name:'K',phone:'0900',guests:'',svcs:[{name:'P',total:1,totalNet:1}],totalAmt:1,created:'26/11/2026',payments:[],status:'pending'};
  assert.equal((await call('booking','POST',{booking:{...base,supPaid:{pa:{amount:500000,date:'26/11/2026'}}}})).status,201);
  const got=(await (await call('booking')).json()).bookings[0];assert.equal(got.supPaid.pa.amount,500000);
  for(const bad of [[],'x',{'a b':{amount:1}},{pa:{amount:-1}},{pa:{amount:'1'}},{pa:{amount:1,date:'<b>'}},{pa:null}])
   assert.equal((await call('booking/ST26112601','PUT',{booking:{...base,supPaid:bad}})).status,400);
  const ps=[{id:'pa',name:'A',cats:['c1'],cycle:'week'},{id:'pb',name:'B',cats:['c1']}];
  assert.equal((await call('booking-settings','PUT',{partners:ps})).status,200);
  const st=(await (await call('booking-settings')).json()).settings;assert.equal(st.partners[0].cycle,'week');assert.equal('cycle' in st.partners[1],false);
  assert.equal((await call('booking-settings','PUT',{partners:[{id:'pa',name:'A',cats:[],cycle:'year'}]})).status,400);
 }finally{await env.close?.()}
});
