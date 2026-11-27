// Module quick: tách từ _worker.js (không đổi hành vi, chỉ tách theo chức năng).
import {json} from './core.js';

export const QUICK_URL_RE=/^\/media\/[a-zA-Z0-9._-]+$/;

export const quickClean=(v,max)=>String(v==null?'':v).replace(/\r\n/g,'\n').trim().slice(0,max);

export async function quickApi(req,env,path){
 if(!env.DB)return json({error:'Chưa kết nối cơ sở dữ liệu.'},503);
 
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
