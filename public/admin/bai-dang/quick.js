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
async function fileToJpeg(file){return toBlob(await readDataUrl(file),'image/jpeg',.86,1600)}
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
// ---- Tin nhắn mẫu ----
const groupsOf=(arr,k)=>{const m=new Map();arr.forEach(x=>{const g=x[k]||'';m.set(g,(m.get(g)||0)+1)});return [...m.entries()].sort((a,b)=>a[0].localeCompare(b[0],'vi'))};
function drawMsgs(){
 const box=$('sec-msgs'),ed=st.msgEdit?data.msgs.find(m=>m.id===st.msgEdit):null;
 const gs=groupsOf(data.msgs,'grp'),q=st.msgQ.trim().toLowerCase();
 const list=data.msgs.filter(m=>(!st.msgGrp||(st.msgGrp==='__none'?!m.grp:m.grp===st.msgGrp))&&(!q||(m.title+' '+m.body+' '+m.grp).toLowerCase().includes(q)));
 box.innerHTML=`<details class="q-add"${ed||!data.msgs.length?' open':''}><summary>${ed?'Đang sửa mẫu':'+ Thêm tin nhắn mẫu'}</summary><div class="q-form">
  <div class="row2"><div><label for="m-title">Tên mẫu</label><input id="m-title" maxlength="80" placeholder="VD: Báo giá Vinpearl 2N1Đ" value="${esc(ed?ed.title:'')}"></div>
  <div><label for="m-grp">Nhóm</label><input id="m-grp" list="m-grps" maxlength="40" placeholder="VD: Báo giá, Chào khách, Chốt đơn" value="${esc(ed?ed.grp:'')}"><datalist id="m-grps">${gs.filter(g=>g[0]).map(g=>`<option value="${esc(g[0])}">`).join('')}</datalist></div></div>
  <div><label for="m-body">Nội dung (sẽ copy đúng nguyên văn)</label><textarea id="m-body" maxlength="4000">${esc(ed?ed.body:'')}</textarea></div>
  <div class="actions"><button class="primary" id="m-save" type="button">${ed?'Lưu thay đổi':'Lưu mẫu'}</button>${ed?'<button id="m-cancel" type="button">Hủy sửa</button>':''}</div></div></details>
  <div class="q-top"><input type="search" id="m-q" placeholder="Tìm mẫu theo tên hoặc nội dung" value="${esc(st.msgQ)}"></div>
  <div class="q-chips"><button type="button" class="q-chip${!st.msgGrp?' on':''}" data-g="">Tất cả<span class="n">${data.msgs.length}</span></button>${gs.map(g=>`<button type="button" class="q-chip${st.msgGrp===(g[0]||'__none')?' on':''}" data-g="${esc(g[0]||'__none')}">${esc(g[0]||'Chưa phân nhóm')}<span class="n">${g[1]}</span></button>`).join('')}</div>
  <div class="q-list">${list.length?list.map(m=>`<div class="q-card" data-id="${esc(m.id)}"><div class="post-head"><h3>${esc(m.title)}</h3>${m.grp?`<span class="pill">${esc(m.grp)}</span>`:''}</div><p class="q-body">${esc(m.body)}</p>
   <div class="actions"><button class="primary" data-a="copy" type="button">Copy</button>${m.body.length>260||m.body.split('\n').length>6?'<button data-a="more" type="button">Xem hết</button>':''}<button data-a="edit" type="button">Sửa</button><button class="danger" data-a="del" type="button">Xóa</button></div></div>`).join(''):`<div class="empty">${data.msgs.length?'Không có mẫu phù hợp.':'Chưa có mẫu nào. Thêm mẫu đầu tiên ở khung phía trên.'}</div>`}</div>`;
 $('m-save').onclick=saveMsg;
 if($('m-cancel'))$('m-cancel').onclick=()=>{st.msgEdit=null;drawMsgs()};
 $('m-q').oninput=e=>{st.msgQ=e.target.value;const pos=e.target.selectionStart;drawMsgs();const i=$('m-q');i.focus();i.setSelectionRange(pos,pos)};
 box.querySelectorAll('.q-chip').forEach(b=>b.onclick=()=>{st.msgGrp=b.dataset.g;drawMsgs()});
 box.querySelectorAll('.q-card').forEach(card=>{
  const id=card.dataset.id,m=data.msgs.find(x=>x.id===id);
  card.querySelectorAll('[data-a]').forEach(b=>b.onclick=async()=>{
   const a=b.dataset.a;
   if(a==='copy'){toast(await copyText(m.body)?'Đã copy tin nhắn: '+m.title:'Không copy được, hãy bấm Xem hết rồi chọn chữ để copy.',3000)}
   else if(a==='more'){const p=card.querySelector('.q-body');p.classList.toggle('open');b.textContent=p.classList.contains('open')?'Thu gọn':'Xem hết'}
   else if(a==='edit'){st.msgEdit=id;drawMsgs();$('m-title').scrollIntoView({behavior:'smooth',block:'center'});$('m-title').focus()}
   else if(a==='del'){if(!confirm('Xóa mẫu "'+m.title+'"?'))return;try{await api('quick/msg/'+id,'DELETE');data.msgs=data.msgs.filter(x=>x.id!==id);if(st.msgEdit===id)st.msgEdit=null;drawMsgs();toast('Đã xóa mẫu')}catch(e){toast(e.message,4000)}}});});}
