// Module posts: tách từ _worker.js (không đổi hành vi, chỉ tách theo chức năng).
import {json,sha} from './core.js';
import {uploadImage} from './media.js';

export const POST_PLATFORMS=['FACEBOOK','THREADS'],POST_LEAD_MS=5*60000,POST_MAX_IMAGES=10;

export const postClock=ms=>new Date(ms+7*3600000).toISOString().slice(0,16).replace('T',' ');

export const postEpoch=s=>Date.parse(s.replace(' ','T')+':00+07:00');

export function validPostTime(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s))return false;const ms=postEpoch(s);return Number.isFinite(ms)&&postClock(ms)===s}

export function cleanPostFields(data,partial){
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Dữ liệu bài đăng không hợp lệ.');
 const out={},text=(k,max)=>{if(data[k]===undefined)return;if(typeof data[k]!=='string'||data[k].length>max)throw Error('Trường "'+k+'" không hợp lệ hoặc quá dài.');out[k]=data[k]};
 if(data.platform!==undefined){if(!POST_PLATFORMS.includes(data.platform))throw Error('Nền tảng không hợp lệ.');out.platform=data.platform}else if(!partial)throw Error('Thiếu nền tảng.');
 text('body',8000);text('source',200);text('stt',20);text('note',500);text('image',1000);text('post_url',500);text('error',2000);
 if(out.image){const list=out.image.split('\n');if(list.length>POST_MAX_IMAGES)throw Error('Mỗi bài tối đa '+POST_MAX_IMAGES+' ảnh.');if(new Set(list).size!==list.length||list.some(u=>!/^\/media\/[a-zA-Z0-9._-]+$/.test(u)))throw Error('Ảnh không hợp lệ.')}
 if(data.scheduled_at!==undefined){if(data.scheduled_at!==''&&!validPostTime(data.scheduled_at))throw Error('Giờ đăng không hợp lệ.');out.scheduled_at=data.scheduled_at}
 return out}

export function postRow(r){return {id:r.id,platform:r.platform,kind:r.kind,body:r.body,image:r.image,source:r.source,stt:r.stt,scheduled_at:r.scheduled_at,status:r.status,post_url:r.post_url,error:r.error,note:r.note,has_original:r.original_body!==null&&r.original_body!==undefined,posted_at:r.posted_at,created:r.created,updated:r.updated}}

export async function saveStyleSample(env,row,body,note){
 if(row.original_body===null||row.original_body===undefined)return;
 const now=new Date().toISOString(),day=postClock(Date.now()).slice(0,10);
 if(body.trim()===row.original_body.trim()){
  if(note==='OK nguyên bản')await env.DB.prepare('INSERT INTO style_samples(post_id,day,platform,source,original,edited,note,updated) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(post_id) DO NOTHING').bind(row.id,day,row.platform,row.source,row.original_body,body,note,now).run();
  else await env.DB.prepare('DELETE FROM style_samples WHERE post_id=? AND note<>?').bind(row.id,'OK nguyên bản').run();
  return}
 await env.DB.prepare('INSERT INTO style_samples(post_id,day,platform,source,original,edited,note,updated) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(post_id) DO UPDATE SET edited=excluded.edited,source=excluded.source,day=excluded.day,note=excluded.note,updated=excluded.updated').bind(row.id,day,row.platform,row.source,row.original_body,body,'',now).run()}

export async function postsApi(req,env,path){
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

export async function machineScope(req,env){
 const m=/^Bearer ([A-Za-z0-9_-]{40,80})$/.exec(req.headers.get('authorization')||'');if(!m)return null;
 try{const row=await env.DB.prepare('SELECT scope FROM machine_tokens WHERE hash=?').bind(await sha(m[1])).first();return row?.scope||null}catch{return null}}

export const POST_STALE_MS=60*60000,POST_SENDING_MS=15*60000;

export async function tick(env,origin){
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

export async function machineApi(req,env,path,u){
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
