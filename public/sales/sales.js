// Trang cộng tác viên: đăng ký, xác nhận email, đăng nhập. Dữ liệu người dùng luôn gán bằng textContent.
(function(){
  var $=function(id){return document.getElementById(id)};
  var views=['login','register','verify','wait','home'];
  var csrf='',pendingEmail='',cooldownTimer=0;

  function show(name){
    views.forEach(function(v){$('v-'+v).hidden=v!==name});
    $('btn-logout').hidden=name!=='home';
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

  guard($('f-pass'),async function(){
    msg('m-pass','');
    try{
      await api('POST','password',{current:$('p-cur').value,next:$('p-new').value});
      $('p-cur').value='';$('p-new').value='';msg('m-pass','Đã đổi mật khẩu.',true);
    }catch(e){msg('m-pass',e.message)}
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
