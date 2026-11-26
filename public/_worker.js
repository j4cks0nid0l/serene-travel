const enc=new TextEncoder();
const EMAIL='serenetravelvn@gmail.com';
const CSP="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
// Trang booking cần thêm: biểu tượng (jsdelivr) và ảnh mã QR (VietQR). Chỉ áp dụng cho /admin/booking.
const BOOKING_CSP="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' data: https://img.vietqr.io; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}})}
function hex(a){return [...new Uint8Array(a)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function sha(s){return hex(await crypto.subtle.digest('SHA-256',enc.encode(s)))}
function equal(a,b){if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0}
async function passwordOK(pass,secret){const [salt,expected]=secret.split(':');if(!salt||!expected)return false;const key=await crypto.subtle.importKey('raw',enc.encode(pass),'PBKDF2',false,['deriveBits']);const digest=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(salt),iterations:100000},key,256);return equal(hex(digest),expected)}
function cookie(req){return /(?:^|;\s*)serene_session=([A-Za-z0-9-]+)/.exec(req.headers.get('cookie')||'')?.[1]||''}
function sessionCookie(value,age,req){return 'serene_session='+value+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+age+(new URL(req.url).protocol==='https:'?'; Secure':'')}
function validImage(url){return typeof url==='string'&&(/^\/assets\/[a-zA-Z0-9._-]+$/.test(url)||/^\/media\/[a-zA-Z0-9._-]+$/.test(url))}
const tags=new Set(['p','br','h2','h3','strong','b','em','i','u','ul','ol','li','a','img','blockquote']);
function escape(s){return s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')}
// Whitelist formatting; remove arbitrary attributes and all executable URL schemes.
// Khung đặc biệt cho bài cẩm nang (nhập từ HTML): chỉ cho phép đúng các tên lớp này.
const BOX_CLASSES={blockquote:['pocket','cta'],p:['photo-note']};
export function sanitize(input){return String(input||'').replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|iframe|object|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<\/?([a-z0-9]+)\b([^>]*)>/gi,(all,name,attrs)=>{name=name.toLowerCase();if(name==='div')name='p';if(!tags.has(name))return '';if(all.startsWith('</'))return ['br','img'].includes(name)?'':'</'+name+'>';if(name==='a'){const href=/\bhref\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1]||'';let url;try{url=new URL(href)}catch{return '<a>'}return ['https:','http:'].includes(url.protocol)?'<a href="'+escape(url.href)+'" target="_blank" rel="noopener noreferrer">':'<a>'}if(name==='img'){const src=/\bsrc\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1]||'';const alt=/\balt\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1]||'Ảnh minh họa';return validImage(src)?'<img src="'+escape(src)+'" alt="'+escape(alt)+'">':''}const style=/\bstyle\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1]||'';const cls=/\bclass\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1]||'';const alignment=/(?:^|;)\s*text-align\s*:\s*(left|center|right|justify)\s*(?:;|$)/i.exec(style)?.[1]?.toLowerCase()||/^align-(left|center|right|justify)$/.exec(cls)?.[1];const extra=(BOX_CLASSES[name]||[]).filter(c=>cls.split(/\s+/).includes(c));const classes=[...(['p','h2','h3','li','blockquote'].includes(name)&&alignment?['align-'+alignment]:[]),...extra];return '<'+name+(classes.length?' class="'+classes.join(' ')+'"':'')+'>'})}
function validate(value,id){if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Nội dung không hợp lệ.');const p={};if(id==='settings'){const keys=['heroTitle','heroSubtitle','heroImage','aboutTitle','aboutBody','founderName','founderImage','phone','email','company','address','hours','zalo','cardVinpearl','cardHotel','cardTour','cardTicket'];for(const k of [...keys,...Object.keys(value).filter(k=>/^home[A-Z][A-Za-z0-9]{0,60}$/.test(k))]){if(value[k]!==undefined){if(typeof value[k]!=='string'||value[k].length>12000)throw Error('Trường nội dung quá dài.');p[k]=value[k]}}for(const k of ['heroImage','founderImage','cardVinpearl','cardHotel','cardTour','cardTicket'])if(p[k]&&!validImage(p[k]))throw Error('Ảnh không hợp lệ.');if(p.phone&&!/^\+?[0-9\s-]{8,20}$/.test(p.phone))throw Error('Số điện thoại không hợp lệ.');if(p.zalo&&!/^https:\/\/zalo\.me\/[0-9]+$/.test(p.zalo))throw Error('Liên kết Zalo không hợp lệ.');return p}for(const k of ['title','summary','category','author','body','cover','places']){if(value[k]!==undefined&&typeof value[k]!=='string')throw Error('Nội dung không hợp lệ.');p[k]=value[k]||''}if(!p.title.trim()||p.title.length>180||p.summary.length>1000||p.body.length>150000||p.author.length>150||p.category.length>150)throw Error('Kiểm tra tiêu đề và độ dài bài viết.');if(p.cover&&!validImage(p.cover))throw Error('Ảnh không hợp lệ.');if(p.places&&p.places!=='-'&&!/^(service-[a-z0-9-]{1,60}|cam-nang)(,(service-[a-z0-9-]{1,60}|cam-nang)){0,30}$/.test(p.places))throw Error('Mục hiển thị không hợp lệ.');p.body=sanitize(p.body);return p}
// Loại dịch vụ và đơn vị theo loại (thiết lập của trang Booking). Kiểm tra chặt vì dữ liệu này được chèn lại vào giao diện.
const BOOKING_ID_RE=/^[a-z0-9]{1,20}$/,BOOKING_DATE_MODES=['single','range','trip'],BOOKING_PEOPLE=['none','al-tre','al-tre-nct'];
function cleanBookingCategories(v){
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
function cleanEmailList(v){
 if(v===undefined)return [];
 if(!Array.isArray(v)||v.length>10)return null;
 const out=[],seen=new Set();
 for(const e of v){if(typeof e!=='string'||e.length>80||!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e))return null;const k=e.toLowerCase();if(!seen.has(k)){seen.add(k);out.push(e)}}
 return out}
function cleanBookingHotels(v){
 if(!Array.isArray(v)||v.length>500)return null;
 const t=(x,max)=>{if(typeof x!=='string')return null;const y=x.trim().replace(/\s+/g,' ');return y.length>max||/[<>]/.test(y)?null:y};
 const out=[],names=new Set();
 for(const h of v){if(!h||typeof h!=='object')return null;const name=t(h.name,120),address=t(h.address??'',200),phone=t(h.phone??'',80);if(!name||address===null||phone===null)return null;const k=name.toLowerCase();if(names.has(k))return null;names.add(k);out.push({name,address,phone})}
 return out}
function cleanBookingPartners(v){
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
function cleanUnitHide(v){
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
// Trường quản lý khách và hoa hồng của đơn (đều không bắt buộc, đơn cũ không có vẫn hợp lệ)
const SUP_KEY_RE=/^[A-Za-z0-9_-]{1,40}$/;
const BOOKING_ORDER_STATUSES=['processing','success','cancelled'],CUSTOMER_ID_RE=/^c[a-z0-9]{3,24}$/;
function validateCrmFields(b){
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
// Khách hàng và lead: bảng riêng trong kho đơn hàng (BOOKINGS)
const CUSTOMER_KINDS=['retail','ctv'],LEAD_STATUSES=['new','contacted','ordered','lost'];
function cleanLine(x,max,required){if(x===undefined||x===null)x='';if(typeof x!=='string')return null;const y=x.trim().replace(/\s+/g,' ');if(y.length>max||/[<>]/.test(y)||(required&&!y))return null;return y}
function cleanCustomer(i){
 if(!i||typeof i!=='object'||Array.isArray(i))return null;
 const name=cleanLine(i.name,100,true),phone=cleanLine(i.phone,30),note=cleanLine(i.note,300);
 if(name===null||phone===null||note===null||!/^[0-9+().\s-]*$/.test(phone)||!CUSTOMER_KINDS.includes(i.kind||'retail'))return null;
 return {name,phone,kind:i.kind||'retail',note}}
function cleanLead(i){
 if(!i||typeof i!=='object'||Array.isArray(i))return null;
 const name=cleanLine(i.name,100,true),phone=cleanLine(i.phone,30),need=cleanLine(i.need,500),source=cleanLine(i.source,60);
 if(name===null||phone===null||need===null||source===null||!/^[0-9+().\s-]*$/.test(phone))return null;
 const status=i.status===undefined?'new':i.status,bid=i.booking_id===undefined?'':i.booking_id;
 if(!LEAD_STATUSES.includes(status)||!(bid===''||(typeof bid==='string'&&/^ST[0-9]{1,12}$/.test(bid))))return null;
 return {name,phone,need,source,status,booking_id:bid}}
const newCrmId=prefix=>prefix+crypto.randomUUID().replace(/-/g,'').slice(0,12);
// Form trên website gửi khách vào tab Lead. Cửa công khai nên giới hạn chặt: cùng nguồn, ô bẫy bot, giới hạn theo IP và tổng, kiểm tra từng trường, không trùng số trong 24 giờ.
const VN_PHONE_RE=/^(?:0|\+84|84)[35789]\d{8}$/;
async function publicLead(req,env){
 if(!env.BOOKINGS||!env.DB)return json({error:'Chưa sẵn sàng.'},503);
 if(Number(req.headers.get('content-length')||0)>6000)return json({error:'Yêu cầu quá lớn.'},413);
 const hour=Math.floor(Date.now()/3600000),ip=req.headers.get('CF-Connecting-IP')||'local';
 for(const key of ['lead:ip:'+await sha(ip)+':'+hour,'lead:global:'+hour]){
  await env.DB.prepare('INSERT INTO attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').bind(key,(hour+2)*3600000).run();
  const row=await env.DB.prepare('SELECT count FROM attempts WHERE key=?').bind(key).first();
  if(row.count>(key.startsWith('lead:global:')?200:10))return json({error:'Bạn gửi quá nhiều lần. Vui lòng thử lại sau hoặc nhắn Zalo cho Serene.'},429)
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
async function crmApi(req,env,path,actor){
 // Trả về null nếu không phải đường dẫn khách hàng/lead
 const m=/^\/api\/(customers|leads)(?:\/([a-z0-9]{4,26}))?$/.exec(path);if(!m)return null;
 const kind=m[1],id=m[2];
 if(!env.BOOKINGS)return json({error:'Chưa kết nối kho đơn hàng.'},503);
 const table=kind,isCustomer=kind==='customers',clean=isCustomer?cleanCustomer:cleanLead;
 const missing=e=>/no such table/i.test(String(e?.message||e));
 try{
  await ensureAuthTables(env);
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
function validateBooking(b,expected){if(!b||typeof b!=='object'||Array.isArray(b))throw Error('Dữ liệu đơn hàng không hợp lệ.');if(typeof b.id!=='string'||!/^ST[0-9]{1,12}$/.test(b.id)||(expected&&b.id!==expected))throw Error('Mã đơn không hợp lệ.');if(typeof b.name!=='string'||b.name.length>200||typeof b.phone!=='string'||b.phone.length>60)throw Error('Tên hoặc số điện thoại không hợp lệ.');if(!Array.isArray(b.svcs)||b.svcs.length>60||!b.svcs.every(x=>x&&typeof x==='object'&&!Array.isArray(x)))throw Error('Danh sách dịch vụ không hợp lệ.');if(!Array.isArray(b.payments)||b.payments.length>200||!b.payments.every(x=>x&&typeof x==='object'&&Number.isFinite(x.amount)))throw Error('Danh sách thanh toán không hợp lệ.');if(!Number.isFinite(b.totalAmt)||b.totalAmt<0)throw Error('Tổng tiền không hợp lệ.');validateCrmFields(b);if(JSON.stringify(b).length>150000)throw Error('Dữ liệu đơn quá lớn.');return b}
// ---- Bài đăng Facebook/Threads (lịch đăng, sửa bài, mẫu phong cách) ----
const POST_PLATFORMS=['FACEBOOK','THREADS'],POST_LEAD_MS=5*60000,POST_MAX_IMAGES=10;
const postClock=ms=>new Date(ms+7*3600000).toISOString().slice(0,16).replace('T',' ');
const postEpoch=s=>Date.parse(s.replace(' ','T')+':00+07:00');
function validPostTime(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s))return false;const ms=postEpoch(s);return Number.isFinite(ms)&&postClock(ms)===s}
function cleanPostFields(data,partial){
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Dữ liệu bài đăng không hợp lệ.');
 const out={},text=(k,max)=>{if(data[k]===undefined)return;if(typeof data[k]!=='string'||data[k].length>max)throw Error('Trường "'+k+'" không hợp lệ hoặc quá dài.');out[k]=data[k]};
 if(data.platform!==undefined){if(!POST_PLATFORMS.includes(data.platform))throw Error('Nền tảng không hợp lệ.');out.platform=data.platform}else if(!partial)throw Error('Thiếu nền tảng.');
 text('body',8000);text('source',200);text('stt',20);text('note',500);text('image',1000);text('post_url',500);text('error',2000);
 if(out.image){const list=out.image.split('\n');if(list.length>POST_MAX_IMAGES)throw Error('Mỗi bài tối đa '+POST_MAX_IMAGES+' ảnh.');if(new Set(list).size!==list.length||list.some(u=>!/^\/media\/[a-zA-Z0-9._-]+$/.test(u)))throw Error('Ảnh không hợp lệ.')}
 if(data.scheduled_at!==undefined){if(data.scheduled_at!==''&&!validPostTime(data.scheduled_at))throw Error('Giờ đăng không hợp lệ.');out.scheduled_at=data.scheduled_at}
 return out}
function postRow(r){return {id:r.id,platform:r.platform,kind:r.kind,body:r.body,image:r.image,source:r.source,stt:r.stt,scheduled_at:r.scheduled_at,status:r.status,post_url:r.post_url,error:r.error,note:r.note,has_original:r.original_body!==null&&r.original_body!==undefined,posted_at:r.posted_at,created:r.created,updated:r.updated}}
async function saveStyleSample(env,row,body,note){
 if(row.original_body===null||row.original_body===undefined)return;
 const now=new Date().toISOString(),day=postClock(Date.now()).slice(0,10);
 if(body.trim()===row.original_body.trim()){
  if(note==='OK nguyên bản')await env.DB.prepare('INSERT INTO style_samples(post_id,day,platform,source,original,edited,note,updated) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(post_id) DO NOTHING').bind(row.id,day,row.platform,row.source,row.original_body,body,note,now).run();
  else await env.DB.prepare('DELETE FROM style_samples WHERE post_id=? AND note<>?').bind(row.id,'OK nguyên bản').run();
  return}
 await env.DB.prepare('INSERT INTO style_samples(post_id,day,platform,source,original,edited,note,updated) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(post_id) DO UPDATE SET edited=excluded.edited,source=excluded.source,day=excluded.day,note=excluded.note,updated=excluded.updated').bind(row.id,day,row.platform,row.source,row.original_body,body,'',now).run()}
async function postsApi(req,env,path){
 const m=/^\/api\/posts(?:\/(P[a-z0-9]{6,30}))?$/.exec(path);if(!m)return json({error:'Không tìm thấy.'},404);const id=m[1];
 try{
  if(!id&&req.method==='GET'){const {results}=await env.DB.prepare('SELECT * FROM posts ORDER BY updated DESC LIMIT 400').all();return json({now:postClock(Date.now()),posts:results.map(postRow)})}
  if(Number(req.headers.get('content-length')||0)>60000)return json({error:'Dữ liệu quá lớn.'},413);
  if(!id&&req.method==='POST'){
   let input,f;try{input=await req.json();f=cleanPostFields(input?.data,false)}catch(e){return json({error:e.message||'Nội dung không hợp lệ.'},400)}
   const nid='P'+Date.now().toString(36)+crypto.randomUUID().replaceAll('-','').slice(0,6),now=new Date().toISOString(),body=f.body||'',image=f.image||'';
   await env.DB.prepare('INSERT INTO posts(id,platform,kind,body,original_body,image,source,stt,scheduled_at,status,post_url,error,note,posted_at,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(nid,f.platform,image?'CÓ ẢNH':'CHỮ THUẦN',body,input.from_claude===true?body:null,image,f.source||'',f.stt||'',f.scheduled_at||'','NHÁP','','',f.note||'',null,now,now).run();
   return json({id:nid},201)}
  if(!id)return json({error:'Không hỗ trợ.'},405);
  const row=await env.DB.prepare('SELECT * FROM posts WHERE id=?').bind(id).first();if(!row)return json({error:'Không tìm thấy bài.'},404);
  if(req.method==='DELETE'){if(row.status==='ĐANG ĐĂNG')return json({error:'Bài đang được đăng lên Facebook, chưa xóa được.'},409);if(row.status==='ĐÃ DUYỆT')return json({error:'Hãy bỏ hẹn giờ trước khi xóa bài.'},409);await env.DB.prepare('DELETE FROM posts WHERE id=?').bind(id).run();return json({ok:true})}
  if(req.method!=='PUT')return json({error:'Không hỗ trợ.'},405);
  let input,f;try{input=await req.json();f=cleanPostFields(input?.data||{},true)}catch(e){return json({error:e.message||'Nội dung không hợp lệ.'},400)}
  const action=input.action||'save';if(!['save','approve','unapprove','posted','reschedule'].includes(action))return json({error:'Thao tác không hợp lệ.'},400);
  if(row.status==='ĐÃ ĐĂNG')return json({error:'Bài đã đăng, không sửa được.'},409);
  if(row.status==='ĐANG ĐĂNG'&&action!=='posted')return json({error:'Bài đang được đăng lên Facebook, chờ ít phút rồi tải lại trang.'},409);
  if(action==='reschedule'){
   if(row.status!=='ĐÃ DUYỆT')return json({error:'Chỉ đổi giờ được cho bài đang hẹn giờ.'},409);
   if(f.body!==undefined&&f.body!==row.body||f.image!==undefined&&f.image!==row.image)return json({error:'Bài đã hẹn giờ, không sửa nội dung được.'},409);
   if(!validPostTime(f.scheduled_at))return json({error:'Hãy chọn giờ đăng.'},400);
   if(postEpoch(f.scheduled_at)<Date.now()+POST_LEAD_MS)return json({error:'Giờ đăng phải cách hiện tại ít nhất 5 phút.'},400);
   if(row.scheduled_at&&postEpoch(row.scheduled_at)<Date.now()+POST_LEAD_MS)return json({error:'Bài sắp đến giờ đăng, không đổi giờ được nữa.'},409);
   const r=await env.DB.prepare("UPDATE posts SET scheduled_at=?,updated=? WHERE id=? AND status='ĐÃ DUYỆT'").bind(f.scheduled_at,new Date().toISOString(),id).run();
   if(!r.meta||!r.meta.changes)return json({error:'Bài vừa đổi trạng thái, hãy tải lại trang.'},409);
   return json({ok:true,status:'ĐÃ DUYỆT'})}
  const next={...row,...f},contentChanged=['body','image','scheduled_at','platform'].some(k=>f[k]!==undefined&&f[k]!==row[k]);
  if(row.status==='ĐÃ DUYỆT'&&action!=='unapprove'&&action!=='posted'&&contentChanged)return json({error:'Bài đang hẹn giờ. Hãy bỏ hẹn giờ trước khi sửa.'},409);
  next.kind=next.image?'CÓ ẢNH':'CHỮ THUẦN';let status=row.status,posted=row.posted_at;
  if(action==='approve'){
   if(!next.body.trim())return json({error:'Bài chưa có nội dung.'},400);
   if(next.kind==='CÓ ẢNH'&&!next.image)return json({error:'Bài cần có ảnh.'},400);
   if(!validPostTime(next.scheduled_at))return json({error:'Hãy chọn giờ đăng.'},400);
   if(postEpoch(next.scheduled_at)<Date.now()+POST_LEAD_MS)return json({error:'Giờ đăng phải cách hiện tại ít nhất 5 phút.'},400);
   status='ĐÃ DUYỆT';next.error=''}
  else if(action==='unapprove'){if(!['ĐÃ DUYỆT','LỖI'].includes(row.status))return json({error:'Bài chưa được hẹn giờ.'},409);status='NHÁP';next.error=''}
  else if(action==='posted'){status='ĐÃ ĐĂNG';posted=new Date().toISOString()}
  if(f.body!==undefined&&f.body!==row.body)await saveStyleSample(env,row,next.body,'');
  if(action==='approve'||action==='posted')await saveStyleSample(env,row,next.body,'OK nguyên bản');
  await env.DB.prepare('UPDATE posts SET platform=?,kind=?,body=?,image=?,source=?,stt=?,scheduled_at=?,status=?,post_url=?,error=?,note=?,posted_at=?,updated=? WHERE id=?').bind(next.platform,next.kind,next.body,next.image,next.source,next.stt,next.scheduled_at,status,next.post_url,next.error,next.note,posted,new Date().toISOString(),id).run();
  const original=row.original_body!=null&&row.original_body.trim()!==String(next.body).trim()?row.original_body:null;
  return json({ok:true,status,original})
 }catch(e){if(/no such table/i.test(e.message||''))return json({error:'Chưa tạo bảng bài đăng. Chạy file schema-posts.sql trong Console của D1.'},503);throw e}}
export default {async fetch(req,env){try{return await handle(req,env)}catch(err){console.error('Request failed:',err.message);return json({error:'Chưa xử lý được yêu cầu. Vui lòng thử lại.'},500)}}};
async function uploadImage(req,env,maxMb=5){const MAX=maxMb*1024*1024;if(!env.MEDIA)return json({error:'Chưa kết nối kho ảnh.'},503);const type=req.headers.get('content-type')||'',extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};if(!extensions[type])return json({error:'Chỉ nhận JPG, PNG hoặc WebP.'},400);if(Number(req.headers.get('content-length')||0)>MAX)return json({error:'Ảnh tối đa '+maxMb+' MB.'},413);const bytes=await req.arrayBuffer();if(bytes.byteLength>MAX)return json({error:'Ảnh tối đa '+maxMb+' MB.'},413);const b=new Uint8Array(bytes);const signature=type==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:type==='image/png'?hex(bytes.slice(0,8))==='89504e470d0a1a0a':String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP';if(!signature)return json({error:'Tệp không phải ảnh hợp lệ.'},400);const key=crypto.randomUUID()+'.'+extensions[type];await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:type}});return json({url:'/media/'+key})}
// ---- API cho máy (Claude, Make): khóa riêng dạng Bearer, chỉ lưu bản băm trong bảng machine_tokens ----
async function machineScope(req,env){
 const m=/^Bearer ([A-Za-z0-9_-]{40,80})$/.exec(req.headers.get('authorization')||'');if(!m)return null;
 try{const row=await env.DB.prepare('SELECT scope FROM machine_tokens WHERE hash=?').bind(await sha(m[1])).first();return row?.scope||null}catch{return null}}
// Mỗi phút một Cloudflare Worker gọi vào đây: bài đã duyệt và tới giờ được gửi sang Make để đăng thẳng lên Page (không hẹn giờ trong Business Suite).
const POST_STALE_MS=60*60000,POST_SENDING_MS=15*60000;
async function tick(env,origin){
 if(!env.MAKE_WEBHOOK_URL)return json({error:'Chưa cài địa chỉ nhận bài của Make.'},503);
 const nowMs=Date.now(),now=new Date(nowMs).toISOString(),sum={sent:0,expired:0,stuck:0,failed:0};
 // Gửi sang Make quá 15 phút mà chưa có kết quả: báo lỗi, không tự đăng lại để tránh đăng đôi.
 const stuck=await env.DB.prepare("UPDATE posts SET status='LỖI',error=?,updated=? WHERE status='ĐANG ĐĂNG' AND updated<?").bind('Make chưa báo kết quả sau 15 phút. Hãy kiểm tra trang Facebook trước khi đăng lại để tránh đăng đôi.',now,new Date(nowMs-POST_SENDING_MS).toISOString()).run();
 sum.stuck=stuck.meta?.changes||0;
 const {results}=await env.DB.prepare("SELECT * FROM posts WHERE status='ĐÃ DUYỆT' AND platform='FACEBOOK' AND scheduled_at<>'' AND scheduled_at<=? ORDER BY scheduled_at LIMIT 5").bind(postClock(nowMs)).all();
 for(const r of results){
  if(nowMs-postEpoch(r.scheduled_at)>POST_STALE_MS){
   await env.DB.prepare("UPDATE posts SET status='LỖI',error=?,updated=? WHERE id=? AND status='ĐÃ DUYỆT'").bind('Đã quá giờ đăng hơn 60 phút nên hệ thống không tự đăng. Hãy hẹn giờ lại.',now,r.id).run();sum.expired++;continue}
  const claim=await env.DB.prepare("UPDATE posts SET status='ĐANG ĐĂNG',updated=? WHERE id=? AND status='ĐÃ DUYỆT'").bind(now,r.id).run();
  if(!claim.meta?.changes)continue;
  const photos=(r.image?r.image.split('\n'):[]).map(x=>({type:'url',url:origin+x}));
  let state='sent';
  try{
   const res=await fetch(env.MAKE_WEBHOOK_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:r.id,kind:r.kind,body:r.body,scheduled_at:r.scheduled_at,photos}),signal:AbortSignal.timeout(10000)});
   if(!res.ok)state='retry'}
  catch(e){state=e?.name==='TimeoutError'?'unsure':'retry'}
  if(state==='sent'){sum.sent++;continue}
  sum.failed++;
  if(state==='retry')await env.DB.prepare("UPDATE posts SET status='ĐÃ DUYỆT',updated=? WHERE id=? AND status='ĐANG ĐĂNG'").bind(new Date().toISOString(),r.id).run();
  else await env.DB.prepare("UPDATE posts SET status='LỖI',error=?,updated=? WHERE id=? AND status='ĐANG ĐĂNG'").bind('Gửi sang Make quá thời gian, chưa rõ bài đã lên chưa. Hãy kiểm tra trang Facebook trước khi đăng lại.',new Date().toISOString(),r.id).run()}
 return json({ok:true,...sum})}
async function machineApi(req,env,path,u){
 const scope=await machineScope(req,env);if(!scope)return json({error:'Khóa không hợp lệ.'},401);
 try{
  if(scope==='claude'){
   if(path==='/api/machine/upload'&&req.method==='POST')return uploadImage(req,env);
   if(path==='/api/machine/style'&&req.method==='GET'){const {results}=await env.DB.prepare('SELECT day,platform,source,original,edited,note FROM style_samples ORDER BY updated DESC LIMIT 20').all();return json({samples:results})}
   if(path==='/api/machine/posts'&&req.method==='GET'){const {results}=await env.DB.prepare('SELECT id,platform,kind,source,stt,status,scheduled_at,created FROM posts ORDER BY created DESC LIMIT 200').all();return json({now:postClock(Date.now()),posts:results})}
   if(path==='/api/machine/posts'&&req.method==='POST'){
    if(Number(req.headers.get('content-length')||0)>60000)return json({error:'Dữ liệu quá lớn.'},413);
    let input;try{input=await req.json()}catch{return json({error:'Nội dung không hợp lệ.'},400)}
    const d=input&&typeof input==='object'&&!Array.isArray(input)?input:{},data={};
    for(const k of ['platform','body','source','stt','note','image'])if(d[k]!==undefined)data[k]=Array.isArray(d[k])?d[k].join('\n'):d[k];
    return postsApi(new Request(u.origin+'/api/posts',{method:'POST',body:JSON.stringify({data,from_claude:true})}),env,'/api/posts')}}
  if(scope==='clock'){
   if(path==='/api/machine/tick'&&req.method==='POST')return tick(env,u.origin)}
  if(scope==='make'){
   if(path==='/api/machine/due'&&req.method==='GET'){
    const {results}=await env.DB.prepare("SELECT * FROM posts WHERE status='ĐÃ DUYỆT' AND platform='FACEBOOK' ORDER BY scheduled_at LIMIT 50").all();
    return json({now:postClock(Date.now()),posts:results.map(r=>({id:r.id,scheduled_at:r.scheduled_at,scheduled_at_iso:new Date(postEpoch(r.scheduled_at)).toISOString(),kind:r.kind,body:r.body,images:(r.image?r.image.split('\n'):[]).map(x=>u.origin+x),photos:(r.image?r.image.split('\n'):[]).map(x=>({type:'url',url:u.origin+x}))}))})}
    const m=/^\/api\/machine\/result\/(P[a-z0-9]{6,30})$/.exec(path);
    if(m&&req.method==='POST'){
     let input;try{input=await req.json()}catch{return json({error:'Nội dung không hợp lệ.'},400)}
     const row=await env.DB.prepare('SELECT status FROM posts WHERE id=?').bind(m[1]).first();if(!row)return json({error:'Không tìm thấy bài.'},404);
     if(row.status==='ĐÃ ĐĂNG')return json({ok:true,already:true});
     if(!(['ĐÃ DUYỆT','ĐANG ĐĂNG'].includes(row.status)||(row.status==='LỖI'&&input?.ok===true)))return json({error:'Bài không ở trạng thái chờ đăng.'},409);
     const now=new Date().toISOString(),url=typeof input?.post_url==='string'?input.post_url.slice(0,500):'',msg=typeof input?.error==='string'?input.error.slice(0,2000):'';
     if(input?.ok===true)await env.DB.prepare("UPDATE posts SET status='ĐÃ ĐĂNG',post_url=?,error='',posted_at=?,updated=? WHERE id=?").bind(url,now,now,m[1]).run();
     else await env.DB.prepare("UPDATE posts SET status='LỖI',error=?,updated=? WHERE id=?").bind(msg||'Make báo lỗi.',now,m[1]).run();
     return json({ok:true})}}
  return json({error:'Không hỗ trợ.'},404)
 }catch(e){return json({error:'Chưa xử lý được yêu cầu.'},500)}}
// ---- Tài khoản nhân viên, phân quyền, nhật ký thao tác ----
// Chủ (đăng nhập bằng ADMIN_PASSWORD_HASH) luôn có mọi quyền. Nhân viên lưu trong bảng staff của kho đơn hàng.
// Mọi kiểm tra quyền làm ở máy chủ: giao diện chỉ ẩn nút cho gọn, không phải lớp bảo vệ.
const PERM_CATALOG=[
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
const PERM_KEYS=PERM_CATALOG.map(x=>x[1]);
const OWNER_ONLY_PERMS=['staff.manage','audit.view'];
const ROLE_PERMS={
 accountant:['order.view_all','order.create','order.edit','order.edit_done','order.complete','order.cancel','order.delete_approve','net.access','pay.record','pay.approve','pay.refund','commission.edit','commission.pay','supplier.pay','customer.view_all','customer.create','customer.edit','lead.view_all','lead.assign','lead.edit','debt.view','stats.view','data.export','rates.view','rates.edit','settings.edit','import.run','ctv.manage','ctv.price','ctv.avail'],
 sales:['order.create','order.edit','order.cancel','order.delete_request','net.access','pay.record','commission.edit','customer.create','customer.edit','lead.edit','stats.view','rates.view','ctv.price','ctv.avail']
};
const ROLE_LABELS={owner:'Chủ',accountant:'Kế toán',sales:'Sales',custom:'Tùy chỉnh'};
const OWNER_ACTOR_ID='owner';
function ownerActor(email,csrf,token){return {id:OWNER_ACTOR_ID,owner:true,email,name:'Chủ',role:'owner',perms:[...PERM_KEYS,...OWNER_ONLY_PERMS],csrf,token}}
function can(actor,perm){return !!actor&&(actor.owner===true||actor.perms.includes(perm))}
const noPerm=(msg)=>json({error:msg||'Tài khoản này chưa được cấp quyền làm việc này.'},403);
const authReady=new WeakMap();
async function ensureAuthTables(env){
 if(!env.BOOKINGS)return;
 let p=authReady.get(env.BOOKINGS);
 if(!p){
  p=(async()=>{
   const run=sql=>env.BOOKINGS.prepare(sql).run();
   await run('CREATE TABLE IF NOT EXISTS staff (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL, perms TEXT NOT NULL, hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created TEXT NOT NULL, updated TEXT NOT NULL)');
   await run('CREATE TABLE IF NOT EXISTS staff_sessions (token TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires INTEGER NOT NULL, staff_id TEXT NOT NULL)');
   await run('CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT NOT NULL, actor_name TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL DEFAULT \'\', detail TEXT NOT NULL DEFAULT \'\')');
   await run('CREATE INDEX IF NOT EXISTS audit_at ON audit_log(at)');
   for(const t of ['customers','leads']){try{await run('ALTER TABLE '+t+' ADD COLUMN owner TEXT NOT NULL DEFAULT \'\'')}catch(e){if(!/duplicate column|no such table/i.test(String(e?.message||e)))throw e}}
  })();
  authReady.set(env.BOOKINGS,p);
  p.catch(()=>authReady.delete(env.BOOKINGS));
 }
 await p;
}
async function makePasswordHash(pass){
 const salt=hex(crypto.getRandomValues(new Uint8Array(24))),key=await crypto.subtle.importKey('raw',enc.encode(pass),'PBKDF2',false,['deriveBits']);
 const digest=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(salt),iterations:100000},key,256);
 return salt+':'+hex(digest)
}
function cleanPerms(list){return Array.isArray(list)?PERM_KEYS.filter(k=>list.includes(k)):null}
function staffView(r){let perms=[];try{perms=JSON.parse(r.perms)}catch{}return {id:r.id,name:r.name,email:r.email,role:r.role,perms,active:!!r.active,created:r.created,updated:r.updated}}
// Tìm người đang đăng nhập: Chủ (bảng sessions) hoặc nhân viên (bảng staff_sessions)
async function resolveActor(req,env){
 const token=cookie(req);if(!token)return null;const th=await sha(token);
 const own=await env.DB.prepare('SELECT csrf,expires FROM sessions WHERE token=?').bind(th).first();
 if(own)return own.expires<Date.now()?null:ownerActor(EMAIL,own.csrf,th);
 if(!env.BOOKINGS)return null;
 try{
  await ensureAuthTables(env);
  const r=await env.BOOKINGS.prepare('SELECT s.csrf,s.expires,t.id,t.name,t.email,t.role,t.perms,t.active FROM staff_sessions s JOIN staff t ON t.id=s.staff_id WHERE s.token=?').bind(th).first();
  if(!r||r.expires<Date.now()||!r.active)return null;
  let perms=[];try{perms=cleanPerms(JSON.parse(r.perms))||[]}catch{}
  return {id:r.id,owner:false,email:r.email,name:r.name,role:r.role,perms,csrf:r.csrf,token:th}
 }catch{return null}
}
async function logAudit(env,actor,action,target,detail){
 try{
  await ensureAuthTables(env);
  await env.BOOKINGS.prepare('INSERT INTO audit_log(at,actor,actor_name,action,target,detail) VALUES(?,?,?,?,?,?)').bind(new Date().toISOString(),actor.id,actor.name+(actor.owner?'':' ('+(ROLE_LABELS[actor.role]||actor.role)+')'),action,String(target||'').slice(0,60),String(detail||'').slice(0,4000)).run()
 }catch{}
}
// So sánh nội dung bất kể thứ tự khóa
function canon(v){if(Array.isArray(v))return '['+v.map(canon).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}';return JSON.stringify(v===undefined?null:v)}
const ost=b=>BOOKING_ORDER_STATUSES.includes(b?.orderStatus)?b.orderStatus:'success';
const NET_KEYS=['netPrice','totalNet','partnerId','partner'];
function svcNetPart(s){const o={};for(const k of NET_KEYS)if(s[k]!==undefined)o[k]=s[k];if(Array.isArray(s.lines))o.lines=s.lines.map(l=>({netPrice:l?.netPrice,totalNet:l?.totalNet}));return o}
function stripNet(b){
 for(const s of b.svcs||[]){for(const k of NET_KEYS)delete s[k];if(Array.isArray(s.lines))for(const l of s.lines){delete l.netPrice;delete l.totalNet}}
 delete b.supPaid;return b
}
// Người không có quyền net gửi lại đơn đã bị ẩn giá net: đặt lại giá net cũ theo từng dịch vụ để không bị mất
function restoreNet(old,nu){
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
const netSig=b=>canon((b.svcs||[]).map(svcNetPart));
const NON_CORE_TOP=['payments','commission','supPaid','deleteReq','orderStatus','sent','status','updatedBy','updatedAt','createdBy','createdByName','owner'];
function coreSig(b){
 const c=JSON.parse(JSON.stringify(b));for(const k of NON_CORE_TOP)delete c[k];
 for(const s of c.svcs||[]){for(const k of NET_KEYS)delete s[k];delete s.code;delete s.sent;if(Array.isArray(s.lines))for(const l of s.lines){delete l.netPrice;delete l.totalNet}}
 return canon(c)
}
const commSig=b=>canon({c:b.commission?.ctvId||'',a:Number(b.commission?.amount)||0});
const commPaidSig=b=>canon([!!b.commission?.paid,b.commission?.paidDate||'']);
function summarize(old,nu){
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
// Trả về chuỗi lỗi nếu nhân viên không được phép đổi từ old sang nu. Chủ không bị kiểm tra.
function checkBookingChange(actor,old,nu){
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
// Gắn lại yêu cầu xóa cho đúng dạng và đúng người, bất kể máy khách gửi gì
function applyDeleteReq(actor,old,nu){
 const had=old?.deleteReq||null,want=nu.deleteReq;
 if(!want){delete nu.deleteReq;if(had&&!(had.by===actor.id||can(actor,'order.delete_approve')))return 'Chỉ người gửi yêu cầu, Kế toán hoặc Chủ được gỡ yêu cầu xóa.';return null}
 if(had){nu.deleteReq=had;return null}
 if(!can(actor,'order.delete_request')&&!can(actor,'order.delete_approve'))return 'Tài khoản này chưa được phép gửi yêu cầu xóa.';
 const reason=typeof want.reason==='string'?want.reason.replace(/[<>]/g,'').trim().slice(0,200):'';
 nu.deleteReq={by:actor.id,byName:actor.name,at:new Date().toISOString(),reason};return null
}
async function bookingApi(req,env,path,actor){
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
   }else{if(!data.createdBy)data.createdBy=EMAIL;if(!data.owner)data.owner=EMAIL;const e=applyDeleteReq(actor,null,data);if(e)return noPerm(e)}
   data.updatedBy=actor.owner?EMAIL:actor.email;data.updatedAt=stamp;
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
  data.updatedBy=actor.owner?EMAIL:actor.email;data.updatedAt=stamp;
  await env.BOOKINGS.prepare('UPDATE bookings SET data=?,updated=? WHERE id=?').bind(JSON.stringify(data),stamp,data.id).run();
  const note=summarize(old,data);
  if(!/^Lưu lại, không đổi/.test(note))await logAudit(env,actor,'order.update',data.id,note);
  return json({ok:true})
 }
 return json({error:'Không hỗ trợ.'},405)
}
// ---- Quản lý tài khoản nhân viên (chỉ Chủ) và đổi mật khẩu ----
async function staffApi(req,env,path,actor,u){
 if(!env.BOOKINGS)return json({error:'Chưa kết nối kho đơn hàng.'},503);
 await ensureAuthTables(env);
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
  if(email===EMAIL)return json({error:'Email này là của Chủ.'},400);
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
async function auditApi(req,env,u,actor){
 if(!actor.owner)return noPerm('Chỉ Chủ được xem nhật ký.');
 if(!env.BOOKINGS)return json({error:'Chưa kết nối kho đơn hàng.'},503);
 await ensureAuthTables(env);
 const limit=Math.min(200,Math.max(1,Number(u.searchParams.get('limit'))||100)),before=Number(u.searchParams.get('before'))||0;
 const q=(u.searchParams.get('q')||'').trim().slice(0,60);
 const where=[],args=[];if(before){where.push('id<?');args.push(before)}if(q){where.push('(target LIKE ? OR actor_name LIKE ? OR action LIKE ? OR detail LIKE ?)');const l='%'+q.replace(/[%_]/g,'')+'%';args.push(l,l,l,l)}
 const {results}=await env.BOOKINGS.prepare('SELECT id,at,actor,actor_name,action,target,detail FROM audit_log'+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY id DESC LIMIT '+limit).bind(...args).all();
 return json({log:results})
}
async function staffLogin(env,mail,pass,req){
 const bad=()=>json({error:'Email hoặc mật khẩu chưa đúng.'},401);
 if(!env.BOOKINGS||!mail)return bad();
 let row=null;try{await ensureAuthTables(env);row=await env.BOOKINGS.prepare('SELECT * FROM staff WHERE email=?').bind(mail).first()}catch{return bad()}
 const ok=await passwordOK(pass,row?row.hash:'0:'+'0'.repeat(64));
 if(!row||!ok||!row.active)return bad();
 const token=crypto.randomUUID()+'-'+crypto.randomUUID(),csrf=crypto.randomUUID();
 await env.BOOKINGS.prepare('INSERT INTO staff_sessions(token,csrf,expires,staff_id) VALUES(?,?,?,?)').bind(await sha(token),csrf,Date.now()+8*3600000,row.id).run();
 await env.BOOKINGS.prepare('DELETE FROM staff_sessions WHERE expires<?').bind(Date.now()).run();
 await env.DB.prepare('DELETE FROM attempts WHERE expires<?').bind(Date.now()).run();
 await logAudit(env,{id:row.id,name:row.name,role:row.role,owner:false},'login',row.id,'Đăng nhập');
 return json({email:row.email,csrf,name:row.name,role:row.role},200,{'set-cookie':sessionCookie(token,28800,req)})
}
// ---- Copy nhanh: tin nhắn mẫu + thư viện ảnh khách sạn (chỉ Chủ) ----
const quickReady=new WeakMap();
async function ensureQuickTables(env){
 let p=quickReady.get(env.DB);
 if(!p){
  p=(async()=>{
   await env.DB.prepare('CREATE TABLE IF NOT EXISTS quick_msgs (id TEXT PRIMARY KEY, grp TEXT NOT NULL DEFAULT \'\', title TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL)').run();
   // Cột sec = Mục (tầng 1), grp = Nhóm (tầng 2). Bảng cũ chỉ có grp thì chuyển grp cũ lên làm Mục.
   let added=false;
   try{await env.DB.prepare('ALTER TABLE quick_msgs ADD COLUMN sec TEXT NOT NULL DEFAULT \'\'').run();added=true}catch(e){if(!/duplicate column/i.test(String(e&&e.message||e)))throw e}
   if(added)await env.DB.prepare('UPDATE quick_msgs SET sec=grp, grp=\'\' WHERE grp<>\'\'').run();
   await env.DB.prepare('CREATE TABLE IF NOT EXISTS quick_photos (id TEXT PRIMARY KEY, album TEXT NOT NULL, label TEXT NOT NULL DEFAULT \'\', url TEXT NOT NULL, created TEXT NOT NULL)').run();
   // Ảnh cũng 3 tầng: sec (Mục) > grp (Nhóm) > album (Khách sạn). Ảnh cũ để sec và grp trống, hiện trong "Chưa phân loại".
   for(const col of ['sec','grp']){try{await env.DB.prepare('ALTER TABLE quick_photos ADD COLUMN '+col+' TEXT NOT NULL DEFAULT \'\'').run()}catch(e){if(!/duplicate column/i.test(String(e&&e.message||e)))throw e}}
  })();
  quickReady.set(env.DB,p);
  p.catch(()=>quickReady.delete(env.DB));
 }
 await p;
}
const QUICK_URL_RE=/^\/media\/[a-zA-Z0-9._-]+$/;
const quickClean=(v,max)=>String(v==null?'':v).replace(/\r\n/g,'\n').trim().slice(0,max);
async function quickApi(req,env,path){
 if(!env.DB)return json({error:'Chưa kết nối cơ sở dữ liệu.'},503);
 await ensureQuickTables(env);
 const now=new Date().toISOString();
 const m=/^\/api\/quick(?:\/(msg|photo|rename|group|prename|pgroup)(?:\/([A-Za-z0-9]{6,30}))?)?$/.exec(path);
 if(!m)return json({error:'Không tìm thấy.'},404);
 const kind=m[1],id=m[2];
 if(!kind){
  if(req.method!=='GET')return json({error:'Không hỗ trợ.'},405);
  const msgs=await env.DB.prepare('SELECT id,sec,grp,title,body,updated FROM quick_msgs ORDER BY sec COLLATE NOCASE, grp COLLATE NOCASE, title COLLATE NOCASE LIMIT 600').all();
  const photos=await env.DB.prepare('SELECT id,sec,grp,album,label,url,created FROM quick_photos ORDER BY sec COLLATE NOCASE, grp COLLATE NOCASE, album COLLATE NOCASE, created DESC LIMIT 3000').all();
  return json({msgs:msgs.results,photos:photos.results});
 }
 let data={};
 if(req.method==='POST'||req.method==='PUT'){try{data=await req.json()}catch{return json({error:'Dữ liệu không hợp lệ.'},400)}}
 const newId=()=>'Q'+crypto.randomUUID().replace(/-/g,'').slice(0,16);
 if(kind==='rename'){
  if(req.method!=='POST')return json({error:'Không hỗ trợ.'},405);
  const sec=quickClean(data.sec,40),from=quickClean(data.from,40),to=quickClean(data.to,40);
  if(!to)return json({error:'Nhập tên mới.'},400);
  if(data.level==='sec')await env.DB.prepare('UPDATE quick_msgs SET sec=?,updated=? WHERE sec=?').bind(to,now,from).run();
  else if(data.level==='grp')await env.DB.prepare('UPDATE quick_msgs SET grp=?,updated=? WHERE sec=? AND grp=?').bind(to,now,sec,from).run();
  else return json({error:'Dữ liệu không hợp lệ.'},400);
  return json({ok:true});
 }
 if(kind==='group'){
  if(req.method!=='POST')return json({error:'Không hỗ trợ.'},405);
  const sec=quickClean(data.sec,40),grp=quickClean(data.grp,40);
  if(!sec)return json({error:'Thiếu tên mục.'},400);
  if(data.level==='sec')await env.DB.prepare('DELETE FROM quick_msgs WHERE sec=?').bind(sec).run();
  else if(data.level==='grp')await env.DB.prepare('DELETE FROM quick_msgs WHERE sec=? AND grp=?').bind(sec,grp).run();
  else return json({error:'Dữ liệu không hợp lệ.'},400);
  return json({ok:true});
 }
 if(kind==='prename'){
  if(req.method!=='POST')return json({error:'Không hỗ trợ.'},405);
  const sec=quickClean(data.sec,40),grp=quickClean(data.grp,40),from=quickClean(data.from,80),to=quickClean(data.to,80);
  if(!to)return json({error:'Nhập tên mới.'},400);
  if(data.level==='sec')await env.DB.prepare('UPDATE quick_photos SET sec=? WHERE sec=?').bind(to.slice(0,40),from).run();
  else if(data.level==='grp')await env.DB.prepare('UPDATE quick_photos SET grp=? WHERE sec=? AND grp=?').bind(to.slice(0,40),sec,from).run();
  else if(data.level==='album')await env.DB.prepare('UPDATE quick_photos SET album=? WHERE sec=? AND grp=? AND album=?').bind(to,sec,grp,from).run();
  else return json({error:'Dữ liệu không hợp lệ.'},400);
  return json({ok:true});
 }
 if(kind==='pgroup'){
  if(req.method!=='POST')return json({error:'Không hỗ trợ.'},405);
  const sec=quickClean(data.sec,40),grp=quickClean(data.grp,40),album=quickClean(data.album,80);
  let where,args;
  if(data.level==='sec'){where='sec=?';args=[sec]}
  else if(data.level==='grp'){where='sec=? AND grp=?';args=[sec,grp]}
  else if(data.level==='album'){where='sec=? AND grp=? AND album=?';args=[sec,grp,album]}
  else return json({error:'Dữ liệu không hợp lệ.'},400);
  const rows=await env.DB.prepare('SELECT url FROM quick_photos WHERE '+where).bind(...args).all();
  await env.DB.prepare('DELETE FROM quick_photos WHERE '+where).bind(...args).run();
  if(env.MEDIA&&env.MEDIA.delete)for(const r of rows.results){
   const left=await env.DB.prepare('SELECT COUNT(*) n FROM quick_photos WHERE url=?').bind(r.url).first();
   if(!left.n)try{await env.MEDIA.delete(r.url.slice(7))}catch{}
  }
  return json({ok:true,removed:rows.results.length});
 }
 if(kind==='msg'){
  const sec=quickClean(data.sec,40),grp=quickClean(data.grp,40),title=quickClean(data.title,80),body=quickClean(data.body,4000);
  if((req.method==='POST'||req.method==='PUT')&&!sec)return json({error:'Nhập tên mục.'},400);
  if(req.method==='POST'){
   if(!title||!body)return json({error:'Nhập tên mẫu và nội dung.'},400);
   const c=await env.DB.prepare('SELECT COUNT(*) n FROM quick_msgs').first();
   if(c.n>=500)return json({error:'Đã đủ 500 mẫu, hãy xóa bớt mẫu cũ.'},400);
   const nid=newId();
   await env.DB.prepare('INSERT INTO quick_msgs (id,sec,grp,title,body,created,updated) VALUES (?,?,?,?,?,?,?)').bind(nid,sec,grp,title,body,now,now).run();
   return json({msg:{id:nid,sec,grp,title,body,updated:now}},201);
  }
  if(!id)return json({error:'Thiếu mã mẫu.'},400);
  if(req.method==='PUT'){
   if(!title||!body)return json({error:'Nhập tên mẫu và nội dung.'},400);
   const r=await env.DB.prepare('UPDATE quick_msgs SET sec=?,grp=?,title=?,body=?,updated=? WHERE id=?').bind(sec,grp,title,body,now,id).run();
   if(!r.meta.changes)return json({error:'Không tìm thấy mẫu.'},404);
   return json({msg:{id,sec,grp,title,body,updated:now}});
  }
  if(req.method==='DELETE'){await env.DB.prepare('DELETE FROM quick_msgs WHERE id=?').bind(id).run();return json({ok:true})}
  return json({error:'Không hỗ trợ.'},405);
 }
 const psec=quickClean(data.sec,40),pgrp=quickClean(data.grp,40),album=quickClean(data.album,80),label=quickClean(data.label,40);
 if((req.method==='POST'||req.method==='PUT')&&!psec)return json({error:'Nhập tên mục.'},400);
 if(req.method==='POST'){
  if(!album)return json({error:'Chọn hoặc nhập tên khách sạn.'},400);
  const url=String(data.url||'');
  if(!QUICK_URL_RE.test(url))return json({error:'Ảnh không hợp lệ.'},400);
  const c=await env.DB.prepare('SELECT COUNT(*) n FROM quick_photos').first();
  if(c.n>=3000)return json({error:'Đã đủ 3000 ảnh, hãy xóa bớt ảnh cũ.'},400);
  const nid=newId();
  await env.DB.prepare('INSERT INTO quick_photos (id,sec,grp,album,label,url,created) VALUES (?,?,?,?,?,?,?)').bind(nid,psec,pgrp,album,label,url,now).run();
  return json({photo:{id:nid,sec:psec,grp:pgrp,album,label,url,created:now}},201);
 }
 if(!id)return json({error:'Thiếu mã ảnh.'},400);
 if(req.method==='PUT'){
  if(!album)return json({error:'Nhập tên khách sạn.'},400);
  const r=await env.DB.prepare('UPDATE quick_photos SET sec=?,grp=?,album=?,label=? WHERE id=?').bind(psec,pgrp,album,label,id).run();
  if(!r.meta.changes)return json({error:'Không tìm thấy ảnh.'},404);
  return json({ok:true});
 }
 if(req.method==='DELETE'){
  const row=await env.DB.prepare('SELECT url FROM quick_photos WHERE id=?').bind(id).first();
  await env.DB.prepare('DELETE FROM quick_photos WHERE id=?').bind(id).run();
  // Xóa file ảnh khỏi kho nếu không còn nơi nào dùng
  if(row&&env.MEDIA&&env.MEDIA.delete){
   const left=await env.DB.prepare('SELECT COUNT(*) n FROM quick_photos WHERE url=?').bind(row.url).first();
   if(!left.n)try{await env.MEDIA.delete(row.url.slice(7))}catch{}
  }
  return json({ok:true});
 }
 return json({error:'Không hỗ trợ.'},405);
}
// ---- CTV (cộng tác viên): đăng ký, xác nhận email, đăng nhập, quản lý ----
// Tài khoản CTV tách hẳn tài khoản nhân viên: cookie riêng, bảng riêng, đường dẫn /api/sales/*.
// Trạng thái: pending_email (chờ nhập mã OTP) -> pending (chờ Chủ duyệt) -> active; locked = bị khóa.
const CTV_COOKIE='serene_ctv';
const CTV_SESSION_SECONDS=7*86400;
const CTV_EMAIL_RE=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const ctvReady=new WeakMap();
async function ensureCtvTables(env){
 let p=ctvReady.get(env.BOOKINGS);
 if(!p){
  p=(async()=>{
   const run=sql=>env.BOOKINGS.prepare(sql).run();
   await run('CREATE TABLE IF NOT EXISTS ctv_accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, zalo TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL UNIQUE, hash TEXT NOT NULL, status TEXT NOT NULL, email_ok INTEGER NOT NULL DEFAULT 0, otp_hash TEXT NOT NULL DEFAULT \'\', otp_expires INTEGER NOT NULL DEFAULT 0, otp_tries INTEGER NOT NULL DEFAULT 0, otp_sent INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, updated TEXT NOT NULL, last_login TEXT NOT NULL DEFAULT \'\')');
   await run('CREATE TABLE IF NOT EXISTS ctv_sessions (token TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires INTEGER NOT NULL, ctv_id TEXT NOT NULL)');
  })();
  ctvReady.set(env.BOOKINGS,p);
  p.catch(()=>ctvReady.delete(env.BOOKINGS));
 }
 await p;
}
function ctvCookieValue(req){return new RegExp('(?:^|;\\s*)'+CTV_COOKIE+'=([A-Za-z0-9-]+)').exec(req.headers.get('cookie')||'')?.[1]||''}
function ctvSessionCookie(value,age,req){return CTV_COOKIE+'='+value+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+age+(new URL(req.url).protocol==='https:'?'; Secure':'')}
function ctvAdminView(r){return {id:r.id,name:r.name,phone:r.phone,zalo:r.zalo,email:r.email,status:r.status,emailOk:!!r.email_ok,created:r.created,lastLogin:r.last_login}}
// Gửi mã OTP bằng email chỉ bật khi đã cài RESEND_API_KEY và MAIL_FROM (cần tên miền đã xác minh trong Resend)
function ctvOtpEnabled(env){return !!(env.RESEND_API_KEY&&env.MAIL_FROM)}
async function ctvSendOtpMail(env,to,code){
 try{
  const res=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:'Bearer '+env.RESEND_API_KEY,'content-type':'application/json'},body:JSON.stringify({
   from:env.MAIL_FROM,to:[to],subject:'Mã xác nhận Serene Travel: '+code,
   text:'Mã xác nhận đăng ký cộng tác viên Serene Travel của bạn là: '+code+'\n\nMã có hiệu lực trong 10 phút. Nếu bạn không đăng ký, hãy bỏ qua email này.'
  }),signal:AbortSignal.timeout(10000)});
  return res.ok
 }catch{return false}
}
// Tạo và gửi mã mới. Trả về 'sent' | 'throttled' | 'failed'
async function ctvIssueOtp(env,row){
 const now=Date.now();
 if(now-row.otp_sent<60000)return 'throttled';
 const buf=new Uint32Array(1);crypto.getRandomValues(buf);
 const code=String(buf[0]%1000000).padStart(6,'0');
 await env.BOOKINGS.prepare('UPDATE ctv_accounts SET otp_hash=?,otp_expires=?,otp_tries=0,otp_sent=?,updated=? WHERE id=?').bind(await sha(code+':'+row.id),now+600000,now,new Date().toISOString(),row.id).run();
 return await ctvSendOtpMail(env,row.email,code)?'sent':'failed'
}
// Đếm lượt thử theo khóa; trả về true nếu vượt giới hạn
async function ctvBump(env,key,ttlMs,max){
 await env.DB.prepare('INSERT INTO attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').bind(key,Date.now()+ttlMs).run();
 const row=await env.DB.prepare('SELECT count FROM attempts WHERE key=?').bind(key).first();
 return (row?.count||0)>max
}
// Người đang đăng nhập trang CTV (chỉ tài khoản đã duyệt)
async function resolveCtv(req,env){
 const token=ctvCookieValue(req);if(!token||!env.BOOKINGS)return null;
 try{
  await ensureCtvTables(env);
  const th=await sha(token);
  const r=await env.BOOKINGS.prepare('SELECT s.csrf,s.expires,t.id,t.name,t.email,t.status FROM ctv_sessions s JOIN ctv_accounts t ON t.id=s.ctv_id WHERE s.token=?').bind(th).first();
  if(!r||r.expires<Date.now()||r.status!=='active')return null;
  return {id:r.id,name:r.name,email:r.email,csrf:r.csrf,token:th}
 }catch{return null}
}
async function salesApi(req,env,path,u){
 if(!env.BOOKINGS||!env.DB)return json({error:'Chưa sẵn sàng.'},503);
 await ensureCtvTables(env);
 const ip=await sha(req.headers.get('CF-Connecting-IP')||'local'),hour=Math.floor(Date.now()/3600000),quarter=Math.floor(Date.now()/900000);
 const readBody=async(max=4000)=>{
  if(Number(req.headers.get('content-length')||0)>max)return null;
  try{const i=await req.json();return i&&typeof i==='object'&&!Array.isArray(i)?i:null}catch{return null}
 };
 const mailOf=x=>typeof x==='string'&&x.trim().length<=80&&CTV_EMAIL_RE.test(x.trim())?x.trim().toLowerCase():null;
 const goodPass=x=>typeof x==='string'&&x.length>=8&&x.length<=128;
 const invalid=()=>json({error:'Yêu cầu không hợp lệ.'},400);
 if(path==='/api/sales/register'&&req.method==='POST'){
  const i=await readBody();if(!i)return invalid();
  if(i.website)return json({ok:true,next:'wait'});
  if(await ctvBump(env,'ctv:reg:ip:'+ip+':'+hour,2*3600000,8)||await ctvBump(env,'ctv:reg:all:'+hour,2*3600000,150))return json({error:'Bạn đăng ký quá nhiều lần. Vui lòng thử lại sau.'},429);
  const name=cleanLine(i.name,60,true),phone=typeof i.phone==='string'?i.phone.replace(/[\s().-]/g,''):'',zalo=i.zalo===undefined||i.zalo===''?'':cleanLine(i.zalo,30),email=mailOf(i.email);
  if(!name)return json({error:'Vui lòng nhập họ tên.'},400);
  if(!VN_PHONE_RE.test(phone))return json({error:'Số điện thoại chưa đúng.'},400);
  if(zalo===null)return json({error:'Zalo chưa đúng.'},400);
  if(!email)return json({error:'Email chưa đúng.'},400);
  if(email===EMAIL)return json({error:'Email này không dùng được.'},400);
  if(!goodPass(i.password))return json({error:'Mật khẩu cần từ 8 đến 128 ký tự.'},400);
  const otpOn=ctvOtpEnabled(env);
  const old=await env.BOOKINGS.prepare('SELECT * FROM ctv_accounts WHERE email=?').bind(email).first();
  if(old){
   // Đã đăng ký nhưng chưa nhập mã: cho gửi lại mã, không đổi mật khẩu đã đặt
   if(old.status==='pending_email'&&otpOn){await ctvIssueOtp(env,old);return json({ok:true,next:'verify'})}
   return json({error:'Email này đã đăng ký. Hãy đăng nhập hoặc nhắn Zalo cho Serene.'},409)
  }
  const cnt=await env.BOOKINGS.prepare('SELECT COUNT(*) AS n FROM ctv_accounts').first();if((cnt?.n||0)>=5000)return json({error:'Tạm thời chưa nhận thêm đăng ký.'},503);
  const id='k'+hex(crypto.getRandomValues(new Uint8Array(6))),now=new Date().toISOString();
  await env.BOOKINGS.prepare('INSERT INTO ctv_accounts(id,name,phone,zalo,email,hash,status,email_ok,created,updated) VALUES(?,?,?,?,?,?,?,0,?,?)').bind(id,name,phone,zalo||'',email,await makePasswordHash(i.password),otpOn?'pending_email':'pending',now,now).run();
  if(otpOn){
   const row=await env.BOOKINGS.prepare('SELECT * FROM ctv_accounts WHERE id=?').bind(id).first();
   const sent=await ctvIssueOtp(env,row);
   if(sent==='failed')return json({ok:true,next:'verify',warn:'Chưa gửi được email. Bấm "Gửi lại mã" sau ít phút.'},201);
   return json({ok:true,next:'verify'},201)
  }
  return json({ok:true,next:'wait'},201)
 }
 if(path==='/api/sales/verify'&&req.method==='POST'){
  const i=await readBody();if(!i)return invalid();
  const email=mailOf(i.email),code=typeof i.code==='string'?i.code.trim():'';
  if(!email||!/^\d{6}$/.test(code))return json({error:'Mã gồm 6 chữ số.'},400);
  if(await ctvBump(env,'ctv:otp:ip:'+ip+':'+hour,2*3600000,30))return json({error:'Bạn thử quá nhiều lần. Vui lòng thử lại sau.'},429);
  const row=await env.BOOKINGS.prepare('SELECT * FROM ctv_accounts WHERE email=?').bind(email).first();
  const wrong=()=>json({error:'Mã chưa đúng hoặc đã hết hạn.'},400);
  if(!row||row.status!=='pending_email'||!row.otp_hash)return wrong();
  if(row.otp_tries>=5)return json({error:'Bạn nhập sai quá nhiều lần. Bấm "Gửi lại mã" để nhận mã mới.'},429);
  if(row.otp_expires<Date.now()){return wrong()}
  if(!equal(await sha(code+':'+row.id),row.otp_hash)){
   await env.BOOKINGS.prepare('UPDATE ctv_accounts SET otp_tries=otp_tries+1 WHERE id=?').bind(row.id).run();
   return wrong()
  }
  await env.BOOKINGS.prepare("UPDATE ctv_accounts SET status='pending',email_ok=1,otp_hash='',otp_expires=0,otp_tries=0,updated=? WHERE id=?").bind(new Date().toISOString(),row.id).run();
  return json({ok:true,next:'wait'})
 }
 if(path==='/api/sales/resend'&&req.method==='POST'){
  const i=await readBody();if(!i)return invalid();
  const email=mailOf(i.email);
  if(await ctvBump(env,'ctv:resend:ip:'+ip+':'+hour,2*3600000,10))return json({error:'Bạn yêu cầu quá nhiều lần. Vui lòng thử lại sau.'},429);
  // Luôn trả lời giống nhau để không lộ email nào đã đăng ký
  if(email&&ctvOtpEnabled(env)){
   const row=await env.BOOKINGS.prepare("SELECT * FROM ctv_accounts WHERE email=? AND status='pending_email'").bind(email).first();
   if(row)await ctvIssueOtp(env,row)
  }
  return json({ok:true})
 }
 if(path==='/api/sales/login'&&req.method==='POST'){
  const i=await readBody();if(!i)return invalid();
  if(await ctvBump(env,'ctv:login:ip:'+ip+':'+quarter,900000,10)||await ctvBump(env,'ctv:login:all:'+quarter,900000,100))return json({error:'Đã thử quá nhiều lần. Vui lòng đợi 15 phút.'},429);
  const email=mailOf(i.email),pass=typeof i.password==='string'?i.password:'';
  const bad=()=>json({error:'Email hoặc mật khẩu chưa đúng.'},401);
  if(!email||pass.length>256)return bad();
  const row=await env.BOOKINGS.prepare('SELECT * FROM ctv_accounts WHERE email=?').bind(email).first();
  const ok=await passwordOK(pass,row?row.hash:'0:'+'0'.repeat(64));
  if(!row||!ok)return bad();
  if(row.status==='pending_email')return json({error:'Bạn chưa xác nhận email. Nhập mã OTP đã gửi về email.',needVerify:true},403);
  if(row.status==='pending')return json({error:'Tài khoản đang chờ Serene duyệt. Chúng tôi sẽ báo cho bạn sớm.'},403);
  if(row.status!=='active')return json({error:'Tài khoản đã bị khóa. Vui lòng liên hệ Serene.'},403);
  const token=crypto.randomUUID()+'-'+crypto.randomUUID(),csrf=crypto.randomUUID(),now=new Date().toISOString();
  await env.BOOKINGS.prepare('INSERT INTO ctv_sessions(token,csrf,expires,ctv_id) VALUES(?,?,?,?)').bind(await sha(token),csrf,Date.now()+CTV_SESSION_SECONDS*1000,row.id).run();
  await env.BOOKINGS.prepare('DELETE FROM ctv_sessions WHERE expires<?').bind(Date.now()).run();
  await env.DB.prepare('DELETE FROM attempts WHERE expires<?').bind(Date.now()).run();
  await env.BOOKINGS.prepare('UPDATE ctv_accounts SET last_login=? WHERE id=?').bind(now,row.id).run();
  return json({name:row.name,email:row.email,csrf},200,{'set-cookie':ctvSessionCookie(token,CTV_SESSION_SECONDS,req)})
 }
 // Các đường dẫn còn lại cần đăng nhập
 const ctv=await resolveCtv(req,env);
 if(!ctv)return json({error:'Vui lòng đăng nhập.'},401,ctvCookieValue(req)?{'set-cookie':ctvSessionCookie('',0,req)}:{});
 if(req.method!=='GET'&&req.headers.get('x-csrf-token')!==ctv.csrf)return json({error:'Phiên đăng nhập không hợp lệ. Hãy đăng nhập lại.'},403);
 if(path==='/api/sales/me'&&req.method==='GET')return json({name:ctv.name,email:ctv.email,csrf:ctv.csrf});
 if(path==='/api/sales/logout'&&req.method==='POST'){
  await env.BOOKINGS.prepare('DELETE FROM ctv_sessions WHERE token=?').bind(ctv.token).run();
  return json({ok:true},200,{'set-cookie':ctvSessionCookie('',0,req)})
 }
 if(path==='/api/sales/password'&&req.method==='POST'){
  const i=await readBody();if(!i)return invalid();
  if(!goodPass(i.next))return json({error:'Mật khẩu mới cần từ 8 đến 128 ký tự.'},400);
  const row=await env.BOOKINGS.prepare('SELECT hash FROM ctv_accounts WHERE id=?').bind(ctv.id).first();
  if(!row||typeof i.current!=='string'||i.current.length>128||!await passwordOK(i.current,row.hash))return json({error:'Mật khẩu hiện tại chưa đúng.'},400);
  await env.BOOKINGS.prepare('UPDATE ctv_accounts SET hash=?,updated=? WHERE id=?').bind(await makePasswordHash(i.next),new Date().toISOString(),ctv.id).run();
  await env.BOOKINGS.prepare('DELETE FROM ctv_sessions WHERE ctv_id=? AND token<>?').bind(ctv.id,ctv.token).run();
  return json({ok:true})
 }
 if(path==='/api/sales/hotels'&&req.method==='GET')return ctvSalesHotels(env);
 if(path==='/api/sales/hotel'&&req.method==='GET')return ctvSalesHotel(env,u.searchParams.get('name')||'');
 return json({error:'Không tìm thấy.'},404)
}
// Quản lý CTV trong trang quản trị (Chủ hoặc nhân viên có quyền ctv.manage)
async function ctvAdminApi(req,env,path,actor){
 if(!can(actor,'ctv.manage'))return noPerm();
 if(!env.BOOKINGS)return json({error:'Chưa kết nối kho đơn hàng.'},503);
 await ensureCtvTables(env);
 const m=/^\/api\/ctv(?:\/(k[0-9a-f]{12}))?$/.exec(path);if(!m)return json({error:'Không tìm thấy.'},404);
 const id=m[1];
 if(req.method==='GET'&&!id){
  const {results}=await env.BOOKINGS.prepare("SELECT * FROM ctv_accounts ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'pending_email' THEN 1 WHEN 'active' THEN 2 ELSE 3 END, created DESC").all();
  return json({ctvs:results.map(ctvAdminView),pending:results.filter(r=>r.status==='pending').length,otp:ctvOtpEnabled(env)})
 }
 if(!id)return json({error:'Không hỗ trợ.'},405);
 const row=await env.BOOKINGS.prepare('SELECT * FROM ctv_accounts WHERE id=?').bind(id).first();
 if(!row)return json({error:'Không tìm thấy CTV.'},404);
 const now=new Date().toISOString(),label=row.name+' <'+row.email+'>';
 if(req.method==='PUT'){
  if(Number(req.headers.get('content-length')||0)>2000)return json({error:'Dữ liệu quá lớn.'},413);
  let i;try{i=await req.json()}catch{return json({error:'Nội dung không hợp lệ.'},400)}
  const action=i?.action;
  if(action==='approve'){
   if(row.status!=='pending'&&row.status!=='pending_email')return json({error:'CTV này không ở trạng thái chờ duyệt.'},400);
   // Khi bật OTP, chưa xác nhận email thì chưa duyệt được
   if(row.status==='pending_email'&&ctvOtpEnabled(env))return json({error:'CTV chưa xác nhận email bằng mã OTP.'},400);
   await env.BOOKINGS.prepare("UPDATE ctv_accounts SET status='active',updated=? WHERE id=?").bind(now,id).run();
   await logAudit(env,actor,'ctv.approve',id,label)
  }else if(action==='lock'){
   if(row.status!=='active')return json({error:'Chỉ khóa được CTV đang hoạt động.'},400);
   await env.BOOKINGS.prepare("UPDATE ctv_accounts SET status='locked',updated=? WHERE id=?").bind(now,id).run();
   await env.BOOKINGS.prepare('DELETE FROM ctv_sessions WHERE ctv_id=?').bind(id).run();
   await logAudit(env,actor,'ctv.lock',id,label)
  }else if(action==='unlock'){
   if(row.status!=='locked')return json({error:'CTV này không bị khóa.'},400);
   await env.BOOKINGS.prepare("UPDATE ctv_accounts SET status='active',updated=? WHERE id=?").bind(now,id).run();
   await logAudit(env,actor,'ctv.unlock',id,label)
  }else if(action==='password'){
   if(typeof i.password!=='string'||i.password.length<8||i.password.length>128)return json({error:'Mật khẩu cần từ 8 đến 128 ký tự.'},400);
   await env.BOOKINGS.prepare('UPDATE ctv_accounts SET hash=?,updated=? WHERE id=?').bind(await makePasswordHash(i.password),now,id).run();
   await env.BOOKINGS.prepare('DELETE FROM ctv_sessions WHERE ctv_id=?').bind(id).run();
   await logAudit(env,actor,'ctv.password',id,label)
  }else return json({error:'Thao tác không hợp lệ.'},400);
  return json({ctv:ctvAdminView(await env.BOOKINGS.prepare('SELECT * FROM ctv_accounts WHERE id=?').bind(id).first())})
 }
 if(req.method==='DELETE'){
  if(row.status==='active')return json({error:'Hãy khóa CTV trước rồi mới xóa.'},400);
  await env.BOOKINGS.prepare('DELETE FROM ctv_sessions WHERE ctv_id=?').bind(id).run();
  await env.BOOKINGS.prepare('DELETE FROM ctv_accounts WHERE id=?').bind(id).run();
  await logAudit(env,actor,'ctv.delete',id,label);
  return json({ok:true})
 }
 return json({error:'Không hỗ trợ.'},405)
}
// ---- Giá CTV: tính từ giá net theo quy tắc, có ghi đè tay ----
// Quy tắc chung (mặc định): net dưới 500.000 đ thì cộng 10%, từ 500.000 đ trở lên thì cộng 50.000 đ mỗi phòng mỗi đêm, rồi làm tròn LÊN hàng nghìn.
// Mỗi khách sạn có thể chọn quy tắc riêng (luôn cộng % hoặc luôn cộng số tiền cố định). Từng dòng giá có thể nhập tay.
// Chỉ dùng số nguyên để không bị lệch số lẻ (440.000 không thành 441.000).
const CTV_RULE_DEFAULT={thresh:500000,pct:10,fixed:50000,round:1000};
const ctvHk=n=>String(n||'').trim().toLowerCase().replace(/\s+/g,' ');
function ctvRuleClean(r){
 if(!r||typeof r!=='object')return null;
 const thresh=Number(r.thresh),pct=Number(r.pct),fixed=Number(r.fixed),round=Number(r.round);
 if(!Number.isInteger(thresh)||thresh<0||thresh>100000000)return null;
 if(!Number.isFinite(pct)||pct<0||pct>100||Math.abs(pct*100-Math.round(pct*100))>1e-9)return null;
 if(!Number.isInteger(fixed)||fixed<0||fixed>10000000)return null;
 if(!Number.isInteger(round)||round<1||round>100000)return null;
 return {thresh,pct,fixed,round}
}
// Quy tắc riêng của khách sạn: null (dùng quy tắc chung) hoặc {type:'pct'|'fixed', value}
function ctvHotelRuleClean(r){
 if(r===null||r===undefined)return null;
 if(typeof r!=='object')return undefined;
 const value=Number(r.value);
 if(r.type==='pct'){if(!Number.isFinite(value)||value<0||value>100||Math.abs(value*100-Math.round(value*100))>1e-9)return undefined;return {type:'pct',value}}
 if(r.type==='fixed'){if(!Number.isInteger(value)||value<0||value>10000000)return undefined;return {type:'fixed',value}}
 return undefined
}
function ctvPrice(net,rule,hotelRule){
 const type=hotelRule?hotelRule.type:(net<rule.thresh?'pct':'fixed');
 let num,den;
 if(type==='pct'){const bp=Math.round((hotelRule&&hotelRule.type==='pct'?hotelRule.value:rule.pct)*100);num=net*(10000+bp);den=10000}
 else{num=net+(hotelRule&&hotelRule.type==='fixed'?hotelRule.value:rule.fixed);den=1}
 const unit=den*rule.round;
 return Math.ceil(num/unit)*rule.round
}
async function ctvSetting(env,key){
 const row=await env.BOOKINGS.prepare('SELECT value FROM booking_settings WHERE key=?').bind(key).first();
 if(!row)return null;try{return JSON.parse(row.value)}catch{return null}
}
async function ctvGetRule(env){return ctvRuleClean(await ctvSetting(env,'ctv:rule'))||{...CTV_RULE_DEFAULT}}
// Cấu hình giá CTV của một khách sạn: {rule, over:[{room,from,to,price,sat}]}
async function ctvGetHotelCfg(env,name){
 const v=await ctvSetting(env,'ctvprice:'+ctvHk(name))||{};
 const rule=ctvHotelRuleClean(v.rule)||null;
 const over=Array.isArray(v.over)?v.over.filter(o=>o&&typeof o.room==='string'&&typeof o.from==='string'&&typeof o.to==='string'):[];
 return {rule,over}
}
const ctvRowKey=(room,from,to)=>ctvHk(room)+'|'+from+'|'+to;
// Gom các dòng giá net (nhiều đối tác) về một dòng cho mỗi hạng phòng và mùa, lấy net thấp nhất
function ctvGroupRows(rows){
 const m=new Map();
 for(const r of rows||[]){
  const k=ctvRowKey(r.room,r.from,r.to);
  let g=m.get(k);
  if(!g){g={key:k,room:r.room,label:r.label||'',from:r.from,to:r.to,net:r.net,satNet:null,hasSat:false};m.set(k,g)}
  g.net=Math.min(g.net,r.net);
  if(r.sat!=null)g.hasSat=true;
 }
 for(const g of m.values()){
  if(!g.hasSat)continue;
  g.satNet=Math.min(...rows.filter(r=>ctvRowKey(r.room,r.from,r.to)===g.key).map(r=>r.sat!=null?r.sat:r.net))
 }
 return [...m.values()]
}
// Tính giá CTV cho từng dòng. includeNet=false thì không đưa giá net ra ngoài.
function ctvComputeRows(rec,cfg,rule,includeNet){
 const over=new Map(cfg.over.map(o=>[ctvRowKey(o.room,o.from,o.to),o]));
 return ctvGroupRows(rec.rows).map(g=>{
  const auto=ctvPrice(g.net,rule,cfg.rule),autoSat=g.hasSat?ctvPrice(g.satNet,rule,cfg.rule):null;
  const o=over.get(g.key)||{};
  const price=Number.isInteger(o.price)?o.price:null,sat=Number.isInteger(o.sat)?o.sat:null;
  const out={room:g.room,label:g.label,from:g.from,to:g.to,ctv:price??auto,ctvSat:sat??autoSat,auto,autoSat,manual:price!==null,manualSat:sat!==null};
  if(includeNet){out.net=g.net;out.satNet=g.satNet}
  return out
 })
}
async function ctvPriceApi(req,env,path,u,actor){
 if(!can(actor,'ctv.price'))return noPerm();
 if(!env.BOOKINGS)return json({error:'Chưa kết nối kho đơn hàng.'},503);
 const showNet=can(actor,'net.access');
 const isD=s=>{const m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(s||'');if(!m)return false;const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));return d.getUTCFullYear()===+m[1]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[3]};
 const money=x=>x===null||x===undefined||x===''?null:(Number.isInteger(x)&&x>=1&&x<=100000000?x:undefined);
 const rateRec=async name=>{const v=await ctvSetting(env,'rates:'+ctvHk(name));return v&&Array.isArray(v.rows)?v:null};
 const readJson=async max=>{if(Number(req.headers.get('content-length')||0)>max)return null;try{const i=await req.json();return i&&typeof i==='object'&&!Array.isArray(i)?i:null}catch{return null}};
 if(path==='/api/ctv/price'&&req.method==='GET'){
  const rule=await ctvGetRule(env),want=u.searchParams.get('hotel');
  const names=async()=>{const {results}=await env.BOOKINGS.prepare("SELECT key,value FROM booking_settings WHERE key LIKE 'rates:%'").all();const out=[];for(const r of results){try{const v=JSON.parse(r.value);if(v&&typeof v.name==='string'&&Array.isArray(v.rows))out.push(v)}catch{}}return out.sort((a,b)=>a.name.localeCompare(b.name,'vi'))};
  if(want){
   const rec=await rateRec(want);if(!rec)return json({error:'Không tìm thấy bảng giá của khách sạn này.'},404);
   const cfg=await ctvGetHotelCfg(env,rec.name);
   return json({rule,hotel:{name:rec.name,rule:cfg.rule,rows:ctvComputeRows(rec,cfg,rule,showNet)}})
  }
  if(u.searchParams.get('export')==='1'){
   const out=[];
   for(const rec of await names()){const cfg=await ctvGetHotelCfg(env,rec.name);for(const r of ctvComputeRows(rec,cfg,rule,showNet))out.push({hotel:rec.name,...r})}
   return json({rule,rows:out,showNet})
  }
  const list=[];
  for(const rec of await names()){const cfg=await ctvGetHotelCfg(env,rec.name);list.push({name:rec.name,rows:ctvGroupRows(rec.rows).length,manual:cfg.over.length,rule:cfg.rule})}
  return json({rule,hotels:list,showNet})
 }
 if(path==='/api/ctv/price'&&req.method==='PUT'){
  const i=await readJson(200000);if(!i)return json({error:'Nội dung không hợp lệ.'},400);
  if(i.hotel===undefined){
   const rule=ctvRuleClean(i.rule);if(!rule)return json({error:'Quy tắc giá không hợp lệ. Kiểm tra lại các số.'},400);
   await env.BOOKINGS.prepare('INSERT INTO booking_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('ctv:rule',JSON.stringify(rule)).run();
   await logAudit(env,actor,'ctv.rule','',`net dưới ${rule.thresh} +${rule.pct}%, còn lại +${rule.fixed} đ, làm tròn lên ${rule.round}`);
   return json({rule})
  }
  const rec=typeof i.hotel==='string'?await rateRec(i.hotel):null;if(!rec)return json({error:'Không tìm thấy bảng giá của khách sạn này.'},404);
  const hotelRule=ctvHotelRuleClean(i.rule);if(hotelRule===undefined)return json({error:'Quy tắc riêng của khách sạn không hợp lệ.'},400);
  if(!Array.isArray(i.over)||i.over.length>600)return json({error:'Danh sách giá nhập tay không hợp lệ.'},400);
  const valid=new Set(ctvGroupRows(rec.rows).map(g=>g.key)),over=[];
  for(const o of i.over){
   if(!o||typeof o.room!=='string'||!isD(o.from)||!isD(o.to)||!valid.has(ctvRowKey(o.room,o.from,o.to)))return json({error:'Có dòng giá nhập tay không khớp bảng giá net của khách sạn.'},400);
   const price=money(o.price),sat=money(o.sat);
   if(price===undefined||sat===undefined)return json({error:'Giá CTV phải là số nguyên từ 1 đến 100.000.000.'},400);
   if(price!==null||sat!==null)over.push({room:o.room,from:o.from,to:o.to,price,sat})
  }
  await env.BOOKINGS.prepare('INSERT INTO booking_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('ctvprice:'+ctvHk(rec.name),JSON.stringify({rule:hotelRule,over})).run();
  await logAudit(env,actor,'ctv.price',rec.name,(hotelRule?`quy tắc riêng ${hotelRule.type==='pct'?hotelRule.value+'%':hotelRule.value+' đ'}`:'quy tắc chung')+`, ${over.length} dòng nhập tay`);
  const rule=await ctvGetRule(env),cfg=await ctvGetHotelCfg(env,rec.name);
  return json({hotel:{name:rec.name,rule:cfg.rule,rows:ctvComputeRows(rec,cfg,rule,showNet)}})
 }
 // Nhập file: mỗi dòng {hotel, room, from, to, price, sat}. Giá trống hoặc bằng giá tự tính thì bỏ ghi đè.
 if(path==='/api/ctv/price/import'&&req.method==='POST'){
  const i=await readJson(1500000);if(!i||!Array.isArray(i.items)||!i.items.length||i.items.length>6000)return json({error:'File không hợp lệ hoặc quá nhiều dòng.'},400);
  const rule=await ctvGetRule(env),errors=[],byHotel=new Map();
  i.items.forEach((it,idx)=>{
   const line=Number.isInteger(it?.line)?it.line:idx+2;
   if(!it||typeof it.hotel!=='string'||typeof it.room!=='string'||!isD(it.from)||!isD(it.to)){errors.push({line,msg:'Thiếu hoặc sai khách sạn, hạng phòng, ngày'});return}
   const price=money(it.price),sat=money(it.sat);
   if(price===undefined||sat===undefined){errors.push({line,msg:'Giá CTV phải là số nguyên'});return}
   const k=ctvHk(it.hotel);if(!byHotel.has(k))byHotel.set(k,[]);byHotel.get(k).push({...it,line,price,sat})
  });
  let hotels=0,set=0,cleared=0;const unknown=[];
  for(const [k,items] of byHotel){
   const rec=await rateRec(k);if(!rec){unknown.push(items[0].hotel);continue}
   const cfg=await ctvGetHotelCfg(env,rec.name),groups=new Map(ctvGroupRows(rec.rows).map(g=>[g.key,g]));
   const over=new Map(cfg.over.map(o=>[ctvRowKey(o.room,o.from,o.to),{...o}]));
   let touched=false;
   for(const it of items){
    const key=ctvRowKey(it.room,it.from,it.to),g=groups.get(key);
    if(!g){errors.push({line:it.line,msg:`${rec.name}: không có hạng phòng "${it.room}" ${it.from} đến ${it.to} trong bảng giá net`});continue}
    const auto=ctvPrice(g.net,rule,cfg.rule),autoSat=g.hasSat?ctvPrice(g.satNet,rule,cfg.rule):null;
    const wantPrice=it.price!==null&&it.price!==auto?it.price:null,wantSat=it.sat!==null&&it.sat!==autoSat?it.sat:null;
    const prev=over.get(key)||{},hadAny=Number.isInteger(prev.price)||Number.isInteger(prev.sat);
    if(wantPrice===null&&wantSat===null){if(hadAny){over.delete(key);cleared++;touched=true}continue}
    over.set(key,{room:g.room,from:g.from,to:g.to,price:wantPrice,sat:wantSat});set++;touched=true
   }
   if(touched){
    await env.BOOKINGS.prepare('INSERT INTO booking_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('ctvprice:'+ctvHk(rec.name),JSON.stringify({rule:cfg.rule,over:[...over.values()]})).run();
    hotels++
   }
  }
  unknown.forEach(n=>errors.push({line:0,msg:`Chưa có bảng giá net cho khách sạn "${n}"`}));
  if(hotels||set||cleared)await logAudit(env,actor,'ctv.import','',`${hotels} khách sạn, ${set} dòng nhập tay, ${cleared} dòng về tự tính`);
  return json({hotels,set,cleared,errors:errors.slice(0,30),errorCount:errors.length})
 }
 return json({error:'Không hỗ trợ.'},405)
}
// ---- CTV: bật/tắt dịch vụ, tình trạng phòng, và dữ liệu giá cho trang CTV ----
const todayVnYmd=()=>new Date(Date.now()+7*3600000).toISOString().slice(0,10);
const ctvIsDate=s=>{const m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(s||'');if(!m)return false;const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));return d.getUTCFullYear()===+m[1]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[3]};
// Khóa dịch vụ: "hotel:tên khách sạn". Sau này thêm "ticket:", "tour:", "combo:" cùng cách.
const ctvSvcKey=(type,name)=>type+':'+ctvHk(name);
async function ctvAllRates(env){
 const {results}=await env.BOOKINGS.prepare("SELECT key,value FROM booking_settings WHERE key LIKE 'rates:%'").all();
 const out=[];
 for(const r of results){try{const v=JSON.parse(r.value);if(v&&typeof v.name==='string'&&Array.isArray(v.rows))out.push(v)}catch{}}
 return out.sort((a,b)=>a.name.localeCompare(b.name,'vi'))
}
async function ctvHiddenSet(env){const v=await ctvSetting(env,'ctv:hidden');return new Set(Array.isArray(v)?v.filter(x=>typeof x==='string'):[])}
async function ctvGetAvail(env,name){
 const v=await ctvSetting(env,'ctvavail:'+ctvHk(name));
 const days={};
 if(v&&v.days&&typeof v.days==='object')for(const [d,e] of Object.entries(v.days)){
  if(!ctvIsDate(d)||!e||typeof e!=='object')continue;
  const s=e.s==='o'||e.s==='c'?e.s:'',m=Number.isInteger(e.m)&&e.m>=2&&e.m<=30?e.m:0;
  if(s||m)days[d]={...(s?{s}:{}),...(m?{m}:{})}
 }
 return days
}
// Quản lý dịch vụ hiển thị và tình trạng phòng (trang quản trị)
async function ctvSvcApi(req,env,path,u,actor){
 const isSvc=path==='/api/ctv/services';
 if(!can(actor,isSvc?'ctv.price':'ctv.avail'))return noPerm();
 if(!env.BOOKINGS)return json({error:'Chưa kết nối kho đơn hàng.'},503);
 const readJson=async max=>{if(Number(req.headers.get('content-length')||0)>max)return null;try{const i=await req.json();return i&&typeof i==='object'&&!Array.isArray(i)?i:null}catch{return null}};
 const save=(key,val)=>env.BOOKINGS.prepare('INSERT INTO booking_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,JSON.stringify(val)).run();
 const today=todayVnYmd();
 if(isSvc){
  const recs=await ctvAllRates(env),hidden=await ctvHiddenSet(env);
  const items=recs.map(r=>({key:ctvSvcKey('hotel',r.name),type:'hotel',name:r.name,rows:ctvGroupRows(r.rows).length,last:r.rows.reduce((m,x)=>x.to>m?x.to:m,''),visible:!hidden.has(ctvSvcKey('hotel',r.name))}));
  if(req.method==='GET')return json({items,today});
  if(req.method==='PUT'){
   const i=await readJson(100000);
   if(!i||!Array.isArray(i.keys)||!i.keys.length||i.keys.length>1000||typeof i.visible!=='boolean')return json({error:'Yêu cầu không hợp lệ.'},400);
   const valid=new Set(items.map(x=>x.key));
   if(!i.keys.every(k=>typeof k==='string'&&valid.has(k)))return json({error:'Có dịch vụ không tồn tại.'},400);
   for(const k of i.keys){if(i.visible)hidden.delete(k);else hidden.add(k)}
   // Chỉ giữ khóa còn tồn tại để danh sách không phình ra
   await save('ctv:hidden',[...hidden].filter(k=>valid.has(k)));
   const names=items.filter(x=>i.keys.includes(x.key)).map(x=>x.name);
   await logAudit(env,actor,'ctv.service','',(i.visible?'Hiện cho CTV: ':'Ẩn khỏi CTV: ')+names.slice(0,5).join(', ')+(names.length>5?' và '+(names.length-5)+' khách sạn nữa':''));
   return json({items:items.map(x=>i.keys.includes(x.key)?{...x,visible:i.visible}:x)})
  }
  return json({error:'Không hỗ trợ.'},405)
 }
 // Tình trạng phòng: mỗi khách sạn một bảng ngày. s: o = còn phòng, c = hết phòng, không có = hỏi lại. m = số đêm tối thiểu.
 const recs=await ctvAllRates(env);
 if(req.method==='GET'){
  const want=u.searchParams.get('hotel');
  if(want){
   const rec=recs.find(r=>ctvHk(r.name)===ctvHk(want));if(!rec)return json({error:'Không tìm thấy khách sạn.'},404);
   return json({hotel:rec.name,today,days:await ctvGetAvail(env,rec.name)})
  }
  const list=[];
  for(const r of recs){const d=await ctvGetAvail(env,r.name);list.push({name:r.name,tracked:Object.keys(d).filter(x=>x>=today).length})}
  return json({hotels:list,today})
 }
 if(req.method==='PUT'){
  const i=await readJson(200000);if(!i||typeof i.hotel!=='string'||!i.days||typeof i.days!=='object'||Array.isArray(i.days))return json({error:'Yêu cầu không hợp lệ.'},400);
  const rec=recs.find(r=>ctvHk(r.name)===ctvHk(i.hotel));if(!rec)return json({error:'Không tìm thấy khách sạn.'},404);
  const entries=Object.entries(i.days);if(entries.length>800)return json({error:'Tối đa 800 ngày mỗi khách sạn.'},400);
  const days={};
  for(const [d,e] of entries){
   if(!ctvIsDate(d)||!e||typeof e!=='object'||Array.isArray(e))return json({error:'Có ngày không hợp lệ.'},400);
   const s=e.s===undefined||e.s===''?'':e.s,m=e.m===undefined||e.m===null||e.m===0?0:e.m;
   if(s!==''&&s!=='o'&&s!=='c')return json({error:'Tình trạng phòng không hợp lệ.'},400);
   if(m!==0&&(!Number.isInteger(m)||m<2||m>30))return json({error:'Số đêm tối thiểu từ 2 đến 30.'},400);
   if(d<today)continue; // ngày đã qua không cần giữ
   if(s||m)days[d]={...(s?{s}:{}),...(m?{m}:{})}
  }
  await save('ctvavail:'+ctvHk(rec.name),{days});
  await logAudit(env,actor,'ctv.avail',rec.name,Object.keys(days).length+' ngày có thiết lập');
  return json({hotel:rec.name,today,days})
 }
 return json({error:'Không hỗ trợ.'},405)
}
// ---- Dữ liệu cho trang CTV: chỉ giá CTV, tuyệt đối không có giá net, đối tác hay cờ nhập tay ----
async function ctvVisibleHotels(env){
 const recs=await ctvAllRates(env),hidden=await ctvHiddenSet(env),today=todayVnYmd(),rule=await ctvGetRule(env),out=[];
 for(const rec of recs){
  if(hidden.has(ctvSvcKey('hotel',rec.name)))continue;
  const cfg=await ctvGetHotelCfg(env,rec.name);
  const rows=ctvComputeRows(rec,cfg,rule,false).filter(r=>r.to>=today).map(r=>({room:r.room,label:r.label,from:r.from,to:r.to,ctv:r.ctv,ctvSat:r.ctvSat}));
  if(rows.length)out.push({rec,rows})
 }
 return out
}
async function ctvSalesHotels(env){
 const list=await ctvVisibleHotels(env),out=[];
 for(const {rec,rows} of list){
  const avail=await ctvGetAvail(env,rec.name);
  out.push({name:rec.name,from:Math.min(...rows.map(r=>r.ctv)),rooms:new Set(rows.map(r=>ctvHk(r.room))).size,tracked:Object.keys(avail).some(d=>d>=todayVnYmd())})
 }
 return json({hotels:out})
}
async function ctvSalesHotel(env,name){
 const hit=(await ctvVisibleHotels(env)).find(x=>ctvHk(x.rec.name)===ctvHk(name));
 if(!hit)return json({error:'Không tìm thấy khách sạn.'},404);
 const today=todayVnYmd(),avail=await ctvGetAvail(env,hit.rec.name),days={};
 for(const [d,e] of Object.entries(avail))if(d>=today)days[d]=e;
 const info=(await ctvSetting(env,'hotels'));
 const meta=Array.isArray(info)?info.find(h=>h&&ctvHk(h.name)===ctvHk(hit.rec.name)):null;
 let photos=[];
 try{
  await ensureQuickTables(env);
  const {results}=await env.DB.prepare('SELECT id,album,label,url FROM quick_photos ORDER BY created DESC LIMIT 3000').all();
  photos=results.filter(p=>ctvHk(p.album)===ctvHk(hit.rec.name)).slice(0,60).map(p=>({id:p.id,label:p.label||'',url:p.url}))
 }catch{}
 return json({hotel:{name:hit.rec.name,note:typeof hit.rec.note==='string'?hit.rec.note:'',address:meta&&typeof meta.address==='string'?meta.address:'',rows:hit.rows,avail:days,photos,today}})
}
async function handle(req,env){const u=new URL(req.url),path=u.pathname;
if(path.startsWith('/media/')){if(req.method!=='GET')return json({error:'Không hỗ trợ.'},405);const key=path.slice(7);if(!/^[a-zA-Z0-9._-]+$/.test(key))return new Response('Not found',{status:404});if(!env.MEDIA)return new Response('Not configured',{status:503});const o=await env.MEDIA.get(key);if(!o)return new Response('Not found',{status:404});return new Response(o.body,{headers:{'content-type':o.httpMetadata?.contentType||'application/octet-stream','cache-control':'public,max-age=31536000,immutable','x-content-type-options':'nosniff'}})}
if(!path.startsWith('/api/')){const response=await env.ASSETS.fetch(req);const headers=new Headers(response.headers);headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');headers.set('Content-Security-Policy',path.startsWith('/admin/booking')?BOOKING_CSP:CSP);if(path.startsWith('/admin'))headers.set('Cache-Control','no-store');if(path==='/sales'||path.startsWith('/sales/')){headers.set('Cache-Control','no-store');headers.set('X-Robots-Tag','noindex, nofollow')}return new Response(response.body,{status:response.status,headers})}
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
 for(const key of limits){await env.DB.prepare('INSERT INTO attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').bind(key,Date.now()+900000).run();const row=await env.DB.prepare('SELECT count FROM attempts WHERE key=?').bind(key).first();if(row.count>(key.startsWith('global:')?50:10))return json({error:'Đã thử quá nhiều lần. Vui lòng đợi 15 phút.'},429)}
 let input;try{input=await req.json()}catch{return json({error:'Nội dung không hợp lệ.'},400)}const pass=typeof input.password==='string'?input.password:'';if(pass.length>256)return json({error:'Đăng nhập không thành công.'},401);
 const mail=typeof input.email==='string'?input.email.toLowerCase().trim():'';
 if(mail!==EMAIL)return staffLogin(env,mail,pass,req);
 const ok=await passwordOK(pass,env.ADMIN_PASSWORD_HASH);if(!ok)return json({error:'Email hoặc mật khẩu chưa đúng.'},401);
 const token=crypto.randomUUID()+'-'+crypto.randomUUID(),csrf=crypto.randomUUID();await env.DB.prepare('INSERT INTO sessions(token,csrf,expires) VALUES(?,?,?)').bind(await sha(token),csrf,Date.now()+8*3600000).run();await env.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(Date.now()).run();await env.DB.prepare('DELETE FROM attempts WHERE expires<?').bind(Date.now()).run();return json({email:EMAIL,csrf,name:'Chủ',role:'owner'},200,{'set-cookie':sessionCookie(token,28800,req)})
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
const match=/^\/api\/content\/([a-z0-9-]{1,90})$/.exec(path);if(match&&req.method==='PUT'){if(Number(req.headers.get('content-length')||0)>200000)return json({error:'Nội dung quá lớn.'},413);let input,p;try{input=await req.json();p=validate(input.data,match[1])}catch(e){return json({error:e.message||'Nội dung không hợp lệ.'},400)}const id=match[1];if(id!=='settings'&&!id.startsWith('service-')&&!id.startsWith('post-'))return json({error:'Mục không hợp lệ.'},400);const mode=input.mode;if(!['draft','publish','unpublish'].includes(mode))return json({error:'Thao tác không hợp lệ.'},400);const old=await env.DB.prepare('SELECT draft,published FROM content WHERE id=?').bind(id).first();const published=mode==='publish'?JSON.stringify(p):mode==='unpublish'?null:old?.published||null;let wasHidden=false;try{wasHidden=!!JSON.parse(old?.draft||'{}').hidden}catch{}const hidden=id!=='settings'&&(mode==='unpublish'||(mode==='draft'&&!old?.published&&wasHidden));await env.DB.prepare('INSERT INTO content(id,draft,published,updated) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET draft=excluded.draft,published=excluded.published,updated=excluded.updated').bind(id,JSON.stringify(hidden?{...p,hidden:true}:p),published,new Date().toISOString()).run();return json({ok:true})}
return json({error:'Không tìm thấy.'},404)
}


