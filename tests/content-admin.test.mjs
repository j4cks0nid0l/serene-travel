import test from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import worker, {sanitize} from '../public/_worker.js/index.js';
import {runtime} from '../scripts/local-runtime.mjs';

const pass = 'Only-for-local-tests-Change-This-123!';
const hash = 'test-salt:' + pbkdf2Sync(pass, 'test-salt', 100000, 32, 'sha256').toString('hex');
const origin = 'https://serene-test.pages.dev';
const SERVICE = 'service-quality-test';

async function session(env) {
  let cookie = '', csrf = '';
  async function call(path, method = 'GET', body) {
    const headers = {origin, ...(method === 'GET' ? {} : {'content-type': 'application/json'}), ...(cookie ? {cookie} : {}), ...(csrf ? {'x-csrf-token': csrf} : {})};
    return worker.fetch(new Request(origin + '/api/' + path, {method, headers, body: body === undefined ? undefined : JSON.stringify(body)}), env);
  }
  return {
    call,
    async login() {
      const r = await call('login', 'POST', {email: 'serenetravelvn@gmail.com', password: pass});
      cookie = r.headers.get('set-cookie').split(';')[0];
      csrf = (await r.json()).csrf;
    },
  };
}

const fullService = (over = {}) => ({title: 'Dịch vụ thử', summary: 'Mô tả ngắn để kiểm tra.', body: '<p>Nội dung chi tiết.</p>', category: 'Dịch vụ', author: 'Serene Travel', cover: '', places: '-', ...over});

test('Publish rules: settings cannot be unpublished; services need summary and body to publish', async () => {
  const env = await runtime({passwordHash: hash});
  const s = await session(env);
  try {
    await s.login();

    // Trang chủ không được gỡ khỏi website.
    const settings = await s.call('content/settings', 'PUT', {data: {heroTitle: 'Tiêu đề thử'}, mode: 'unpublish'});
    assert.equal(settings.status, 400);
    assert.match((await settings.json()).error, /cài đặt trang chủ/);

    // Bản nháp được lưu dù còn thiếu mô tả.
    assert.equal((await s.call('content/' + SERVICE, 'PUT', {data: fullService({summary: ''}), mode: 'draft'})).status, 200);

    // Đăng thiếu mô tả hoặc thiếu nội dung thì bị từ chối, và không xuất hiện trên website.
    const noSummary = await s.call('content/' + SERVICE, 'PUT', {data: fullService({summary: '   '}), mode: 'publish'});
    assert.equal(noSummary.status, 400);
    assert.match((await noSummary.json()).error, /mô tả ngắn/);
    const noBody = await s.call('content/' + SERVICE, 'PUT', {data: fullService({body: '<p> </p>'}), mode: 'publish'});
    assert.equal(noBody.status, 400);
    assert.match((await noBody.json()).error, /nội dung/);
    const pub = await (await worker.fetch(new Request(origin + '/api/public'), env)).json();
    assert.equal(pub.items.some((x) => x.id === SERVICE), false);

    // Đủ mô tả và nội dung thì đăng được.
    assert.equal((await s.call('content/' + SERVICE, 'PUT', {data: fullService(), mode: 'publish'})).status, 200);
    const pub2 = await (await worker.fetch(new Request(origin + '/api/public'), env)).json();
    assert.equal(pub2.items.some((x) => x.id === SERVICE), true);

    // Ảnh tải lên được coi là nội dung.
    const imageOnly = await s.call('content/' + SERVICE, 'PUT', {data: fullService({body: '<img src="/media/abc.jpg" alt="Ảnh">'}), mode: 'publish'});
    assert.equal(imageOnly.status, 200);

    // Gỡ dịch vụ khỏi website vẫn được.
    assert.equal((await s.call('content/' + SERVICE, 'PUT', {data: fullService(), mode: 'unpublish'})).status, 200);
  } finally {
    env.close?.();
  }
});

test('Settings publish and draft still work', async () => {
  const env = await runtime({passwordHash: hash});
  const s = await session(env);
  try {
    await s.login();
    assert.equal((await s.call('content/settings', 'PUT', {data: {heroTitle: 'Tiêu đề mới'}, mode: 'publish'})).status, 200);
    assert.equal((await s.call('content/settings', 'PUT', {data: {heroTitle: 'Nháp'}, mode: 'draft'})).status, 200);
    const pub = await (await worker.fetch(new Request(origin + '/api/public'), env)).json();
    assert.equal(pub.items.find((x) => x.id === 'settings').heroTitle, 'Tiêu đề mới');
  } finally {
    env.close?.();
  }
});

