import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const rootEnvPath = path.resolve(import.meta.dirname, '.env');
  if (process.env.VITE_SUPABASE_ANON_KEY?.startsWith('sb_secret_') && fs.existsSync(rootEnvPath)) {
    dotenv.config({ path: rootEnvPath, override: true });
  }
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
        '@apps': path.resolve(import.meta.dirname, 'apps'),
        '@mercado-uige/shared': path.resolve(import.meta.dirname, 'packages/shared/src'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
