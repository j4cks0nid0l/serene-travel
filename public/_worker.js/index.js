// Module index: tách từ _worker.js (không đổi hành vi, chỉ tách theo chức năng).
import {ADMIN_CSP,BOOKING_CSP,CSP,adminEmail,json,passwordOK,sessionCookie,sha} from './core.js';
import {putContent} from './content.js';
import {bookingApi,cleanBookingCategories,cleanBookingHotels,cleanBookingPartners,cleanEmailList,cleanUnitHide} from './booking.js';
import {crmApi,publicLead} from './crm.js';
import {machineApi,postsApi} from './posts.js';
import {uploadImage} from './media.js';
import {ROLE_LABELS,auditApi,can,logAudit,makePasswordHash,noPerm,resolveActor,staffApi,staffLogin} from './auth.js';
import {quickApi} from './quick.js';
import {ctvAdminApi,ctvPriceApi,ctvSvcApi,salesApi} from './ctv.js';

export {sanitize} from './content.js';
export default {async fetch(req,env){try{return await handle(req,env)}catch(err){console.error('Request failed:',err.message);return json({error:'Chưa xử lý được yêu cầu. Vui lòng thử lại.'},500)}}};

async function handle(req,env){const u=new URL(req.url),path=u.pathname;
if(path.startsWith('/media/')){if(req.method!=='GET')return json({error:'Không hỗ trợ.'},405);const key=path.slice(7);if(!/^[a-zA-Z0-9._-]+$/.test(key))return new Response('Not found',{status:404});if(!env.MEDIA)return new Response('Not configured',{status:503});const o=await env.MEDIA.get(key);if(!o)return new Response('Not found',{status:404});return new Response(o.body,{headers:{'content-type':o.httpMetadata?.contentType||'application/octet-stream','cache-control':'public,max-age=31536000,immutable','x-content-type-options':'nosniff'}})}
if(!path.startsWith('/api/')){const response=await env.ASSETS.fetch(req);const headers=new Headers(response.headers);headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');headers.set('Content-Security-Policy',path.startsWith('/admin/booking')?BOOKING_CSP:path.startsWith('/admin')?ADMIN_CSP:CSP);if(path.startsWith('/admin'))headers.set('Cache-Control','no-store');if(path==='/sales'||path.startsWith('/sales/')){headers.set('Cache-Control','no-store');headers.set('X-Robots-Tag','noindex, nofollow')}return new Response(response.body,{status:response.status,headers})}
if(!env.DB)return json({error:'Chưa kết nối kho nội dung Cloudflare.'},503);
if(path==='/api/public'&&req.method==='GET'){const {results}=await env.DB.prepare('SELECT id,published,updated FROM content WHERE published IS NOT NULL').all();return json({items:results.map(x=>({id:x.id,...JSON.parse(x.published),updated:x.updated}))})}
if(path.startsWith('/api/machine/'))return machineApi(req,env,path,u);
if(req.method!=='GET'&&req.headers.get('origin')!==u.origin)return json({error:'Yêu cầu không hợp lệ.'},403);
if(path==='/api/lead-public'&&req.method==='POST')return publicLead(req,env);
if(path==='/api/sales'||path.startsWith('/api/sales/'))return salesApi(req,env,path,u);
if(path==='/api/login'&&req.method==='POST'){
 if(!env.ADMIN_PASSWORD_HASH)return json({error:'Chưa thiết lập tài khoản quản trị.'},503);
 if(Number(req.headers.get('content-length')||0)>4096)return json({error:'Yêu cầu quá lớn.'},413);
 const bucket=Math.floor(Date.now()/900000),ip=req.headers.get('CF-Connecting-IP')||'local';const limits=['ip:'+await sha(ip)+':'+bucket,'global:'+bucket];
 for(const key of limits){await env.DB.prepare('INSERT INTO attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').bind(key,Date.now()+900000).run();const row=await env.DB.prepare('SELECT count FROM attempts WHERE key=?').bind(key).first();if(row.count>(key.startsWith('global:')?300:10))return json({error:'Đã thử quá nhiều lần. Vui lòng đợi 15 phút.'},429)}
 let input;try{input=await req.json()}catch{return json({error:'Nội dung không hợp lệ.'},400)}const pass=typeof input.password==='string'?input.password:'';if(pass.length>256)return json({error:'Đăng nhập không thành công.'},401);
 const mail=typeof input.email==='string'?input.email.toLowerCase().trim():'';
 if(!adminEmail(env)||mail!==adminEmail(env))return staffLogin(env,mail,pass,req);
 const ok=await passwordOK(pass,env.ADMIN_PASSWORD_HASH);if(!ok)return json({error:'Email hoặc mật khẩu chưa đúng.'},401);
 const token=crypto.randomUUID()+'-'+crypto.randomUUID(),csrf=crypto.randomUUID();await env.DB.prepare('INSERT INTO sessions(token,csrf,expires) VALUES(?,?,?)').bind(await sha(token),csrf,Date.now()+8*3600000).run();await env.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(Date.now()).run();await env.DB.prepare('DELETE FROM attempts WHERE expires<?').bind(Date.now()).run();return json({email:adminEmail(env),csrf,name:'Chủ',role:'owner'},200,{'set-cookie':sessionCookie(token,28800,req)})
}
const actor=await resolveActor(req,env);
if(!actor)return json({error:'Vui lòng đăng nhập.'},401);
if(req.method!=='GET'&&req.headers.get('x-csrf-token')!==actor.csrf)return json({error:'Phiên xác thực không hợp lệ. Hãy đăng nhập lại.'},403);
if(path==='/api/session'&&req.method==='GET')return json({email:actor.email,csrf:actor.csrf,id:actor.id,name:actor.name,role:actor.role,roleLabel:ROLE_LABELS[actor.role]||actor.role,perms:actor.perms});
if(path==='/api/logout'&&req.method==='POST'){await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(actor.token).run();if(!actor.owner)await env.BOOKINGS.prepare('DELETE FROM staff_sessions WHERE token=?').bind(actor.token).run();return json({ok:true},200,{'set-cookie':sessionCookie('',0,req)})}
if(path==='/api/me/password'&&req.method==='POST'){
 if(actor.owner)return json({error:'Mật khẩu của Chủ đổi trong Cloudflare (ADMIN_PASSWORD_HASH), không đổi ở đây.'},400);
 let i;try{i=await req.json()}catch{return json({error:'Nội dung không hợp lệ.'},400)}
 if(typeof i?.next!=='string'||i.next.length<8||i.next.length>128)return json({error:'Mật khẩu mới cần từ 8 đến 128 ký tự.'},400);
 const row=await env.BOOKINGS.prepare('SELECT hash FROM staff WHERE id=?').bind(actor.id).first();
 if(!row||typeof i.current!=='string'||i.current.length>128||!await passwordOK(i.current,row.hash))return json({error:'Mật khẩu hiện tại chưa đúng.'},400);
 await env.BOOKINGS.prepare('UPDATE staff SET hash=?,updated=? WHERE id=?').bind(await makePasswordHash(i.next),new Date().toISOString(),actor.id).run();
 await env.BOOKINGS.prepare('DELETE FROM staff_sessions WHERE staff_id=? AND token<>?').bind(actor.id,actor.token).run();
 await logAudit(env,actor,'staff.password',actor.id,'Tự đổi mật khẩu');
 return json({ok:true})
}
if(!actor.owner&&!/^\/api\/(booking|booking-qr|booking-settings|booking-units|hotel-rates|customers|leads|staff|audit|ctv)(\/|$)/.test(path))return noPerm('Tài khoản nhân viên không vào được phần này.');
if(path==='/api/staff'||path.startsWith('/api/staff/'))return staffApi(req,env,path,actor,u);
if(path==='/api/audit'&&req.method==='GET')return auditApi(req,env,u,actor);
if(path==='/api/ctv/price'||path==='/api/ctv/price/import')return ctvPriceApi(req,env,path,u,actor);
if(path==='/api/ctv/services'||path==='/api/ctv/avail')return ctvSvcApi(req,env,path,u,actor);
if(path==='/api/ctv'||path.startsWith('/api/ctv/'))return ctvAdminApi(req,env,path,actor);
if(path==='/api/content'&&req.method==='GET'){const {results}=await env.DB.prepare('SELECT * FROM content ORDER BY updated DESC').all();return json({items:results.map(x=>({id:x.id,draft:JSON.parse(x.draft),published:x.published?JSON.parse(x.published):null,updated:x.updated}))})}
if(path==='/api/upload'&&req.method==='POST')return uploadImage(req,env,actor.owner&&u.searchParams.get('big')==='1'?20:5);
if(path==='/api/booking-qr'&&req.method==='GET'){
 // Lấy mã QR VietQR qua máy chủ để trình duyệt chụp ảnh phiếu được (không bị chặn khác nguồn). Tài khoản nhận cố định.
 const amount=u.searchParams.get('amount')||'0',info=u.searchParams.get('info')||'';
 if(!/^\d{1,10}$/.test(amount)||!/^[A-Za-z0-9 ]{0,50}$/.test(info))return json({error:'Tham số QR không hợp lệ.'},400);
 let r;try{r=await fetch('https://img.vietqr.io/image/970422-0327818196-compact2.png?accountName=NGUYEN+DUY+HA'+(Number(amount)>0?'&amount='+amount:'')+(info?'&addInfo='+encodeURIComponent(info):''),{signal:AbortSignal.timeout(10000)})}catch{return json({error:'Không lấy được mã QR.'},502)}
 if(!r.ok||!(r.headers.get('content-type')||'').startsWith('image/'))return json({error:'Không lấy được mã QR.'},502);
 return new Response(r.body,{headers:{'content-type':r.headers.get('content-type'),'cache-control':'private, max-age=300','x-content-type-options':'nosniff'}})
}
if(path==='/api/booking-units'){
 if(req.method!=='GET'&&!can(actor,'settings.edit'))return noPerm();
 if(!env.BOOKINGS)return json({error:'Chưa kết nối kho đơn hàng.'},503);
 try{
  if(req.method==='GET'){const {results}=await env.BOOKINGS.prepare('SELECT name FROM booking_units ORDER BY rowid').all();return json({units:results.map(r=>r.name)})}
  if(req.method==='POST'){
   let input;try{input=await req.json()}catch{return json({error:'Nội dung không hợp lệ.'},400)}
   const name=typeof input?.name==='string'?input.name.trim().replace(/\s+/g,' '):'';
   if(!name||name.length>20||/[<>"&]/.test(name))return json({error:'Tên đơn vị phải từ 1 đến 20 ký tự, không chứa < > " &.'},400);
   const c=await env.BOOKINGS.prepare('SELECT COUNT(*) AS n FROM booking_units').first();if((c?.n||0)>=100)return json({error:'Đã có quá nhiều đơn vị.'},400);
   await env.BOOKINGS.prepare('INSERT OR IGNORE INTO booking_units(name,created) VALUES(?,?)').bind(name,new Date().toISOString()).run();return json({ok:true,name})
  }
  if(req.method==='DELETE'){
   const name=(u.searchParams.get('name')||'').trim();if(!name||name.length>20)return json({error:'Thiếu tên đơn vị.'},400);
   await env.BOOKINGS.prepare('DELETE FROM booking_units WHERE name=?').bind(name).run();return json({ok:true})
  }
 }catch{return json({error:'Chưa có bảng đơn vị. Cần chạy thêm lệnh tạo bảng trong D1.'},503)}
 return json({error:'Không hỗ trợ.'},405)
}
if(path==='/api/hotel-rates'){
 if(!can(actor,req.method==='GET'?'rates.view':'rates.edit'))return noPerm();
 // Bảng giá net theo khách sạn: mỗi khách sạn một dòng trong booking_settings (khóa rates:tên), không cần tạo bảng mới.
 if(!env.BOOKINGS)return json({error:'Chưa kết nối kho đơn hàng.'},503);
 const hk=n=>String(n||'').trim().toLowerCase().replace(/\s+/g,' '),url=new URL(req.url);
 try{
  if(req.method==='GET'){
   const want=url.searchParams.get('hotel');
   if(want){const row=await env.BOOKINGS.prepare('SELECT value FROM booking_settings WHERE key=?').bind('rates:'+hk(want)).first();let v=null;try{v=row?JSON.parse(row.value):null}catch{}return json({rates:v})}
   const {results}=await env.BOOKINGS.prepare("SELECT key,value FROM booking_settings WHERE key LIKE 'rates:%'").all();
   const list=[];for(const r of results){try{const v=JSON.parse(r.value);list.push({name:v.name,updated:v.updated||'',rows:Array.isArray(v.rows)?v.rows.length:0,last:Array.isArray(v.rows)?v.rows.reduce((m,x)=>x.to>m?x.to:m,''):'',note:!!v.note})}catch{}}
   return json({list})
  }
  if(req.method==='PUT'){
   if(Number(req.headers.get('content-length')||0)>900000)return json({error:'Dữ liệu quá lớn, hãy nhập ít khách sạn hơn mỗi lần.'},413);
   let input;try{input=await req.json()}catch{return json({error:'Nội dung không hợp lệ.'},400)}
   const items=input&&Array.isArray(input.items)?input.items:null;
   if(!items||!items.length||items.length>20)return json({error:'Mỗi lần lưu 1 đến 20 khách sạn.'},400);
   const t=(x,max)=>{if(x==null)return '';if(typeof x!=='string')return null;const y=x.trim();return y.length>max||/[<>]/.test(y)?null:y};
   const isD=s=>{const m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(s||'');if(!m)return false;const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));return d.getUTCFullYear()===+m[1]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[3]};
   const writes=[];
   for(const it of items){
    if(!it||typeof it!=='object')return json({error:'Khách sạn không hợp lệ.'},400);
    const name=t(it.name,120);if(!name)return json({error:'Tên khách sạn không hợp lệ.'},400);
    const note=t(it.note,2000);if(note===null)return json({error:name+': ghi chú quá dài hoặc có ký tự < >.'},400);
    const updated=t(it.updated,20);if(updated===null)return json({error:name+': ngày cập nhật không hợp lệ.'},400);
    if(!Array.isArray(it.rows)||it.rows.length>600)return json({error:name+': tối đa 600 dòng giá.'},400);
    const rows=[];
    for(const r of it.rows){
     if(!r||typeof r!=='object')return json({error:name+': dòng giá không hợp lệ.'},400);
     const room=t(r.room,120),label=t(r.label,60),p=r.p==null?'':r.p;
     if(!room||label===null||typeof p!=='string'||(p&&!/^[A-Za-z0-9_-]{1,40}$/.test(p))||!isD(r.from)||!isD(r.to)||r.from>r.to)return json({error:name+': có dòng giá sai hạng phòng, đối tác hoặc ngày.'},400);
     const net=r.net,sat=r.sat==null?null:r.sat;
     if(!Number.isInteger(net)||net<1||net>100000000||(sat!==null&&(!Number.isInteger(sat)||sat<1||sat>100000000)))return json({error:name+': có dòng giá sai số tiền.'},400);
     rows.push({p,room,label,from:r.from,to:r.to,net,sat})
    }
    writes.push([ 'rates:'+hk(name),JSON.stringify({name,note,updated,rows}) ])
   }
   for(const [k,v] of writes)await env.BOOKINGS.prepare('INSERT INTO booking_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k,v).run();
   return json({ok:true,saved:writes.length})
  }
  if(req.method==='DELETE'){
   const want=url.searchParams.get('hotel');if(!want)return json({error:'Thiếu tên khách sạn.'},400);
   await env.BOOKINGS.prepare('DELETE FROM booking_settings WHERE key=?').bind('rates:'+hk(want)).run();return json({ok:true})
  }
 }catch{return json({error:'Chưa lưu được bảng giá. Thử lại sau.'},503)}
 return json({error:'Không hỗ trợ.'},405)
}
if(path==='/api/booking-settings'){
 if(req.method!=='GET'&&!can(actor,'settings.edit'))return noPerm();
 if(!env.BOOKINGS)return json({error:'Chưa kết nối kho đơn hàng.'},503);
 try{
  if(req.method==='GET'){const {results}=await env.BOOKINGS.prepare('SELECT key,value FROM booking_settings').all();const out={};for(const r of results)out[r.key]=r.value;const parse=k=>{try{return out[k]?JSON.parse(out[k]):null}catch{return null}};return json({settings:{slipNote:out.slipNote||'',categories:parse('categories'),unitHide:parse('unitHide')||{},partners:parse('partners')||[],ccInternal:parse('ccInternal')||[],hotels:parse('hotels')||[]}})}
  if(req.method==='PUT'){
   let input;try{input=await req.json()}catch{return json({error:'Nội dung không hợp lệ.'},400)}
   if(!input||typeof input!=='object'||Array.isArray(input))return json({error:'Nội dung không hợp lệ.'},400);
   const writes=[];
   if(input.slipNote!==undefined){
    const note=input.slipNote;
    if(typeof note!=='string'||note.length>300)return json({error:'Ghi chú tối đa 300 ký tự.'},400);
    writes.push(['slipNote',note.trim()])
   }
   if(input.categories!==undefined){
    const cats=cleanBookingCategories(input.categories);if(!cats)return json({error:'Danh sách loại dịch vụ không hợp lệ.'},400);
    writes.push(['categories',JSON.stringify(cats)])
   }
   if(input.unitHide!==undefined){
    const hide=cleanUnitHide(input.unitHide);if(!hide)return json({error:'Thiết lập đơn vị theo loại không hợp lệ.'},400);
    writes.push(['unitHide',JSON.stringify(hide)])
   }
   if(input.partners!==undefined){
    const ps=cleanBookingPartners(input.partners);if(!ps)return json({error:'Danh sách đối tác không hợp lệ.'},400);
    writes.push(['partners',JSON.stringify(ps)])
   }
   if(input.hotels!==undefined){
    const hs=cleanBookingHotels(input.hotels);if(!hs)return json({error:'Danh sách khách sạn không hợp lệ.'},400);
    writes.push(['hotels',JSON.stringify(hs)])
   }
   if(input.ccInternal!==undefined){
    const cc=cleanEmailList(input.ccInternal);if(!cc)return json({error:'Danh sách email CC không hợp lệ (tối đa 10 email).'},400);
    writes.push(['ccInternal',JSON.stringify(cc)])
   }
   if(!writes.length)return json({error:'Không có gì để lưu.'},400);
   for(const [k,v] of writes)await env.BOOKINGS.prepare('INSERT INTO booking_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k,v).run();return json({ok:true})
  }
 }catch{return json({error:'Chưa có bảng thiết lập. Cần chạy thêm lệnh tạo bảng trong D1.'},503)}
 return json({error:'Không hỗ trợ.'},405)
}
if(path==='/api/posts'||path.startsWith('/api/posts/'))return postsApi(req,env,path);
if(path==='/api/quick'||path.startsWith('/api/quick/'))return quickApi(req,env,path);
const crm=await crmApi(req,env,path,actor);if(crm)return crm;
if(path==='/api/booking'||path.startsWith('/api/booking/'))return bookingApi(req,env,path,actor);
const match=/^\/api\/content\/([a-z0-9-]{1,90})$/.exec(path);if(match&&req.method==='PUT')return putContent(req,env,match[1]);
return json({error:'Không tìm thấy.'},404)
}
