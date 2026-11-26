// Copy nhanh: tin nhắn mẫu và thư viện ảnh khách sạn
const $=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let csrf='',data={msgs:[],photos:[]},loaded=false,sec='posts';
const st={msgGrp:'',msgQ:'',msgEdit:null,phAlbum:'',phQ:'',phEdit:null,pick:new Set(),pickMode:false};
let toastTimer=0;
function toast(t,ms=2400){const el=$('qtoast');el.textContent=t;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),ms)}
async function api(path,method='GET',body){
 const isBlob=body instanceof Blob;
 const res=await fetch('/api/'+path,{method,headers:{...(isBlob?{'content-type':body.type}:{'content-type':'application/json'}),'x-csrf-token':csrf},body:isBlob?body:body?JSON.stringify(body):undefined});
 let json;try{json=await res.json()}catch{throw Error('Máy chủ chưa sẵn sàng.')}
 if(res.status===401){location.href='/admin/';throw Error('Vui lòng đăng nhập.')}
 if(!res.ok)throw Error(json.error||'Chưa xử lý được yêu cầu.');
 return json}
// ---- Copy văn bản ----
async function copyText(t){
 try{await navigator.clipboard.writeText(t);return true}catch{}
 const ta=document.createElement('textarea');ta.value=t;ta.style.cssText='position:fixed;top:0;left:0;opacity:0';document.body.appendChild(ta);ta.focus();ta.select();
 let ok=false;try{ok=document.execCommand('copy')}catch{}ta.remove();return ok}
// ---- Ảnh: đổi sang PNG để copy, nén JPEG để tải lên ----
function loadImg(src){return new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>no(Error('Không mở được ảnh.'));i.src=src})}
async function toBlob(src,type,quality,maxSide){
 const img=await loadImg(src);let w=img.naturalWidth,h=img.naturalHeight;
 if(maxSide&&Math.max(w,h)>maxSide){const k=maxSide/Math.max(w,h);w=Math.round(w*k);h=Math.round(h*k)}
 const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
 if(type==='image/jpeg'){x.fillStyle='#fff';x.fillRect(0,0,w,h)}
 x.drawImage(img,0,0,w,h);
 return new Promise((ok,no)=>c.toBlob(b=>b?ok(b):no(Error('Không xử lý được ảnh.')),type,quality))}
function readDataUrl(file){return new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>no(Error('Không đọc được tệp.'));r.readAsDataURL(file)})}
// Giữ nguyên ảnh gốc (kích thước và chất lượng). Chỉ đổi sang JPEG khi định dạng lạ (như HEIC) hoặc quá 20 MB.
const MAX_BYTES=20*1024*1024;
async function prepareFile(file){
 if(/^image\/(jpeg|png|webp)$/.test(file.type)&&file.size<=MAX_BYTES)return file;
 const jpg=await toBlob(await readDataUrl(file),'image/jpeg',.95,0);
 if(jpg.size>MAX_BYTES)throw Error('Ảnh quá lớn (trên 20 MB), hãy giảm dung lượng trước khi tải.');
 return jpg}
function fileName(ph){return (ph.album+(ph.label?' '+ph.label:'')).replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'').slice(0,60)||'anh'}
async function download(ph){
 const r=await fetch(ph.url);if(!r.ok)throw Error('Không tải được ảnh.');
 const b=await r.blob(),a=document.createElement('a');a.href=URL.createObjectURL(b);
 a.download=fileName(ph)+'-'+ph.id.slice(-4)+(ph.url.split('.').pop().match(/^(jpg|png|webp)$/)?'.'+ph.url.split('.').pop():'.jpg');
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),3000)}
// Copy ảnh: tạo ClipboardItem ngay trong lúc bấm (Safari bắt buộc). Không được thì tải về.
async function copyImage(ph){
 if(navigator.clipboard&&window.ClipboardItem){
  try{
   const pr=toBlob(ph.url,'image/png');
   await navigator.clipboard.write([new ClipboardItem({'image/png':pr})]);
   toast('Đã copy ảnh. Dán vào khung chat.');return}
  catch(e){console.warn('Copy ảnh lỗi',e)}}
 try{await download(ph);toast('Máy này không cho copy ảnh nên đã tải về. Chọn ảnh trong máy để gửi.',4500)}
 catch(e){toast(e.message,4000)}}
