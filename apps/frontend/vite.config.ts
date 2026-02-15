import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@flash-sale/shared': path.resolve(__dirname, '../../packages/shared/src'),
      },
    },
    server: {
      port: Number(env.DEV_PORT || 5173),
      proxy: {
        '/api': {
          target: env.API_PROXY_TARGET || 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  };
});
