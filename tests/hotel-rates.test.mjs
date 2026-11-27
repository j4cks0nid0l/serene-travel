import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {pbkdf2Sync} from 'node:crypto';
import worker from '../public/_worker.js/index.js';
import {runtime} from '../scripts/local-runtime.mjs';

const ctx={};ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../public/admin/booking/rates.js',import.meta.url),'utf8'),ctx);
const RT=ctx.RT;
const J=x=>JSON.parse(JSON.stringify(x));

const rows=[
 {p:'',room:'Deluxe',label:'Thấp',from:'2026-12-01',to:'2026-12-22',net:1000000,sat:null},
 {p:'',room:'Deluxe',label:'Cao',from:'2026-12-23',to:'2027-01-07',net:1500000,sat:null},
 {p:'pA',room:'Deluxe',label:'Thấp',from:'2026-12-01',to:'2026-12-22',net:900000,sat:null},
 {p:'pA',room:'Deluxe',label:'Cao',from:'2026-12-23',to:'2027-01-07',net:1600000,sat:null},
 {p:'pB',room:'Deluxe',label:'Thấp',from:'2026-12-01',to:'2026-12-31',net:1100000,sat:1300000},
 {p:'',room:'Suite',label:'x',from:'2026-12-01',to:'2026-12-31',net:3000000,sat:null},
];

