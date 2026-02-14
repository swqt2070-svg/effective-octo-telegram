const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const defaultConfig = getDefaultConfig(__dirname);
const config = {
  resolver: {
    extraNodeModules: {
      crypto: require.resolve('react-native-quick-crypto'),
      fs: require.resolve('./src/shims/fs'),
      'libsignal-protocol': require.resolve('libsignal-protocol/dist/libsignal-protocol.js'),
      'mocha-bytebuffer': require.resolve('bytebuffer'),
      path: require.resolve('path-browserify'),
      stream: require.resolve('stream-browserify'),
      buffer: require.resolve('buffer'),
      process: require.resolve('process'),
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);
