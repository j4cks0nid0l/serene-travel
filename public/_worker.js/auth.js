// Module auth: tách từ _worker.js (không đổi hành vi, chỉ tách theo chức năng).
import {adminEmail,cookie,enc,hex,json,passwordOK,sessionCookie,sha} from './core.js';

export const PERM_CATALOG=[
 ['Đơn hàng','order.view_all','Xem đơn của mọi người (không bật thì chỉ thấy đơn mình tạo)'],
 ['Đơn hàng','order.create','Tạo đơn'],
 ['Đơn hàng','order.edit','Sửa đơn đang xử lý'],
 ['Đơn hàng','order.edit_done','Sửa đơn đã Thành công hoặc Hủy'],
 ['Đơn hàng','order.complete','Bấm Thành công (và đưa đơn Thành công về lại)'],
 ['Đơn hàng','order.cancel','Bấm Hủy'],
 ['Đơn hàng','order.delete_request','Gửi yêu cầu xóa đơn'],
 ['Đơn hàng','order.delete_approve','Duyệt yêu cầu xóa và xóa đơn'],
 ['Giá net','net.access','Xem và nhập giá net, chọn đối tác'],
 ['Tiền thu','pay.record','Ghi nhận thu tiền (khoản của người không có quyền duyệt sẽ ở trạng thái Chờ duyệt)'],
 ['Tiền thu','pay.approve','Duyệt phiếu thu Chờ duyệt, sửa hoặc xóa phiếu thu đã có'],
 ['Tiền thu','pay.refund','Ghi nhận hoàn tiền (số tiền âm)'],
 ['Hoa hồng và đối tác','commission.edit','Nhập hoa hồng CTV'],
 ['Hoa hồng và đối tác','commission.pay','Đánh dấu đã trả hoa hồng'],
 ['Hoa hồng và đối tác','supplier.pay','Đánh dấu đã trả đối tác'],
 ['Khách hàng','customer.view_all','Xem khách của mọi người'],
 ['Khách hàng','customer.create','Thêm khách và CTV'],
 ['Khách hàng','customer.edit','Sửa khách (của mình, hoặc của mọi người nếu có quyền xem tất cả)'],
 ['Khách hàng','customer.delete','Xóa khách'],
 ['Lead','lead.view_all','Xem lead của mọi người, gồm lead từ website'],
 ['Lead','lead.assign','Giao lead cho nhân viên'],
 ['Lead','lead.edit','Thêm và sửa lead của mình'],
 ['Lead','lead.delete','Xóa lead'],
 ['Báo cáo','debt.view','Xem công nợ khách và đối tác'],
 ['Báo cáo','stats.view','Xem thống kê'],
 ['Báo cáo','data.export','Xuất dữ liệu ra file'],
 ['Thiết lập','rates.view','Xem bảng giá net khách sạn'],
 ['Thiết lập','rates.edit','Sửa bảng giá net khách sạn'],
 ['Thiết lập','settings.edit','Sửa đối tác, danh mục, đơn vị và thiết lập chung'],
 ['Thiết lập','import.run','Nhập dữ liệu từ file Excel'],
 ['CTV','ctv.manage','Duyệt, khóa CTV và đặt lại mật khẩu CTV'],
 ['CTV','ctv.price','Sửa giá CTV và bật tắt dịch vụ hiển thị cho CTV'],
 ['CTV','ctv.avail','Sửa tình trạng phòng và số đêm tối thiểu cho CTV']
];

export const PERM_KEYS=PERM_CATALOG.map(x=>x[1]);

export const OWNER_ONLY_PERMS=['staff.manage','audit.view'];

