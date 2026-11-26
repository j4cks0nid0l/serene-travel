import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx={TextDecoder,TextEncoder,Blob,Response,DecompressionStream,Uint8Array,Date,Math,Number,String,parseInt,isFinite,isNaN,RegExp,Error,Array};ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../public/admin/booking/xlsx.js',import.meta.url),'utf8'),ctx);
const XR=ctx.XR;
const J=x=>JSON.parse(JSON.stringify(x));
const ab=u8=>u8.buffer.slice(u8.byteOffset,u8.byteOffset+u8.byteLength);

test('Đọc file Excel thật: chữ có ký tự đặc biệt, ngày thành dd/mm/yyyy, số nguyên, chỉ lấy sheet đầu',async()=>{
 const f=fs.readFileSync(new URL('./fixtures/excel-thuong.xlsx',import.meta.url));
 const rows=J(await XR.readFirstSheet(ab(f)));
 assert.deepEqual(rows[0],['Tên','Ngày','Số','Giờ']);
 assert.deepEqual(rows[1],['Nguyễn & "Anh" <A>','01/04/2027','1200000','0901234567']);
 assert.equal(rows[2][2],'3.5');
 assert.equal(rows[4][1],'31/12/2026');
 assert.equal(rows.length,5);            // dòng trống cuối bị cắt, sheet thứ hai không đọc
 assert.equal(JSON.stringify(rows).includes('KHÔNG ĐỌC'),false);
});
test('Tạo file rồi đọc lại ra đúng dữ liệu, ô số giữ là số, ô văn bản giữ số 0 đầu',async()=>{
 const rows=[['A','B','C'],['VÍ DỤ',' 0901',1500000],['x & y <z>','"q"',2]];
 const bin=XR.build([{name:'Bảng giá',rows,widths:[10,10,10],textCols:[1],validations:[{sqref:'A2:A9',type:'list',formula:"'Đối tác'!$A$2:$A$9",error:'Chọn trong danh sách'},{sqref:'C2:C9',type:'whole',formula:'1',formula2:'100'}]},{name:'Đối tác',rows:[['Tên'],['Đối tác Một']],note:true}]);
 const back=J(await XR.readFirstSheet(ab(bin)));
 assert.deepEqual(back,[['A','B','C'],['VÍ DỤ',' 0901','1500000'],['x & y <z>','"q"','2']]);
});
test('File không phải Excel bị từ chối bằng thông báo rõ ràng',async()=>{
 await assert.rejects(()=>XR.readFirstSheet(new TextEncoder().encode('a,b\n1,2').buffer),/không phải file Excel/i);
 await assert.rejects(()=>XR.readFirstSheet(new ArrayBuffer(0)),/không phải file Excel/i);
});
