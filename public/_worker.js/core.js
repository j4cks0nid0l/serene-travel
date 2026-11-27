// Module core: tách từ _worker.js (không đổi hành vi, chỉ tách theo chức năng).


export const enc=new TextEncoder();

export const adminEmail=env=>String(env?.ADMIN_EMAIL||'').trim().toLowerCase();

export const CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

export const ADMIN_CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

export const BOOKING_CSP="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' data: https://img.vietqr.io; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

export function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}})}

export function hex(a){return [...new Uint8Array(a)].map(x=>x.toString(16).padStart(2,'0')).join('')}

export async function sha(s){return hex(await crypto.subtle.digest('SHA-256',enc.encode(s)))}

export function equal(a,b){if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0}

export async function passwordOK(pass,secret){const [salt,expected]=secret.split(':');if(!salt||!expected)return false;const key=await crypto.subtle.importKey('raw',enc.encode(pass),'PBKDF2',false,['deriveBits']);const digest=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(salt),iterations:100000},key,256);return equal(hex(digest),expected)}

export function cookie(req){return /(?:^|;\s*)serene_session=([A-Za-z0-9-]+)/.exec(req.headers.get('cookie')||'')?.[1]||''}

export function sessionCookie(value,age,req){return 'serene_session='+value+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+age+(new URL(req.url).protocol==='https:'?'; Secure':'')}
