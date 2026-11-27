// Module ctv: tách từ _worker.js (không đổi hành vi, chỉ tách theo chức năng).
import {adminEmail,equal,hex,json,passwordOK,sha} from './core.js';
import {VN_PHONE_RE,cleanLine} from './crm.js';
import {can,logAudit,makePasswordHash,noPerm} from './auth.js';

export const CTV_COOKIE='serene_ctv';

export const CTV_SESSION_SECONDS=7*86400;

export const CTV_EMAIL_RE=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function ctvCookieValue(req){return new RegExp('(?:^|;\\s*)'+CTV_COOKIE+'=([A-Za-z0-9-]+)').exec(req.headers.get('cookie')||'')?.[1]||''}

export function ctvSessionCookie(value,age,req){return CTV_COOKIE+'='+value+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+age+(new URL(req.url).protocol==='https:'?'; Secure':'')}

export function ctvAdminView(r){return {id:r.id,name:r.name,phone:r.phone,zalo:r.zalo,email:r.email,status:r.status,emailOk:!!r.email_ok,created:r.created,lastLogin:r.last_login}}

export function ctvOtpEnabled(env){return !!(env.RESEND_API_KEY&&env.MAIL_FROM)}

export async function ctvSendOtpMail(env,to,code){
 try{
  const res=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:'Bearer '+env.RESEND_API_KEY,'content-type':'application/json'},body:JSON.stringify({
   from:env.MAIL_FROM,to:[to],subject:'Mã xác nhận Serene Travel: '+code,
   text:'Mã xác nhận đăng ký cộng tác viên Serene Travel của bạn là: '+code+'\n\nMã có hiệu lực trong 10 phút. Nếu bạn không đăng ký, hãy bỏ qua email này.'
  }),signal:AbortSignal.timeout(10000)});
  return res.ok
 }catch{return false}
}

export async function ctvIssueOtp(env,row){
 const now=Date.now();
 if(now-row.otp_sent<60000)return 'throttled';
 const buf=new Uint32Array(1);crypto.getRandomValues(buf);
 const code=String(buf[0]%1000000).padStart(6,'0');
 await env.BOOKINGS.prepare('UPDATE ctv_accounts SET otp_hash=?,otp_expires=?,otp_tries=0,otp_sent=?,updated=? WHERE id=?').bind(await sha(code+':'+row.id),now+600000,now,new Date().toISOString(),row.id).run();
 return await ctvSendOtpMail(env,row.email,code)?'sent':'failed'
}

export async function ctvBump(env,key,ttlMs,max){
 await env.DB.prepare('INSERT INTO attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').bind(key,Date.now()+ttlMs).run();
 const row=await env.DB.prepare('SELECT count FROM attempts WHERE key=?').bind(key).first();
 return (row?.count||0)>max
}

export async function resolveCtv(req,env){
 const token=ctvCookieValue(req);if(!token||!env.BOOKINGS)return null;
 try{
  
  const th=await sha(token);
  const r=await env.BOOKINGS.prepare('SELECT s.csrf,s.expires,t.id,t.name,t.email,t.status FROM ctv_sessions s JOIN ctv_accounts t ON t.id=s.ctv_id WHERE s.token=?').bind(th).first();
  if(!r||r.expires<Date.now()||r.status!=='active')return null;
  return {id:r.id,name:r.name,email:r.email,csrf:r.csrf,token:th}
 }catch{return null}
}

