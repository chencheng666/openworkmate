import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  publicDir: '../ui/public',
  server: {
    port: 5180,
    host: '127.0.0.1',
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.WORKMATE_API_TARGET ?? 'http://127.0.0.1:18790',
        changeOrigin: true,
      },
      '/admin': {
        target: 'http://127.0.0.1:5174',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
