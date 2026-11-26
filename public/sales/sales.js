// Trang cộng tác viên: đăng ký, xác nhận email, đăng nhập. Dữ liệu người dùng luôn gán bằng textContent.
(function(){
  var $=function(id){return document.getElementById(id)};
  var views=['login','register','verify','wait','home','hotel'];
  var csrf='',pendingEmail='',cooldownTimer=0;

  function show(name){
    views.forEach(function(v){$('v-'+v).hidden=v!==name});
    $('btn-logout').hidden=name!=='home'&&name!=='hotel';
    document.querySelector('main').classList.toggle('wide',name==='home'||name==='hotel');
    if(name==='home')loadHotels();
    window.scrollTo(0,0);
  }
  async function api(method,path,body){
    var opt={method:method,headers:{}};
    if(body!==undefined){opt.headers['content-type']='application/json';opt.body=JSON.stringify(body)}
    if(method!=='GET'&&csrf)opt.headers['x-csrf-token']=csrf;
    var res=await fetch('/api/sales/'+path,opt),data=null;
    try{data=await res.json()}catch(e){}
    if(!res.ok){var err=new Error((data&&data.error)||'Có lỗi xảy ra. Vui lòng thử lại.');err.status=res.status;err.data=data||{};throw err}
    return data||{};
  }
  function msg(id,text,good){var el=$(id);el.textContent=text||'';el.classList.toggle('good',!!good)}
  // Khóa nút trong lúc gửi để tránh bấm hai lần
  function guard(form,fn){
    form.addEventListener('submit',async function(ev){
      ev.preventDefault();
      var btn=form.querySelector('button[type=submit]');btn.disabled=true;
      try{await fn()}finally{btn.disabled=false}
    });
  }

  document.querySelectorAll('[data-go]').forEach(function(b){
    b.addEventListener('click',function(){
      msg('m-login','');msg('m-register','');show(b.getAttribute('data-go'));
    });
  });

  guard($('f-login'),async function(){
    msg('m-login','');
    var email=$('l-email').value.trim(),password=$('l-pass').value;
    if(!email||!password){msg('m-login','Vui lòng nhập email và mật khẩu.');return}
    try{
      var r=await api('POST','login',{email:email,password:password});
      csrf=r.csrf;$('h-name').textContent=r.name;$('l-pass').value='';show('home');
    }catch(e){
      if(e.data&&e.data.needVerify){pendingEmail=email;openVerify(email);return}
      msg('m-login',e.message);
    }
  });

  guard($('f-register'),async function(){
    msg('m-register','');
    var body={name:$('r-name').value,phone:$('r-phone').value,zalo:$('r-zalo').value,email:$('r-email').value,password:$('r-pass').value,website:$('r-web').value};
    try{
      var r=await api('POST','register',body);
      $('r-pass').value='';
      if(r.next==='verify'){pendingEmail=body.email.trim().toLowerCase();openVerify(pendingEmail,r.warn)}else show('wait');
    }catch(e){msg('m-register',e.message)}
  });

  function openVerify(email,warn){
    $('vf-email').textContent=email;$('vf-code').value='';msg('m-verify',warn||'');show('verify');
    $('vf-code').focus();startCooldown(60);
  }
  function startCooldown(sec){
    var btn=$('btn-resend');clearInterval(cooldownTimer);btn.disabled=true;
    var left=sec;btn.textContent='Gửi lại mã ('+left+'s)';
    cooldownTimer=setInterval(function(){
      left-=1;
      if(left<=0){clearInterval(cooldownTimer);btn.disabled=false;btn.textContent='Gửi lại mã'}
      else btn.textContent='Gửi lại mã ('+left+'s)';
    },1000);
  }
  $('btn-resend').addEventListener('click',async function(){
    try{await api('POST','resend',{email:pendingEmail});msg('m-verify','Đã gửi lại mã. Hãy kiểm tra email (cả mục Thư rác).',true);startCooldown(60)}
    catch(e){msg('m-verify',e.message)}
  });
  guard($('f-verify'),async function(){
    msg('m-verify','');
    var code=$('vf-code').value.trim();
    if(!/^\d{6}$/.test(code)){msg('m-verify','Mã gồm 6 chữ số.');return}
    try{await api('POST','verify',{email:pendingEmail,code:code});clearInterval(cooldownTimer);show('wait')}
    catch(e){msg('m-verify',e.message)}
  });


  // ===== Bảng giá khách sạn =====
  var hotels=[],cur=null;
  var money=function(n){return Math.round(n).toLocaleString('vi-VN')+' đ'};
  var dmy=function(ymd){var p=ymd.split('-');return p[2]+'/'+p[1]+'/'+p[0]};
  var norm=function(t){return String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().trim()};
  function toast(t){var el=$('toast');el.textContent=t;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(function(){el.hidden=true},2200)}
  async function loadHotels(){
    var box=$('hs-list');
    try{var r=await api('GET','hotels');hotels=r.hotels||[];renderHotels()}
    catch(e){if(e.status===401){csrf='';show('login');return}box.textContent=e.message}
  }
  function renderHotels(){
    var q=norm($('hs-search').value),box=$('hs-list');box.textContent='';
    var list=hotels.filter(function(h){return!q||norm(h.name).indexOf(q)>=0});
    if(!hotels.length){var p=document.createElement('p');p.className='lead';p.textContent='Hiện chưa có khách sạn nào để xem. Vui lòng quay lại sau.';box.appendChild(p);return}
    if(!list.length){var p2=document.createElement('p');p2.className='lead';p2.textContent='Không tìm thấy khách sạn phù hợp.';box.appendChild(p2);return}
    list.forEach(function(h){
      var b=document.createElement('button');b.type='button';b.className='hs-item';
      var n=document.createElement('b');n.textContent=h.name;
      var f=document.createElement('span');f.textContent='Từ '+money(h.from)+'/đêm';
      b.appendChild(n);b.appendChild(f);
      b.addEventListener('click',function(){openHotel(h.name)});
      box.appendChild(b);
    });
  }
  async function openHotel(name){
    try{var r=await api('GET','hotel?name='+encodeURIComponent(name));cur=r.hotel}
    catch(e){if(e.status===401){csrf='';show('login');return}toast(e.message);loadHotels();return}
    $('ht-name').textContent=cur.name;
    $('ht-addr').textContent=cur.address||'';$('ht-addr').hidden=!cur.address;
    $('ht-note').textContent=cur.note?'Lưu ý: '+cur.note:'';$('ht-note').hidden=!cur.note;
    var t=cur.today,d=new Date(t+'T00:00:00Z'),n=new Date(d.getTime()+86400000).toISOString().slice(0,10);
    $('ht-in').min=t;$('ht-in').value=t;$('ht-out').min=n;$('ht-out').value=n;$('ht-rooms').value='1';
    var mk='';try{mk=localStorage.getItem('serene_ctv_markup')||''}catch(e){}
    $('ht-mk').value=mk;
    renderTable();renderPhotos();calc();show('hotel');
  }
  function roomGroups(){
    var m={},order=[];
    cur.rows.forEach(function(r){var k=norm(r.room);if(!m[k]){m[k]={room:r.room,rows:[]};order.push(k)}m[k].rows.push(r)});
    return order.map(function(k){return m[k]});
  }
  function renderTable(){
    var box=$('ht-table');box.textContent='';
    var tb=document.createElement('table'),th=document.createElement('tr');
    ['Hạng phòng','Mùa','Từ - đến','Giá/đêm','Đêm thứ 7'].forEach(function(x){var c=document.createElement('th');c.textContent=x;th.appendChild(c)});
    tb.appendChild(th);
    cur.rows.slice().sort(function(a,b){return norm(a.room)<norm(b.room)?-1:norm(a.room)>norm(b.room)?1:a.from<b.from?-1:1}).forEach(function(r){
      var tr=document.createElement('tr');
      [r.room,r.label||'',dmy(r.from)+' - '+dmy(r.to),money(r.ctv),r.ctvSat!=null&&r.ctvSat!==r.ctv?money(r.ctvSat):'—'].forEach(function(x,i){var c=document.createElement('td');if(i>=3)c.className='n';c.textContent=x;tr.appendChild(c)});
      tb.appendChild(tr);
    });
    box.appendChild(tb);
  }
  function nightsList(a,b){
    var out=[],d=new Date(a+'T00:00:00Z'),end=new Date(b+'T00:00:00Z');
    while(d<end&&out.length<120){out.push(d.toISOString().slice(0,10));d=new Date(d.getTime()+86400000)}
    return out;
  }
  function rowFor(rows,ymd){
    for(var i=0;i<rows.length;i++)if(rows[i].from<=ymd&&ymd<=rows[i].to)return rows[i];
    return null;
  }
  function isSat(ymd){var p=ymd.split('-');return new Date(+p[0],+p[1]-1,+p[2]).getDay()===6}
  function digits(v){return parseInt(String(v||'').replace(/\D/g,''),10)||0}
  var lastQuotes=[];
  function calc(){
    var box=$('ht-res');box.textContent='';lastQuotes=[];
    if(!cur)return;
    var a=$('ht-in').value,b=$('ht-out').value,rooms=Math.min(50,Math.max(1,parseInt($('ht-rooms').value,10)||1)),mk=digits($('ht-mk').value);
    if(!a||!b||b<=a){var p=document.createElement('p');p.className='lead';p.textContent='Chọn ngày nhận và trả phòng để xem giá.';box.appendChild(p);return}
    var nights=nightsList(a,b),av=cur.avail||{},tracked=Object.keys(av).length>0;
    var closed=[],unknown=[],minN=0;
    nights.forEach(function(y){var e=av[y];if(e&&e.s==='c')closed.push(y);if(!e||!e.s)unknown.push(y);if(e&&e.m&&e.m>minN)minN=e.m});
    var warns=[];
    if(closed.length)warns.push(['warn','Hết phòng đêm '+closed.slice(0,6).map(function(y){return dmy(y).slice(0,5)}).join(', ')+(closed.length>6?'...':'')+'.']);
    if(minN>nights.length)warns.push(['warn','Khách sạn yêu cầu đặt tối thiểu '+minN+' đêm cho thời gian này.']);
    if(!closed.length&&unknown.length)warns.push(['askr',tracked?'Một số đêm chưa có thông tin còn phòng, cần hỏi lại Serene.':'Chưa có thông tin còn phòng, cần hỏi lại Serene trước khi báo khách.']);
    if(!closed.length&&!unknown.length&&minN<=nights.length)warns.push(['okr','Còn phòng các đêm đã chọn.']);
    roomGroups().forEach(function(g){
      var sum=0,missing=null;
      nights.forEach(function(y){
        if(missing)return;var r=rowFor(g.rows,y);
        if(!r){missing=y;return}
        sum+=(isSat(y)&&r.ctvSat!=null)?r.ctvSat:r.ctv;
      });
      var card=document.createElement('div');card.className='res';
      var h=document.createElement('h3');h.textContent=g.room;card.appendChild(h);
      if(missing){var w=document.createElement('p');w.className='warn';w.textContent='Chưa có giá cho đêm '+dmy(missing)+'. Vui lòng hỏi Serene.';card.appendChild(w);box.appendChild(card);return}
      var pay=sum*rooms,extra=mk*rooms*nights.length,sale=pay+extra;
      var add=function(cls,l,v){var r=document.createElement('div');r.className='row '+cls;var s1=document.createElement('span'),s2=document.createElement('span');s1.textContent=l;s2.textContent=v;r.appendChild(s1);r.appendChild(s2);card.appendChild(r)};
      add('',rooms+' phòng, '+nights.length+' đêm','');
      add('','Bạn trả Serene',money(pay));
      add('big','Giá bán khách',money(sale));
      add('profit','Bạn lãi',money(extra));
      warns.forEach(function(w2){var p3=document.createElement('p');p3.className=w2[0];p3.textContent=w2[1];card.appendChild(p3)});
      var q=cur.name+'\nHạng phòng: '+g.room+'\nNhận phòng: '+dmy(a)+' - Trả phòng: '+dmy(b)+' ('+nights.length+' đêm)\nSố phòng: '+rooms+'\nTổng giá: '+money(sale)+'\n(Giá trung bình '+money(sale/rooms/nights.length)+'/phòng/đêm)';
      lastQuotes.push(q);
      var btn=document.createElement('button');btn.type='button';btn.className='primary';btn.textContent='Copy báo giá cho khách';
      btn.addEventListener('click',function(){copyText(q)});card.appendChild(btn);
      box.appendChild(card);
    });
    if(!box.children.length){var p4=document.createElement('p');p4.className='lead';p4.textContent='Chưa có bảng giá cho khách sạn này.';box.appendChild(p4)}
    if(lastQuotes.length>1){var all=document.createElement('button');all.type='button';all.textContent='Copy báo giá tất cả hạng phòng';all.style.marginTop='12px';all.addEventListener('click',function(){copyText(lastQuotes.join('\n\n'))});box.appendChild(all)}
  }
  async function copyText(t){
    try{await navigator.clipboard.writeText(t);toast('Đã copy báo giá')}
    catch(e){
      var ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();
      var ok=false;try{ok=document.execCommand('copy')}catch(x){}
      ta.remove();toast(ok?'Đã copy báo giá':'Không copy được, hãy chọn và copy thủ công')
    }
  }
  function renderPhotos(){
    var box=$('ht-photos');box.textContent='';var ps=cur.photos||[];$('ht-photo-card').hidden=!ps.length;
    ps.forEach(function(p){
      var w=document.createElement('div');w.className='photo';
      var img=document.createElement('img');img.src=p.url;img.alt=p.label||cur.name;img.loading='lazy';w.appendChild(img);
      if(p.label){var c=document.createElement('div');c.className='cap';c.textContent=p.label;w.appendChild(c)}
      var bar=document.createElement('div');bar.className='ph-b';
      var cp=document.createElement('button');cp.type='button';cp.textContent='Copy ảnh';
      cp.addEventListener('click',function(){copyImage(p.url)});
      var dl=document.createElement('a');dl.href=p.url;dl.download='';dl.textContent='Tải về';
      bar.appendChild(cp);bar.appendChild(dl);w.appendChild(bar);box.appendChild(w);
    });
  }
  // Chuyển ảnh sang PNG bằng canvas rồi copy; trình duyệt không hỗ trợ thì tải về
  function pngBlob(url){
    return new Promise(function(res,rej){
      var im=new Image();
      im.onload=function(){var c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;c.getContext('2d').drawImage(im,0,0);c.toBlob(function(b){b?res(b):rej(new Error('toBlob'))},'image/png')};
      im.onerror=function(){rej(new Error('load'))};
      im.src=url;
    });
  }
  async function copyImage(url){
    try{
      if(!window.ClipboardItem||!navigator.clipboard||!navigator.clipboard.write)throw new Error('unsupported');
      await navigator.clipboard.write([new ClipboardItem({'image/png':pngBlob(url)})]);
      toast('Đã copy ảnh');
    }catch(e){
      var a=document.createElement('a');a.href=url;a.download='';document.body.appendChild(a);a.click();a.remove();
      toast('Máy không cho copy ảnh, đã tải ảnh về');
    }
  }
  $('hs-search').addEventListener('input',renderHotels);
  $('ht-back').addEventListener('click',function(){show('home')});
  ['ht-in','ht-out','ht-rooms'].forEach(function(id){$(id).addEventListener('input',function(){
    if(id==='ht-in'&&$('ht-in').value){var d=new Date($('ht-in').value+'T00:00:00Z'),n=new Date(d.getTime()+86400000).toISOString().slice(0,10);$('ht-out').min=n;if($('ht-out').value<=$('ht-in').value)$('ht-out').value=n}
    calc()})});
  $('ht-mk').addEventListener('input',function(){
    var v=digits(this.value);this.value=v?v.toLocaleString('vi-VN'):'';
    try{localStorage.setItem('serene_ctv_markup',this.value)}catch(e){}
    calc();
  });
  $('btn-logout').addEventListener('click',async function(){
    try{await api('POST','logout',{})}catch(e){}
    csrf='';show('login');
  });

  (async function init(){
    try{var me=await api('GET','me');csrf=me.csrf;$('h-name').textContent=me.name;show('home')}
    catch(e){show('login')}
  })();
})();
