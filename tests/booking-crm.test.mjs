import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const sandbox={module:{exports:{}}};
vm.runInNewContext(fs.readFileSync(new URL('../public/admin/booking/calc.js',import.meta.url),'utf8'),sandbox);
const BK=sandbox.module.exports;
const ord=(id,extra={})=>({id,name:'Khách',phone:'0900 000 001',guests:'',svcs:[{catId:'hotel',name:'Phòng',total:1000000,totalNet:800000,qty1:1,unit1:'phòng'}],totalAmt:1000000,created:'25/11/2026',payments:[],status:'pending',...extra});

test('Trạng thái đơn: đơn cũ không có trường này được coi là Thành công',()=>{
 assert.equal(BK.orderStatusOf(ord('ST1')),'success');
 assert.equal(BK.orderStatusOf(ord('ST1',{orderStatus:'processing'})),'processing');
 assert.equal(BK.orderStatusOf(ord('ST1',{orderStatus:'cancelled'})),'cancelled');
 assert.equal(BK.orderStatusOf(ord('ST1',{orderStatus:'lạ'})),'success');
});

test('Tiền đã thu chỉ tính phiếu đã duyệt; phiếu cũ không có trạng thái là đã duyệt',()=>{
 const b=ord('ST1',{payments:[{amount:300000},{amount:200000,status:'approved'},{amount:500000,status:'pending'}]});
 assert.equal(BK.paidOf(b),500000);
 assert.equal(BK.pendingOf(b),500000);
 assert.equal(BK.paidOf(ord('ST2')),0);
});

test('Hoa hồng chỉ phải trả khi đơn Thành công',()=>{
 const c={ctvId:'c1',amount:150000,paid:false};
 assert.equal(BK.commissionDue(ord('ST1',{orderStatus:'processing',commission:c})),0);
 assert.equal(BK.commissionDue(ord('ST1',{orderStatus:'cancelled',commission:c})),0);
 assert.equal(BK.commissionDue(ord('ST1',{orderStatus:'success',commission:c})),150000);
 assert.equal(BK.commissionDue(ord('ST1',{commission:c})),150000);
 assert.equal(BK.commissionDue(ord('ST1')),0);
 assert.equal(BK.commissionOf(ord('ST1',{commission:{ctvId:'c1',amount:-5}})),0);
});

test('Công nợ khách: tăng khi đơn Thành công, giảm theo phiếu đã duyệt; đang xử lý là tiền nhận trước; hủy là cần hoàn',()=>{
 const customers=[{id:'c1',name:'An',phone:'0900 000 001',kind:'retail'},{id:'c2',name:'Bình',phone:'0911111111',kind:'retail'}];
 const bookings=[
  ord('ST1',{customerId:'c1',orderStatus:'success',payments:[{amount:400000},{amount:100000,status:'pending'}]}),
  ord('ST2',{customerId:'c1',orderStatus:'processing',payments:[{amount:200000}]}),
  ord('ST3',{customerId:'c1',orderStatus:'cancelled',payments:[{amount:300000}]}),
  ord('ST4',{phone:'0911 111 111',totalAmt:2000000,orderStatus:'success',payments:[{amount:2000000}]}) // đơn cũ, nhận ra khách qua số điện thoại
 ];
 const [a,b]=BK.customerLedger(bookings,customers);
 assert.deepEqual([a.count,a.revenue,a.paid,a.debt,a.prepaid,a.refundDue],[3,1000000,400000,600000,200000,300000]);
 assert.deepEqual([b.count,b.revenue,b.paid,b.debt],[1,2000000,2000000,0]);
});

test('Thống kê hoa hồng theo cộng tác viên: chỉ đơn Thành công, tách đã trả và chưa trả',()=>{
 const customers=[{id:'c9',name:'CTV Lan',kind:'ctv'}];
 const bookings=[
  ord('ST1',{commission:{ctvId:'c9',amount:100000,paid:true}}),
  ord('ST2',{commission:{ctvId:'c9',amount:50000,paid:false}}),
  ord('ST3',{orderStatus:'processing',commission:{ctvId:'c9',amount:70000,paid:false}}),
  ord('ST4',{commission:{ctvId:'',amount:30000,paid:false}})
 ];
 const r=BK.commissionStats(bookings,customers);
 assert.equal(r.total,180000);assert.equal(r.paid,100000);assert.equal(r.unpaid,80000);
 assert.equal(r.rows.length,2);
 const lan=r.rows.find(x=>x.id==='c9');
 assert.deepEqual([lan.name,lan.count,lan.total,lan.paid,lan.unpaid],['CTV Lan',2,150000,100000,50000]);
 assert.equal(r.rows.find(x=>x.id==='').name,'Chưa chọn cộng tác viên');
});

test('Thống kê theo loại bỏ qua đơn đã hủy',()=>{
 const rows=BK.statsByCat([ord('ST1'),ord('ST2',{orderStatus:'cancelled'})],BK.DEFAULT_CATS);
 assert.equal(rows.length,1);assert.equal(rows[0].revenue,1000000);
});

test('CSV có thêm trạng thái đơn và hoa hồng; chỉ tính phiếu đã duyệt',()=>{
 const b=ord('ST1',{orderStatus:'success',payments:[{amount:400000},{amount:100000,status:'pending'}],commission:{ctvId:'c1',amount:120000,paid:true}});
 const rows=BK.csvRows([b],{pending:'Chờ cọc'},BK.DEFAULT_CATS);
 const head=rows[0],r=rows[1];
 const at=name=>r[head.indexOf(name)];
 assert.equal(at('Đã thu'),400000);assert.equal(at('Còn lại'),600000);
 assert.equal(at('Trạng thái đơn'),'Thành công');assert.equal(at('Hoa hồng'),120000);assert.equal(at('Hoa hồng đã trả'),'Đã trả');
 const noSvc=BK.csvRows([{...b,svcs:[]}],{},BK.DEFAULT_CATS)[1];
 assert.equal(noSvc.length,head.length);
});
