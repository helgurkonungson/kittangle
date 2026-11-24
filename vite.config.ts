import { defineConfig, type Plugin } from 'vite';

// Portal builds: `vite build --mode crazygames` → dist-crazygames/ (game page only, portal SDK script injected).
const SDK: Record<string, string> = {
  crazygames: 'https://sdk.crazygames.com/crazygames-sdk-v3.js',
};

const portalSdk = (mode: string): Plugin => ({
  name: 'portal-sdk',
  transformIndexHtml: (html) => (SDK[mode] ? html.replace('<head>', `<head>\n<script src="${SDK[mode]}"></script>`) : html),
});

export default defineConfig(({ mode }) => {
  const portal = mode in SDK;
  return {
    base: './',
    // build stamp: appended to audio/art URLs so a new build never plays cached old files
    define: { __BUILD__: JSON.stringify(Date.now().toString(36)) },
    plugins: [portalSdk(mode)],
    build: {
      outDir: portal ? `dist-${mode}` : 'dist',
      chunkSizeWarningLimit: 2000,
      rollupOptions: { input: portal ? { main: 'index.html' } : { main: 'index.html', lab: 'lab.html' } },
    },
  };
});
