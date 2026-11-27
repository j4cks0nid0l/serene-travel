// Kiểm tra cú pháp mọi file JavaScript của dự án (không gồm thư viện bên thứ ba trong public/vendor).
// Chạy: node scripts/check.mjs. CI chạy lệnh này trước khi chạy test.
import {execFileSync} from 'node:child_process';
import {readdirSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const SKIP = new Set(['.git', 'node_modules', '.wrangler', 'vendor']);

function* files(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* files(full);
    else if (/\.(m?js)$/.test(name)) yield full;
  }
}

let failed = 0;
let count = 0;
for (const file of files(root)) {
  count++;
  try {
    execFileSync(process.execPath, ['--check', file], {stdio: 'pipe'});
  } catch (e) {
    failed++;
    console.error('LỖI CÚ PHÁP: ' + relative(root, file) + '\n' + String(e.stderr || e.message));
  }
}
console.log(`Đã kiểm tra ${count} file JavaScript, lỗi: ${failed}`);
process.exit(failed ? 1 : 0);
