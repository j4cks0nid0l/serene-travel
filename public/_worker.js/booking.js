// Module booking: tách từ _worker.js (không đổi hành vi, chỉ tách theo chức năng).
import {adminEmail,json} from './core.js';
import {validateCrmFields} from './crm.js';
import {can,logAudit,noPerm} from './auth.js';

export const BOOKING_ID_RE=/^[a-z0-9]{1,20}$/,BOOKING_DATE_MODES=['single','range','trip'],BOOKING_PEOPLE=['none','al-tre','al-tre-nct'];

export function cleanBookingCategories(v){
 if(!Array.isArray(v)||v.length<1||v.length>20)return null;
 const out=[],ids=new Set(),names=new Set();
 for(const c of v){
  if(!c||typeof c!=='object'||Array.isArray(c)||typeof c.id!=='string'||!BOOKING_ID_RE.test(c.id)||typeof c.name!=='string')return null;
  const name=c.name.trim().replace(/\s+/g,' ');
  if(name.length<1||name.length>30||/[<>"&]/.test(name)||!BOOKING_DATE_MODES.includes(c.dateMode)||!BOOKING_PEOPLE.includes(c.people))return null;
  if(ids.has(c.id)||names.has(name.toLowerCase()))return null;
  ids.add(c.id);names.add(name.toLowerCase());out.push({id:c.id,name,dateMode:c.dateMode,people:c.people})
 }
 return out
}

export function cleanEmailList(v){
 if(v===undefined)return [];
 if(!Array.isArray(v)||v.length>10)return null;
 const out=[],seen=new Set();
 for(const e of v){if(typeof e!=='string'||e.length>80||!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e))return null;const k=e.toLowerCase();if(!seen.has(k)){seen.add(k);out.push(e)}}
 return out}

export function cleanBookingHotels(v){
 if(!Array.isArray(v)||v.length>500)return null;
 const t=(x,max)=>{if(typeof x!=='string')return null;const y=x.trim().replace(/\s+/g,' ');return y.length>max||/[<>]/.test(y)?null:y};
 const out=[],names=new Set();
 for(const h of v){if(!h||typeof h!=='object')return null;const name=t(h.name,120),address=t(h.address??'',200),phone=t(h.phone??'',80);if(!name||address===null||phone===null)return null;const k=name.toLowerCase();if(names.has(k))return null;names.add(k);out.push({name,address,phone})}
 return out}

export function cleanBookingPartners(v){
 if(!Array.isArray(v)||v.length>300)return null;
 const t=(x,max)=>{if(typeof x!=='string')return null;const y=x.trim().replace(/\s+/g,' ');return y.length>max||/[<>]/.test(y)?null:y};
 const out=[],ids=new Set(),names=new Set();
 for(const p of v){
  if(!p||typeof p!=='object'||Array.isArray(p)||typeof p.id!=='string'||!BOOKING_ID_RE.test(p.id)||ids.has(p.id))return null;
  const name=t(p.name,60);if(!name)return null;
  const phone=p.phone===undefined?'':t(p.phone,30);if(phone===null||!/^[0-9+().\s-]*$/.test(phone))return null;
  const email=p.email===undefined?'':t(p.email,80);if(email===null||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))return null;
  const cc=cleanEmailList(p.cc);if(!cc)return null;
  if(!Array.isArray(p.cats)||p.cats.length>20||!p.cats.every(x=>typeof x==='string'&&BOOKING_ID_RE.test(x)))return null;
  if(p.services!==undefined&&(!Array.isArray(p.services)||p.services.length>100))return null;
  const services=[];for(const s of p.services||[]){const x=t(s,80);if(!x)return null;if(!services.includes(x))services.push(x)}
  if(names.has(name.toLowerCase()))return null;
  if(p.cycle!==undefined&&p.cycle!=='week'&&p.cycle!=='month')return null;
  ids.add(p.id);names.add(name.toLowerCase());const o={id:p.id,name,phone,email,cc,cats:[...new Set(p.cats)],services};if(p.cycle)o.cycle=p.cycle;out.push(o)
 }
 return JSON.stringify(out).length>300000?null:out
}

