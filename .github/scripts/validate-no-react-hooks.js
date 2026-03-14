const fs = require('fs');
const path = require('path');

const REACT_HOOKS = [
  'useState',
  'useEffect',
  'useContext',
  'useReducer',
  'useCallback',
  'useMemo',
  'useRef',
  'useImperativeHandle',
  'useLayoutEffect',
  'useDebugValue',
  'useDeferredValue',
  'useTransition',
  'useId',
  'useSyncExternalStore',
  'useInsertionEffect'
];

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const errors = [];

  for (const hook of REACT_HOOKS) {
    const patterns = [
      new RegExp(`\\b${hook}\\s*=`),
      new RegExp(`\\bReact\\.${hook}\\b`),
      new RegExp(`import\\s+\\{[^}]*\\b${hook}\\b[^}]*\\}\\s+from\\s+['"]react['"]`),
      new RegExp(`const\\s+\\{\\s*${hook}\\s*\\}\\s*=\\s*React`)
    ];

    for (const pattern of patterns) {
      if (pattern.test(content)) {
        errors.push(`${hook} (${path.basename(filePath)})`);
      }
    }
  }

  return errors;
}

function scanDirectory(dir, relativePath = '') {
  let allErrors = [];

  if (!fs.existsSync(dir)) {
    return allErrors;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.join(relativePath, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') {
        continue;
      }
      allErrors = allErrors.concat(scanDirectory(fullPath, relPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      allErrors = allErrors.concat(checkFile(fullPath));
    }
  }

  return allErrors;
}

const skillsDir = path.join(__dirname, '..', 'skills');
const errors = scanDirectory(skillsDir);

if (errors.length === 0) {
  console.log('✅ 未检测到 React Hooks 使用');
  process.exit(0);
} else {
  console.error('❌ 检测到禁止使用的 React Hooks:');
  errors.forEach(err => console.error(`   - ${err}`));
  console.error('\n宜搭自定义页面必须使用类组件模式，禁止使用 React Hooks');
  console.error('请参考 yida-custom-page skill 的开发规范');
  process.exit(1);
}