// ---- Chuyển khu ----
function setSec(n){
 sec=n;
 document.querySelectorAll('#seg button').forEach(b=>b.classList.toggle('on',b.dataset.sec===n));
 $('sec-posts').hidden=n!=='posts';$('sec-msgs').hidden=n!=='msgs';$('sec-photos').hidden=n!=='photos';
 document.querySelectorAll('.posts-top').forEach(e=>{});
 if(n!=='posts')ensureData().then(()=>n==='msgs'?drawMsgs():drawPhotos());
 try{history.replaceState(null,'',n==='posts'?location.pathname:'#'+n)}catch{}}
async function ensureData(){
 if(loaded)return;
 try{csrf=(await api('session')).csrf;data=await api('quick');loaded=true}catch(e){toast(e.message,4000)}}
document.querySelectorAll('#seg button').forEach(b=>b.onclick=()=>setSec(b.dataset.sec));
// ---- Tin nhắn mẫu: Mục > Nhóm > Tin ----
const groupsOf=(arr,k)=>{const m=new Map();arr.forEach(x=>{const g=x[k]||'';m.set(g,(m.get(g)||0)+1)});return [...m.entries()].sort((a,b)=>a[0].localeCompare(b[0],'vi'))};
const NOGRP='Chưa phân nhóm';
st.msgSec=null;st.msgGrp=null;
function crumbs(){
 const parts=[`<a href="#" data-go="root">Tin nhắn mẫu</a>`];
 if(st.msgSec!==null)parts.push(st.msgGrp===null?`<b>${esc(st.msgSec)}</b>`:`<a href="#" data-go="sec">${esc(st.msgSec)}</a>`);
 if(st.msgSec!==null&&st.msgGrp!==null)parts.push(`<b>${esc(st.msgGrp||NOGRP)}</b>`);
 return `<nav class="crumbs">${parts.join(' <span>›</span> ')}</nav>`}
function msgCard(m,showPath){
 const long=m.body.length>260||m.body.split('\n').length>6;
 return `<div class="q-card" data-id="${esc(m.id)}"><div class="post-head"><h3>${esc(m.title)}</h3>${showPath?`<span class="pill">${esc(m.sec)}${m.grp?' › '+esc(m.grp):''}</span>`:''}</div><p class="q-body">${esc(m.body)}</p>
 <div class="actions"><button class="primary" data-a="copy" type="button">Copy</button>${long?'<button data-a="more" type="button">Xem hết</button>':''}<button data-a="edit" type="button">Sửa</button><button class="danger" data-a="del" type="button">Xóa</button></div></div>`}
function folderCard(kind,name,line){
 return `<div class="q-folder" data-k="${kind}" data-n="${esc(name)}"><button class="q-open" type="button" data-a="open"><span class="q-ico">📁</span><span class="q-fname">${esc(name||NOGRP)}</span><span class="q-fcount">${esc(line)}</span></button>${name||kind==='sec'?`<div class="q-fbar"><button type="button" data-a="ren">Đổi tên</button><button type="button" class="danger" data-a="rm">Xóa</button></div>`:''}</div>`}