async function saveMsg(){
 const body={title:$('m-title').value,grp:$('m-grp').value,body:$('m-body').value};
 if(!body.title.trim()||!body.body.trim()){toast('Nhập tên mẫu và nội dung.');return}
 const btn=$('m-save');btn.disabled=true;
 try{
  if(st.msgEdit){const r=await api('quick/msg/'+st.msgEdit,'PUT',body);const i=data.msgs.findIndex(x=>x.id===st.msgEdit);data.msgs[i]=r.msg;st.msgEdit=null;toast('Đã lưu thay đổi')}
  else{const r=await api('quick/msg','POST',body);data.msgs.push(r.msg);toast('Đã lưu mẫu mới')}
  drawMsgs()}
 catch(e){toast(e.message,4000);btn.disabled=false}}
// ---- Thư viện ảnh ----
function drawPhotos(){
 const box=$('sec-photos'),ed=st.phEdit?data.photos.find(p=>p.id===st.phEdit):null;
 const albums=groupsOf(data.photos,'album'),q=st.phQ.trim().toLowerCase();
 const list=data.photos.filter(p=>(!st.phAlbum||p.album===st.phAlbum)&&(!q||(p.album+' '+p.label).toLowerCase().includes(q)));
 box.innerHTML='<details class="q-add"'+(ed||!data.photos.length?' open':'')+'><summary>'+(ed?'Đang sửa ảnh':'+ Thêm ảnh')+'</summary>'+(ed?`<div class="q-form"><h2>Sửa ảnh</h2><div class="row2"><div><label for="p-album">Khách sạn / resort</label><input id="p-album" list="p-albums" maxlength="80" value="${esc(ed.album)}"></div><div><label for="p-label">Nhãn (không bắt buộc)</label><input id="p-label" maxlength="40" value="${esc(ed.label)}"></div></div><datalist id="p-albums">${albums.map(a=>`<option value="${esc(a[0])}">`).join('')}</datalist><div class="actions"><button class="primary" id="p-save" type="button">Lưu</button><button id="p-cancel" type="button">Hủy</button></div></div>`
 :`<div class="q-form"><h2>Thêm ảnh</h2><div class="row2"><div><label for="p-album">Khách sạn / resort</label><input id="p-album" list="p-albums" maxlength="80" placeholder="VD: Vinpearl Nha Trang" value="${esc(st.phAlbum)}"></div><div><label for="p-label">Nhãn (không bắt buộc)</label><input id="p-label" maxlength="40" placeholder="VD: Hồ bơi, Phòng, Bữa sáng"></div></div><datalist id="p-albums">${albums.map(a=>`<option value="${esc(a[0])}">`).join('')}</datalist>
  <div><label for="p-files">Chọn ảnh (được chọn nhiều ảnh cùng lúc)</label><input id="p-files" type="file" accept="image/*" multiple></div><p class="hint" style="margin:0;font-size:12.5px;color:var(--muted)">Ảnh được thu nhỏ còn tối đa 1600 điểm ảnh để gửi khách nhanh hơn.</p><div class="actions"><button class="primary" id="p-up" type="button">Tải ảnh lên</button></div></div>`)+'</details>'
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
   const jpg=await fileToJpeg(files[i]);
   const up=await api('upload','POST',jpg);
   const r=await api('quick/photo','POST',{album,label,url:up.url});
   data.photos.unshift(r.photo);ok++}
  catch(e){fail++;lastErr=e.message}}
 st.phAlbum=album;drawPhotos();
 toast(fail?('Đã tải '+ok+' ảnh, lỗi '+fail+' ảnh: '+lastErr):'Đã thêm '+ok+' ảnh vào "'+album+'"',fail?6000:2800)}
if(location.hash==='#msgs')setSec('msgs');else if(location.hash==='#photos')setSec('photos');
