// babel-preset-expo (SDK 50+) reads tsconfig "paths", so the "@/*" alias and
// the "@mysupplier/shared" source mapping work without extra plugins.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["react-native-reanimated/plugin"],
  };
};