function drawMsgs(){
 const box=$('sec-msgs'),ed=st.msgEdit?data.msgs.find(m=>m.id===st.msgEdit):null;
 const q=st.msgQ.trim().toLowerCase(),all=data.msgs;
 const secs=groupsOf(all,'sec').filter(x=>x[0]);
 const inSec=st.msgSec===null?[]:all.filter(m=>m.sec===st.msgSec);
 const grps=groupsOf(inSec,'grp').filter(x=>x[0]);
 let body='';
 if(q){
  const list=all.filter(m=>(m.sec+' '+m.grp+' '+m.title+' '+m.body).toLowerCase().includes(q));
  body=`<div class="q-list">${list.length?list.map(m=>msgCard(m,true)).join(''):'<div class="empty">Không có tin phù hợp.</div>'}</div>`}
 else if(st.msgSec===null){
  body=secs.length?`<div class="q-folders">${secs.map(([n,c])=>{const gc=new Set(all.filter(m=>m.sec===n&&m.grp).map(m=>m.grp)).size;return folderCard('sec',n,c+' tin'+(gc?' · '+gc+' nhóm':''))}).join('')}</div>`:'<div class="empty">Chưa có tin nào. Bấm "+ Thêm tin nhắn mẫu" ở trên.</div>'}
 else if(st.msgGrp===null){
  const loose=inSec.filter(m=>!m.grp);
  body=(grps.length?`<div class="q-folders">${grps.map(([n,c])=>folderCard('grp',n,c+' tin')).join('')}</div>`:'')
   +(loose.length?`${grps.length?`<h3 class="q-sub">${NOGRP}</h3>`:''}<div class="q-list">${loose.map(m=>msgCard(m)).join('')}</div>`:'')
   +(!grps.length&&!loose.length?'<div class="empty">Mục này chưa có tin nào.</div>':'')}
 else{
  const list=inSec.filter(m=>m.grp===st.msgGrp);
  body=`<div class="q-list">${list.length?list.map(m=>msgCard(m)).join(''):'<div class="empty">Nhóm này chưa có tin nào.</div>'}</div>`}
 const defSec=ed?ed.sec:(st.msgSec||''),defGrp=ed?ed.grp:(st.msgGrp||'');
 box.innerHTML=`<details class="q-add"${ed||!all.length?' open':''}><summary>${ed?'Đang sửa tin':'+ Thêm tin nhắn mẫu'}</summary><div class="q-form">
  <div class="row2"><div><label for="m-sec">Mục</label><input id="m-sec" list="m-secs" maxlength="40" placeholder="VD: Vinpearl 2N1Đ" value="${esc(defSec)}"><datalist id="m-secs">${secs.map(x=>`<option value="${esc(x[0])}">`).join('')}</datalist></div>
  <div><label for="m-grp">Nhóm (không bắt buộc)</label><input id="m-grp" list="m-grps" maxlength="40" placeholder="VD: Vin Đảo Hòn Tre" value="${esc(defGrp)}"><datalist id="m-grps"></datalist></div></div>
  <div><label for="m-title">Tên tin</label><input id="m-title" maxlength="80" placeholder="VD: Combo Vinpearl Resort 2N1Đ" value="${esc(ed?ed.title:'')}"></div>
  <div><label for="m-body">Nội dung (sẽ copy đúng nguyên văn)</label><textarea id="m-body" maxlength="4000">${esc(ed?ed.body:'')}</textarea></div>
  <div class="actions"><button class="primary" id="m-save" type="button">${ed?'Lưu thay đổi':'Lưu tin'}</button>${ed?'<button id="m-cancel" type="button">Hủy sửa</button>':''}</div></div></details>
  <div class="q-top"><input type="search" id="m-q" placeholder="Tìm tin theo tên khách sạn, nội dung..." value="${esc(st.msgQ)}"></div>
  ${q?'':crumbs()}${body}`;
 const fillGrps=()=>{const sv=$('m-sec').value.trim();$('m-grps').innerHTML=groupsOf(all.filter(m=>m.sec===sv),'grp').filter(x=>x[0]).map(x=>`<option value="${esc(x[0])}">`).join('')};
 fillGrps();$('m-sec').oninput=fillGrps;
 $('m-save').onclick=saveMsg;
 if($('m-cancel'))$('m-cancel').onclick=()=>{st.msgEdit=null;drawMsgs()};
 $('m-q').oninput=e=>{st.msgQ=e.target.value;const pos=e.target.selectionStart;drawMsgs();const i=$('m-q');i.focus();i.setSelectionRange(pos,pos)};
 box.querySelectorAll('.crumbs a').forEach(a=>a.onclick=e=>{e.preventDefault();if(a.dataset.go==='root'){st.msgSec=null}st.msgGrp=null;drawMsgs()});
 box.querySelectorAll('.q-folder').forEach(f=>{
  const kind=f.dataset.k,name=f.dataset.n;
  f.querySelectorAll('[data-a]').forEach(b=>b.onclick=async()=>{
   const a=b.dataset.a;
   if(a==='open'){if(kind==='sec'){st.msgSec=name;st.msgGrp=null}else st.msgGrp=name;drawMsgs();window.scrollTo({top:0})}
   else if(a==='ren'){const to=prompt('Tên mới:',name);if(to===null||!to.trim()||to.trim()===name)return;
    try{await api('quick/rename','POST',{level:kind,sec:st.msgSec||name,from:name,to:to.trim()});data=await api('quick');if(kind==='sec'&&st.msgSec===name)st.msgSec=to.trim();drawMsgs();toast('Đã đổi tên')}catch(e){toast(e.message,4000)}}
   else if(a==='rm'){const n=data.msgs.filter(m=>kind==='sec'?m.sec===name:(m.sec===st.msgSec&&m.grp===name)).length;
    if(!confirm('Xóa '+(kind==='sec'?'mục':'nhóm')+' "'+name+'" cùng '+n+' tin bên trong? Không khôi phục được.'))return;
    try{await api('quick/group','POST',{level:kind,sec:kind==='sec'?name:st.msgSec,grp:kind==='grp'?name:''});data=await api('quick');drawMsgs();toast('Đã xóa')}catch(e){toast(e.message,4000)}}});});
 box.querySelectorAll('.q-card').forEach(card=>{
  const id=card.dataset.id,m=data.msgs.find(x=>x.id===id);
  card.querySelectorAll('[data-a]').forEach(b=>b.onclick=async()=>{
   const a=b.dataset.a;
   if(a==='copy'){toast(await copyText(m.body)?'Đã copy tin nhắn: '+m.title:'Không copy được, hãy bấm Xem hết rồi chọn chữ để copy.',3000)}
   else if(a==='more'){const p=card.querySelector('.q-body');p.classList.toggle('open');b.textContent=p.classList.contains('open')?'Thu gọn':'Xem hết'}
   else if(a==='edit'){st.msgEdit=id;drawMsgs();$('m-title').scrollIntoView({behavior:'smooth',block:'center'});$('m-title').focus()}
   else if(a==='del'){if(!confirm('Xóa tin "'+m.title+'"?'))return;try{await api('quick/msg/'+id,'DELETE');data.msgs=data.msgs.filter(x=>x.id!==id);if(st.msgEdit===id)st.msgEdit=null;
     if(st.msgSec!==null&&!data.msgs.some(x=>x.sec===st.msgSec)){st.msgSec=null;st.msgGrp=null}else if(st.msgGrp&&!data.msgs.some(x=>x.sec===st.msgSec&&x.grp===st.msgGrp))st.msgGrp=null;
     drawMsgs();toast('Đã xóa tin')}catch(e){toast(e.message,4000)}}});});}