export async function salesApi(req,env,path,u){
 if(!env.BOOKINGS||!env.DB)return json({error:'Chưa sẵn sàng.'},503);
 
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
  if(email===adminEmail(env))return json({error:'Email này không dùng được.'},400);
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

export async function ctvAdminApi(req,env,path,actor){
 if(!can(actor,'ctv.manage'))return noPerm();
 if(!env.BOOKINGS)return json({error:'Chưa kết nối kho đơn hàng.'},503);
 
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

export const CTV_RULE_DEFAULT={thresh:500000,pct:10,fixed:50000,round:1000};

export const ctvHk=n=>String(n||'').trim().toLowerCase().replace(/\s+/g,' ');

export function ctvRuleClean(r){
 if(!r||typeof r!=='object')return null;
 const thresh=Number(r.thresh),pct=Number(r.pct),fixed=Number(r.fixed),round=Number(r.round);
 if(!Number.isInteger(thresh)||thresh<0||thresh>100000000)return null;
 if(!Number.isFinite(pct)||pct<0||pct>100||Math.abs(pct*100-Math.round(pct*100))>1e-9)return null;
 if(!Number.isInteger(fixed)||fixed<0||fixed>10000000)return null;
 if(!Number.isInteger(round)||round<1||round>100000)return null;
 return {thresh,pct,fixed,round}
}

export function ctvHotelRuleClean(r){
 if(r===null||r===undefined)return null;
 if(typeof r!=='object')return undefined;
 const value=Number(r.value);
 if(r.type==='pct'){if(!Number.isFinite(value)||value<0||value>100||Math.abs(value*100-Math.round(value*100))>1e-9)return undefined;return {type:'pct',value}}
 if(r.type==='fixed'){if(!Number.isInteger(value)||value<0||value>10000000)return undefined;return {type:'fixed',value}}
 return undefined
}

export function ctvPrice(net,rule,hotelRule){
 const type=hotelRule?hotelRule.type:(net<rule.thresh?'pct':'fixed');
 let num,den;
 if(type==='pct'){const bp=Math.round((hotelRule&&hotelRule.type==='pct'?hotelRule.value:rule.pct)*100);num=net*(10000+bp);den=10000}
 else{num=net+(hotelRule&&hotelRule.type==='fixed'?hotelRule.value:rule.fixed);den=1}
 const unit=den*rule.round;
 return Math.ceil(num/unit)*rule.round
}

export async function ctvSetting(env,key){
 const row=await env.BOOKINGS.prepare('SELECT value FROM booking_settings WHERE key=?').bind(key).first();
 if(!row)return null;try{return JSON.parse(row.value)}catch{return null}
}

export async function ctvGetRule(env){return ctvRuleClean(await ctvSetting(env,'ctv:rule'))||{...CTV_RULE_DEFAULT}}

export async function ctvGetHotelCfg(env,name){
 const v=await ctvSetting(env,'ctvprice:'+ctvHk(name))||{};
 const rule=ctvHotelRuleClean(v.rule)||null;
 const over=Array.isArray(v.over)?v.over.filter(o=>o&&typeof o.room==='string'&&typeof o.from==='string'&&typeof o.to==='string'):[];
 return {rule,over}
}

export const ctvRowKey=(room,from,to)=>ctvHk(room)+'|'+from+'|'+to;

export function ctvGroupRows(rows){
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

export function ctvComputeRows(rec,cfg,rule,includeNet){
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

export async function ctvPriceApi(req,env,path,u,actor){
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

export const todayVnYmd=()=>new Date(Date.now()+7*3600000).toISOString().slice(0,10);

export const ctvIsDate=s=>{const m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(s||'');if(!m)return false;const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));return d.getUTCFullYear()===+m[1]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[3]};

export const ctvSvcKey=(type,name)=>type+':'+ctvHk(name);

export async function ctvAllRates(env){
 const {results}=await env.BOOKINGS.prepare("SELECT key,value FROM booking_settings WHERE key LIKE 'rates:%'").all();
 const out=[];
 for(const r of results){try{const v=JSON.parse(r.value);if(v&&typeof v.name==='string'&&Array.isArray(v.rows))out.push(v)}catch{}}
 return out.sort((a,b)=>a.name.localeCompare(b.name,'vi'))
}

export async function ctvHiddenSet(env){const v=await ctvSetting(env,'ctv:hidden');return new Set(Array.isArray(v)?v.filter(x=>typeof x==='string'):[])}

export async function ctvGetAvail(env,name){
 const v=await ctvSetting(env,'ctvavail:'+ctvHk(name));
 const days={};
 if(v&&v.days&&typeof v.days==='object')for(const [d,e] of Object.entries(v.days)){
  if(!ctvIsDate(d)||!e||typeof e!=='object')continue;
  const s=e.s==='o'||e.s==='c'?e.s:'',m=Number.isInteger(e.m)&&e.m>=2&&e.m<=30?e.m:0;
  if(s||m)days[d]={...(s?{s}:{}),...(m?{m}:{})}
 }
 return days
}

export async function ctvSvcApi(req,env,path,u,actor){
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

export async function ctvVisibleHotels(env){
 const recs=await ctvAllRates(env),hidden=await ctvHiddenSet(env),today=todayVnYmd(),rule=await ctvGetRule(env),out=[];
 for(const rec of recs){
  if(hidden.has(ctvSvcKey('hotel',rec.name)))continue;
  const cfg=await ctvGetHotelCfg(env,rec.name);
  const rows=ctvComputeRows(rec,cfg,rule,false).filter(r=>r.to>=today).map(r=>({room:r.room,label:r.label,from:r.from,to:r.to,ctv:r.ctv,ctvSat:r.ctvSat}));
  if(rows.length)out.push({rec,rows})
 }
 return out
}

export async function ctvSalesHotels(env){
 const list=await ctvVisibleHotels(env),out=[];
 for(const {rec,rows} of list){
  const avail=await ctvGetAvail(env,rec.name);
  out.push({name:rec.name,from:Math.min(...rows.map(r=>r.ctv)),rooms:new Set(rows.map(r=>ctvHk(r.room))).size,tracked:Object.keys(avail).some(d=>d>=todayVnYmd())})
 }
 return json({hotels:out})
}

export async function ctvSalesHotel(env,name){
 const hit=(await ctvVisibleHotels(env)).find(x=>ctvHk(x.rec.name)===ctvHk(name));
 if(!hit)return json({error:'Không tìm thấy khách sạn.'},404);
 const today=todayVnYmd(),avail=await ctvGetAvail(env,hit.rec.name),days={};
 for(const [d,e] of Object.entries(avail))if(d>=today)days[d]=e;
 const info=(await ctvSetting(env,'hotels'));
 const meta=Array.isArray(info)?info.find(h=>h&&ctvHk(h.name)===ctvHk(hit.rec.name)):null;
 let photos=[];
 try{
  
  const {results}=await env.DB.prepare('SELECT id,album,label,url FROM quick_photos ORDER BY created DESC LIMIT 3000').all();
  photos=results.filter(p=>ctvHk(p.album)===ctvHk(hit.rec.name)).slice(0,60).map(p=>({id:p.id,label:p.label||'',url:p.url}))
 }catch{}
 return json({hotel:{name:hit.rec.name,note:typeof hit.rec.note==='string'?hit.rec.note:'',address:meta&&typeof meta.address==='string'?meta.address:'',rows:hit.rows,avail:days,photos,today}})
}
