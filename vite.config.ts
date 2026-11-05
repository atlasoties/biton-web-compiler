import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// In development the compile server (npm run server) listens on 8080 and
// Vite forwards /api to it, so the frontend can use same-origin URLs.
const API_TARGET = process.env.BITON_API_TARGET || 'http://127.0.0.1:8080';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // Never inline fonts as data: URLs: the CSP only allows fonts from 'self'.
      assetsInlineLimit: (file: string) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
      rollupOptions: {
        output: {
          // Vendor code changes rarely; separate chunks stay cached across deploys.
          manualChunks(id: string) {
            if (/node_modules\/(@codemirror|@lezer|crelt|style-mod|w3c-keyname)\//.test(id)) return "codemirror";
            if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react";
            if (id.includes("node_modules/lucide-react/")) return "icons";
          },
        },
      },
    },
    server: {
      proxy: {
        // Keep the browser's Host header (the string shorthand would rewrite
        // it): in development the API derives its own origin from Host, and
        // checks that sign-in and compile requests come from that origin.
        '/api': { target: API_TARGET, changeOrigin: false },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
