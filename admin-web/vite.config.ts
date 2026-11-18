import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/admin/',
  publicDir: '../ui/public',
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.WORKMATE_API_TARGET ?? 'http://127.0.0.1:18790',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
