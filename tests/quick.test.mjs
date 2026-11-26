import test from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import worker from '../public/_worker.js';
import {runtime} from '../scripts/local-runtime.mjs';
const pass='Only-for-local-tests-Change-This-123!';
const hash='test-salt:'+pbkdf2Sync(pass,'test-salt',100000,32,'sha256').toString('hex');
const origin='https://serene-test.pages.dev';
function client(env){
 let cookie='',csrf='';
 const call=async(path,method='GET',body,raw)=>worker.fetch(new Request(origin+path,{method,headers:{origin,...(method==='GET'?{}:{'content-type':raw||'application/json'}),...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{})},body:body==null?undefined:raw?body:JSON.stringify(body)}),env);
 const j=async(...a)=>{const r=await call(...a);return {status:r.status,body:await r.json().catch(()=>null)}};
 const login=async(email,password)=>{const r=await call('/api/login','POST',{email,password});if(r.status===200){cookie=r.headers.get('set-cookie').split(';')[0];csrf=(await r.json()).csrf}return r};
 return {call,j,login};
}
const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
test('Copy nhanh: tin nhắn mẫu thêm, sửa, xóa',async()=>{
 const env=await runtime({passwordHash:hash});const o=client(env);await o.login('serenetravelvn@gmail.com',pass);
 assert.deepEqual((await o.j('/api/quick')).body,{msgs:[],photos:[]});
 assert.equal((await o.j('/api/quick/msg','POST',{title:'',body:'x'})).status,400);
 assert.equal((await o.j('/api/quick/msg','POST',{sec:'',title:'a',body:'x'})).status,400,'bắt buộc có mục');
 const a=await o.j('/api/quick/msg','POST',{sec:'Vinpearl 2N1Đ',grp:'Vin Đảo Hòn Tre',title:'KS A',body:'Dạ em gửi chị\nGiá: 3.500.000đ'});assert.equal(a.status,201);
 const id=a.body.msg.id;
 assert.equal((await o.j('/api/quick/msg/'+id,'PUT',{sec:'Vinpearl 2N1Đ',grp:'',title:'Vinpearl',body:'Nội dung mới'})).status,200);
 const l=(await o.j('/api/quick')).body;assert.equal(l.msgs.length,1);assert.equal(l.msgs[0].body,'Nội dung mới');
 assert.equal((await o.j('/api/quick/msg/'+id,'DELETE')).status,200);
 assert.equal((await o.j('/api/quick')).body.msgs.length,0);
 assert.equal((await o.j('/api/quick/msg/Qkhongco123','PUT',{sec:'a',title:'a',body:'b'})).status,404);
});
test('Copy nhanh: ảnh khách sạn, tải lên, đổi album, xóa kèm file',async()=>{
 const env=await runtime({passwordHash:hash});const o=client(env);await o.login('serenetravelvn@gmail.com',pass);
 const up=await o.j('/api/upload','POST',png,'image/png');assert.equal(up.status,200);
 assert.equal((await o.j('/api/quick/photo','POST',{album:'',url:up.body.url})).status,400);
 assert.equal((await o.j('/api/quick/photo','POST',{album:'Vinpearl',url:'https://evil.com/a.png'})).status,400);
 const p=await o.j('/api/quick/photo','POST',{album:'Vinpearl',label:'Hồ bơi',url:up.body.url});assert.equal(p.status,201);
 assert.equal((await o.call(up.body.url)).status,200);
 assert.equal((await o.j('/api/quick/photo/'+p.body.photo.id,'PUT',{album:'Vinpearl Luxury',label:'Phòng'})).status,200);
 assert.equal((await o.j('/api/quick')).body.photos[0].album,'Vinpearl Luxury');
 assert.equal((await o.j('/api/quick/photo/'+p.body.photo.id,'DELETE')).status,200);
 assert.equal((await o.call(up.body.url)).status,404,'file ảnh bị xóa khỏi kho');
});
test('Copy nhanh: chỉ Chủ dùng được',async()=>{
 const env=await runtime({passwordHash:hash});const o=client(env);await o.login('serenetravelvn@gmail.com',pass);
 await o.j('/api/staff','POST',{name:'S',email:'s@example.com',password:'matkhau-tam-1',role:'sales'});
 const s=client(env);assert.equal((await s.login('s@example.com','matkhau-tam-1')).status,200);
 assert.equal((await s.j('/api/quick')).status,403);
 assert.equal((await client(env).j('/api/quick')).status,401);
});
test('Copy nhanh: ảnh lớn (đến 20 MB) chỉ qua đường tải riêng của Chủ',async()=>{
 const env=await runtime({passwordHash:hash});const o=client(env);await o.login('serenetravelvn@gmail.com',pass);
 const big=new Uint8Array(6*1024*1024);big.set([137,80,78,71,13,10,26,10]);
 assert.equal((await o.j('/api/upload','POST',big,'image/png')).status,413);
 assert.equal((await o.j('/api/upload?big=1','POST',big,'image/png')).status,200);
});
test('Copy nhanh: 3 tầng Mục > Nhóm > Tin, đổi tên và xóa cả mục/nhóm',async()=>{
 const env=await runtime({passwordHash:hash});const o=client(env);await o.login('serenetravelvn@gmail.com',pass);
 const add=(sec,grp,title)=>o.j('/api/quick/msg','POST',{sec,grp,title,body:'Nội dung '+title});
 for(const t of ['A','B','C','D'])assert.equal((await add('Vinpearl 2N1Đ','Vin Đảo Hòn Tre','KS '+t)).status,201);
 for(const t of ['E','F'])assert.equal((await add('Vinpearl 2N1Đ','Vin Thành Phố','KS '+t)).status,201);
 await add('Chào khách','','Lời chào');
 let m=(await o.j('/api/quick')).body.msgs;assert.equal(m.length,7);
 assert.equal(m.filter(x=>x.sec==='Vinpearl 2N1Đ'&&x.grp==='Vin Thành Phố').length,2);
 assert.equal((await o.j('/api/quick/rename','POST',{level:'grp',sec:'Vinpearl 2N1Đ',from:'Vin Thành Phố',to:'Vin City'})).status,200);
 assert.equal((await o.j('/api/quick/rename','POST',{level:'sec',from:'Vinpearl 2N1Đ',to:'Vinpearl 2N1D'})).status,200);
 m=(await o.j('/api/quick')).body.msgs;assert.equal(m.filter(x=>x.sec==='Vinpearl 2N1D'&&x.grp==='Vin City').length,2);
 assert.equal((await o.j('/api/quick/rename','POST',{level:'sec',from:'x',to:''})).status,400);
 assert.equal((await o.j('/api/quick/group','POST',{level:'grp',sec:'Vinpearl 2N1D',grp:'Vin City'})).status,200);
 assert.equal((await o.j('/api/quick')).body.msgs.length,5);
 assert.equal((await o.j('/api/quick/group','POST',{level:'sec',sec:'Vinpearl 2N1D'})).status,200);
 assert.deepEqual((await o.j('/api/quick')).body.msgs.map(x=>x.sec),['Chào khách']);
});
test('Copy nhanh: bảng cũ chỉ có nhóm thì chuyển nhóm cũ thành Mục',async()=>{
 const env=await runtime({passwordHash:hash});
 await env.DB.prepare("CREATE TABLE quick_msgs (id TEXT PRIMARY KEY, grp TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL)").run();
 await env.DB.prepare("INSERT INTO quick_msgs VALUES ('Qold000001','Báo giá','Mẫu cũ','nd','t','t')").run();
 const o=client(env);await o.login('serenetravelvn@gmail.com',pass);
 const m=(await o.j('/api/quick')).body.msgs;assert.equal(m[0].sec,'Báo giá');assert.equal(m[0].grp,'');
 const again=(await o.j('/api/quick')).body.msgs;assert.equal(again[0].sec,'Báo giá');
});
