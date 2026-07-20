import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: process.env.VITE_APP_BASE || '/',
    plugins: [react(), tailwindcss()],
    env: {
      VITE_USE_WS: "false",
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Ignore db.json so timer auto-saves do not trigger full page reloads in dev.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/db.json'],
      },
    },
  };
});
