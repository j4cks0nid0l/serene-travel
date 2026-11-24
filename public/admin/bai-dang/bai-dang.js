const $=id=>document.getElementById(id);
const MAX_IMAGES=10;
let csrf='',posts=[],nowText='',filter='',target=null,rescheduling=false;
const editing=new Set();
const drafts=new Map();
const TABS=[['NHÁP','Chờ duyệt'],['ĐÃ DUYỆT','Đã hẹn giờ'],['ĐÃ ĐĂNG','Đã đăng'],['LỖI','Lỗi'],['ALL','Tất cả']];
const STATUS_PILL={'NHÁP':['Chờ duyệt','draft'],'ĐÃ DUYỆT':['Đã hẹn giờ','ok'],'ĐÃ ĐĂNG':['Đã đăng','done'],'ĐANG ĐĂNG':['Đang đăng','ok'],'LỖI':['Lỗi','err']};
const tabOf=p=>p.status==='ĐANG ĐĂNG'?'ĐÃ DUYỆT':p.status;
const epoch=s=>Date.parse(s.replace(' ','T')+':00+07:00');
const clock=ms=>new Date(ms+7*3600000).toISOString().slice(0,16).replace('T',' ');
function show(text){$('status').textContent=text||''}
function fmt(t){if(!t)return '';const [d,h]=t.split(' '),[y,m,day]=d.split('-');return h+' '+day+'/'+m+'/'+y}
async function api(path,method='GET',body){
 const isBlob=body instanceof Blob;
 const res=await fetch('/api/'+path,{method,headers:{...(isBlob?{'content-type':body.type}:{'content-type':'application/json'}),'x-csrf-token':csrf},body:isBlob?body:body?JSON.stringify(body):undefined});
 let json;try{json=await res.json()}catch{throw Error('Máy chủ chưa sẵn sàng.')}
 if(res.status===401){location.href='/admin/';throw Error('Vui lòng đăng nhập.')}
 if(!res.ok)throw Error(json.error||'Chưa xử lý được yêu cầu.');
 return json}
function current(p){const d=drafts.get(p.id)||{};return {body:d.body??p.body,source:d.source??p.source,note:d.note??p.note}}
function edits(p){const c=current(p);return {body:c.body,source:c.source,note:c.note}}
function isDirty(){return drafts.size>0}
async function load(keepFilter=true){
 const r=await api('posts');posts=r.posts;nowText=r.now;
 if(!keepFilter||!filter)filter=posts.some(p=>p.status==='NHÁP')?'NHÁP':'ALL';
 render()}
function counts(){const c={ALL:posts.length};for(const [k] of TABS)if(k!=='ALL')c[k]=posts.filter(p=>tabOf(p)===k).length;return c}
function renderTabs(){
 const c=counts(),root=$('tabs');root.replaceChildren();
 for(const [key,label] of TABS){const b=document.createElement('button');b.type='button';b.className='tab';b.setAttribute('role','tab');b.setAttribute('aria-selected',String(filter===key));b.append(label);const n=document.createElement('span');n.className='n';n.textContent=c[key];b.append(n);b.onclick=()=>{filter=key;render()};root.append(b)}}
