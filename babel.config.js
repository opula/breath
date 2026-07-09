module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // three >= 0.183 ships static class blocks in three.core.js; the
      // hermes-stable transform profile doesn't lower them by default.
      '@babel/plugin-transform-class-static-block',
      'unplugin-typegpu/babel',
      'react-native-reanimated/plugin',
    ],
  };
};