test('Tính net theo từng đêm, qua hai mùa, đêm trả phòng không tính',()=>{
 // 21/12 và 22/12 mùa thấp, 23/12 mùa cao: 3 đêm
 const q=RT.quote(rows,'_none','Deluxe','2026-12-21','2026-12-24');
 assert.equal(q.nights,3);assert.equal(q.total,1000000+1000000+1500000);assert.equal(q.missing.length,0);
 assert.equal(RT.quote(rows,'_none','deluxe','2026-12-22','2026-12-23').total,1000000); // khác hoa thường vẫn khớp
 assert.equal(RT.quote(rows,'_none','Deluxe','2026-12-24','2026-12-24').nights,0);
});
test('Đêm thứ 7 dùng giá riêng; thiếu giá thì báo thiếu chứ không đoán',()=>{
 // 2026-12-05 là thứ 7
 assert.equal(new Date(2026,11,5).getDay(),6);
 const q=RT.quote(rows,'pB','Deluxe','2026-12-04','2026-12-07'); // đêm 4 (T6), 5 (T7), 6 (CN)
 assert.equal(q.total,1100000+1300000+1100000);
 const m=RT.quote(rows,'pA','Deluxe','2027-01-06','2027-01-10'); // hết bảng giá sau 07/01
 assert.equal(m.missing.length,2);assert.equal(m.total,1600000*2);
});
test('Gợi ý đối tác rẻ nhất; đối tác thiếu đêm xếp sau dù tổng thấp hơn',()=>{
 // 20/12 đến 25/12: 5 đêm, đêm 20, 21, 22 mùa thấp và đêm 23, 24 mùa cao. Không có đêm thứ 7 nào.
 const s=RT.suggest(rows,'Deluxe','2026-12-20','2026-12-25');
 const totals=Object.fromEntries(s.options.map(o=>[o.p,o.total]));
 assert.equal(totals._none,3*1000000+2*1500000);   // 6.000.000
 assert.equal(totals.pA,3*900000+2*1600000);       // 5.900.000
 assert.equal(totals.pB,5*1100000);                // 5.500.000
 assert.equal(s.best.p,'pB');
 assert.deepEqual(J(s.options.map(o=>o.p)),['pB','pA','_none']);
 // 30/12 đến 03/01: pB chỉ có giá đến 31/12 nên thiếu 2 đêm, dù tổng nhỏ nhất vẫn không được chọn
 const s2=RT.suggest(rows,'Deluxe','2026-12-30','2027-01-03');
 const pb=s2.options.find(o=>o.p==='pB');
 assert.equal(pb.missing,2);assert.equal(pb.total,2*1100000);
 assert.equal(s2.best.p,'_none'); // 4 x 1.500.000 = 6.000.000 < 4 x 1.600.000
 assert.equal(s2.options[s2.options.length-1].p,'pB');
 assert.equal(RT.suggest(rows,'Phòng không có','2026-12-20','2026-12-22').options.length,0);
});
test('Khớp tên hạng phòng: đúng, chứa nhau, mơ hồ thì không đoán',()=>{
 assert.equal(RT.matchRoom(rows,'deluxe'),'Deluxe');
 assert.equal(RT.matchRoom(rows,'Suite King'),'Suite');
 const two=[{...rows[0],room:'Deluxe Sea'},{...rows[0],room:'Deluxe Garden'}];
 assert.equal(RT.matchRoom(two,'Deluxe'),null);
 assert.equal(RT.matchRoom(rows,''),null);
});
test('Làm sạch dòng giá: từ chối ngày sai, giá sai, tên có < >',()=>{
 assert.equal(RT.cleanRows([rows[0]]).length,1);
 for(const bad of [{...rows[0],from:'2026-13-01'},{...rows[0],from:'2026-12-30',to:'2026-12-01'},{...rows[0],net:0},{...rows[0],net:1.5},{...rows[0],room:'a<b'},{...rows[0],room:''},{...rows[0],sat:-1}])assert.equal(RT.cleanRows([bad]),null);
});
test('Nhập CSV: gộp theo khách sạn, bỏ dòng VÍ DỤ, báo lỗi đúng dòng, đối tác lạ bị từ chối',()=>{
 const csv=RT.parseCsvText(RT.templateCsv().replace('﻿',''));
 assert.equal(RT.buildRates(csv,{}).items.length,0); // chỉ có dòng ví dụ
 const text=[RT.HEAD.join(','),
  'Hotel A,1 Đường B,0258,,Deluxe,Thấp,01/01/2027,31/03/2027,1200000,,Ghi chú A',
  'Hotel A,,,,Deluxe,Cao,01/04/2027,31/08/2027,"1.500.000",1700000,',
  'Hotel A,,,,Deluxe,Cao,01/04/2027,31/08/2027,1500000,,',
  'Hotel B,,,Đối tác lạ,Suite,x,01/01/2027,31/01/2027,2000000,,',
  'Hotel B,,,Đối tác Một,Suite,x,31/02/2027,31/01/2027,2000000,,',
  'Hotel B,,,Đối tác Một,Suite,x,01/01/2027,31/01/2027,abc,,',
  'Hotel B,,,Đối tác Một,Suite,x,01/01/2027,31/01/2027,2000000,,'].join('\n');
 const r=RT.buildRates(RT.parseCsvText(text),{partners:[{id:'pOne',name:'Đối tác Một'}]});
 assert.equal(r.items.length,2);
 const a=r.items[0];assert.equal(a.name,'Hotel A');assert.equal(a.rows.length,2);assert.equal(a.note,'Ghi chú A');assert.equal(a.rows[1].net,1500000);assert.equal(a.rows[1].sat,1700000);
 assert.ok(r.errors.some(e=>e.line===4&&/trùng/.test(e.msg))||r.errors.some(e=>/trùng/.test(e.msg)));
 const b=r.items[1];assert.equal(b.rows.length,1);assert.equal(b.rows[0].p,'pOne');
 const lines=r.errors.map(e=>e.line);assert.ok(lines.includes(5)&&lines.includes(6)&&lines.includes(7));
 assert.equal(RT.buildRates([['a','b']],{}).fatal.length>0,true);
 // đối tác mặc định cho dòng bỏ trống
 assert.equal(RT.buildRates(RT.parseCsvText(text),{partners:[],defaultPartner:'pX'}).items[0].rows[0].p,'pX');
});
test('Xuất rồi nhập lại ra đúng dữ liệu cũ',()=>{
 const recs=[{name:'Hotel A',address:'Đ1',phone:'1',note:'n',rows:[rows[0],rows[2],rows[4]]}];
 const csv=RT.toCsv(RT.exportRows(recs,[{id:'pA',name:'Đối tác A'},{id:'pB',name:'Đối tác B'}]));
 const back=RT.buildRates(RT.parseCsvText(csv.replace('﻿','')),{partners:[{id:'pA',name:'Đối tác A'},{id:'pB',name:'Đối tác B'}]});
 assert.equal(back.errors.length,0);
 assert.deepEqual(J(back.items[0].rows.map(r=>[r.p,r.room,r.from,r.to,r.net,r.sat])),J(recs[0].rows.map(r=>[r.p,r.room,r.from,r.to,r.net,r.sat])));
});
test('Đọc file Commitment: bảng chuẩn đọc đúng, bảng mơ hồ không bị đoán',()=>{
 const sheet=(name,body)=>'## Sheet name: '+name+'\n'+body+'\n';
 const good=sheet('Hotel Good',[
  'SERENE TRAVEL','Tên KS/RS,Hotel Good','Địa chỉ,"1 Phố A, Hà Nội"','Hotline,0123','Ngày Update,30/10/2026','',
  'Hạng phòng,Total Rooms,"NORMAL\n16/10/2026 - 30/11/2026","HIGH\n01/12/2026 - 22/12/2026\n08/01/2027 - 05/02/2027"',
  'Deluxe,10,2.000.000,2.500.000','Suite,2,4.000.000,N/A','','DỊCH VỤ BAO GỒM','- Ăn sáng'].join('\n'));
 const monthOnly=sheet('Hotel Month',['Tên KS/RS,Hotel Month','Hạng phòng,"Thấp điểm\ntháng 4, 5, 6"','Deluxe,1.000.000'].join('\n'));
 const overlap=sheet('Hotel Overlap',['Tên KS/RS,Hotel Overlap','Hạng phòng,"A\n01/01/2027 - 31/03/2027","B\n01/03/2027 - 30/04/2027"','Deluxe,1.000.000,1.200.000'].join('\n'));
 const sub=sheet('Hotel Sub',['Tên KS/RS,Hotel Sub','Hạng phòng,"A\n01/01/2027 - 31/03/2027"',',Lẻ','Deluxe,1.000.000'].join('\n'));
 const info=sheet('DANH MỤC','a,b\nc,d');
 const r=RT.parseCommitment(info+good+monthOnly+overlap+sub);
 assert.equal(r.ok.length,1);const h=r.ok[0];
 assert.equal(h.name,'Hotel Good');assert.equal(h.address,'1 Phố A, Hà Nội');assert.equal(h.phone,'0123');
 assert.deepEqual(J(h.rows.map(x=>[x.room,x.label,x.from,x.to,x.net])),[
  ['Deluxe','NORMAL','2026-10-16','2026-11-30',2000000],
  ['Deluxe','HIGH','2026-12-01','2026-12-22',2500000],
  ['Deluxe','HIGH','2027-01-08','2027-02-05',2500000],
  ['Suite','NORMAL','2026-10-16','2026-11-30',4000000]]); // ô N/A của Suite bị bỏ, không đoán
 assert.match(h.note,/Ăn sáng/);
 assert.equal(r.review.length,1);assert.equal(r.review[0].name,'Hotel Overlap');assert.match(r.review[0].warn[0],/chồng ngày/);
 assert.deepEqual(J(r.skipped.map(s=>s.sheet).sort()),['Hotel Month','Hotel Sub']);
});

