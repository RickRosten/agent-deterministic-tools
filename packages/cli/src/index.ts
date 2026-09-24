export { run, type RunOptions } from './cli.js';
export { BUILTIN_MODULES, BUILTIN_MODULE_IDS } from './builtins.js';
export { ConfigSchema, ConfigError, configJsonSchema, CONFIG_SCHEMA_URL, loadConfig, saveConfig, defaultConfig, type Config, type HttpConfig } from './config.js';
export { buildRegistry, type BuiltRegistry, type ModuleSource } from './registry.js';
export { loadPlugin, modulesFromExports, resolvePackage, PluginError, type LoadedPlugin } from './plugins.js';
export { runDoctor, doctorExitCode, type Check, type CheckStatus } from './doctor.js';
export {
  installIntegration,
  uninstallIntegration,
  integrationStatus,
  serverEntry,
  configSnippet,
  cursorDeeplink,
  claudeCodeCommand,
  INTEGRATIONS,
  type Integration,
  type ServerEntry,
} from './integrations.js';
export {
  processEnvironment,
  configDir,
  defaultConfigPath,
  claudeDesktopConfigPath,
  cursorConfigPath,
  type CliEnvironment,
} from './environment.js';
export { runSetup, type SetupPrompts } from './setup.js';
export { VERSION } from './version.js';
