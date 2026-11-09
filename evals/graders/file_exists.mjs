// grader: file_exists —— 断言某个产物/前置文件是否存在。
// 用途（M1）：验证前端构建产物已生成（契约 §7.4「前端构建通过」的确定性证据）；
// 用途（M2+）：文档处理类 case 的产物断言（报告、导出文件）。
//
// spec: { type:'file_exists', path, exists?, root? }
//   path  : 绝对路径，或相对 root（默认仓库根，即 evals/ 的上一级）
//   exists: 默认 true；false 表示"必须不存在"
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const type = 'file_exists';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..'); // evals/graders -> 仓库根

export async function grade(_ctx, spec) {
  if (!spec.path) return { pass: false, detail: 'file_exists: 缺少 path' };
  const root = spec.root ? path.resolve(spec.root) : DEFAULT_ROOT;
  const abs = path.isAbsolute(spec.path) ? spec.path : path.resolve(root, spec.path);
  const wantExists = spec.exists !== false;

  let stat = null;
  let err = null;
  try {
    stat = await fs.stat(abs);
  } catch (e) {
    err = e;
  }

  if (wantExists) {
    if (stat && stat.isFile()) {
      return { pass: true, detail: `file_exists: ${rel(abs, root)} 存在（${stat.size} B）` };
    }
    return {
      pass: false,
      detail: `file_exists: ${rel(abs, root)} 不存在${err && err.code !== 'ENOENT' ? `（${err.code}）` : ''}`,
    };
  }
  if (!stat) return { pass: true, detail: `file_exists: ${rel(abs, root)} 不存在（符合期望）` };
  return { pass: false, detail: `file_exists: ${rel(abs, root)} 意外存在（${stat.size} B）` };
}

function rel(abs, root) {
  const r = path.relative(root, abs);
  return r.startsWith('..') ? abs : r;
}
