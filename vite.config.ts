import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'packages/ui',
  plugins: [react()],
  build: { target: 'chrome94', outDir: '../../.build/ui', emptyOutDir: true },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
