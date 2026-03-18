/**
 * 检查所有 skill 脚本的 JavaScript 语法
 * 跨平台兼容（Linux / macOS / Windows）
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const skillsDir = path.join(process.cwd(), 'skills');
let failed = false;

const skillNames = fs.readdirSync(skillsDir).filter(name => {
  return fs.statSync(path.join(skillsDir, name)).isDirectory();
});

for (const skillName of skillNames) {
  const scriptsDir = path.join(skillsDir, skillName, 'scripts');
  if (!fs.existsSync(scriptsDir)) continue;

  const files = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const filePath = path.join(scriptsDir, file);
    const result = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf-8' });
    if (result.status !== 0) {
      console.error('FAIL:', path.relative(process.cwd(), filePath));
      console.error(result.stderr);
      failed = true;
    } else {
      console.log('  OK:', path.relative(process.cwd(), filePath));
    }
  }
}

if (failed) process.exit(1);
console.log('\n✅ JS syntax check passed');
