import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// calc.js chạy được cả trên trình duyệt lẫn node; ở đây nạp như một script thường
const sandbox={module:{exports:{}}};
vm.runInNewContext(fs.readFileSync(new URL('../public/admin/booking/calc.js',import.meta.url),'utf8'),sandbox);
const BK=sandbox.module.exports;
const same=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));
const cat=id=>BK.findCat(BK.DEFAULT_CATS,id);
const base=(id,extra={})=>{const c=cat(id);return {catId:c.id,catName:c.name,dateMode:c.dateMode,people:c.people,name:'Dịch vụ thử',partnerId:'p1',partner:'Đối tác thử',dateIn:'',dateOut:'',unit:'vé',...extra}};
const ok=r=>{assert.equal(r.ok,true,r.error);return r.svc};

test('Khách sạn: số phòng × số đêm × giá một đêm, số đêm tự tính từ ngày nhận/trả',()=>{
 const s=ok(BK.buildService(base('hotel',{unit:'phòng',dateIn:'10/12/26',dateOut:'13/12/26',qty:2,price:1000000,net:800000})));
 assert.equal(s.qty2,3);assert.equal(s.unit2,'đêm');assert.equal(s.total,6000000);assert.equal(s.totalNet,4800000);assert.equal(s.catId,'hotel');
 assert.equal(BK.unitsOf(s),6);
 // đủ cho code đọc kiểu cũ: cột 1 = phòng, cột 2 = đêm
 assert.equal(s.qty1,2);assert.equal(s.unit1,'phòng');
 // qua tháng và qua năm
 assert.equal(ok(BK.buildService(base('hotel',{unit:'phòng',dateIn:'30/12/26',dateOut:'02/01/27',qty:1,price:100,net:0}))).qty2,3);
 assert.equal(ok(BK.buildService(base('hotel',{unit:'phòng',dateIn:'28/02/28',dateOut:'01/03/28',qty:1,price:100,net:0}))).qty2,2);
});
test('Khách sạn: thiếu ngày, ngày sai, trả phòng không sau nhận phòng đều bị từ chối',()=>{
 const h=(extra)=>BK.buildService(base('hotel',{unit:'phòng',qty:1,price:1000,...extra}));
 assert.equal(h({dateIn:'',dateOut:''}).ok,false);
 assert.equal(h({dateIn:'10/12/26',dateOut:''}).ok,false);
 assert.equal(h({dateIn:'31/02/26',dateOut:'05/03/26'}).ok,false);
 assert.equal(h({dateIn:'10/12/26',dateOut:'10/12/26'}).ok,false);
 assert.equal(h({dateIn:'12/12/26',dateOut:'10/12/26'}).ok,false);
 assert.equal(h({dateIn:'10/12/26',dateOut:'11/12/26',qty:0}).ok,false);
 assert.equal(h({dateIn:'10/12/26',dateOut:'11/12/26',price:0}).ok,false);
});
test('Xe: ngày đi và số lượng, không có ngày về',()=>{
 const s=ok(BK.buildService(base('xe',{unit:'chiếc',dateIn:'05/01/27',dateOut:'09/01/27',qty:3,price:500000,net:400000})));
 assert.equal(s.total,1500000);assert.equal(s.totalNet,1200000);assert.equal(s.dateOut,'');assert.equal(s.qty2,null);
 assert.equal(BK.buildService(base('xe',{qty:1,price:0})).ok,false);
});
test('Tour: tính riêng từng nhóm, nhóm bằng 0 không lưu',()=>{
 const s=ok(BK.buildService(base('tour',{dateIn:'20/12/26',lines:{al:{qty:2,price:500000,net:400000},tre:{qty:1,price:300000,net:250000},nct:{qty:0,price:450000,net:300000}}})));
 assert.equal(s.lines.length,2);same(s.lines.map(l=>l.k),['al','tre']);
 assert.equal(s.total,2*500000+300000);assert.equal(s.totalNet,2*400000+250000);
 assert.equal(s.lines[0].total,1000000);assert.equal(s.lines[0].label,'Người lớn');
 assert.equal(BK.netState(s),'full');
});
test('Giá net chưa đủ các nhóm thì tổng net để trống, không tính thiếu',()=>{
 const s=ok(BK.buildService(base('tour',{lines:{al:{qty:2,price:500000,net:400000},tre:{qty:1,price:300000,net:0}}})));
 assert.equal(s.totalNet,null);assert.equal(BK.netState(s),'partial');assert.equal(s.total,1300000);
 const none=ok(BK.buildService(base('tour',{lines:{al:{qty:1,price:500000,net:0}}})));assert.equal(none.totalNet,null);assert.equal(BK.netState(none),'none');
});
test('Nhóm có số lượng thì phải có giá; giá 0 gõ chủ ý được coi là miễn phí',()=>{
 assert.equal(BK.buildService(base('tour',{lines:{al:{qty:1,price:500000},tre:{qty:1,price:null}}})).ok,false);
 assert.equal(BK.buildService(base('tour',{lines:{al:{qty:1,price:500000},tre:{qty:1,price:''}}})).ok,false);
 const s=ok(BK.buildService(base('tour',{lines:{al:{qty:2,price:500000},tre:{qty:1,price:0}}})));
 assert.equal(s.total,1000000);assert.equal(s.lines[1].total,0);
 assert.equal(BK.buildService(base('tour',{lines:{al:{qty:0,price:500000}}})).ok,false);
 assert.equal(BK.buildService(base('tour',{lines:{al:{qty:1,price:0}}})).ok,false);
});
test('Ăn uống chỉ có người lớn và trẻ em, bỏ qua người cao tuổi',()=>{
 const s=ok(BK.buildService(base('an',{unit:'suất',lines:{al:{qty:2,price:200000},tre:{qty:1,price:100000},nct:{qty:5,price:1}}})));
 same(s.lines.map(l=>l.k),['al','tre']);assert.equal(s.total,500000);
});
test('Vé tàu/xe/máy bay: một chiều hay khứ hồi, giá khứ hồi là giá cả đi và về',()=>{
 const one=ok(BK.buildService(base('ve',{trip:'oneway',dateIn:'01/03/27',dateOut:'09/03/27',lines:{al:{qty:2,price:900000},tre:{qty:1,price:600000}}})));
 assert.equal(one.trip,'oneway');assert.equal(one.dateOut,'');assert.equal(one.total,2400000);
 const round=ok(BK.buildService(base('ve',{trip:'round',dateIn:'01/03/27',dateOut:'05/03/27',lines:{al:{qty:2,price:1700000},tre:{qty:1,price:1100000}}})));
 assert.equal(round.trip,'round');assert.equal(round.dateOut,'05/03/27');assert.equal(round.total,2*1700000+1100000);
 assert.equal(BK.buildService(base('ve',{trip:'round',dateIn:'05/03/27',dateOut:'01/03/27',lines:{al:{qty:1,price:1}}})).ok,false);
 assert.equal(ok(BK.buildService(base('ve',{trip:'round',dateIn:'01/03/27',dateOut:'',lines:{al:{qty:1,price:1000}}}))).total,1000);
});
test('Ngày để trống được ở loại không phải khách sạn, nhưng ngày gõ dở thì báo',()=>{
 assert.equal(BK.buildService(base('tour',{dateIn:'',lines:{al:{qty:1,price:1000}}})).ok,true);
 assert.equal(BK.buildService(base('tour',{dateIn:'20/1',lines:{al:{qty:1,price:1000}}})).ok,false);
 assert.equal(BK.buildService(base('tour',{name:'  ',lines:{al:{qty:1,price:1000}}})).ok,false);
 assert.equal(BK.buildService({...base('tour',{lines:{al:{qty:1,price:1000}}}),catId:''}).ok,false);
});
test('Đơn cũ: tổng tiền và cách đọc không đổi, tính là loại Xe',()=>{
 const old={name:'Phòng',price:1000000,qty1:2,unit1:'phòng',qty2:3,unit2:'đêm',total:6000000,netPrice:800000,totalNet:4800000,dateIn:'10/12/26',dateOut:'13/12/26'};
 assert.equal(BK.isLegacy(old),true);assert.equal(BK.catIdOf(old),'xe');assert.equal(BK.catNameOf(old,BK.DEFAULT_CATS),'Xe');
 assert.equal(BK.unitsOf(old),6);
 const l=BK.svcLines(old);assert.equal(l.length,1);assert.equal(l[0].total,6000000);assert.equal(l[0].qty2,3);
 // Sửa giá net đơn cũ vẫn nhân cột 1 × cột 2
 BK.applyNet(old,700000);assert.equal(old.netPrice,700000);assert.equal(old.totalNet,4200000);
 BK.applyNet(old,0);assert.equal(old.netPrice,null);assert.equal(old.totalNet,null);
 const oneCol={name:'Vé',price:50000,qty1:4,unit1:'vé',qty2:null,total:200000};
 BK.applyNet(oneCol,30000);assert.equal(oneCol.totalNet,120000);
});
test('Sửa giá net của dịch vụ chia nhóm',()=>{
 const s=ok(BK.buildService(base('tour',{lines:{al:{qty:2,price:500000},tre:{qty:1,price:300000}}})));
 BK.applyNet(s,{al:400000,tre:0});assert.equal(s.totalNet,null);assert.equal(s.lines[0].totalNet,800000);assert.equal(BK.netState(s),'partial');
 BK.applyNet(s,{al:400000,tre:250000});assert.equal(s.totalNet,1050000);assert.equal(BK.netState(s),'full');
});
test('Thống kê theo loại: đơn cũ tính là Xe, lãi chỉ tính dịch vụ đã đủ giá net',()=>{
 const tour=ok(BK.buildService(base('tour',{lines:{al:{qty:2,price:500000,net:400000}}})));
 const tour2=ok(BK.buildService(base('tour',{lines:{al:{qty:1,price:700000}}})));
 const hotel=ok(BK.buildService(base('hotel',{unit:'phòng',dateIn:'10/12/26',dateOut:'12/12/26',qty:1,price:1000000,net:900000})));
 const old={name:'Xe cũ',price:300000,qty1:1,unit1:'chiếc',total:300000};
 const rows=BK.statsByCat([{svcs:[tour,hotel]},{svcs:[tour2,old]}],BK.DEFAULT_CATS);
 const by=Object.fromEntries(rows.map(r=>[r.id,r]));
 assert.equal(by.tour.count,2);assert.equal(by.tour.revenue,1700000);assert.equal(by.tour.net,800000);assert.equal(by.tour.netRevenue,1000000);assert.equal(by.tour.profit,200000);
 assert.equal(by.hotel.revenue,2000000);assert.equal(by.hotel.net,1800000);assert.equal(by.hotel.profit,200000);
 assert.equal(by.xe.count,1);assert.equal(by.xe.revenue,300000);assert.equal(by.xe.net,0);assert.equal(by.xe.profit,0);
 // Loại đã bị xóa khỏi thiết lập: vẫn hiện bằng tên lúc tạo
 const gone=BK.statsByCat([{svcs:[tour]}],BK.DEFAULT_CATS.filter(c=>c.id!=='tour'));assert.equal(gone[0].name,'Tour');
});
test('CSV: mỗi nhóm người một dòng, có cột loại dịch vụ, đơn cũ giữ số liệu',()=>{
 const tour=ok(BK.buildService(base('tour',{name:'Tour đảo',dateIn:'20/12/26',lines:{al:{qty:2,price:500000,net:400000},tre:{qty:1,price:300000,net:0}}})));
 const old={name:'Xe đón',price:300000,qty1:2,unit1:'chiếc',qty2:null,total:600000,dateIn:'01/01/27'};
 const b={id:'ST26112101',created:'21/11/2026',name:'A',phone:'09',status:'pending',totalAmt:1900000,payments:[{amount:500000}],svcs:[tour,old]};
 const rows=BK.csvRows([b],{pending:'Chờ cọc'},BK.DEFAULT_CATS);
 assert.equal(rows.length,1+2+1);
 const head=rows[0],col=n=>head.indexOf(n);
 assert.ok(col('Loại dịch vụ')>=0&&col('Nhóm')>=0&&col('Chiều')>=0);
 assert.equal(rows[1][col('Loại dịch vụ')],'Tour');assert.equal(rows[1][col('Nhóm')],'Người lớn');assert.equal(rows[1][col('Số lượng')],'2 vé');
 assert.equal(rows[1][col('Đơn giá bán')],500000);assert.equal(rows[1][col('Thành tiền')],1000000);assert.equal(rows[1][col('Đơn giá net')],400000);
 assert.equal(rows[2][col('Nhóm')],'Trẻ em');assert.equal(rows[2][col('Thành tiền')],300000);assert.equal(rows[2][col('Đơn giá net')],'');
 assert.equal(rows[3][col('Loại dịch vụ')],'Xe');assert.equal(rows[3][col('Nhóm')],'');assert.equal(rows[3][col('Số lượng')],'2 chiếc');assert.equal(rows[3][col('Thành tiền')],600000);
 assert.equal(rows[3][col('Còn lại')],1400000);assert.equal(rows[3][col('Trạng thái')],'Chờ cọc');
 assert.equal(BK.csvRows([{...b,svcs:[]}],{},BK.DEFAULT_CATS).length,2);
});
test('Danh sách loại: lọc dữ liệu hỏng, trùng mã, tên sai; rỗng thì dùng 6 loại mặc định',()=>{
 assert.equal(BK.normalizeCats(null).length,6);assert.equal(BK.normalizeCats([]).length,6);
 const n=BK.normalizeCats([{id:'a1',name:' Spa ',dateMode:'single',people:'none'},{id:'a1',name:'Trùng',dateMode:'single',people:'none'},{id:'B',name:'x',dateMode:'single',people:'none'},{id:'b2',name:'<b>',dateMode:'single',people:'none'},{id:'b3',name:'Ok',dateMode:'zzz',people:'none'},{id:'b4',name:'Ok',dateMode:'trip',people:'zzz'},{id:'b5',name:'Chuyến',dateMode:'trip',people:'al-tre'}]);
 same(n.map(c=>c.id),['a1','b5']);assert.equal(n[0].name,'Spa');
 assert.equal(BK.normalizeCats([{id:'zz',name:'<>',dateMode:'single',people:'none'}]).length,6);
 const ids=BK.DEFAULT_CATS.map(c=>c.id);same(ids,['hotel','tour','xe','ve','vui','an']);
 same(BK.groupKeys('al-tre-nct'),['al','tre','nct']);same(BK.groupKeys('none'),[]);
});