function sorted(list){
 return [...list].sort((a,b)=>{
  if(filter==='ĐÃ ĐĂNG'||filter==='LỖI')return b.updated.localeCompare(a.updated);
  const ta=a.scheduled_at||'9999',tb=b.scheduled_at||'9999';
  return ta===tb?b.updated.localeCompare(a.updated):ta.localeCompare(tb)})}
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e}
function button(label,cls,onclick){const b=el('button',cls||'',label);b.type='button';b.onclick=onclick;return b}
async function run(buttons,job){buttons.forEach(b=>b.disabled=true);try{await job()}catch(e){show(e.message)}finally{buttons.forEach(b=>{b.disabled=false})}}
function card(p){
 const editable=p.status==='NHÁP'||p.status==='LỖI',typing=editable&&editing.has(p.id);
 const box=el('article','post');box.dataset.id=p.id;
 const head=el('div','post-head');
 head.append(el('span','pill'+(p.platform==='THREADS'?' threads':''),p.platform==='THREADS'?'Threads':'Facebook'));
 let [label,cls]=STATUS_PILL[p.status]||[p.status,''];if(p.status==='ĐÃ ĐĂNG'&&p.scheduled_at&&p.scheduled_at>nowText)label='Đã đặt lịch trên Facebook';head.append(el('span','pill '+cls,label));
 if(p.kind==='CÓ ẢNH')head.append(el('span','pill','Có ảnh'));
 if(p.scheduled_at)head.append(el('span','post-time',fmt(p.scheduled_at)));
 box.append(head);
 if(p.status==='LỖI'&&p.error)box.append(el('p','err-text',p.error));
 const c=current(p);
 const row=el('div','row2');
 const l1=el('label','','Khách sạn / nguồn');const src=el('input');src.maxLength=200;src.value=c.source;src.readOnly=!typing;l1.append(src);
 const l2=el('label','','Ghi chú của tôi');const note=el('input');note.maxLength=500;note.value=c.note;note.readOnly=!typing;l2.append(note);
 row.append(l1,l2);box.append(row);
 const lb=el('label','','Nội dung bài');const ta=el('textarea');ta.maxLength=8000;ta.value=c.body;ta.readOnly=!typing;ta.rows=9;lb.append(ta);box.append(lb);
 const count=el('p','count');const updateCount=()=>{const n=[...ta.value].length;count.textContent=p.platform==='THREADS'?n+'/500 ký tự (Threads thường giới hạn 500)':n+' ký tự';count.classList.toggle('warn',p.platform==='THREADS'&&n>500)};updateCount();box.append(count);
 const remember=()=>{const next={body:ta.value,source:src.value,note:note.value};if(next.body===p.body&&next.source===p.source&&next.note===p.note)drafts.delete(p.id);else drafts.set(p.id,next)};
 for(const f of [ta,src,note])f.addEventListener('input',()=>{remember();updateCount()});
 if(p.platform==='FACEBOOK'){
  const list=p.image?p.image.split('\n'):[];
  const wrap=el('div','post-images');
  const saveImages=(urls,msg)=>api('posts/'+p.id,'PUT',{data:{...edits(p),image:urls.join('\n')}}).then(async()=>{drafts.delete(p.id);await load();show(msg)});
  list.forEach((url,i)=>{
   const cell=el('div','pthumb');const img=el('img');img.alt='Ảnh '+(i+1);img.src=url;cell.append(img);
   if(i===0)cell.append(el('span','main-tag','Ảnh chính'));
   if(editable){
    const bar=el('div','pthumb-bar');
    if(i>0)bar.append(button('◀','',function(){run([this],()=>{const next=[...list];[next[i-1],next[i]]=[next[i],next[i-1]];return saveImages(next,'Đã đổi thứ tự ảnh.')})}));
    bar.append(button('Bỏ','',function(){run([this],()=>saveImages(list.filter((_,k)=>k!==i),'Đã bỏ ảnh.'))}));
    cell.append(bar)}
   wrap.append(cell)});
  if(!list.length)wrap.append(el('div','noimg','Chưa có ảnh'));
  if(editable){
   const side=el('div','img-side');const file=el('input');file.type='file';file.multiple=true;file.accept='image/jpeg,image/png,image/webp';file.hidden=true;
   const pick=button(list.length?'Thêm ảnh':'Chọn ảnh','',()=>file.click());side.append(pick);
   side.append(el('p','hint','Hoặc bấm vào ô nội dung rồi Ctrl+V để dán ảnh. Tối đa '+MAX_IMAGES+' ảnh.'));
   const addFiles=files=>run([pick],async()=>{
    const imgs=[...files].filter(f=>f.type.startsWith('image/'));if(!imgs.length)return;
    const room=MAX_IMAGES-list.length;if(room<=0){show('Mỗi bài tối đa '+MAX_IMAGES+' ảnh.');return}
    const urls=[...list];let done=0,skipped=imgs.length>room?imgs.length-room:0;
    try{for(const f of imgs.slice(0,room)){show('Đang tải ảnh '+(done+1)+'/'+Math.min(imgs.length,room)+'…');const up=await api('upload','POST',await prepareImage(f));urls.push(up.url);done++}}
    finally{if(done)await saveImages(urls,'Đã thêm '+done+' ảnh'+(skipped?', bỏ '+skipped+' ảnh vì quá '+MAX_IMAGES+' ảnh':'')+'.')}});
   file.onchange=()=>{const f=[...file.files];file.value='';if(f.length)addFiles(f)};
   ta.addEventListener('paste',e=>{const files=[...(e.clipboardData?.files||[])].filter(f=>f.type.startsWith('image/'));if(!files.length)return;e.preventDefault();addFiles(files)});
   side.append(file);wrap.append(side)}
  box.append(wrap)}
 const actions=el('div','actions');
 if(editable){
  const sched=button('Hẹn giờ đăng','primary',()=>openSchedule(p));
  actions.append(sched);
  if(!typing)actions.append(button('Sửa bài','',()=>{editing.add(p.id);render()}));
  else{
   const save=button('Lưu sửa','',()=>run([save],async()=>{const c=edits(p),r=await api('posts/'+p.id,'PUT',{data:c});drafts.delete(p.id);editing.delete(p.id);await load();showReport(p,c,r.original);show('Đã lưu.')}));
   actions.append(save,button('Hủy sửa','',()=>{drafts.delete(p.id);editing.delete(p.id);render()}))}}
 if(p.status==='ĐÃ DUYỆT')actions.append(button('Đổi giờ','primary',()=>openSchedule(p,true)));
 if(p.status==='ĐÃ DUYỆT')actions.append(button('Bỏ hẹn giờ','',function(){run([this],async()=>{await api('posts/'+p.id,'PUT',{action:'unapprove',data:{}});filter='NHÁP';await load();show('Đã bỏ hẹn giờ, bài về mục Chờ duyệt.')})}));
 if(p.status==='LỖI')actions.append(button('Đưa về chờ duyệt','',function(){run([this],async()=>{await api('posts/'+p.id,'PUT',{action:'unapprove',data:{}});filter='NHÁP';await load()})}));
 actions.append(button('Sao chép','',async()=>{try{await navigator.clipboard.writeText(ta.value);show('Đã sao chép nội dung bài.')}catch{ta.select();show('Chưa sao chép tự động được. Nội dung đã được chọn, bấm Ctrl+C.')}}));
 if(p.status!=='ĐÃ ĐĂNG')actions.append(button('Đã đăng','',function(){if(!confirm('Đánh dấu bài này là đã đăng?'))return;run([this],async()=>{await api('posts/'+p.id,'PUT',{action:'posted',data:['ĐÃ DUYỆT','ĐANG ĐĂNG'].includes(p.status)?{}:edits(p)});drafts.delete(p.id);await load();show('Đã đánh dấu đã đăng.')})}));
 if(!['ĐÃ DUYỆT','ĐANG ĐĂNG'].includes(p.status))actions.append(button('Xóa','danger',function(){if(!confirm('Xóa bài này? Không khôi phục được.'))return;run([this],async()=>{await api('posts/'+p.id,'DELETE');drafts.delete(p.id);await load();show('Đã xóa.')})}));
 box.append(actions);return box}
