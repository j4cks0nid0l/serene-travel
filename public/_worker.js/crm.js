// Module crm: tách từ _worker.js (không đổi hành vi, chỉ tách theo chức năng).
import {json,sha} from './core.js';
import {BOOKING_ORDER_STATUSES,CUSTOMER_ID_RE} from './booking.js';
import {can,logAudit,noPerm} from './auth.js';

export const SUP_KEY_RE=/^[A-Za-z0-9_-]{1,40}$/;

export function validateCrmFields(b){
 if(b.orderStatus!==undefined&&!BOOKING_ORDER_STATUSES.includes(b.orderStatus))throw Error('Trạng thái đơn không hợp lệ.');
 if(b.customerId!==undefined&&b.customerId!==''&&!(typeof b.customerId==='string'&&CUSTOMER_ID_RE.test(b.customerId)))throw Error('Mã khách hàng không hợp lệ.');
 if(b.ref!==undefined&&!(typeof b.ref==='string'&&b.ref.length<=40&&!/[<>]/.test(b.ref)))throw Error('Mã tham chiếu không hợp lệ.');
 for(const k of ['createdBy','updatedBy','owner'])if(b[k]!==undefined&&!(typeof b[k]==='string'&&b[k].length<=80&&!/[<>]/.test(b[k])))throw Error('Thông tin người tạo không hợp lệ.');
 for(const p of b.payments){
  if(p.status!==undefined&&!['approved','pending'].includes(p.status))throw Error('Trạng thái phiếu thu không hợp lệ.');
  if(p.code!==undefined&&!(typeof p.code==='string'&&p.code.length<=30&&!/[<>"&]/.test(p.code)))throw Error('Mã phiếu thu không hợp lệ.');
 }
 const sp=b.supPaid;
 if(sp!==undefined&&sp!==null){
  if(typeof sp!=='object'||Array.isArray(sp)||Object.keys(sp).length>60)throw Error('Thông tin trả đối tác không hợp lệ.');
  for(const k of Object.keys(sp)){const v=sp[k];if(!SUP_KEY_RE.test(k)||!v||typeof v!=='object'||!Number.isFinite(v.amount)||v.amount<0||v.amount>10000000000||(v.date!==undefined&&!(typeof v.date==='string'&&v.date.length<=20&&!/[<>]/.test(v.date))))throw Error('Thông tin trả đối tác không hợp lệ.')}
 }
 const c=b.commission;
 if(c!==undefined&&c!==null){
  if(typeof c!=='object'||Array.isArray(c))throw Error('Hoa hồng không hợp lệ.');
  if(!Number.isFinite(c.amount)||c.amount<0||c.amount>10000000000)throw Error('Số tiền hoa hồng không hợp lệ.');
  if(c.ctvId!==undefined&&c.ctvId!==''&&!(typeof c.ctvId==='string'&&CUSTOMER_ID_RE.test(c.ctvId)))throw Error('Cộng tác viên không hợp lệ.');
  if(c.paid!==undefined&&typeof c.paid!=='boolean')throw Error('Trạng thái trả hoa hồng không hợp lệ.');
  for(const k of ['paidDate','note'])if(c[k]!==undefined&&!(typeof c[k]==='string'&&c[k].length<=(k==='note'?200:20)&&!/[<>]/.test(c[k])))throw Error('Thông tin hoa hồng không hợp lệ.');
 }
}

export const CUSTOMER_KINDS=['retail','ctv'],LEAD_STATUSES=['new','contacted','ordered','lost'];

export function cleanLine(x,max,required){if(x===undefined||x===null)x='';if(typeof x!=='string')return null;const y=x.trim().replace(/\s+/g,' ');if(y.length>max||/[<>]/.test(y)||(required&&!y))return null;return y}

export function cleanCustomer(i){
 if(!i||typeof i!=='object'||Array.isArray(i))return null;
 const name=cleanLine(i.name,100,true),phone=cleanLine(i.phone,30),note=cleanLine(i.note,300);
 if(name===null||phone===null||note===null||!/^[0-9+().\s-]*$/.test(phone)||!CUSTOMER_KINDS.includes(i.kind||'retail'))return null;
 return {name,phone,kind:i.kind||'retail',note}}

export function cleanLead(i){
 if(!i||typeof i!=='object'||Array.isArray(i))return null;
 const name=cleanLine(i.name,100,true),phone=cleanLine(i.phone,30),need=cleanLine(i.need,500),source=cleanLine(i.source,60);
 if(name===null||phone===null||need===null||source===null||!/^[0-9+().\s-]*$/.test(phone))return null;
 const status=i.status===undefined?'new':i.status,bid=i.booking_id===undefined?'':i.booking_id;
 if(!LEAD_STATUSES.includes(status)||!(bid===''||(typeof bid==='string'&&/^ST[0-9]{1,12}$/.test(bid))))return null;
 return {name,phone,need,source,status,booking_id:bid}}

export const newCrmId=prefix=>prefix+crypto.randomUUID().replace(/-/g,'').slice(0,12);

export const VN_PHONE_RE=/^(?:0|\+84|84)[35789]\d{8}$/;

export async function publicLead(req,env){
 if(!env.BOOKINGS||!env.DB)return json({error:'Chưa sẵn sàng.'},503);
 if(Number(req.headers.get('content-length')||0)>6000)return json({error:'Yêu cầu quá lớn.'},413);
 const hour=Math.floor(Date.now()/3600000),ip=req.headers.get('CF-Connecting-IP')||'local';
 for(const key of ['lead:ip:'+await sha(ip)+':'+hour,'lead:global:'+hour]){
  await env.DB.prepare('INSERT INTO attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').bind(key,(hour+2)*3600000).run();
  const row=await env.DB.prepare('SELECT count FROM attempts WHERE key=?').bind(key).first();
  if(row.count>(key.startsWith('lead:global:')?1000:10))return json({error:'Bạn gửi quá nhiều lần. Vui lòng thử lại sau hoặc nhắn Zalo cho Serene.'},429)
 }
 let i;try{i=await req.json()}catch{return json({error:'Nội dung không hợp lệ.'},400)}
 if(!i||typeof i!=='object'||Array.isArray(i))return json({error:'Nội dung không hợp lệ.'},400);
 if(i.website)return json({ok:true});
 const name=cleanLine(i.name,80,true),phone=typeof i.phone==='string'?i.phone.replace(/[\s().-]/g,''):'';
 if(!name||!VN_PHONE_RE.test(phone))return json({error:'Thông tin chưa hợp lệ.'},400);
 const parts=[];
 const add=(label,v,max,re)=>{if(v===undefined||v===null||v==='')return true;if(typeof v!=='string'&&typeof v!=='number')return false;const x=cleanLine(String(v),max);if(x===null||(x&&re&&!re.test(x)))return false;if(x)parts.push(label+': '+x);return true};
 if(!(add('Dịch vụ',i.service,60)&&add('Điểm đến',i.destination,120)&&add('Ngày đi dự kiến',i.date,10,/^\d{4}-\d{2}-\d{2}$/)&&add('Người lớn',i.adults,4,/^\d{1,3}$/)&&add('Trẻ em',i.children,4,/^\d{1,3}$/)&&add('Ghi chú',i.message,1000)))return json({error:'Thông tin chưa hợp lệ.'},400);
 const need=parts.join(' | ').slice(0,500),source=i.from==='news'?'Website: đăng ký ưu đãi':'Website: form liên hệ';
 try{
  const since=new Date(Date.now()-86400000).toISOString();
  const dup=await env.BOOKINGS.prepare('SELECT id FROM leads WHERE phone=? AND created>? LIMIT 1').bind(phone,since).first();
  if(dup)return json({ok:true});
  const cnt=await env.BOOKINGS.prepare('SELECT COUNT(*) AS n FROM leads').first();if((cnt?.n||0)>=20000)return json({error:'Tạm thời chưa nhận được. Vui lòng nhắn Zalo cho Serene.'},503);
  const now=new Date().toISOString();
  await env.BOOKINGS.prepare('INSERT INTO leads(id,name,phone,need,source,status,booking_id,created,updated) VALUES(?,?,?,?,?,?,?,?,?)').bind(newCrmId('l'),name,phone,need,source,'new','',now,now).run();
  return json({ok:true},201)
 }catch(e){return json({error:'Chưa ghi nhận được. Vui lòng nhắn Zalo cho Serene.'},503)}
}

export async function crmApi(req,env,path,actor){
 // Trả về null nếu không phải đường dẫn khách hàng/lead
 const m=/^\/api\/(customers|leads)(?:\/([a-z0-9]{4,26}))?$/.exec(path);if(!m)return null;
 const kind=m[1],id=m[2];
 if(!env.BOOKINGS)return json({error:'Chưa kết nối kho đơn hàng.'},503);
 const table=kind,isCustomer=kind==='customers',clean=isCustomer?cleanCustomer:cleanLead;
 const missing=e=>/no such table/i.test(String(e?.message||e));
 try{
  
  const mine=r=>actor.owner||can(actor,isCustomer?'customer.view_all':'lead.view_all')||r.owner===actor.id;
  if(!id&&req.method==='GET'){
   let sql='SELECT * FROM '+table,args=[];
   if(!isCustomer&&!can(actor,'lead.view_all')){sql+=' WHERE owner=?';args=[actor.id]}
   if(isCustomer&&!can(actor,'customer.view_all')){sql+=" WHERE owner=? OR kind='ctv'";args=[actor.id]}
   const {results}=await env.BOOKINGS.prepare(sql+' ORDER BY created').bind(...args).all();return json({[kind]:results})}
  if(!id&&req.method==='POST'){
   if(!can(actor,isCustomer?'customer.create':'lead.edit'))return noPerm();
   if(Number(req.headers.get('content-length')||0)>20000)return json({error:'Dữ liệu quá lớn.'},413);
   let input;try{input=await req.json()}catch{return json({error:'Nội dung không hợp lệ.'},400)}
   const d=clean(input);if(!d)return json({error:isCustomer?'Thông tin khách hàng không hợp lệ.':'Thông tin lead không hợp lệ.'},400);
   const cnt=await env.BOOKINGS.prepare('SELECT COUNT(*) AS n FROM '+table).first();if((cnt?.n||0)>=20000)return json({error:'Đã đạt giới hạn số lượng.'},400);
   const now=new Date().toISOString(),nid=newCrmId(isCustomer?'c':'l'),own=actor.owner?'':actor.id;
   if(isCustomer)await env.BOOKINGS.prepare('INSERT INTO customers(id,name,phone,kind,note,created,updated,owner) VALUES(?,?,?,?,?,?,?,?)').bind(nid,d.name,d.phone,d.kind,d.note,now,now,own).run();
   else await env.BOOKINGS.prepare('INSERT INTO leads(id,name,phone,need,source,status,booking_id,created,updated,owner) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(nid,d.name,d.phone,d.need,d.source,d.status,d.booking_id,now,now,own).run();
   if(isCustomer)await logAudit(env,actor,'customer.create',nid,d.name+(d.kind==='ctv'?' (CTV)':''));
   const row=await env.BOOKINGS.prepare('SELECT * FROM '+table+' WHERE id=?').bind(nid).first();return json({[isCustomer?'customer':'lead']:row},201)}
  if(id&&req.method==='PUT'){
   if(Number(req.headers.get('content-length')||0)>20000)return json({error:'Dữ liệu quá lớn.'},413);
   let input;try{input=await req.json()}catch{return json({error:'Nội dung không hợp lệ.'},400)}
   const d=clean(input);if(!d)return json({error:isCustomer?'Thông tin khách hàng không hợp lệ.':'Thông tin lead không hợp lệ.'},400);
   const old=await env.BOOKINGS.prepare('SELECT * FROM '+table+' WHERE id=?').bind(id).first();if(!old||!mine(old))return json({error:'Không tìm thấy.'},404);
   if(!can(actor,isCustomer?'customer.edit':'lead.edit'))return noPerm();
   const now=new Date().toISOString();
   if(isCustomer)await env.BOOKINGS.prepare('UPDATE customers SET name=?,phone=?,kind=?,note=?,updated=? WHERE id=?').bind(d.name,d.phone,d.kind,d.note,now,id).run();
   else await env.BOOKINGS.prepare('UPDATE leads SET name=?,phone=?,need=?,source=?,status=?,booking_id=?,updated=? WHERE id=?').bind(d.name,d.phone,d.need,d.source,d.status,d.booking_id,now,id).run();
   let assigned=null;
   if(!isCustomer&&Object.prototype.hasOwnProperty.call(input,'owner')&&can(actor,'lead.assign')){
    const want=typeof input.owner==='string'?input.owner:'';
    if(want!==''){const st=await env.BOOKINGS.prepare('SELECT id,name FROM staff WHERE id=? AND active=1').bind(want).first();if(!st)return json({error:'Nhân viên được giao không tồn tại hoặc đã tắt.'},400);assigned=st.name}
    if(want!==old.owner){await env.BOOKINGS.prepare('UPDATE leads SET owner=? WHERE id=?').bind(want,id).run();await logAudit(env,actor,'lead.assign',id,d.name+' -> '+(assigned||'Chủ'))}
   }
   if(isCustomer&&(old.name!==d.name||old.phone!==d.phone||old.kind!==d.kind||old.note!==d.note))await logAudit(env,actor,'customer.update',id,old.name+(old.name!==d.name?' -> '+d.name:'')+(old.phone!==d.phone?'; SĐT '+old.phone+' -> '+d.phone:'')+(old.kind!==d.kind?'; loại '+old.kind+' -> '+d.kind:''));
   const row=await env.BOOKINGS.prepare('SELECT * FROM '+table+' WHERE id=?').bind(id).first();return json({[isCustomer?'customer':'lead']:row})}
  if(id&&req.method==='DELETE'){
   if(!can(actor,isCustomer?'customer.delete':'lead.delete'))return noPerm();
   const old=await env.BOOKINGS.prepare('SELECT * FROM '+table+' WHERE id=?').bind(id).first();if(old&&!mine(old))return json({error:'Không tìm thấy.'},404);
   if(isCustomer){const used=await env.BOOKINGS.prepare('SELECT id FROM bookings WHERE data LIKE ? OR data LIKE ? LIMIT 1').bind('%"customerId":"'+id+'"%','%"ctvId":"'+id+'"%').first();if(used)return json({error:'Khách này đã có đơn hoặc hoa hồng nên chưa xóa được.'},409)}
   await env.BOOKINGS.prepare('DELETE FROM '+table+' WHERE id=?').bind(id).run();if(old)await logAudit(env,actor,kind.slice(0,-1)+'.delete',id,old.name+(old.phone?' '+old.phone:''));return json({ok:true})}
  return json({error:'Không hỗ trợ.'},405)
 }catch(e){if(missing(e))return json({error:'Chưa tạo bảng '+table+' trong kho đơn hàng. Chạy phần mới của schema-bookings.sql trong tab Console của D1.'},503);return json({error:'Chưa xử lý được yêu cầu.'},500)}
}
