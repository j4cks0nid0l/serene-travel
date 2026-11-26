// Đọc file Commitment (bản xuất text) thành CSV bảng giá để xem lại rồi nhập vào phần mềm.
// Cách chạy: node scripts/commitment-to-csv.mjs <file-commitment> <thư-mục-ra>
import fs from 'node:fs';
import vm from 'node:vm';
const [src,out]=process.argv.slice(2);
if(!src||!out){console.error('Dùng: node scripts/commitment-to-csv.mjs <file> <thư mục ra>');process.exit(1)}
const ctx={};ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../public/admin/booking/rates.js',import.meta.url),'utf8'),ctx);
const RT=ctx.RT;
const r=RT.parseCommitment(fs.readFileSync(src,'utf8'));
fs.mkdirSync(out,{recursive:true});
const toRecs=l=>l.map(h=>({name:h.name,address:h.address,phone:h.phone,note:h.note,rows:h.rows}));
fs.writeFileSync(out+'/bang-gia-chac-chan.csv',RT.toCsv(RT.exportRows(toRecs(r.ok),[])));
fs.writeFileSync(out+'/bang-gia-can-xem-lai.csv',RT.toCsv(RT.exportRows(toRecs(r.review),[])));
const lines=['KHÁCH SẠN CẦN XEM LẠI (đã đọc được một phần, có cảnh báo)',...r.review.map(h=>'- '+h.name+': '+h.warn.join('; ')),'','SHEET CHƯA ĐỌC ĐƯỢC (cần nhập tay hoặc gửi lại bố cục chuẩn)',...r.skipped.map(s=>'- '+s.sheet+': '+s.why)];
fs.writeFileSync(out+'/danh-sach-chua-doc-duoc.txt',lines.join('\n')+'\n');
console.log('Chắc chắn:',r.ok.length,'khách sạn,',r.ok.reduce((a,h)=>a+h.rows.length,0),'dòng giá');
console.log('Cần xem lại:',r.review.length,'khách sạn');
console.log('Chưa đọc được:',r.skipped.length,'sheet');
