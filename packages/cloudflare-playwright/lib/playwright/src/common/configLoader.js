import fs from 'node:fs';
import path__default from 'node:path';
import { isRegExp } from '../../../playwright-core/src/utils/isomorphic/rtti.js';
import '../../../_virtual/pixelmatch.js';
import '../../../playwright-core/src/utilsBundle.js';
import 'node:crypto';
import '../../../playwright-core/src/server/utils/debug.js';
import '../../../playwright-core/src/server/utils/debugLogger.js';
import '../../../playwright-core/src/server/utils/expectUtils.js';
import '../../../playwright-core/src/zipBundle.js';
import '../../../playwright-core/src/server/utils/hostPlatform.js';
import 'node:http';
import 'node:http2';
import 'node:https';
import '../../../playwright-core/src/server/utils/happyEyeballs.js';
import '../../../playwright-core/src/server/utils/nodePlatform.js';
import '../../../playwright-core/src/server/utils/profiler.js';
import '../../../playwright-core/src/server/utils/socksProxy.js';
import 'node:os';
import '../../../playwright-core/src/server/utils/zones.js';
import { setSingleTSConfig, requireOrImport } from '../../../mocks/transform.js';
import { fileIsModule, errorWithFile } from '../util.js';
import { FullConfigInternal } from './config.js';
import { configureESMLoader, configureESMLoaderTransformConfig } from '../../../mocks/esmLoaderHost.js';
import { addToCompilationCache } from '../../../mocks/compilationCache.js';

