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
  ids.add(p.id);names.add(name.toLowerCase());out.push({id:p.id,name,phone,email,cc,cats:[...new Set(p.cats)],services})
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
const BOOKING_ORDER_STATUSES=['processing','success','cancelled'],CUSTOMER_ID_RE=/^c[a-z0-9]{3,24}$/;
function validateCrmFields(b){
 if(b.orderStatus!==undefined&&!BOOKING_ORDER_STATUSES.includes(b.orderStatus))throw Error('Trạng thái đơn không hợp lệ.');
 if(b.customerId!==undefined&&b.customerId!==''&&!(typeof b.customerId==='string'&&CUSTOMER_ID_RE.test(b.customerId)))throw Error('Mã khách hàng không hợp lệ.');
 for(const k of ['createdBy','updatedBy','owner'])if(b[k]!==undefined&&!(typeof b[k]==='string'&&b[k].length<=80&&!/[<>]/.test(b[k])))throw Error('Thông tin người tạo không hợp lệ.');
 for(const p of b.payments){
  if(p.status!==undefined&&!['approved','pending'].includes(p.status))throw Error('Trạng thái phiếu thu không hợp lệ.');
  if(p.code!==undefined&&!(typeof p.code==='string'&&p.code.length<=30&&!/[<>"&]/.test(p.code)))throw Error('Mã phiếu thu không hợp lệ.');
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
async function crmApi(req,env,path){
 // Trả về null nếu không phải đường dẫn khách hàng/lead
 const m=/^\/api\/(customers|leads)(?:\/([a-z0-9]{4,26}))?$/.exec(path);if(!m)return null;
 const kind=m[1],id=m[2];
 if(!env.BOOKINGS)return json({error:'Chưa kết nối kho đơn hàng.'},503);
 const table=kind,isCustomer=kind==='customers',clean=isCustomer?cleanCustomer:cleanLead;
 const missing=e=>/no such table/i.test(String(e?.message||e));
 try{
  if(!id&&req.method==='GET'){const {results}=await env.BOOKINGS.prepare('SELECT * FROM '+table+' ORDER BY created').all();return json({[kind]:results})}
  if(!id&&req.method==='POST'){
   if(Number(req.headers.get('content-length')||0)>20000)return json({error:'Dữ liệu quá lớn.'},413);
   let input;try{input=await req.json()}catch{return json({error:'Nội dung không hợp lệ.'},400)}
   const d=clean(input);if(!d)return json({error:isCustomer?'Thông tin khách hàng không hợp lệ.':'Thông tin lead không hợp lệ.'},400);
   const cnt=await env.BOOKINGS.prepare('SELECT COUNT(*) AS n FROM '+table).first();if((cnt?.n||0)>=20000)return json({error:'Đã đạt giới hạn số lượng.'},400);
   const now=new Date().toISOString(),nid=newCrmId(isCustomer?'c':'l');
   if(isCustomer)await env.BOOKINGS.prepare('INSERT INTO customers(id,name,phone,kind,note,created,updated) VALUES(?,?,?,?,?,?,?)').bind(nid,d.name,d.phone,d.kind,d.note,now,now).run();
   else await env.BOOKINGS.prepare('INSERT INTO leads(id,name,phone,need,source,status,booking_id,created,updated) VALUES(?,?,?,?,?,?,?,?,?)').bind(nid,d.name,d.phone,d.need,d.source,d.status,d.booking_id,now,now).run();
   const row=await env.BOOKINGS.prepare('SELECT * FROM '+table+' WHERE id=?').bind(nid).first();return json({[isCustomer?'customer':'lead']:row},201)}
  if(id&&req.method==='PUT'){
   if(Number(req.headers.get('content-length')||0)>20000)return json({error:'Dữ liệu quá lớn.'},413);
   let input;try{input=await req.json()}catch{return json({error:'Nội dung không hợp lệ.'},400)}
   const d=clean(input);if(!d)return json({error:isCustomer?'Thông tin khách hàng không hợp lệ.':'Thông tin lead không hợp lệ.'},400);
   const old=await env.BOOKINGS.prepare('SELECT id FROM '+table+' WHERE id=?').bind(id).first();if(!old)return json({error:'Không tìm thấy.'},404);
   const now=new Date().toISOString();
   if(isCustomer)await env.BOOKINGS.prepare('UPDATE customers SET name=?,phone=?,kind=?,note=?,updated=? WHERE id=?').bind(d.name,d.phone,d.kind,d.note,now,id).run();
   else await env.BOOKINGS.prepare('UPDATE leads SET name=?,phone=?,need=?,source=?,status=?,booking_id=?,updated=? WHERE id=?').bind(d.name,d.phone,d.need,d.source,d.status,d.booking_id,now,id).run();
   const row=await env.BOOKINGS.prepare('SELECT * FROM '+table+' WHERE id=?').bind(id).first();return json({[isCustomer?'customer':'lead']:row})}
  if(id&&req.method==='DELETE'){
   if(isCustomer){const used=await env.BOOKINGS.prepare('SELECT id FROM bookings WHERE data LIKE ? OR data LIKE ? LIMIT 1').bind('%"customerId":"'+id+'"%','%"ctvId":"'+id+'"%').first();if(used)return json({error:'Khách này đã có đơn hoặc hoa hồng nên chưa xóa được.'},409)}
   await env.BOOKINGS.prepare('DELETE FROM '+table+' WHERE id=?').bind(id).run();return json({ok:true})}
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
async function uploadImage(req,env){if(!env.MEDIA)return json({error:'Chưa kết nối kho ảnh.'},503);const type=req.headers.get('content-type')||'',extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};if(!extensions[type])return json({error:'Chỉ nhận JPG, PNG hoặc WebP.'},400);if(Number(req.headers.get('content-length')||0)>5*1024*1024)return json({error:'Ảnh tối đa 5 MB.'},413);const bytes=await req.arrayBuffer();if(bytes.byteLength>5*1024*1024)return json({error:'Ảnh tối đa 5 MB.'},413);const b=new Uint8Array(bytes);const signature=type==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:type==='image/png'?hex(bytes.slice(0,8))==='89504e470d0a1a0a':String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP';if(!signature)return json({error:'Tệp không phải ảnh hợp lệ.'},400);const key=crypto.randomUUID()+'.'+extensions[type];await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:type}});return json({url:'/media/'+key})}
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
async function handle(req,env){const u=new URL(req.url),path=u.pathname;
if(path.startsWith('/media/')){if(req.method!=='GET')return json({error:'Không hỗ trợ.'},405);const key=path.slice(7);if(!/^[a-zA-Z0-9._-]+$/.test(key))return new Response('Not found',{status:404});if(!env.MEDIA)return new Response('Not configured',{status:503});const o=await env.MEDIA.get(key);if(!o)return new Response('Not found',{status:404});return new Response(o.body,{headers:{'content-type':o.httpMetadata?.contentType||'application/octet-stream','cache-control':'public,max-age=31536000,immutable','x-content-type-options':'nosniff'}})}
if(!path.startsWith('/api/')){const response=await env.ASSETS.fetch(req);const headers=new Headers(response.headers);headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');headers.set('Content-Security-Policy',path.startsWith('/admin/booking')?BOOKING_CSP:CSP);if(path.startsWith('/admin'))headers.set('Cache-Control','no-store');return new Response(response.body,{status:response.status,headers})}
if(!env.DB)return json({error:'Chưa kết nối kho nội dung Cloudflare.'},503);
if(path==='/api/public'&&req.method==='GET'){const {results}=await env.DB.prepare('SELECT id,published,updated FROM content WHERE published IS NOT NULL').all();return json({items:results.map(x=>({id:x.id,...JSON.parse(x.published),updated:x.updated}))})}
if(path.startsWith('/api/machine/'))return machineApi(req,env,path,u);
if(req.method!=='GET'&&req.headers.get('origin')!==u.origin)return json({error:'Yêu cầu không hợp lệ.'},403);
if(path==='/api/login'&&req.method==='POST'){
 if(!env.ADMIN_PASSWORD_HASH)return json({error:'Chưa thiết lập tài khoản quản trị.'},503);
 if(Number(req.headers.get('content-length')||0)>4096)return json({error:'Yêu cầu quá lớn.'},413);
 const bucket=Math.floor(Date.now()/900000),ip=req.headers.get('CF-Connecting-IP')||'local';const limits=['ip:'+await sha(ip)+':'+bucket,'global:'+bucket];
 for(const key of limits){await env.DB.prepare('INSERT INTO attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').bind(key,Date.now()+900000).run();const row=await env.DB.prepare('SELECT count FROM attempts WHERE key=?').bind(key).first();if(row.count>(key.startsWith('global:')?50:10))return json({error:'Đã thử quá nhiều lần. Vui lòng đợi 15 phút.'},429)}
 let input;try{input=await req.json()}catch{return json({error:'Nội dung không hợp lệ.'},400)}const pass=typeof input.password==='string'?input.password:'';if(pass.length>256)return json({error:'Đăng nhập không thành công.'},401);
 const ok=await passwordOK(pass,env.ADMIN_PASSWORD_HASH);if(input.email?.toLowerCase().trim()!==EMAIL||!ok)return json({error:'Email hoặc mật khẩu chưa đúng.'},401);
 const token=crypto.randomUUID()+'-'+crypto.randomUUID(),csrf=crypto.randomUUID();await env.DB.prepare('INSERT INTO sessions(token,csrf,expires) VALUES(?,?,?)').bind(await sha(token),csrf,Date.now()+8*3600000).run();await env.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(Date.now()).run();await env.DB.prepare('DELETE FROM attempts WHERE expires<?').bind(Date.now()).run();return json({email:EMAIL,csrf},200,{'set-cookie':sessionCookie(token,28800,req)})
}
const token=cookie(req),session=token?await env.DB.prepare('SELECT csrf,expires FROM sessions WHERE token=?').bind(await sha(token)).first():null;
if(!session||session.expires<Date.now())return json({error:'Vui lòng đăng nhập.'},401);
if(req.method!=='GET'&&req.headers.get('x-csrf-token')!==session.csrf)return json({error:'Phiên xác thực không hợp lệ. Hãy đăng nhập lại.'},403);
if(path==='/api/session'&&req.method==='GET')return json({email:EMAIL,csrf:session.csrf});
if(path==='/api/logout'&&req.method==='POST'){await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(await sha(token)).run();return json({ok:true},200,{'set-cookie':sessionCookie('',0,req)})}
if(path==='/api/content'&&req.method==='GET'){const {results}=await env.DB.prepare('SELECT * FROM content ORDER BY updated DESC').all();return json({items:results.map(x=>({id:x.id,draft:JSON.parse(x.draft),published:x.published?JSON.parse(x.published):null,updated:x.updated}))})}
if(path==='/api/upload'&&req.method==='POST')return uploadImage(req,env);
if(path==='/api/booking-qr'&&req.method==='GET'){
 // Lấy mã QR VietQR qua máy chủ để trình duyệt chụp ảnh phiếu được (không bị chặn khác nguồn). Tài khoản nhận cố định.
 const amount=u.searchParams.get('amount')||'0',info=u.searchParams.get('info')||'';
 if(!/^\d{1,10}$/.test(amount)||!/^[A-Za-z0-9 ]{0,50}$/.test(info))return json({error:'Tham số QR không hợp lệ.'},400);
 let r;try{r=await fetch('https://img.vietqr.io/image/970422-0327818196-compact2.png?accountName=NGUYEN+DUY+HA'+(Number(amount)>0?'&amount='+amount:'')+(info?'&addInfo='+encodeURIComponent(info):''),{signal:AbortSignal.timeout(10000)})}catch{return json({error:'Không lấy được mã QR.'},502)}
 if(!r.ok||!(r.headers.get('content-type')||'').startsWith('image/'))return json({error:'Không lấy được mã QR.'},502);
 return new Response(r.body,{headers:{'content-type':r.headers.get('content-type'),'cache-control':'private, max-age=300','x-content-type-options':'nosniff'}})
}
if(path==='/api/booking-units'){
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
if(path==='/api/booking-settings'){
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
const crm=await crmApi(req,env,path);if(crm)return crm;
if(path==='/api/booking'||path.startsWith('/api/booking/')){
 // Đơn hàng nằm trong database riêng (binding BOOKINGS), tách hẳn khỏi nội dung website.
 if(!env.BOOKINGS)return json({error:'Chưa kết nối kho đơn hàng.'},503);
 const bm=/^\/api\/booking(?:\/(ST[0-9]{1,12}))?$/.exec(path);if(!bm)return json({error:'Không tìm thấy.'},404);const bid=bm[1];
 if(!bid&&req.method==='GET'){const {results}=await env.BOOKINGS.prepare('SELECT data FROM bookings ORDER BY seq').all();return json({bookings:results.map(r=>JSON.parse(r.data))})}
 if(bid&&req.method==='DELETE'){await env.BOOKINGS.prepare('DELETE FROM bookings WHERE id=?').bind(bid).run();return json({ok:true})}
 if((req.method==='POST'&&!bid)||(req.method==='PUT'&&bid)){
  if(Number(req.headers.get('content-length')||0)>200000)return json({error:'Dữ liệu quá lớn.'},413);
  let input,data;try{input=await req.json()}catch{return json({error:'Nội dung không hợp lệ.'},400)}
  try{data=validateBooking(input?.booking,bid)}catch(e){return json({error:e.message},400)}
  const stamp=new Date().toISOString();if(req.method==='POST'){if(!data.createdBy)data.createdBy=EMAIL;if(!data.owner)data.owner=EMAIL}data.updatedBy=EMAIL;data.updatedAt=stamp;
  const now=stamp,text=JSON.stringify(data),exists=await env.BOOKINGS.prepare('SELECT id FROM bookings WHERE id=?').bind(data.id).first();
  if(req.method==='POST'){if(exists)return json({error:'Mã đơn đã tồn tại.'},409);try{await env.BOOKINGS.prepare('INSERT INTO bookings(id,data,created,updated) VALUES(?,?,?,?)').bind(data.id,text,now,now).run()}catch{return json({error:'Mã đơn đã tồn tại.'},409)}return json({ok:true},201)}
  if(!exists)return json({error:'Không tìm thấy đơn.'},404);
  await env.BOOKINGS.prepare('UPDATE bookings SET data=?,updated=? WHERE id=?').bind(text,now,data.id).run();return json({ok:true})
 }
 return json({error:'Không hỗ trợ.'},405)
}
const match=/^\/api\/content\/([a-z0-9-]{1,90})$/.exec(path);if(match&&req.method==='PUT'){if(Number(req.headers.get('content-length')||0)>200000)return json({error:'Nội dung quá lớn.'},413);let input,p;try{input=await req.json();p=validate(input.data,match[1])}catch(e){return json({error:e.message||'Nội dung không hợp lệ.'},400)}const id=match[1];if(id!=='settings'&&!id.startsWith('service-')&&!id.startsWith('post-'))return json({error:'Mục không hợp lệ.'},400);const mode=input.mode;if(!['draft','publish','unpublish'].includes(mode))return json({error:'Thao tác không hợp lệ.'},400);const old=await env.DB.prepare('SELECT draft,published FROM content WHERE id=?').bind(id).first();const published=mode==='publish'?JSON.stringify(p):mode==='unpublish'?null:old?.published||null;let wasHidden=false;try{wasHidden=!!JSON.parse(old?.draft||'{}').hidden}catch{}const hidden=id!=='settings'&&(mode==='unpublish'||(mode==='draft'&&!old?.published&&wasHidden));await env.DB.prepare('INSERT INTO content(id,draft,published,updated) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET draft=excluded.draft,published=excluded.published,updated=excluded.updated').bind(id,JSON.stringify(hidden?{...p,hidden:true}:p),published,new Date().toISOString()).run();return json({ok:true})}
return json({error:'Không tìm thấy.'},404)
}


