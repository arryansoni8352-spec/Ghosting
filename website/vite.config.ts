/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages cannot send a Content-Security-Policy header, so the production build
// carries it in a <meta> tag. It is injected at build time only: the dev server needs
// inline scripts and a websocket for hot reload, which this policy would block.
// connect-src 'none' provides defense-in-depth by restricting network APIs (fetch, XHR,
// WebSockets, EventSource) in supported browsers, complementing our local-first architecture.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const injectCsp = (): Plugin => ({
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler(html) {
      const tag = `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`;
      return html.replace(/(<meta\s+charset[^>]*>)/i, `$1\n    ${tag}`);
    },
  },
});

export default defineConfig({
  plugins: [react(), injectCsp()],
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
});
