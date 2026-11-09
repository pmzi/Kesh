const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const protocol = path.resolve(__dirname, '../../packages/protocol/src');

/** @type {import('@react-native/metro-config').MetroConfig} */
const config = {
  watchFolders: [protocol],
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
