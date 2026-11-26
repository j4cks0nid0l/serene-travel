import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const sandbox={module:{exports:{}}};
vm.runInNewContext(fs.readFileSync(new URL('../public/admin/booking/calc.js',import.meta.url),'utf8'),sandbox);
const BK=sandbox.module.exports;
const P=[{id:'p1',name:'KS A',cats:['hotel','vui']}];
const ctx={cats:BK.DEFAULT_CATS,partners:P,today:'26/11/2026'};
const J=x=>JSON.parse(JSON.stringify(x));

test('Đọc CSV: ngoặc kép, dấu phẩy trong ô, chấm phẩy kiểu Excel Việt Nam, BOM',()=>{
 assert.deepEqual(J(BK.parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n')),[['a','b'],['x, y','say "hi"']]);
 assert.deepEqual(J(BK.parseCsv('a;b;c\n1;2;3')),[['a','b','c'],['1','2','3']]);
 assert.deepEqual(J(BK.parseCsv('a,b\n"dòng 1\ndòng 2",z')),[['a','b'],['dòng 1\ndòng 2','z']]);
});

test('File mẫu: đọc lại được, các dòng VÍ DỤ bị bỏ qua, không có lỗi',()=>{
 const csv=BK.importTemplateCsv(BK.DEFAULT_CATS,P);
 assert.ok(csv.startsWith('﻿'));
 const rows=BK.parseCsv(csv);
 assert.equal(rows[0].length,BK.IMPORT_HEAD.length);
 const r=BK.buildImport(rows,ctx);
 assert.equal(r.fatal,'');assert.equal(r.errors.length,0);assert.equal(r.orders.length,0);assert.equal(r.skipped,2);
});

test('Nhập đơn từ file mẫu sau khi bỏ chữ VÍ DỤ: 1 đơn, 2 dịch vụ, đúng tiền',()=>{
 const csv=BK.importTemplateCsv(BK.DEFAULT_CATS,P).replace('VÍ DỤ ','');
 const r=BK.buildImport(BK.parseCsv(csv),ctx);
 assert.equal(r.errors.length,0,JSON.stringify(r.errors));
 assert.equal(r.orders.length,1);
 const o=r.orders[0];
 assert.equal(o.name,'Nguyễn Văn A');assert.equal(o.orderStatus,'success');assert.equal(o.created,'25/11/2026');
 // phòng: 1 phòng x 2 đêm (25/12 đến 27/12) x 1.200.000 = 2.400.000, net 1.800.000
 assert.equal(o.svcs[0].total,2400000);assert.equal(o.svcs[0].totalNet,1800000);
 // vé: 2 người lớn x 880.000 + 1 trẻ em x 650.000 = 2.410.000, net 2x700.000 + 500.000 = 1.900.000
 assert.equal(o.svcs[1].total,2410000);assert.equal(o.svcs[1].totalNet,1900000);
 assert.equal(o.totalAmt,4810000);assert.equal(o.paid,500000);
 assert.equal(o.ctvName,'Tên CTV');assert.equal(o.commission,100000);assert.equal(o.commissionPaid,true);assert.equal(o.ref,'SHEET-001');
 assert.equal(o.svcs[0].partnerId,'p1');
});

test('Lỗi được báo đúng dòng, đơn lỗi không lọt vào danh sách nhập, đơn đúng vẫn nhập được',()=>{
 const H=BK.IMPORT_HEAD.join(',');
 const row=(o)=>BK.IMPORT_HEAD.map(h=>o[h]??'').join(',');
 const ok={'Nhóm đơn':'A','Tên khách':'An','SĐT':'0901234567','Loại dịch vụ':'Phòng khách sạn','Đối tác':'KS A','Tên dịch vụ':'Deluxe','Ngày đi hoặc nhận phòng':'11226','Ngày về hoặc trả phòng':'31226','Số lượng':'1','Giá bán':'1.000.000'};
 const csv=[H,row(ok),
  row({...ok,'Nhóm đơn':'B','Đối tác':'Không có'}),
  row({...ok,'Nhóm đơn':'C','SĐT':'abc'}),
  row({...ok,'Nhóm đơn':'D','Đã thu':'9.999.999'}),
  row({...ok,'Nhóm đơn':'E','Ngày tạo đơn':'31/02/2026'}),
  row({...ok,'Nhóm đơn':'F','Trạng thái đơn':'lạ'}),
  row({...ok,'Nhóm đơn':'G','Hoa hồng':'100000'}),
  row({...ok,'Nhóm đơn':'H','Loại dịch vụ':'Không loại'}),
 ].join('\n');
 const r=BK.buildImport(BK.parseCsv(csv),ctx);
 assert.equal(r.orders.length,1);assert.equal(r.orders[0].group,'A');
 // ngày 11226 (Excel làm mất số 0) được bù thành 011226: 1 đêm
 assert.equal(r.orders[0].svcs[0].total,2000000);   // 1 phòng x 2 đêm (01/12 đến 03/12) x 1.000.000
 const lines=r.errors.map(e=>e.line).sort((a,b)=>a-b);
 assert.deepEqual(J(lines),[3,4,5,6,7,8,9]);
 assert.match(r.errors.find(e=>e.line===3).msg,/Đối tác/);
 assert.match(r.errors.find(e=>e.line===5).msg,/Đã thu/);
 assert.equal(r.badOrders,7);
});

test('Thiếu cột bắt buộc hoặc file trống thì dừng, không đoán',()=>{
 assert.match(BK.buildImport(BK.parseCsv('a,b\n1,2'),ctx).fatal,/thiếu cột/);
 assert.match(BK.buildImport([],ctx).fatal,/trống/);
});

test('Nhiều dòng cùng nhóm đơn gộp thành một đơn; không ghi nhóm thì mỗi dòng một đơn',()=>{
 const H=BK.IMPORT_HEAD.join(',');
 const row=(o)=>BK.IMPORT_HEAD.map(h=>o[h]??'').join(',');
 const base={'Tên khách':'An','SĐT':'0901234567','Loại dịch vụ':'Phòng khách sạn','Đối tác':'KS A','Tên dịch vụ':'Deluxe','Ngày đi hoặc nhận phòng':'011226','Ngày về hoặc trả phòng':'021226','Số lượng':'1','Giá bán':'500000'};
 const r=BK.buildImport(BK.parseCsv([H,row({...base,'Nhóm đơn':'X'}),row({...base,'Nhóm đơn':'X'}),row(base),row(base)].join('\n')),ctx);
 assert.equal(r.orders.length,3);assert.equal(r.orders[0].svcs.length,2);assert.equal(r.orders[0].totalAmt,1000000);
});

test('Ngày: các cách gõ phổ biến đều quy về cùng một kiểu',()=>{
 assert.equal(BK.normCreated('5/1/26'),'05/01/2026');assert.equal(BK.normCreated('05-01-2026'),'05/01/2026');assert.equal(BK.normCreated('30/02/2026'),null);
 assert.equal(BK.normDate6('25/12/2026'),'251226');assert.equal(BK.normDate6('251226'),'251226');assert.equal(BK.normDate6('51226'),'051226');assert.equal(BK.normDate6(''),'');
});
