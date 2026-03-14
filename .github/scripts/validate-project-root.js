const fs = require('fs');
const path = require('path');

function findProjectRoot(startDir) {
  let current = startDir;
  while (true) {
    const hasReadme = fs.existsSync(path.join(current, 'README.md'));
    const hasGit = fs.existsSync(path.join(current, '.git')) && fs.statSync(path.join(current, '.git')).isDirectory();
    const isSubmodule = current.endsWith('.claude/skills');

    if ((hasReadme || hasGit) && !isSubmodule) {
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

console.log(`find_project_root 返回: ${result}`);

const isYidaSkills = result.includes('/.claude/skills');
const isParentProject = !result.includes('/.claude/skills') && result.includes('/openyida');

if (isYidaSkills || isParentProject) {
  console.log(`✅ find_project_root 正确找到项目根目录`);
  if (isParentProject) {
    console.log(`   (被作为 submodule 引用时，正确向上找到了真实项目根目录)`);
  }
  process.exit(0);
} else {
  console.error(`❌ find_project_root 找到意外的根目录: ${result}`);
  console.error(`   应该返回 yida-skills 目录或其父项目目录`);
  process.exit(1);
}