export const ROLE_PERMS={
 accountant:['order.view_all','order.create','order.edit','order.edit_done','order.complete','order.cancel','order.delete_approve','net.access','pay.record','pay.approve','pay.refund','commission.edit','commission.pay','supplier.pay','customer.view_all','customer.create','customer.edit','lead.view_all','lead.assign','lead.edit','debt.view','stats.view','data.export','rates.view','rates.edit','settings.edit','import.run','ctv.manage','ctv.price','ctv.avail'],
 sales:['order.create','order.edit','order.cancel','order.delete_request','net.access','pay.record','commission.edit','customer.create','customer.edit','lead.edit','stats.view','rates.view','ctv.price','ctv.avail']
};

export const ROLE_LABELS={owner:'Chủ',accountant:'Kế toán',sales:'Sales',custom:'Tùy chỉnh'};

export const OWNER_ACTOR_ID='owner';

export function ownerActor(email,csrf,token){return {id:OWNER_ACTOR_ID,owner:true,email,name:'Chủ',role:'owner',perms:[...PERM_KEYS,...OWNER_ONLY_PERMS],csrf,token}}

export function can(actor,perm){return !!actor&&(actor.owner===true||actor.perms.includes(perm))}

export const noPerm=(msg)=>json({error:msg||'Tài khoản này chưa được cấp quyền làm việc này.'},403);

export async function makePasswordHash(pass){
 const salt=hex(crypto.getRandomValues(new Uint8Array(24))),key=await crypto.subtle.importKey('raw',enc.encode(pass),'PBKDF2',false,['deriveBits']);
 const digest=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(salt),iterations:100000},key,256);
 return salt+':'+hex(digest)
}

export function cleanPerms(list){return Array.isArray(list)?PERM_KEYS.filter(k=>list.includes(k)):null}

export function staffView(r){let perms=[];try{perms=JSON.parse(r.perms)}catch{}return {id:r.id,name:r.name,email:r.email,role:r.role,perms,active:!!r.active,created:r.created,updated:r.updated}}

export async function resolveActor(req,env){
 const token=cookie(req);if(!token)return null;const th=await sha(token);
 const own=await env.DB.prepare('SELECT csrf,expires FROM sessions WHERE token=?').bind(th).first();
 if(own)return own.expires<Date.now()?null:ownerActor(adminEmail(env),own.csrf,th);
 if(!env.BOOKINGS)return null;
 try{
  
  const r=await env.BOOKINGS.prepare('SELECT s.csrf,s.expires,t.id,t.name,t.email,t.role,t.perms,t.active FROM staff_sessions s JOIN staff t ON t.id=s.staff_id WHERE s.token=?').bind(th).first();
  if(!r||r.expires<Date.now()||!r.active)return null;
  let perms=[];try{perms=cleanPerms(JSON.parse(r.perms))||[]}catch{}
  return {id:r.id,owner:false,email:r.email,name:r.name,role:r.role,perms,csrf:r.csrf,token:th}
 }catch{return null}
}

export async function logAudit(env,actor,action,target,detail){
 try{
  
  await env.BOOKINGS.prepare('INSERT INTO audit_log(at,actor,actor_name,action,target,detail) VALUES(?,?,?,?,?,?)').bind(new Date().toISOString(),actor.id,actor.name+(actor.owner?'':' ('+(ROLE_LABELS[actor.role]||actor.role)+')'),action,String(target||'').slice(0,60),String(detail||'').slice(0,4000)).run()
 }catch{}
}

