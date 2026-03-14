/**
 * 检查所有 skill 的 SKILL.md 文档完整性：
 *   1. SKILL.md 是否存在
 *   2. frontmatter 是否存在（以 --- 开头）
 *   3. 是否有章节（## 标题）
 *   4. Markdown 链接引用的 .md 文件是否真实存在
 *   5. 反引号路径引用的 .md 文件是否真实存在
 *
 * 跨平台兼容（Linux / macOS / Windows）
 */
const fs = require('fs');
const path = require('path');

const skillsDir = path.join(process.cwd(), 'skills');
const errors = [];

// shared 是公共资源目录，不是 skill，跳过
const SKIP_DIRS = new Set(['shared']);

const skillDirs = fs.readdirSync(skillsDir).filter(name => {
  const fullPath = path.join(skillsDir, name);
  return fs.statSync(fullPath).isDirectory() && !SKIP_DIRS.has(name);
});

/**
 * 判断路径是否应跳过检查：
 * - 外部链接（http/https）
 * - 占位符路径（含 < >，如 prd/<项目名>.md）
 * - 纯文件名（不含路径分隔符，如正文描述中的 README.md）
 */
function shouldSkipPath(refPath) {
  if (refPath.startsWith('http')) return true;
  if (refPath.includes('<') || refPath.includes('>')) return true;
  if (!refPath.includes('/') && !refPath.includes('\\')) return true;
  return false;
}

for (const skillName of skillDirs) {
  const skillDir = path.join(skillsDir, skillName);
  const skillMdPath = path.join(skillDir, 'SKILL.md');

  if (!fs.existsSync(skillMdPath)) {
    errors.push(`[${skillName}] 缺少 SKILL.md`);
    continue;
  }

  const content = fs.readFileSync(skillMdPath, 'utf-8');

  if (!content.startsWith('---')) {
    errors.push(`[${skillName}] SKILL.md 缺少 frontmatter`);
  }

  if (!content.includes('## ')) {
    errors.push(`[${skillName}] SKILL.md 没有任何章节（## 标题）`);
  }

  // 检查 Markdown 链接引用：[text](path.md)
  const linkPattern = /\[.*?\]\(([^)]+\.md)\)/g;
  let match;
  while ((match = linkPattern.exec(content)) !== null) {
    const refPath = match[1];
    if (shouldSkipPath(refPath)) continue;
    const absPath = path.resolve(skillDir, refPath);
    if (!fs.existsSync(absPath)) {
      errors.push(`[${skillName}] 引用了不存在的文件：${refPath}`);
    }
  }

  // 检查反引号路径引用：`path/to/file.md`
  const backtickPattern = /`([^`]*\.md)`/g;
  while ((match = backtickPattern.exec(content)) !== null) {
    const refPath = match[1];
    if (shouldSkipPath(refPath)) continue;
    const absPath = path.resolve(skillDir, refPath);
    if (!fs.existsSync(absPath)) {
      errors.push(`[${skillName}] 引用了不存在的路径：${refPath}`);
    }
  }

  console.log(`✅ ${skillName}`);
}

if (errors.length > 0) {
  console.error('\n以下 SKILL.md 存在问题：');
  errors.forEach(e => console.error('❌', e));
  process.exit(1);
}

console.log(`\n✅ 所有 ${skillDirs.length} 个 skill 的 SKILL.md 检查通过`);
