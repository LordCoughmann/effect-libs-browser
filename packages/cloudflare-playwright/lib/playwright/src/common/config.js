import require$$0 from '../../package.json.js';
import fs from 'node:fs';
import os from 'node:os';
import path__default from 'node:path';
import { getPackageJsonPath, mergeObjects } from '../util.js';

const defaultTimeout = 3e4;
class FullConfigInternal {
  constructor(location, userConfig, configCLIOverrides, metadata) {
    this.projects = [];
    this.cliArgs = [];
    this.cliListOnly = false;
    this.preOnlyTestFilters = [];
    this.postShardTestFilters = [];
    this.defineConfigWasUsed = false;
    this.globalSetups = [];
    this.globalTeardowns = [];
    if (configCLIOverrides.projects && userConfig.projects)
      throw new Error(`Cannot use --browser option when configuration file defines projects. Specify browserName in the projects instead.`);
    const { resolvedConfigFile, configDir } = location;
    const packageJsonPath = getPackageJsonPath(configDir);
    const packageJsonDir = packageJsonPath ? path__default.dirname(packageJsonPath) : process.cwd();
    this.configDir = configDir;
    this.configCLIOverrides = configCLIOverrides;
    const privateConfiguration = userConfig["@playwright/test"];
    this.plugins = (privateConfiguration?.plugins || []).map((p) => ({ factory: p }));
    this.singleTSConfigPath = pathResolve(configDir, userConfig.tsconfig);
    this.captureGitInfo = userConfig.captureGitInfo;
    this.failOnFlakyTests = takeFirst(configCLIOverrides.failOnFlakyTests, userConfig.failOnFlakyTests, false);
    this.globalSetups = (Array.isArray(userConfig.globalSetup) ? userConfig.globalSetup : [userConfig.globalSetup]).map((s) => resolveScript(s, configDir)).filter((script) => script !== void 0);
    this.globalTeardowns = (Array.isArray(userConfig.globalTeardown) ? userConfig.globalTeardown : [userConfig.globalTeardown]).map((s) => resolveScript(s, configDir)).filter((script) => script !== void 0);
    userConfig.metadata = userConfig.metadata || {};
    const globalTags = Array.isArray(userConfig.tag) ? userConfig.tag : userConfig.tag ? [userConfig.tag] : [];
    for (const tag of globalTags) {
      if (tag[0] !== "@")
        throw new Error(`Tag must start with "@" symbol, got "${tag}" instead.`);
    }
    this.config = {
      configFile: resolvedConfigFile,
      rootDir: pathResolve(configDir, userConfig.testDir) || configDir,
      forbidOnly: takeFirst(configCLIOverrides.forbidOnly, userConfig.forbidOnly, false),
      fullyParallel: takeFirst(configCLIOverrides.fullyParallel, userConfig.fullyParallel, false),
      globalSetup: this.globalSetups[0] ?? null,
      globalTeardown: this.globalTeardowns[0] ?? null,
      globalTimeout: takeFirst(configCLIOverrides.debug ? 0 : void 0, configCLIOverrides.globalTimeout, userConfig.globalTimeout, 0),
      grep: takeFirst(userConfig.grep, defaultGrep),
      grepInvert: takeFirst(userConfig.grepInvert, null),
      maxFailures: takeFirst(configCLIOverrides.debug ? 1 : void 0, configCLIOverrides.maxFailures, userConfig.maxFailures, 0),
      metadata: metadata ?? userConfig.metadata,
      preserveOutput: takeFirst(userConfig.preserveOutput, "always"),
      projects: [],
      quiet: takeFirst(configCLIOverrides.quiet, userConfig.quiet, false),
      reporter: takeFirst(configCLIOverrides.reporter, resolveReporters(userConfig.reporter, configDir), [[defaultReporter]]),
      reportSlowTests: takeFirst(userConfig.reportSlowTests, {
        max: 5,
        threshold: 3e5
        /* 5 minutes */
      }),
      // @ts-expect-error runAgents is hidden
      runAgents: takeFirst(configCLIOverrides.runAgents, "none"),
      shard: takeFirst(configCLIOverrides.shard, userConfig.shard, null),
      tags: globalTags,
      updateSnapshots: takeFirst(configCLIOverrides.updateSnapshots, userConfig.updateSnapshots, "missing"),
      updateSourceMethod: takeFirst(configCLIOverrides.updateSourceMethod, userConfig.updateSourceMethod, "patch"),
      version: require$$0.version,
      workers: resolveWorkers(takeFirst(configCLIOverrides.debug || configCLIOverrides.pause ? 1 : void 0, configCLIOverrides.workers, userConfig.workers, "50%")),
      webServer: null
    };
    for (const key in userConfig) {
      if (key.startsWith("@"))
        this.config[key] = userConfig[key];
    }
    this.config[configInternalSymbol] = this;
    const webServers = takeFirst(userConfig.webServer, null);
    if (Array.isArray(webServers)) {
      this.config.webServer = null;
      this.webServers = webServers;
    } else if (webServers) {
      this.config.webServer = webServers;
      this.webServers = [webServers];
    } else {
      this.webServers = [];
    }
    const projectConfigs = configCLIOverrides.projects || userConfig.projects || [{ ...userConfig, workers: void 0 }];
    this.projects = projectConfigs.map((p) => new FullProjectInternal(configDir, userConfig, this, p, this.configCLIOverrides, packageJsonDir));
    resolveProjectDependencies(this.projects);
    this._assignUniqueProjectIds(this.projects);
    this.config.projects = this.projects.map((p) => p.project);
  }
  _assignUniqueProjectIds(projects) {
    const usedNames = /* @__PURE__ */ new Set();
    for (const p of projects) {
      const name = p.project.name || "";
      for (let i = 0; i < projects.length; ++i) {
        const candidate = name + (i ? i : "");
        if (usedNames.has(candidate))
          continue;
        p.id = candidate;
        p.project.__projectId = p.id;
        usedNames.add(candidate);
        break;
      }
    }
  }
}
class FullProjectInternal {
  constructor(configDir, config, fullConfig, projectConfig, configCLIOverrides, packageJsonDir) {
    this.id = "";
    this.deps = [];
    this.fullConfig = fullConfig;
    const testDir = takeFirst(pathResolve(configDir, projectConfig.testDir), pathResolve(configDir, config.testDir), fullConfig.configDir);
    this.snapshotPathTemplate = takeFirst(projectConfig.snapshotPathTemplate, config.snapshotPathTemplate);
    this.project = {
      grep: takeFirst(projectConfig.grep, config.grep, defaultGrep),
      grepInvert: takeFirst(projectConfig.grepInvert, config.grepInvert, null),
      outputDir: takeFirst(configCLIOverrides.outputDir, pathResolve(configDir, projectConfig.outputDir), pathResolve(configDir, config.outputDir), path__default.join(packageJsonDir, "test-results")),
      // Note: we either apply the cli override for repeatEach or not, depending on whether the
      // project is top-level vs dependency. See collectProjectsAndTestFiles in loadUtils.
      repeatEach: takeFirst(projectConfig.repeatEach, config.repeatEach, 1),
      retries: takeFirst(configCLIOverrides.retries, projectConfig.retries, config.retries, 0),
      metadata: takeFirst(projectConfig.metadata, config.metadata, {}),
      name: takeFirst(projectConfig.name, config.name, ""),
      testDir,
      snapshotDir: takeFirst(pathResolve(configDir, projectConfig.snapshotDir), pathResolve(configDir, config.snapshotDir), testDir),
      testIgnore: takeFirst(projectConfig.testIgnore, config.testIgnore, []),
      testMatch: takeFirst(projectConfig.testMatch, config.testMatch, "**/*.@(spec|test).?(c|m)[jt]s?(x)"),
      timeout: takeFirst(configCLIOverrides.debug ? 0 : void 0, configCLIOverrides.timeout, projectConfig.timeout, config.timeout, defaultTimeout),
      use: mergeObjects(config.use, projectConfig.use, configCLIOverrides.use),
      dependencies: projectConfig.dependencies || [],
      teardown: projectConfig.teardown
    };
    this.fullyParallel = takeFirst(configCLIOverrides.fullyParallel, projectConfig.fullyParallel, config.fullyParallel, void 0);
    this.expect = takeFirst(projectConfig.expect, config.expect, {});
    if (this.expect.toHaveScreenshot?.stylePath) {
      const stylePaths = Array.isArray(this.expect.toHaveScreenshot.stylePath) ? this.expect.toHaveScreenshot.stylePath : [this.expect.toHaveScreenshot.stylePath];
      this.expect.toHaveScreenshot.stylePath = stylePaths.map((stylePath) => path__default.resolve(configDir, stylePath));
    }
    this.respectGitIgnore = takeFirst(projectConfig.respectGitIgnore, config.respectGitIgnore, !projectConfig.testDir && !config.testDir);
    this.ignoreSnapshots = takeFirst(configCLIOverrides.ignoreSnapshots, projectConfig.ignoreSnapshots, config.ignoreSnapshots, false);
    this.workers = projectConfig.workers ? resolveWorkers(projectConfig.workers) : void 0;
    if (configCLIOverrides.debug && this.workers)
      this.workers = 1;
  }
}
function takeFirst(...args) {
  for (const arg of args) {
    if (arg !== void 0)
      return arg;
  }
  return void 0;
}
function pathResolve(baseDir, relative) {
  if (!relative)
    return void 0;
  return path__default.resolve(baseDir, relative);
}
function resolveReporters(reporters, rootDir) {
  return toReporters(reporters)?.map(([id, arg]) => {
    if (builtInReporters.includes(id))
      return [id, arg];
    return [require.resolve(id, { paths: [rootDir] }), arg];
  });
}
function resolveWorkers(workers) {
  if (typeof workers === "string") {
    if (workers.endsWith("%")) {
      const cpus = os.cpus().length;
      return Math.max(1, Math.floor(cpus * (parseInt(workers, 10) / 100)));
    }
    const parsedWorkers = parseInt(workers, 10);
    if (isNaN(parsedWorkers))
      throw new Error(`Workers ${workers} must be a number or percentage.`);
    return parsedWorkers;
  }
  return workers;
}
function resolveProjectDependencies(projects) {
  const teardownSet = /* @__PURE__ */ new Set();
  for (const project of projects) {
    for (const dependencyName of project.project.dependencies) {
      const dependencies = projects.filter((p) => p.project.name === dependencyName);
      if (!dependencies.length)
        throw new Error(`Project '${project.project.name}' depends on unknown project '${dependencyName}'`);
      if (dependencies.length > 1)
        throw new Error(`Project dependencies should have unique names, reading ${dependencyName}`);
      project.deps.push(...dependencies);
    }
    if (project.project.teardown) {
      const teardowns = projects.filter((p) => p.project.name === project.project.teardown);
      if (!teardowns.length)
        throw new Error(`Project '${project.project.name}' has unknown teardown project '${project.project.teardown}'`);
      if (teardowns.length > 1)
        throw new Error(`Project teardowns should have unique names, reading ${project.project.teardown}`);
      const teardown = teardowns[0];
      project.teardown = teardown;
      teardownSet.add(teardown);
    }
  }
  for (const teardown of teardownSet) {
    if (teardown.deps.length)
      throw new Error(`Teardown project ${teardown.project.name} must not have dependencies`);
  }
  for (const project of projects) {
    for (const dep of project.deps) {
      if (teardownSet.has(dep))
        throw new Error(`Project ${project.project.name} must not depend on a teardown project ${dep.project.name}`);
    }
  }
}
function toReporters(reporters) {
  if (!reporters)
    return;
  if (typeof reporters === "string")
    return [[reporters]];
  return reporters;
}
const builtInReporters = ["list", "line", "dot", "json", "junit", "null", "github", "html", "blob"];
function resolveScript(id, rootDir) {
  if (!id)
    return void 0;
  const localPath = path__default.resolve(rootDir, id);
  if (fs.existsSync(localPath))
    return localPath;
  return require.resolve(id, { paths: [rootDir] });
}
const defaultGrep = /.*/;
const defaultReporter = process.env.CI ? "dot" : "list";
const configInternalSymbol = Symbol("configInternalSymbol");

export { FullConfigInternal, FullProjectInternal, builtInReporters, defaultGrep, defaultReporter, defaultTimeout, takeFirst, toReporters };
