// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const threePackagePath = path.resolve(__dirname, 'node_modules/three');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Metro doesn't support package.json "exports" field, so we resolve
  // three.js subpath imports explicitly (matches react-native-webgpu example).

  // three and three/webgpu → WebGPU build
  if (moduleName === 'three' || moduleName === 'three/webgpu') {
    return {
      filePath: path.resolve(threePackagePath, 'build/three.webgpu.js'),
      type: 'sourceFile',
    };
  }

  // three/tsl → TSL node functions
  if (moduleName === 'three/tsl') {
    return {
      filePath: path.resolve(threePackagePath, 'build/three.tsl.js'),
      type: 'sourceFile',
    };
  }

  // three/addons/* → examples/jsm/*
  if (moduleName.startsWith('three/addons/')) {
    return {
      filePath: path.resolve(
        threePackagePath,
        'examples/jsm/' + moduleName.replace('three/addons/', '') + '.js',
      ),
      type: 'sourceFile',
    };
  }

  // Use the standard react-three/fiber instead of the React Native version
  // since webgpu is giving us a more w3c spec-compliant runtime.
  if (platform !== 'web' && moduleName.startsWith('@react-three/fiber')) {
    return context.resolveRequest(
      {
        ...context,
        unstable_conditionNames: ['module'],
        mainFields: ['module'],
      },
      moduleName,
      platform,
    );
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
