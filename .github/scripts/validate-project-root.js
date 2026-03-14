const fs = require('fs');
const path = require('path');

function findProjectRoot(startDir) {
  let current = startDir;
  while (true) {
    const hasReadme = fs.existsSync(path.join(current, 'README.md'));
    const hasGit = fs.existsSync(path.join(current, '.git')) && fs.statSync(path.join(current, '.git')).isDirectory();

    if (hasReadme || hasGit) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}

const scriptDir = path.join(__dirname, 'skills', 'yida-login', 'scripts');
const result = findProjectRoot(scriptDir);

const yidaSkillsRoot = path.resolve(__dirname, '..', '..');

if (result === yidaSkillsRoot) {
  console.log(`✅ find_project_root 正确找到项目根目录: ${result}`);
  process.exit(0);
} else {
  console.error(`❌ find_project_root 找到错误的根目录: ${result}`);
  console.error(`   预期: ${yidaSkillsRoot}`);
  process.exit(1);
}
