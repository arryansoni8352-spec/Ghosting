/// <reference types="vitest" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages cannot send a Content-Security-Policy header, so the production build
// carries it in a <meta> tag. It is injected at build time only: the dev server needs
// inline scripts and a websocket for hot reload, which this policy would block.
// connect-src is 'none' unless VITE_SHIELD_API_URL is set. When AI Shield is configured, connect-src
// allows exactly that one origin and nothing else, so the local-first tools still cannot reach anywhere.
const buildCsp = (shieldOrigin: string | null): string => [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  `connect-src ${shieldOrigin ?? "'none'"}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const injectCsp = (csp: string): Plugin => ({
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler(html) {
      const tag = `<meta http-equiv="Content-Security-Policy" content="${csp}" />`;
      return html.replace(/(<meta\s+charset[^>]*>)/i, `$1\n    ${tag}`);
    },
  },
});

export default defineConfig(({ mode }) => {
  const raw = loadEnv(mode, process.cwd(), 'VITE_').VITE_SHIELD_API_URL?.trim();
  const origin = raw ? new URL(raw).origin : null;
  return {
  plugins: [react(), injectCsp(buildCsp(origin))],
  base: '/',
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: './tests/setup.ts',
  },
  server: {
    port: 5180,
    open: false,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
};
});
