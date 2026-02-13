const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withNativeFallbacks } = require('react-native-quick-crypto/metro');

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
      stream: require.resolve('stream-browserify'),
      buffer: require.resolve('buffer'),
      process: require.resolve('process'),
    },
  },
};

module.exports = mergeConfig(withNativeFallbacks(defaultConfig), config);
