/**
 * framework-root.mjs — 框架正文的位置解析。
 *
 * 2026-11-27 起框架正文迁至独立仓 moxian-framework，本仓不再保存条文。
 * 解析顺序：
 *   1. 环境变量 SIMO_FRAMEWORK_ROOT：指向框架仓根目录（其下有 docs/framework/）；
 *   2. 本仓 docs/framework/ 若仍有实体正文（目录里除 README.md 外还有文件），用于自检夹具；
 *   3. 同级目录 ../moxian-framework 与子目录 ./moxian-framework，取先有 MOXIAN.md 的一个。
 * 都找不到时返回 ../moxian-framework/docs/framework，由调用方按文件缺失报错。
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

function hasLocalText(dir) {
  if (!existsSync(dir)) return false;
  try {
    return readdirSync(dir).some((name) => name !== 'README.md');
  } catch {
    return false;
  }
}

export function frameworkDir(root) {
  const env = (process.env.SIMO_FRAMEWORK_ROOT ?? '').trim();
  if (env) return join(resolve(env), 'docs', 'framework');

  const local = join(root, 'docs', 'framework');
  if (hasLocalText(local)) return local;

  for (const base of [join(root, '..', 'moxian-framework'), join(root, 'moxian-framework')]) {
    if (existsSync(join(base, 'docs', 'framework', 'MOXIAN.md'))) return join(base, 'docs', 'framework');
  }
  return join(root, '..', 'moxian-framework', 'docs', 'framework');
}
