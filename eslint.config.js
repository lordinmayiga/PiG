// https://docs.expo.dev/guides/using-eslint/
const expoConfig = require('eslint-config-expo/flat');
const { defineConfig } = require('eslint/config');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // react-hooks/immutability (from React Compiler, via eslint-config-expo) flags
    // Reanimated's `sharedValue.value = ...` writes as illegal state mutation. That's
    // a false positive: mutating `.value` on a SharedValue is the correct, intentional
    // way to drive a Reanimated animation, not a React state violation. PiG uses
    // Reanimated throughout for motion (see the pig-motion skill), so this is disabled
    // project-wide rather than suppressed file-by-file.
    rules: {
      'react-hooks/immutability': 'off',
    },
  },
]);