export async function staffApi(req,env,path,actor,u){
 if(!env.BOOKINGS)return json({error:'Chưa kết nối kho đơn hàng.'},503);
 
 const m=/^\/api\/staff(?:\/(s[0-9a-f]{12}))?$/.exec(path);if(!m)return json({error:'Không tìm thấy.'},404);const id=m[1];
 if(req.method==='GET'&&!id&&u.searchParams.get('lite')==='1'){
  if(!(actor.owner||can(actor,'lead.assign')||can(actor,'order.view_all')))return noPerm();
  const {results}=await env.BOOKINGS.prepare('SELECT id,name,role FROM staff WHERE active=1 ORDER BY name').all();
  return json({staff:results.map(r=>({id:r.id,name:r.name,role:r.role}))})
 }
 if(!actor.owner)return noPerm('Chỉ Chủ được quản lý tài khoản nhân viên.');
 if(req.method==='GET'&&!id){
  const {results}=await env.BOOKINGS.prepare('SELECT * FROM staff ORDER BY created').all();
  return json({staff:results.map(staffView),catalog:PERM_CATALOG.map(([group,key,label])=>({group,key,label})),roles:{accountant:ROLE_PERMS.accountant,sales:ROLE_PERMS.sales},roleLabels:ROLE_LABELS})
 }
 const cleanName=x=>typeof x==='string'&&x.trim().length>=1&&x.trim().length<=60&&!/[<>]/.test(x)?x.trim().replace(/\s+/g,' '):null;
 const cleanEmail=x=>typeof x==='string'&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(x.trim())&&x.trim().length<=80?x.trim().toLowerCase():null;
 const goodPass=x=>typeof x==='string'&&x.length>=8&&x.length<=128;
 if(req.method==='POST'&&!id){
  if(Number(req.headers.get('content-length')||0)>8000)return json({error:'Dữ liệu quá lớn.'},413);
  let i;try{i=await req.json()}catch{return json({error:'Nội dung không hợp lệ.'},400)}
  const name=cleanName(i?.name),email=cleanEmail(i?.email);
  if(!name)return json({error:'Tên không hợp lệ.'},400);if(!email)return json({error:'Email không hợp lệ.'},400);
  if(email===adminEmail(env))return json({error:'Email này là của Chủ.'},400);
  if(!goodPass(i.password))return json({error:'Mật khẩu cần từ 8 đến 128 ký tự.'},400);
  const role=['accountant','sales','custom'].includes(i.role)?i.role:'sales';
  const perms=cleanPerms(i.perms)||(ROLE_PERMS[role]||[]).slice();
  const cnt=await env.BOOKINGS.prepare('SELECT COUNT(*) AS n FROM staff').first();if((cnt?.n||0)>=50)return json({error:'Đã đạt giới hạn số tài khoản.'},400);
  const dup=await env.BOOKINGS.prepare('SELECT id FROM staff WHERE email=?').bind(email).first();if(dup)return json({error:'Email này đã có tài khoản.'},409);
  const nid='s'+hex(crypto.getRandomValues(new Uint8Array(6))),now=new Date().toISOString();
  await env.BOOKINGS.prepare('INSERT INTO staff(id,name,email,role,perms,hash,active,created,updated) VALUES(?,?,?,?,?,?,1,?,?)').bind(nid,name,email,role,JSON.stringify(perms),await makePasswordHash(i.password),now,now).run();
  await logAudit(env,actor,'staff.create',nid,name+' <'+email+'>, vai trò '+(ROLE_LABELS[role]||role)+', '+perms.length+' quyền');
  return json({staff:staffView(await env.BOOKINGS.prepare('SELECT * FROM staff WHERE id=?').bind(nid).first())},201)
 }
 if(req.method==='PUT'&&id){
  if(Number(req.headers.get('content-length')||0)>8000)return json({error:'Dữ liệu quá lớn.'},413);
  let i;try{i=await req.json()}catch{return json({error:'Nội dung không hợp lệ.'},400)}
  const row=await env.BOOKINGS.prepare('SELECT * FROM staff WHERE id=?').bind(id).first();if(!row)return json({error:'Không tìm thấy tài khoản.'},404);
  const next={name:row.name,role:row.role,perms:row.perms,active:row.active},notes=[];let kill=false,hash=row.hash;
  if(i.name!==undefined){const n=cleanName(i.name);if(!n)return json({error:'Tên không hợp lệ.'},400);if(n!==row.name){next.name=n;notes.push('đổi tên')}}
  if(i.role!==undefined){if(!['accountant','sales','custom'].includes(i.role))return json({error:'Vai trò không hợp lệ.'},400);if(i.role!==row.role){next.role=i.role;notes.push('vai trò '+(ROLE_LABELS[i.role]||i.role))}}
  if(i.perms!==undefined){const p=cleanPerms(i.perms);if(!p)return json({error:'Danh sách quyền không hợp lệ.'},400);if(JSON.stringify(p)!==JSON.stringify(cleanPerms(JSON.parse(row.perms))||[])){next.perms=JSON.stringify(p);notes.push('đổi quyền ('+p.length+' quyền)')}}
  if(i.active!==undefined){const a=i.active?1:0;if(a!==row.active){next.active=a;notes.push(a?'bật lại':'tắt tài khoản');if(!a)kill=true}}
  if(i.password!==undefined){if(!goodPass(i.password))return json({error:'Mật khẩu cần từ 8 đến 128 ký tự.'},400);hash=await makePasswordHash(i.password);notes.push('đặt lại mật khẩu');kill=true}
  await env.BOOKINGS.prepare('UPDATE staff SET name=?,role=?,perms=?,hash=?,active=?,updated=? WHERE id=?').bind(next.name,next.role,next.perms,hash,next.active,new Date().toISOString(),id).run();
  if(kill)await env.BOOKINGS.prepare('DELETE FROM staff_sessions WHERE staff_id=?').bind(id).run();
  if(notes.length)await logAudit(env,actor,'staff.update',id,row.name+': '+notes.join(', '));
  return json({staff:staffView(await env.BOOKINGS.prepare('SELECT * FROM staff WHERE id=?').bind(id).first())})
 }
 return json({error:'Không hỗ trợ.'},405)
}

