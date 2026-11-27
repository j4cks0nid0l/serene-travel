// Module content: tách từ _worker.js (không đổi hành vi, chỉ tách theo chức năng).
import {json} from './core.js';

export function validImage(url){return typeof url==='string'&&(/^\/assets\/[a-zA-Z0-9._-]+$/.test(url)||/^\/media\/[a-zA-Z0-9._-]+$/.test(url))}

export const tags=new Set(['p','br','h2','h3','strong','b','em','i','u','ul','ol','li','a','img','blockquote']);

export function escape(s){return s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')}

export const BOX_CLASSES={blockquote:['pocket','cta'],p:['photo-note']};

export function sanitize(input){return String(input||'').replace(/<!--[\s\S]*?-->/g,'').replace(/<(?![^<>]*>)/g,'&lt;').replace(/<(script|style|iframe|object|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<\/?([a-z0-9]+)\b([^>]*)>/gi,(all,name,attrs)=>{name=name.toLowerCase();if(name==='div')name='p';if(!tags.has(name))return '';if(all.startsWith('</'))return ['br','img'].includes(name)?'':'</'+name+'>';if(name==='a'){const href=/\bhref\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1]||'';let url;try{url=new URL(href)}catch{return '<a>'}return ['https:','http:'].includes(url.protocol)?'<a href="'+escape(url.href)+'" target="_blank" rel="noopener noreferrer">':'<a>'}if(name==='img'){const src=/\bsrc\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1]||'';const alt=/\balt\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1]||'Ảnh minh họa';return validImage(src)?'<img src="'+escape(src)+'" alt="'+escape(alt)+'">':''}const style=/\bstyle\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1]||'';const cls=/\bclass\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1]||'';const alignment=/(?:^|;)\s*text-align\s*:\s*(left|center|right|justify)\s*(?:;|$)/i.exec(style)?.[1]?.toLowerCase()||/^align-(left|center|right|justify)$/.exec(cls)?.[1];const extra=(BOX_CLASSES[name]||[]).filter(c=>cls.split(/\s+/).includes(c));const classes=[...(['p','h2','h3','li','blockquote'].includes(name)&&alignment?['align-'+alignment]:[]),...extra];return '<'+name+(classes.length?' class="'+classes.join(' ')+'"':'')+'>'})}

export function validate(value,id){if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Nội dung không hợp lệ.');const p={};if(id==='settings'){const keys=['heroTitle','heroSubtitle','heroImage','aboutTitle','aboutBody','founderName','founderImage','phone','email','company','address','hours','zalo','cardVinpearl','cardHotel','cardTour','cardTicket'];for(const k of [...keys,...Object.keys(value).filter(k=>/^home[A-Z][A-Za-z0-9]{0,60}$/.test(k))]){if(value[k]!==undefined){if(typeof value[k]!=='string'||value[k].length>12000)throw Error('Trường nội dung quá dài.');p[k]=value[k]}}for(const k of ['heroImage','founderImage','cardVinpearl','cardHotel','cardTour','cardTicket'])if(p[k]&&!validImage(p[k]))throw Error('Ảnh không hợp lệ.');if(p.phone&&!/^\+?[0-9\s-]{8,20}$/.test(p.phone))throw Error('Số điện thoại không hợp lệ.');if(p.zalo&&!/^https:\/\/zalo\.me\/[0-9]+$/.test(p.zalo))throw Error('Liên kết Zalo không hợp lệ.');return p}for(const k of ['title','summary','category','author','body','cover','places','featured','home','location','tags']){if(value[k]!==undefined&&typeof value[k]!=='string')throw Error('Nội dung không hợp lệ.');p[k]=value[k]||''}if(!p.title.trim()||p.title.length>180||p.summary.length>1000||p.body.length>150000||p.author.length>150||p.category.length>150)throw Error('Kiểm tra tiêu đề và độ dài bài viết.');if(p.cover&&!validImage(p.cover))throw Error('Ảnh không hợp lệ.');if(p.places&&p.places!=='-'&&!/^(service-[a-z0-9-]{1,60}|cam-nang)(,(service-[a-z0-9-]{1,60}|cam-nang)){0,30}$/.test(p.places))throw Error('Mục hiển thị không hợp lệ.');for(const k of ['featured','home'])if(p[k]!==''&&p[k]!=='1')throw Error('Giá trị không hợp lệ.');if(p.location.length>150||p.tags.length>300)throw Error('Kiểm tra vị trí và tiện ích.');p.body=sanitize(p.body);return p}

export function hasContent(html){return /<img\s/i.test(html)||html.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').trim().length>0}

export function publishProblem(p,id){if(id&&id.startsWith('hotel-'))return '';if(!p.summary.trim())return 'Cần có mô tả ngắn trước khi đăng.';if(!hasContent(p.body))return 'Cần có nội dung trước khi đăng.';return ''}

export async function putContent(req,env,id){
 if(Number(req.headers.get('content-length')||0)>200000)return json({error:'Nội dung quá lớn.'},413);
 if(id!=='settings'&&!id.startsWith('service-')&&!id.startsWith('post-')&&!id.startsWith('hotel-'))return json({error:'Mục không hợp lệ.'},400);
 let input,p;try{input=await req.json();p=validate(input.data,id)}catch(e){return json({error:e.message||'Nội dung không hợp lệ.'},400)}
 const mode=input.mode;
 if(!['draft','publish','unpublish'].includes(mode))return json({error:'Thao tác không hợp lệ.'},400);
 if(id==='settings'&&mode==='unpublish')return json({error:'Không thể gỡ cài đặt trang chủ. Hãy sửa và đăng lại.'},400);
 if(mode==='publish'&&id!=='settings'){const problem=publishProblem(p,id);if(problem)return json({error:problem},400)}
 const old=await env.DB.prepare('SELECT draft,published FROM content WHERE id=?').bind(id).first();
 const published=mode==='publish'?JSON.stringify(p):mode==='unpublish'?null:old?.published||null;
 let wasHidden=false;try{wasHidden=!!JSON.parse(old?.draft||'{}').hidden}catch{}
 const hidden=id!=='settings'&&(mode==='unpublish'||(mode==='draft'&&!old?.published&&wasHidden));
 await env.DB.prepare('INSERT INTO content(id,draft,published,updated) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET draft=excluded.draft,published=excluded.published,updated=excluded.updated').bind(id,JSON.stringify(hidden?{...p,hidden:true}:p),published,new Date().toISOString()).run();
 return json({ok:true});
}
