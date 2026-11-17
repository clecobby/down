import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({
  root: __dirname,
  plugins: [react(), { name: 'mock-api', enforce: 'pre', resolveId(id, importer) { if (id === '../api.js' && importer?.includes('/pages/')) return path.join(__dirname, 'mock-api.js'); } }],
  server: { port: 5199 },
});