export async function auditApi(req,env,u,actor){
 if(!actor.owner)return noPerm('Chỉ Chủ được xem nhật ký.');
 if(!env.BOOKINGS)return json({error:'Chưa kết nối kho đơn hàng.'},503);
 
 const limit=Math.min(200,Math.max(1,Number(u.searchParams.get('limit'))||100)),before=Number(u.searchParams.get('before'))||0;
 const q=(u.searchParams.get('q')||'').trim().slice(0,60);
 const where=[],args=[];if(before){where.push('id<?');args.push(before)}if(q){where.push('(target LIKE ? OR actor_name LIKE ? OR action LIKE ? OR detail LIKE ?)');const l='%'+q.replace(/[%_]/g,'')+'%';args.push(l,l,l,l)}
 const {results}=await env.BOOKINGS.prepare('SELECT id,at,actor,actor_name,action,target,detail FROM audit_log'+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY id DESC LIMIT '+limit).bind(...args).all();
 return json({log:results})
}

export async function staffLogin(env,mail,pass,req){
 const bad=()=>json({error:'Email hoặc mật khẩu chưa đúng.'},401);
 if(!env.BOOKINGS||!mail)return bad();
 let row=null;try{row=await env.BOOKINGS.prepare('SELECT * FROM staff WHERE email=?').bind(mail).first()}catch{return bad()}
 const ok=await passwordOK(pass,row?row.hash:'0:'+'0'.repeat(64));
 if(!row||!ok||!row.active)return bad();
 const token=crypto.randomUUID()+'-'+crypto.randomUUID(),csrf=crypto.randomUUID();
 await env.BOOKINGS.prepare('INSERT INTO staff_sessions(token,csrf,expires,staff_id) VALUES(?,?,?,?)').bind(await sha(token),csrf,Date.now()+8*3600000,row.id).run();
 await env.BOOKINGS.prepare('DELETE FROM staff_sessions WHERE expires<?').bind(Date.now()).run();
 await env.DB.prepare('DELETE FROM attempts WHERE expires<?').bind(Date.now()).run();
 await logAudit(env,{id:row.id,name:row.name,role:row.role,owner:false},'login',row.id,'Đăng nhập');
 return json({email:row.email,csrf,name:row.name,role:row.role},200,{'set-cookie':sessionCookie(token,28800,req)})
}
