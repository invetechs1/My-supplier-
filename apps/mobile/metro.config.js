// Metro config for a pnpm monorepo: watch the workspace root so the
// @mysupplier/shared package (raw .ts source) is bundled, and resolve
// node_modules from both the app and the monorepo root.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];
// pnpm uses symlinks; make sure Metro follows them.
config.resolver.unstable_enableSymlinks = true;
config.resolver.disableHierarchicalLookup = false;
config.resolver.sourceExts = Array.from(
  new Set([...(config.resolver.sourceExts || []), "ts", "tsx", "cjs", "mjs"]),
);

module.exports = config;