test('Sanitizer: stray < cannot open markup, real tags and /media images are handled', () => {
  // Thẻ mở không đóng không được thành thẻ thật.
  const stray = sanitize('<p>Chào</p><svg onload=alert(1)');
  assert.doesNotMatch(stray, /<svg/i);
  assert.doesNotMatch(stray, /<[^>]*onload/i); // không còn thẻ nào có thuộc tính onload
  assert.match(stray, /&lt;svg/); // phần còn lại chỉ là chữ

  // Chữ có dấu < vẫn giữ nguyên dạng chữ.
  assert.match(sanitize('<p>a < b</p>'), /a &lt; b/);

  // Script, sự kiện và liên kết javascript: bị loại bỏ.
  const bad = sanitize('<p onclick="x()">Hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>');
  assert.doesNotMatch(bad, /script|onclick|javascript:/i);

  // Ảnh đã tải lên (/media/) được giữ; ảnh ngoài bị bỏ.
  assert.match(sanitize('<img src="/media/a1.jpg" alt="x">'), /<img src="\/media\/a1\.jpg"/);
  assert.doesNotMatch(sanitize('<img src="https://evil.example/x.png">'), /<img/);
});

test('Admin pages use a CSP without inline scripts; booking and public keep theirs', async () => {
  const env = await runtime({passwordHash: hash});
  env.ASSETS = {fetch: async () => new Response('ok', {headers: {'content-type': 'text/html'}})};
  const csp = async (p) => (await worker.fetch(new Request(origin + p), env)).headers.get('content-security-policy');
  try {
    const admin = await csp('/admin/');
    assert.match(admin, /script-src 'self';/);
    assert.doesNotMatch(admin, /script-src[^;]*unsafe-inline/);
    assert.match(await csp('/admin/bai-dang/'), /script-src 'self';/);
    // Trang booking còn script inline nên giữ CSP riêng; trang công khai đã bỏ script inline.
    assert.match(await csp('/admin/booking/'), /unsafe-inline/);
    assert.match(await csp('/'), /script-src 'self';/);
    assert.doesNotMatch(await csp('/'), /script-src[^;]*unsafe-inline/);
  } finally {
    env.close?.();
  }
});

test('Admin page has no inline script', async () => {
  const html = await readFile(new URL('../public/admin/index.html', import.meta.url), 'utf8');
  const inline = [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)].filter((m) => !/\bsrc=/.test(m[1] || '') && m[2].trim());
  assert.equal(inline.length, 0);
});

test('Hotels and display flags: a hotel needs only a name; flags are validated and published', async () => {
  const env = await runtime({passwordHash: hash});
  const s = await session(env);
  try {
    await s.login();
    // Khách sạn chỉ cần tên để đăng.
    const hotel = {title: 'Khách sạn thử', summary: '', body: '', location: 'Trung tâm Nha Trang', tags: 'Mặt biển, 5 sao', home: '1', featured: '', cover: ''};
    assert.equal((await s.call('content/hotel-quality-test', 'PUT', {data: hotel, mode: 'publish'})).status, 200);
    const pub = (await (await worker.fetch(new Request(origin + '/api/public'), env)).json()).items.find((x) => x.id === 'hotel-quality-test');
    assert.equal(pub.home, '1');
    assert.equal(pub.location, 'Trung tâm Nha Trang');
    assert.equal(pub.tags, 'Mặt biển, 5 sao');

    // Dịch vụ được đánh dấu "Được chọn nhiều" vẫn cần mô tả và nội dung khi đăng.
    assert.equal((await s.call('content/' + SERVICE, 'PUT', {data: fullService({featured: '1'}), mode: 'publish'})).status, 200);
    const svc = (await (await worker.fetch(new Request(origin + '/api/public'), env)).json()).items.find((x) => x.id === SERVICE);
    assert.equal(svc.featured, '1');

    // Cờ chỉ nhận '1' hoặc rỗng.
    const bad = await s.call('content/' + SERVICE, 'PUT', {data: fullService({featured: 'yes'}), mode: 'draft'});
    assert.equal(bad.status, 400);
  } finally {
    env.close?.();
  }
});