// ---- API ----
const pass='Only-for-local-tests-Change-This-123!';
const hash='test-salt:'+pbkdf2Sync(pass,'test-salt',100000,32,'sha256').toString('hex');
const origin='https://serene-test.pages.dev';
test('API bảng giá: cần đăng nhập, lưu, đọc, ghi đè, từ chối dữ liệu sai, xóa',async()=>{
 const env=await runtime({passwordHash:hash});let cookie='',csrf='';
 const call=async(path,method='GET',body)=>worker.fetch(new Request(origin+'/api/'+path,{method,headers:{origin,...(method==='GET'?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)}),env);
 try{
  assert.equal((await call('hotel-rates')).status,401);
  const l=await call('login','POST',{email:'serenetravelvn@gmail.com',password:pass});cookie=l.headers.get('set-cookie').split(';')[0];csrf=(await l.json()).csrf;
  assert.deepEqual((await (await call('hotel-rates')).json()).list,[]);
  const item={name:'Hotel A',note:'Ghi chú',updated:'30/10/2026',rows:rows.slice(0,3)};
  assert.equal((await call('hotel-rates','PUT',{items:[item]})).status,200);
  const list=(await (await call('hotel-rates')).json()).list;
  assert.equal(list.length,1);assert.equal(list[0].rows,3);assert.equal(list[0].last,'2027-01-07');
  const one=(await (await call('hotel-rates?hotel='+encodeURIComponent(' HOTEL  a '))).json()).rates;
  assert.equal(one.name,'Hotel A');assert.equal(one.rows.length,3);
  // ghi đè thay hẳn dòng cũ
  assert.equal((await call('hotel-rates','PUT',{items:[{...item,rows:[rows[0]]}]})).status,200);
  assert.equal((await (await call('hotel-rates?hotel=hotel a')).json()).rates.rows.length,1);
  for(const bad of [undefined,{},{items:[]},{items:[{name:'',rows:[]}]},{items:[{name:'X<',rows:[]}]},{items:[{name:'X',rows:[{...rows[0],from:'2026-02-31'}]}]},{items:[{name:'X',rows:[{...rows[0],net:'1'}]}]},{items:[{name:'X',rows:[{...rows[0],p:'a b'}]}]},{items:[{name:'X',note:'<b>',rows:[]}]},{items:Array.from({length:21},(_,i)=>({name:'H'+i,rows:[]}))}])
   assert.equal((await call('hotel-rates','PUT',bad)).status,400);
  assert.equal((await (await call('hotel-rates')).json()).list.length,1); // dữ liệu sai không lọt vào
  assert.equal((await call('hotel-rates?hotel=hotel a','DELETE')).status,200);
  assert.deepEqual((await (await call('hotel-rates')).json()).list,[]);
  // bảng giá không lẫn vào phần cài đặt chung
  const st=await (await call('booking-settings')).json();assert.equal(JSON.stringify(st).includes('rates:'),false);
 }finally{await env.close?.()}
});
