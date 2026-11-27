// Chạy một file migration trong test, giống như chạy từng câu trong Console của D1.
// Bỏ qua dòng chú thích và lỗi "duplicate column" (cột đã có), đúng như hướng dẫn trong file.
import {readFile} from 'node:fs/promises';

export async function runMigration(db, relPath) {
  const sql = await readFile(new URL('../../' + relPath, import.meta.url), 'utf8');
  const statements = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) {
    try {
      await db.prepare(statement).run();
    } catch (e) {
      if (!/duplicate column/i.test(String(e?.message || e))) throw e;
    }
  }
}