const kDefineConfigWasUsed = Symbol("defineConfigWasUsed");
async function deserializeConfig(data) {
  if (data.compilationCache)
    addToCompilationCache(data.compilationCache);
  return await loadConfig(data.location, data.configCLIOverrides, void 0, data.metadata ? JSON.parse(data.metadata) : void 0);
}
async function loadUserConfig(location) {
  let object = location.resolvedConfigFile ? await requireOrImport(location.resolvedConfigFile) : {};
  if (object && typeof object === "object" && "default" in object)
    object = object["default"];
  return object;
}
async function loadConfig(location, overrides, ignoreProjectDependencies = false, metadata) {
  {
    if (location.resolvedConfigFile && fileIsModule(location.resolvedConfigFile))
      throw errorWithFile(location.resolvedConfigFile, `Playwright requires Node.js 18.19 or higher to load esm modules. Please update your version of Node.js.`);
  }
  setSingleTSConfig(overrides?.tsconfig);
  await configureESMLoader();
  const userConfig = await loadUserConfig(location);
  validateConfig(location.resolvedConfigFile || "<default config>", userConfig);
  const fullConfig = new FullConfigInternal(location, userConfig, overrides || {}, metadata);
  fullConfig.defineConfigWasUsed = !!userConfig[kDefineConfigWasUsed];
  if (ignoreProjectDependencies) {
    for (const project of fullConfig.projects) {
      project.deps = [];
      project.teardown = void 0;
    }
  }
  userConfig["@playwright/test"]?.babelPlugins || [];
  userConfig.build?.external || [];
  if (!overrides?.tsconfig)
    setSingleTSConfig(fullConfig?.singleTSConfigPath);
  await configureESMLoaderTransformConfig();
  return fullConfig;
}
function validateConfig(file, config) {
  if (typeof config !== "object" || !config)
    throw errorWithFile(file, `Configuration file must export a single object`);
  validateProject(file, config, "config");
  if ("forbidOnly" in config && config.forbidOnly !== void 0) {
    if (typeof config.forbidOnly !== "boolean")
      throw errorWithFile(file, `config.forbidOnly must be a boolean`);
  }
  if ("globalSetup" in config && config.globalSetup !== void 0) {
    if (Array.isArray(config.globalSetup)) {
      config.globalSetup.forEach((item, index) => {
        if (typeof item !== "string")
          throw errorWithFile(file, `config.globalSetup[${index}] must be a string`);
      });
    } else if (typeof config.globalSetup !== "string") {
      throw errorWithFile(file, `config.globalSetup must be a string`);
    }
  }
  if ("globalTeardown" in config && config.globalTeardown !== void 0) {
    if (Array.isArray(config.globalTeardown)) {
      config.globalTeardown.forEach((item, index) => {
        if (typeof item !== "string")
          throw errorWithFile(file, `config.globalTeardown[${index}] must be a string`);
      });
    } else if (typeof config.globalTeardown !== "string") {
      throw errorWithFile(file, `config.globalTeardown must be a string`);
    }
  }
  if ("globalTimeout" in config && config.globalTimeout !== void 0) {
    if (typeof config.globalTimeout !== "number" || config.globalTimeout < 0)
      throw errorWithFile(file, `config.globalTimeout must be a non-negative number`);
  }
  if ("grep" in config && config.grep !== void 0) {
    if (Array.isArray(config.grep)) {
      config.grep.forEach((item, index) => {
        if (!isRegExp(item))
          throw errorWithFile(file, `config.grep[${index}] must be a RegExp`);
      });
    } else if (!isRegExp(config.grep)) {
      throw errorWithFile(file, `config.grep must be a RegExp`);
    }
  }
  if ("grepInvert" in config && config.grepInvert !== void 0) {
    if (Array.isArray(config.grepInvert)) {
      config.grepInvert.forEach((item, index) => {
        if (!isRegExp(item))
          throw errorWithFile(file, `config.grepInvert[${index}] must be a RegExp`);
      });
    } else if (!isRegExp(config.grepInvert)) {
      throw errorWithFile(file, `config.grepInvert must be a RegExp`);
    }
  }
  if ("maxFailures" in config && config.maxFailures !== void 0) {
    if (typeof config.maxFailures !== "number" || config.maxFailures < 0)
      throw errorWithFile(file, `config.maxFailures must be a non-negative number`);
  }
  if ("preserveOutput" in config && config.preserveOutput !== void 0) {
    if (typeof config.preserveOutput !== "string" || !["always", "never", "failures-only"].includes(config.preserveOutput))
      throw errorWithFile(file, `config.preserveOutput must be one of "always", "never" or "failures-only"`);
  }
  if ("projects" in config && config.projects !== void 0) {
    if (!Array.isArray(config.projects))
      throw errorWithFile(file, `config.projects must be an array`);
    config.projects.forEach((project, index) => {
      validateProject(file, project, `config.projects[${index}]`);
    });
  }
  if ("quiet" in config && config.quiet !== void 0) {
    if (typeof config.quiet !== "boolean")
      throw errorWithFile(file, `config.quiet must be a boolean`);
  }
  if ("reporter" in config && config.reporter !== void 0) {
    if (Array.isArray(config.reporter)) {
      config.reporter.forEach((item, index) => {
        if (!Array.isArray(item) || item.length <= 0 || item.length > 2 || typeof item[0] !== "string")
          throw errorWithFile(file, `config.reporter[${index}] must be a tuple [name, optionalArgument]`);
      });
    } else if (typeof config.reporter !== "string") {
      throw errorWithFile(file, `config.reporter must be a string`);
    }
  }
  if ("reportSlowTests" in config && config.reportSlowTests !== void 0 && config.reportSlowTests !== null) {
    if (!config.reportSlowTests || typeof config.reportSlowTests !== "object")
      throw errorWithFile(file, `config.reportSlowTests must be an object`);
    if (!("max" in config.reportSlowTests) || typeof config.reportSlowTests.max !== "number" || config.reportSlowTests.max < 0)
      throw errorWithFile(file, `config.reportSlowTests.max must be a non-negative number`);
    if (!("threshold" in config.reportSlowTests) || typeof config.reportSlowTests.threshold !== "number" || config.reportSlowTests.threshold < 0)
      throw errorWithFile(file, `config.reportSlowTests.threshold must be a non-negative number`);
  }
  if ("shard" in config && config.shard !== void 0 && config.shard !== null) {
    if (!config.shard || typeof config.shard !== "object")
      throw errorWithFile(file, `config.shard must be an object`);
    if (!("total" in config.shard) || typeof config.shard.total !== "number" || config.shard.total < 1)
      throw errorWithFile(file, `config.shard.total must be a positive number`);
    if (!("current" in config.shard) || typeof config.shard.current !== "number" || config.shard.current < 1 || config.shard.current > config.shard.total)
      throw errorWithFile(file, `config.shard.current must be a positive number, not greater than config.shard.total`);
  }
  if ("updateSnapshots" in config && config.updateSnapshots !== void 0) {
    if (typeof config.updateSnapshots !== "string" || !["all", "changed", "missing", "none"].includes(config.updateSnapshots))
      throw errorWithFile(file, `config.updateSnapshots must be one of "all", "changed", "missing" or "none"`);
  }
  if ("tsconfig" in config && config.tsconfig !== void 0) {
    if (typeof config.tsconfig !== "string")
      throw errorWithFile(file, `config.tsconfig must be a string`);
    if (!fs.existsSync(path__default.resolve(file, "..", config.tsconfig)))
      throw errorWithFile(file, `config.tsconfig does not exist`);
  }
}
function validateProject(file, project, title) {
  if (typeof project !== "object" || !project)
    throw errorWithFile(file, `${title} must be an object`);
  if ("name" in project && project.name !== void 0) {
    if (typeof project.name !== "string")
      throw errorWithFile(file, `${title}.name must be a string`);
  }
  if ("outputDir" in project && project.outputDir !== void 0) {
    if (typeof project.outputDir !== "string")
      throw errorWithFile(file, `${title}.outputDir must be a string`);
  }
  if ("repeatEach" in project && project.repeatEach !== void 0) {
    if (typeof project.repeatEach !== "number" || project.repeatEach < 0)
      throw errorWithFile(file, `${title}.repeatEach must be a non-negative number`);
  }
  if ("retries" in project && project.retries !== void 0) {
    if (typeof project.retries !== "number" || project.retries < 0)
      throw errorWithFile(file, `${title}.retries must be a non-negative number`);
  }
  if ("testDir" in project && project.testDir !== void 0) {
    if (typeof project.testDir !== "string")
      throw errorWithFile(file, `${title}.testDir must be a string`);
  }
  for (const prop of ["testIgnore", "testMatch"]) {
    if (prop in project && project[prop] !== void 0) {
      const value = project[prop];
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (typeof item !== "string" && !isRegExp(item))
            throw errorWithFile(file, `${title}.${prop}[${index}] must be a string or a RegExp`);
        });
      } else if (typeof value !== "string" && !isRegExp(value)) {
        throw errorWithFile(file, `${title}.${prop} must be a string or a RegExp`);
      }
    }
  }
  if ("timeout" in project && project.timeout !== void 0) {
    if (typeof project.timeout !== "number" || project.timeout < 0)
      throw errorWithFile(file, `${title}.timeout must be a non-negative number`);
  }
  if ("use" in project && project.use !== void 0) {
    if (!project.use || typeof project.use !== "object")
      throw errorWithFile(file, `${title}.use must be an object`);
  }
  if ("ignoreSnapshots" in project && project.ignoreSnapshots !== void 0) {
    if (typeof project.ignoreSnapshots !== "boolean")
      throw errorWithFile(file, `${title}.ignoreSnapshots must be a boolean`);
  }
  if ("workers" in project && project.workers !== void 0) {
    if (typeof project.workers === "number" && project.workers <= 0)
      throw errorWithFile(file, `${title}.workers must be a positive number`);
    else if (typeof project.workers === "string" && !project.workers.endsWith("%"))
      throw errorWithFile(file, `${title}.workers must be a number or percentage`);
  }
}

export { deserializeConfig, loadConfig };
