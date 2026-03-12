#!/usr/bin/env node

const { parseArgs, importApp } = require("./app-import-lib");

async function main() {
  try {
    const options = parseArgs(process.argv);
    const result = await importApp(options);
    console.log(JSON.stringify({
      success: true,
      appType: result.appModel.appType,
      appName: result.appModel.appName,
      corpId: result.appModel.corpId,
      pagesCount: result.appModel.pages.length,
      prdPath: result.prdPath,
      schemaCachePath: result.cachePath
    }, null, 2));
  } catch (error) {
    console.error("导入失败: " + error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
