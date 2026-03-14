/**
 * 检查所有 skill 目录下的 JSON 文件格式是否合法
 * 跨平台兼容（Linux / macOS / Windows）
 */
const fs = require('fs');
const path = require('path');

const skillsDir = path.join(process.cwd(), 'skills');
let failed = false;

function walkAndValidate(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkAndValidate(fullPath);
      continue;
    }
    if (!entry.name.endsWith('.json')) continue;

    try {
      JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
      console.log('  OK:', path.relative(process.cwd(), fullPath));
    } catch (err) {
      console.error('FAIL:', path.relative(process.cwd(), fullPath), '-', err.message);
      failed = true;
    }
  }
}

walkAndValidate(skillsDir);

if (failed) process.exit(1);
console.log('\n✅ JSON validation passed');
