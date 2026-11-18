import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      'expo-constants': path.resolve(__dirname, './src/__tests__/__mocks__/expo-constants.ts'),
      'expo-haptics': path.resolve(__dirname, './src/__tests__/__mocks__/expo-haptics.ts'),
      'react-native': path.resolve(__dirname, './src/__tests__/__mocks__/react-native.ts'),
      'react-native-safe-area-context': path.resolve(
        __dirname,
        './src/__tests__/__mocks__/react-native-safe-area-context.ts'
      ),
      '@react-native-async-storage/async-storage': path.resolve(
        __dirname,
        './src/__tests__/__mocks__/async-storage.ts'
      ),
    },
  },
});