test('Đối tác bắt buộc với bố cục mới, ghi chú không bắt buộc',()=>{
 const t=(extra)=>BK.buildService(base('tour',{lines:{al:{qty:1,price:1000}},...extra}));
 assert.equal(t({partnerId:''}).ok,false);assert.equal(t({partnerId:''}).error,'Chọn đối tác.');
 assert.equal(t({partner:'  '}).ok,false);
 const a=ok(t({}));assert.equal(a.partnerId,'p1');assert.equal(a.partner,'Đối tác thử');assert.equal('note' in a,false);
 const b=ok(t({note:'  Đón tại sảnh  '}));assert.equal(b.note,'Đón tại sảnh');
 assert.equal(ok(t({note:'   '})).note,undefined);
 assert.equal(t({note:'x'.repeat(300)}).ok,true);
 assert.equal(t({note:'x'.repeat(301)}).ok,false);
 // ghi chú và đối tác không ảnh hưởng tiền
 assert.equal(ok(t({note:'abc'})).total,1000);
});
test('Đối tác: kiểm tra tên, SĐT, email, danh sách dịch vụ',()=>{
 assert.equal(BK.validPartnerName('Vinpearl & Co'),true);assert.equal(BK.validPartnerName(' '),false);assert.equal(BK.validPartnerName('<b>'),false);assert.equal(BK.validPartnerName('x'.repeat(61)),false);
 assert.equal(BK.validPhone(''),true);assert.equal(BK.validPhone('+84 90-123 4567'),true);assert.equal(BK.validPhone('abc'),false);
 assert.equal(BK.validEmail(''),true);assert.equal(BK.validEmail('a@b.vn'),true);assert.equal(BK.validEmail('a@b'),false);assert.equal(BK.validEmail('a b@c.vn'),false);
 same(BK.parseServices('Phòng A\n\n Phòng A \nTour "đảo" & Hòn Mun'),['Phòng A','Tour "đảo" & Hòn Mun']);
 assert.equal(BK.parseServices('ok\n<x>'),null);
 assert.equal(BK.parseServices(Array.from({length:101},(_,i)=>'d'+i).join('\n')),null);
});
test('Đối tác: chuẩn hóa danh sách và lọc theo loại dịch vụ',()=>{
 const raw=[{id:'p1',name:' Khách sạn   A ',phone:'0901',email:'a@b.vn',cats:['hotel','bad id'],services:['Deluxe','Deluxe','Suite']},
  {id:'p1',name:'Trùng mã'},{id:'p2',name:'Tour B',cats:['tour','vui']},{id:'p3',name:'<x>'},{id:'P4',name:'Mã sai'},null,'x'];
 const list=BK.normalizePartners(raw);
 same(list.map(p=>p.id),['p1','p2']);
 assert.equal(list[0].name,'Khách sạn A');same(list[0].cats,['hotel']);same(list[0].services,['Deluxe','Suite']);
 same(BK.partnersForCat(list,'tour').map(p=>p.id),['p2']);same(BK.partnersForCat(list,'xe'),[]);
 assert.equal(BK.findPartner(list,'p2').name,'Tour B');assert.equal(BK.findPartner(list,'zz'),null);
 same(BK.normalizePartners(null),[]);
});