export function cleanUnitHide(v){
 if(!v||typeof v!=='object'||Array.isArray(v))return null;
 const keys=Object.keys(v);if(keys.length>300)return null;
 const out={};
 for(const k of keys){
  if(k==='__proto__'||k.length<1||k.length>20||/[<>"&]/.test(k)||!Array.isArray(v[k])||v[k].length>20)return null;
  if(!v[k].every(x=>typeof x==='string'&&BOOKING_ID_RE.test(x)))return null;
  const ids=[...new Set(v[k])];if(ids.length)Object.defineProperty(out,k,{value:ids,enumerable:true,writable:true,configurable:true})
 }
 return out
}

export const BOOKING_ORDER_STATUSES=['processing','success','cancelled'],CUSTOMER_ID_RE=/^c[a-z0-9]{3,24}$/;

export function validateBooking(b,expected){if(!b||typeof b!=='object'||Array.isArray(b))throw Error('Dữ liệu đơn hàng không hợp lệ.');if(typeof b.id!=='string'||!/^ST[0-9]{1,12}$/.test(b.id)||(expected&&b.id!==expected))throw Error('Mã đơn không hợp lệ.');if(typeof b.name!=='string'||b.name.length>200||typeof b.phone!=='string'||b.phone.length>60)throw Error('Tên hoặc số điện thoại không hợp lệ.');if(!Array.isArray(b.svcs)||b.svcs.length>60||!b.svcs.every(x=>x&&typeof x==='object'&&!Array.isArray(x)))throw Error('Danh sách dịch vụ không hợp lệ.');if(!Array.isArray(b.payments)||b.payments.length>200||!b.payments.every(x=>x&&typeof x==='object'&&Number.isFinite(x.amount)))throw Error('Danh sách thanh toán không hợp lệ.');if(!Number.isFinite(b.totalAmt)||b.totalAmt<0)throw Error('Tổng tiền không hợp lệ.');validateCrmFields(b);if(JSON.stringify(b).length>150000)throw Error('Dữ liệu đơn quá lớn.');return b}

export function canon(v){if(Array.isArray(v))return '['+v.map(canon).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}';return JSON.stringify(v===undefined?null:v)}

export const ost=b=>BOOKING_ORDER_STATUSES.includes(b?.orderStatus)?b.orderStatus:'success';

export const NET_KEYS=['netPrice','totalNet','partnerId','partner'];

export function svcNetPart(s){const o={};for(const k of NET_KEYS)if(s[k]!==undefined)o[k]=s[k];if(Array.isArray(s.lines))o.lines=s.lines.map(l=>({netPrice:l?.netPrice,totalNet:l?.totalNet}));return o}

export function stripNet(b){
 for(const s of b.svcs||[]){for(const k of NET_KEYS)delete s[k];if(Array.isArray(s.lines))for(const l of s.lines){delete l.netPrice;delete l.totalNet}}
 delete b.supPaid;return b
}

export function restoreNet(old,nu){
 delete nu.supPaid;if(old.supPaid!==undefined)nu.supPaid=old.supPaid;
 (nu.svcs||[]).forEach((s,i)=>{
  for(const k of NET_KEYS)delete s[k];
  if(Array.isArray(s.lines))for(const l of s.lines){delete l.netPrice;delete l.totalNet}
  const o=old.svcs?.[i];if(!o||o.name!==s.name)return;
  for(const k of NET_KEYS)if(o[k]!==undefined)s[k]=o[k];
  if(Array.isArray(s.lines)&&Array.isArray(o.lines)&&s.lines.length===o.lines.length)s.lines.forEach((l,j)=>{if(o.lines[j]?.netPrice!==undefined)l.netPrice=o.lines[j].netPrice;if(o.lines[j]?.totalNet!==undefined)l.totalNet=o.lines[j].totalNet})
 });
 return nu
}

export const netSig=b=>canon((b.svcs||[]).map(svcNetPart));

export const NON_CORE_TOP=['payments','commission','supPaid','deleteReq','orderStatus','sent','status','updatedBy','updatedAt','createdBy','createdByName','owner'];

export function coreSig(b){
 const c=JSON.parse(JSON.stringify(b));for(const k of NON_CORE_TOP)delete c[k];
 for(const s of c.svcs||[]){for(const k of NET_KEYS)delete s[k];delete s.code;delete s.sent;if(Array.isArray(s.lines))for(const l of s.lines){delete l.netPrice;delete l.totalNet}}
 return canon(c)
}

export const commSig=b=>canon({c:b.commission?.ctvId||'',a:Number(b.commission?.amount)||0});

export const commPaidSig=b=>canon([!!b.commission?.paid,b.commission?.paidDate||'']);

export function summarize(old,nu){
 const out=[];
 if(!old)return 'Tạo đơn, tổng '+nu.totalAmt+' đ, trạng thái '+ost(nu);
 if(ost(old)!==ost(nu))out.push('Trạng thái '+ost(old)+' -> '+ost(nu));
 if(old.totalAmt!==nu.totalAmt)out.push('Tổng tiền '+old.totalAmt+' -> '+nu.totalAmt);
 if(netSig(old)!==netSig(nu))out.push('Giá net hoặc đối tác thay đổi');
 if(commSig(old)!==commSig(nu))out.push('Hoa hồng '+(Number(old.commission?.amount)||0)+' -> '+(Number(nu.commission?.amount)||0));
 if(commPaidSig(old)!==commPaidSig(nu))out.push('Hoa hồng đã trả: '+(nu.commission?.paid?'có':'không'));
 const op=old.payments||[],np=nu.payments||[];
 if(canon(op)!==canon(np))out.push('Phiếu thu '+op.length+' -> '+np.length+' (đã duyệt '+op.filter(p=>p.status!=='pending').reduce((a,p)=>a+p.amount,0)+' -> '+np.filter(p=>p.status!=='pending').reduce((a,p)=>a+p.amount,0)+')');
 if(canon(old.supPaid||null)!==canon(nu.supPaid||null))out.push('Trả đối tác thay đổi');
 if(canon(old.deleteReq||null)!==canon(nu.deleteReq||null))out.push(nu.deleteReq?'Yêu cầu xóa':'Gỡ yêu cầu xóa');
 if(coreSig(old)!==coreSig(nu))out.push('Thông tin đơn hoặc dịch vụ thay đổi');
 return out.join('; ')||'Lưu lại, không đổi gì quan trọng'
}

export function checkBookingChange(actor,old,nu){
 const locked=ost(old)!=='processing';
 // Trạng thái đơn
 const a=ost(old),b=ost(nu);
 if(a!==b){
  if((a==='success'||b==='success')&&!can(actor,'order.complete'))return 'Chỉ Kế toán hoặc Chủ được bấm Thành công hoặc đưa đơn Thành công về lại.';
  if((a==='cancelled'||b==='cancelled')&&!can(actor,'order.cancel'))return 'Tài khoản này chưa được phép Hủy đơn.'
 }
 // Giá net, đối tác
 const netChanged=netSig(old)!==netSig(nu);
 if(netChanged&&!can(actor,'net.access'))return 'Tài khoản này chưa được phép nhập giá net.';
 // Thông tin đơn và dịch vụ
 const coreChanged=coreSig(old)!==coreSig(nu);
 if(coreChanged||netChanged){
  if(locked&&!can(actor,'order.edit_done'))return 'Đơn đã '+(a==='success'?'Thành công':'Hủy')+' nên đã khóa. Chỉ Kế toán hoặc Chủ được sửa.';
  if(!locked&&!can(actor,'order.edit'))return 'Tài khoản này chưa được phép sửa đơn.'
 }
 // Hoa hồng
 if(commSig(old)!==commSig(nu)){
  if(!can(actor,'commission.edit'))return 'Tài khoản này chưa được phép nhập hoa hồng.';
  if(old.commission?.paid&&!can(actor,'commission.pay'))return 'Hoa hồng này đã trả nên chỉ Kế toán hoặc Chủ được sửa.';
  if(locked&&!can(actor,'order.edit_done'))return 'Đơn đã khóa nên chưa sửa được hoa hồng.'
 }
 if(commPaidSig(old)!==commPaidSig(nu)&&!can(actor,'commission.pay'))return 'Chỉ Kế toán hoặc Chủ được đánh dấu đã trả hoa hồng.';
 if(canon(old.supPaid||null)!==canon(nu.supPaid||null)&&!can(actor,'supplier.pay'))return 'Chỉ Kế toán hoặc Chủ được đánh dấu đã trả đối tác.';
 // Phiếu thu: sửa hoặc xóa phiếu cũ cần quyền duyệt; thêm phiếu mới cần quyền ghi nhận
 const op=old.payments||[],np=nu.payments||[];
 const changedExisting=np.length<op.length||op.some((p,i)=>canon(p)!==canon(np[i]));
 if(changedExisting&&!can(actor,'pay.approve'))return 'Chỉ Kế toán hoặc Chủ được sửa, xóa hoặc duyệt phiếu thu đã có.';
 if(np.length>op.length){
  if(!can(actor,'pay.record'))return 'Tài khoản này chưa được phép ghi nhận thu tiền.';
  for(const p of np.slice(op.length)){
   if(p.amount<0&&!can(actor,'pay.refund'))return 'Tài khoản này chưa được phép ghi nhận hoàn tiền.';
   if(p.status!=='pending'&&!can(actor,'pay.approve'))p.status='pending'
  }
 }
 return null
}

export function applyDeleteReq(actor,old,nu){
 const had=old?.deleteReq||null,want=nu.deleteReq;
 if(!want){delete nu.deleteReq;if(had&&!(had.by===actor.id||can(actor,'order.delete_approve')))return 'Chỉ người gửi yêu cầu, Kế toán hoặc Chủ được gỡ yêu cầu xóa.';return null}
 if(had){nu.deleteReq=had;return null}
 if(!can(actor,'order.delete_request')&&!can(actor,'order.delete_approve'))return 'Tài khoản này chưa được phép gửi yêu cầu xóa.';
 const reason=typeof want.reason==='string'?want.reason.replace(/[<>]/g,'').trim().slice(0,200):'';
 nu.deleteReq={by:actor.id,byName:actor.name,at:new Date().toISOString(),reason};return null
}

export async function bookingApi(req,env,path,actor){
 // Đơn hàng nằm trong database riêng (binding BOOKINGS), tách hẳn khỏi nội dung website.
 if(!env.BOOKINGS)return json({error:'Chưa kết nối kho đơn hàng.'},503);
 const bm=/^\/api\/booking(?:\/(ST[0-9]{1,12}))?$/.exec(path);if(!bm)return json({error:'Không tìm thấy.'},404);const bid=bm[1];
 const parse=t=>{try{return JSON.parse(t)}catch{return null}};
 const seeAll=can(actor,'order.view_all');
 const visible=o=>seeAll||o.createdBy===actor.id;
 if(!bid&&req.method==='GET'){
  const {results}=await env.BOOKINGS.prepare('SELECT data FROM bookings ORDER BY seq').all();
  let list=results.map(r=>parse(r.data)).filter(Boolean).filter(visible);
  if(!can(actor,'net.access'))list=list.map(stripNet);
  return json({bookings:list})
 }
 if(bid&&req.method==='DELETE'){
  if(!can(actor,'order.delete_approve'))return noPerm('Bạn chưa được xóa đơn trực tiếp. Hãy gửi yêu cầu xóa để Kế toán hoặc Chủ duyệt.');
  const row=await env.BOOKINGS.prepare('SELECT data FROM bookings WHERE id=?').bind(bid).first();
  await env.BOOKINGS.prepare('DELETE FROM bookings WHERE id=?').bind(bid).run();
  if(row)await logAudit(env,actor,'order.delete',bid,'Xóa đơn. Bản lưu trước khi xóa: '+row.data.slice(0,3500));
  return json({ok:true})
 }
 if((req.method==='POST'&&!bid)||(req.method==='PUT'&&bid)){
  if(Number(req.headers.get('content-length')||0)>200000)return json({error:'Dữ liệu quá lớn.'},413);
  let input,data;try{input=await req.json()}catch{return json({error:'Nội dung không hợp lệ.'},400)}
  try{data=validateBooking(input?.booking,bid)}catch(e){return json({error:e.message},400)}
  const stamp=new Date().toISOString(),exists=await env.BOOKINGS.prepare('SELECT data FROM bookings WHERE id=?').bind(data.id).first();
  const old=exists?parse(exists.data):null;
  if(req.method==='POST'){
   if(exists)return json({error:'Mã đơn đã tồn tại.'},409);
   if(!actor.owner){
    if(!can(actor,'order.create'))return noPerm('Tài khoản này chưa được phép tạo đơn.');
    data.createdBy=actor.id;data.createdByName=actor.name;data.owner=actor.id;
    if(!can(actor,'net.access'))stripNet(data);
    if(ost(data)!=='processing'&&!can(actor,'order.complete'))return noPerm('Đơn mới chỉ được tạo ở trạng thái Đang xử lý.');
    if(data.payments.length){
     if(!can(actor,'pay.record'))return noPerm('Tài khoản này chưa được phép ghi nhận thu tiền.');
     for(const p of data.payments){if(p.amount<0&&!can(actor,'pay.refund'))return noPerm('Tài khoản này chưa được phép ghi nhận hoàn tiền.');if(p.status!=='pending'&&!can(actor,'pay.approve'))p.status='pending'}
    }
    if(data.commission&&(Number(data.commission.amount)>0||data.commission.ctvId)){if(!can(actor,'commission.edit'))return noPerm('Tài khoản này chưa được phép nhập hoa hồng.');if(data.commission.paid&&!can(actor,'commission.pay'))return noPerm('Chỉ Kế toán hoặc Chủ được đánh dấu đã trả hoa hồng.')}
    if(data.supPaid&&!can(actor,'supplier.pay'))return noPerm('Chỉ Kế toán hoặc Chủ được đánh dấu đã trả đối tác.');
    delete data.deleteReq
   }else{if(!data.createdBy)data.createdBy=adminEmail(env);if(!data.owner)data.owner=adminEmail(env);const e=applyDeleteReq(actor,null,data);if(e)return noPerm(e)}
   data.updatedBy=actor.owner?adminEmail(env):actor.email;data.updatedAt=stamp;
   try{await env.BOOKINGS.prepare('INSERT INTO bookings(id,data,created,updated) VALUES(?,?,?,?)').bind(data.id,JSON.stringify(data),stamp,stamp).run()}catch{return json({error:'Mã đơn đã tồn tại.'},409)}
   await logAudit(env,actor,'order.create',data.id,summarize(null,data));
   return json({ok:true},201)
  }
  if(!old)return json({error:'Không tìm thấy đơn.'},404);
  if(!actor.owner){
   if(!visible(old))return json({error:'Không tìm thấy đơn.'},404);
   if(!can(actor,'net.access'))restoreNet(old,data);
   // Người tạo, người sở hữu không đổi được
   data.createdBy=old.createdBy;data.owner=old.owner;if(old.createdByName!==undefined)data.createdByName=old.createdByName;else delete data.createdByName;
   const e1=applyDeleteReq(actor,old,data);if(e1)return noPerm(e1);
   const e2=checkBookingChange(actor,old,data);if(e2)return noPerm(e2)
  }else{
   const e1=applyDeleteReq(actor,old,data);if(e1)return noPerm(e1)
  }
  data.updatedBy=actor.owner?adminEmail(env):actor.email;data.updatedAt=stamp;
  await env.BOOKINGS.prepare('UPDATE bookings SET data=?,updated=? WHERE id=?').bind(JSON.stringify(data),stamp,data.id).run();
  const note=summarize(old,data);
  if(!/^Lưu lại, không đổi/.test(note))await logAudit(env,actor,'order.update',data.id,note);
  return json({ok:true})
 }
 return json({error:'Không hỗ trợ.'},405)
}