async function saveMsg(){
 const body={sec:$('m-sec').value,grp:$('m-grp').value,title:$('m-title').value,body:$('m-body').value};
 if(!body.sec.trim()){toast('Nhập tên mục.');return}
 if(!body.title.trim()||!body.body.trim()){toast('Nhập tên tin và nội dung.');return}
 const btn=$('m-save');btn.disabled=true;
 try{
  let r;
  if(st.msgEdit){r=await api('quick/msg/'+st.msgEdit,'PUT',body);const i=data.msgs.findIndex(x=>x.id===st.msgEdit);data.msgs[i]=r.msg;st.msgEdit=null;toast('Đã lưu thay đổi')}
  else{r=await api('quick/msg','POST',body);data.msgs.push(r.msg);toast('Đã lưu tin mới')}
  st.msgSec=r.msg.sec;st.msgGrp=r.msg.grp?r.msg.grp:null;st.msgQ='';
  drawMsgs()}
 catch(e){toast(e.message,4000);btn.disabled=false}}
// ---- Thư viện ảnh ----
function drawPhotos(){
 const box=$('sec-photos'),ed=st.phEdit?data.photos.find(p=>p.id===st.phEdit):null;
 const albums=groupsOf(data.photos,'album'),q=st.phQ.trim().toLowerCase();
 const list=data.photos.filter(p=>(!st.phAlbum||p.album===st.phAlbum)&&(!q||(p.album+' '+p.label).toLowerCase().includes(q)));
 box.innerHTML='<details class="q-add"'+(ed||!data.photos.length?' open':'')+'><summary>'+(ed?'Đang sửa ảnh':'+ Thêm ảnh')+'</summary>'+(ed?`<div class="q-form"><h2>Sửa ảnh</h2><div class="row2"><div><label for="p-album">Khách sạn / resort</label><input id="p-album" list="p-albums" maxlength="80" value="${esc(ed.album)}"></div><div><label for="p-label">Nhãn (không bắt buộc)</label><input id="p-label" maxlength="40" value="${esc(ed.label)}"></div></div><datalist id="p-albums">${albums.map(a=>`<option value="${esc(a[0])}">`).join('')}</datalist><div class="actions"><button class="primary" id="p-save" type="button">Lưu</button><button id="p-cancel" type="button">Hủy</button></div></div>`
 :`<div class="q-form"><h2>Thêm ảnh</h2><div class="row2"><div><label for="p-album">Khách sạn / resort</label><input id="p-album" list="p-albums" maxlength="80" placeholder="VD: Vinpearl Nha Trang" value="${esc(st.phAlbum)}"></div><div><label for="p-label">Nhãn (không bắt buộc)</label><input id="p-label" maxlength="40" placeholder="VD: Hồ bơi, Phòng, Bữa sáng"></div></div><datalist id="p-albums">${albums.map(a=>`<option value="${esc(a[0])}">`).join('')}</datalist>
  <div><label for="p-files">Chọn ảnh (được chọn nhiều ảnh cùng lúc)</label><input id="p-files" type="file" accept="image/*" multiple></div><p class="hint" style="margin:0;font-size:12.5px;color:var(--muted)">Ảnh được giữ nguyên kích thước và chất lượng gốc (tối đa 20 MB mỗi ảnh).</p><div class="actions"><button class="primary" id="p-up" type="button">Tải ảnh lên</button></div></div>`)+'</details>'
 +`<div class="q-top"><input type="search" id="p-q" placeholder="Tìm theo tên khách sạn hoặc nhãn" value="${esc(st.phQ)}"><button id="p-mode" type="button">${st.pickMode?'Thoát chọn nhiều':'Chọn nhiều ảnh'}</button>${st.pickMode?`<button class="primary" id="p-dlsel" type="button"${st.pick.size?'':' disabled'}>Tải về ${st.pick.size} ảnh</button>`:''}</div>
  <div class="q-chips"><button type="button" class="q-chip${!st.phAlbum?' on':''}" data-al="">Tất cả<span class="n">${data.photos.length}</span></button>${albums.map(a=>`<button type="button" class="q-chip${st.phAlbum===a[0]?' on':''}" data-al="${esc(a[0])}">${esc(a[0])}<span class="n">${a[1]}</span></button>`).join('')}</div>
  <div class="q-photos">${list.length?list.map(p=>`<div class="q-ph${st.pick.has(p.id)?' sel':''}" data-id="${esc(p.id)}"><img src="${esc(p.url)}" alt="${esc(p.album+' '+p.label)}" loading="lazy"><div class="cap" title="${esc(p.album)}">${esc(p.label||'')}${p.label&&!st.phAlbum?' · ':''}${st.phAlbum?'':esc(p.album)}</div>${st.pickMode?'':'<div class="bar"><button class="primary" data-a="copy" type="button">Copy</button><button data-a="dl" type="button">Tải</button><button data-a="edit" type="button">Sửa</button><button class="danger" data-a="del" type="button">Xóa</button></div>'}</div>`).join(''):`<div class="empty" style="grid-column:1/-1">${data.photos.length?'Không có ảnh phù hợp.':'Chưa có ảnh nào. Thêm ảnh đầu tiên ở khung phía trên.'}</div>`}</div>`;
 if($('p-up'))$('p-up').onclick=uploadPhotos;
 if($('p-save'))$('p-save').onclick=savePhoto;
 if($('p-cancel'))$('p-cancel').onclick=()=>{st.phEdit=null;drawPhotos()};
 $('p-q').oninput=e=>{st.phQ=e.target.value;const pos=e.target.selectionStart;drawPhotos();const i=$('p-q');i.focus();i.setSelectionRange(pos,pos)};
 $('p-mode').onclick=()=>{st.pickMode=!st.pickMode;st.pick.clear();drawPhotos()};
 if($('p-dlsel'))$('p-dlsel').onclick=async()=>{const ids=[...st.pick];toast('Đang tải '+ids.length+' ảnh...',2500);for(const id of ids){const p=data.photos.find(x=>x.id===id);if(p)try{await download(p);await new Promise(r=>setTimeout(r,350))}catch(e){toast(e.message,3500)}}};
 box.querySelectorAll('.q-chip').forEach(b=>b.onclick=()=>{st.phAlbum=b.dataset.al;drawPhotos()});
 box.querySelectorAll('.q-ph').forEach(el=>{
  const id=el.dataset.id,p=data.photos.find(x=>x.id===id);
  el.querySelector('img').onclick=()=>{
   if(st.pickMode){st.pick.has(id)?st.pick.delete(id):st.pick.add(id);drawPhotos();return}
   copyImage(p)};
  el.querySelectorAll('[data-a]').forEach(b=>b.onclick=async()=>{
   const a=b.dataset.a;
   if(a==='copy')copyImage(p);
   else if(a==='dl'){try{await download(p);toast('Đã tải ảnh về máy.')}catch(e){toast(e.message,3500)}}
   else if(a==='edit'){st.phEdit=id;drawPhotos();window.scrollTo({top:0,behavior:'smooth'})}
   else if(a==='del'){if(!confirm('Xóa ảnh này khỏi thư viện? Không khôi phục được.'))return;try{await api('quick/photo/'+id,'DELETE');data.photos=data.photos.filter(x=>x.id!==id);if(st.phAlbum&&!data.photos.some(x=>x.album===st.phAlbum))st.phAlbum='';drawPhotos();toast('Đã xóa ảnh')}catch(e){toast(e.message,4000)}}});});}