test('email CC: parseEmails, mergeEmails, gmailUrl',()=>{
 same(BK.parseEmails(''),[]);
 same(BK.parseEmails('a@x.vn, B@y.vn; a@X.vn\nc@z.vn'),['a@x.vn','B@y.vn','c@z.vn']);
 assert.equal(BK.parseEmails('khong-phai-email'),null);
 assert.equal(BK.parseEmails('a@x.vn, loi'),null);
 assert.equal(BK.parseEmails(Array.from({length:11},(_,i)=>'u'+i+'@x.vn').join(',')),null);
 same(BK.mergeEmails([['a@x.vn','b@x.vn'],['B@x.vn','c@x.vn'],null],['a@x.vn']),['b@x.vn','c@x.vn']);
 const u=BK.gmailUrl('to@x.vn',['c1@x.vn','c2@x.vn'],'Tiêu đề & thử','Dòng 1\nDòng 2');
 const q=new URL(u).searchParams;
 assert.equal(new URL(u).host,'mail.google.com');
 assert.equal(q.get('to'),'to@x.vn');assert.equal(q.get('cc'),'c1@x.vn,c2@x.vn');
 assert.equal(q.get('su'),'Tiêu đề & thử');assert.equal(q.get('body'),'Dòng 1\nDòng 2');
 assert.equal(new URL(BK.gmailUrl('',[],'s','b')).searchParams.get('to'),'');
});
test('đối tác có cc',()=>{
 const l=BK.normalizePartners([{id:'p1',name:'A',email:'a@x.vn',cc:['q@x.vn','t@x.vn']},{id:'p2',name:'B',cc:['bad']}]);
 same(l[0].cc,['q@x.vn','t@x.vn']);same(l[1].cc,[]);
});
