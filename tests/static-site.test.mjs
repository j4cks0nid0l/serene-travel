// Kiểm tra tĩnh cho giao diện công khai và trang quản trị: không chạy trình duyệt,
// nhưng bắt được các lỗi hay gặp: script inline, id bị đổi tên, tệp được tham chiếu bị thiếu.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (rel) => readFile(root + rel, 'utf8');

test('Public home page has no inline scripts or inline event handlers', async () => {
  const html = await read('public/index.html');
  const inline = [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)].filter((m) => !/\bsrc=/.test(m[1] || '') && m[2].trim());
  assert.equal(inline.length, 0, 'script nội tuyến còn trong index.html');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'thuộc tính on*= còn trong index.html');
});

test('Every id that site.js and home.js look up exists in the public home page', async () => {
  const html = await read('public/index.html');
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const file of ['public/site.js', 'public/home.js']) {
    const js = await read(file);
    const wanted = new Set([...js.matchAll(/\$\('([^']+)'\)/g), ...js.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]));
    const missing = [...wanted].filter((id) => !ids.has(id));
    assert.deepEqual(missing, [], `${file} tìm id không có trong index.html`);
  }
});

test('Local scripts and stylesheets referenced by the pages exist', async () => {
  for (const page of ['public/index.html', 'public/admin/index.html', 'public/admin/booking/index.html', 'public/admin/bai-dang/index.html']) {
    const html = await read(page);
    const refs = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="(\/[^"?#]+|\.\/[^"?#]+)"/g)].map((m) => m[1]);
    for (const ref of refs) {
      if (ref.startsWith('//') || /^https?:/.test(ref)) continue;
      const target = ref.startsWith('/') ? root + 'public' + ref : root + page.replace(/[^/]+$/, '') + ref.slice(2);
      await access(target).catch(() => assert.fail(`${page} tham chiếu tệp không tồn tại: ${ref}`));
    }
  }
});

test('Booking page loads its icon stylesheet with a Subresource Integrity hash', async () => {
  const html = await read('public/admin/booking/index.html');
  const link = html.match(/<link[^>]*tabler-icons[^>]*>/);
  assert.ok(link, 'thiếu thẻ link icon');
  assert.match(link[0], /integrity="sha384-[A-Za-z0-9+/=]+"/);
  assert.match(link[0], /crossorigin="anonymous"/);
  assert.match(link[0], /icons-webfont@3\.19\.0\/dist\/tabler-icons\.min\.css/, 'đường dẫn icon phải nằm trong thư mục dist');
});