function render(){
 renderTabs();const list=$('list');list.replaceChildren();
 const shown=sorted(filter==='ALL'?posts:posts.filter(p=>tabOf(p)===filter));
 if(!shown.length){list.append(el('div','empty',filter==='NHÁP'?'Chưa có bài nào chờ duyệt.':'Chưa có bài trong mục này.'));return}
 for(const p of shown)list.append(card(p))}
async function prepareImage(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Chỉ nhận ảnh JPG, PNG hoặc WebP.');
 if(file.size<=1.5*1024*1024)return file;
 const bmp=await createImageBitmap(file),scale=Math.min(1,2048/Math.max(bmp.width,bmp.height)),canvas=document.createElement('canvas');
 canvas.width=Math.round(bmp.width*scale);canvas.height=Math.round(bmp.height*scale);canvas.getContext('2d').drawImage(bmp,0,0,canvas.width,canvas.height);
 const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',0.85));
 if(!blob||blob.size>5*1024*1024)throw Error('Ảnh vẫn quá lớn sau khi thu nhỏ. Hãy chọn ảnh khác.');
 return blob}
function times(){const out=[];for(let m=7*60;m<=22*60;m+=30)out.push(String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'));return out}
function openSchedule(p,again=false){
 target=p;rescheduling=again;$('schedule-title').textContent=again?'Đổi giờ đăng':'Hẹn giờ đăng';const today=nowText.slice(0,10),tomorrow=clock(epoch(nowText)+24*3600000).slice(0,10);
 const date=$('schedule-date');date.min=today;date.value=p.scheduled_at&&p.scheduled_at.slice(0,10)>=today?p.scheduled_at.slice(0,10):tomorrow;
 $('schedule-custom').value='';drawChips();$('schedule-dialog').showModal()}
function tooSoon(day,time){return epoch(day+' '+time)<Date.now()+5*60000}
function drawChips(){
 const root=$('chips');root.replaceChildren();const day=$('schedule-date').value;
 for(const t of times()){const b=button(t,'',()=>confirmTime(t));b.disabled=!day||tooSoon(day,t);root.append(b)}}
async function confirmTime(time){
 const day=$('schedule-date').value;if(!day){show('Hãy chọn ngày đăng.');return}
 if(tooSoon(day,time)){show('Giờ đăng phải cách hiện tại ít nhất 5 phút.');return}
 const p=target;if(!p)return;const dialogButtons=[...document.querySelectorAll('#schedule-dialog button')];
 await run(dialogButtons,async()=>{
  if(rescheduling){await api('posts/'+p.id,'PUT',{action:'reschedule',data:{scheduled_at:day+' '+time}});$('schedule-dialog').close();filter='ĐÃ DUYỆT';await load();show('Đã đổi giờ đăng sang '+fmt(day+' '+time)+'.');return}
  const c=edits(p),r=await api('posts/'+p.id,'PUT',{action:'approve',data:{...c,scheduled_at:day+' '+time}});drafts.delete(p.id);editing.delete(p.id);$('schedule-dialog').close();filter='ĐÃ DUYỆT';await load();showReport(p,c,r.original);show('Đã hẹn giờ '+fmt(day+' '+time)+'.')});
 }
$('schedule-date').onchange=drawChips;
$('schedule-cancel').onclick=()=>$('schedule-dialog').close();
$('schedule-custom-ok').onclick=()=>{const t=$('schedule-custom').value;if(!t){show('Hãy nhập giờ.');return}confirmTime(t)};
async function add(platform){const r=await api('posts','POST',{data:{platform,body:''}});if(r.id)editing.add(r.id);filter='NHÁP';await load();show('Đã thêm bài nháp mới.')}
$('add-facebook').onclick=function(){run([this],()=>add('FACEBOOK'))};
$('add-threads').onclick=function(){run([this],()=>add('THREADS'))};
$('logout').onclick=async()=>{if(isDirty()&&!confirm('Có chỉnh sửa chưa lưu. Vẫn đăng xuất?'))return;try{await api('logout','POST');location.href='/admin/'}catch(e){show(e.message)}};
window.addEventListener('beforeunload',e=>{if(isDirty()){e.preventDefault();e.returnValue=''}});
try{csrf=(await api('session')).csrf;await load(false)}catch(e){show(e.message)}

function showReport(p,c,before){
 if(!before)return;
 const day=nowText.slice(0,10).split('-').reverse().join('/');
 const lines=['BÁO CÁO SỬA BÀI (để Claude học cách hành văn của Jackson)','Ngày sửa: '+day,'Nền tảng: '+(p.platform==='THREADS'?'Threads':'Facebook')];
 if(c.source)lines.push('Khách sạn / nguồn: '+c.source);
 if(c.note)lines.push('Ghi chú của tôi: '+c.note);
 lines.push('','BẢN GỐC (Claude viết):',before.trim(),'','BẢN ĐÃ SỬA (Jackson):',c.body.trim(),'','Nhờ Claude: so sánh hai bản, rút ra điểm khác trong cách hành văn, ghi nhớ để áp dụng cho các bài sau.');
 $('report-text').value=lines.join('\n');$('report-dialog').showModal()}
$('report-close').onclick=()=>$('report-dialog').close();
$('report-copy').onclick=async()=>{const t=$('report-text');try{await navigator.clipboard.writeText(t.value);show('Đã sao chép báo cáo. Dán vào cuộc trò chuyện với Claude.')}catch{t.select();show('Chưa sao chép tự động được. Nội dung đã được chọn, bấm Ctrl+C.')}};