async function savePhoto(){
 const album=$('p-album').value.trim(),label=$('p-label').value.trim();
 if(!album){toast('Nhập tên khách sạn.');return}
 try{await api('quick/photo/'+st.phEdit,'PUT',{album,label});const p=data.photos.find(x=>x.id===st.phEdit);p.album=album;p.label=label;st.phEdit=null;drawPhotos();toast('Đã lưu')}
 catch(e){toast(e.message,4000)}}
async function uploadPhotos(){
 const album=$('p-album').value.trim(),label=$('p-label').value.trim(),files=[...$('p-files').files];
 if(!album){toast('Nhập tên khách sạn trước.');return}
 if(!files.length){toast('Chọn ít nhất một ảnh.');return}
 const btn=$('p-up');btn.disabled=true;let ok=0,fail=0,lastErr='';
 for(let i=0;i<files.length;i++){
  toast('Đang tải ảnh '+(i+1)+'/'+files.length+'...',60000);
  try{
   const blob=await prepareFile(files[i]);
   const up=await api('upload?big=1','POST',blob);
   const r=await api('quick/photo','POST',{album,label,url:up.url});
   data.photos.unshift(r.photo);ok++}
  catch(e){fail++;lastErr=e.message}}
 st.phAlbum=album;drawPhotos();
 toast(fail?('Đã tải '+ok+' ảnh, lỗi '+fail+' ảnh: '+lastErr):'Đã thêm '+ok+' ảnh vào "'+album+'"',fail?6000:2800)}
if(location.hash==='#msgs')setSec('msgs');else if(location.hash==='#photos')setSec('photos');
