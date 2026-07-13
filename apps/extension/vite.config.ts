import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const fromHere = (relative: string) => new URL(relative, import.meta.url).pathname;

/**
 * Deux points d'entrée, alignés sur manifest.json :
 *   popup.html        -> dist/popup.html    (action.default_popup)
 *   src/background.ts -> dist/background.js  (background.service_worker)
 *
 * Le nom du service worker est figé : le manifest le référence en dur.
 *
 * Le gabarit source s'appelle `popup.html`, et non `index.html` : Chrome met le
 * manifest en cache jusqu'au rechargement de l'extension, et un manifest périmé
 * pointant sur « index.html » chargerait le gabarit source (qui référence un
 * .tsx, servi en MIME octet-stream) au lieu d'échouer franchement.
 *
 * Le dossier chargé dans Chrome reste `apps/extension/` (manifest.json à la
 * racine) : l'ID d'une extension non empaquetée dérive du chemin du dossier, et
 * cet ID est whitelisté en CORS côté serveur (ALLOWED_ORIGINS).
 *
 * Pas de dev server : MV3 interdit eval et les scripts inline, donc le HMR de
 * Vite ne peut pas fonctionner. Développement en `vite build --watch`.
 */
export default defineConfig({
  // Chemins relatifs : le popup est servi depuis dist/popup.html, alors qu'une
  // racine absolue (`/assets/...`) pointerait à la racine de l'extension.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fromHere('./src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: fromHere('./popup.html'),
        checking: fromHere('./checking.html'),
        blocked: fromHere('./blocked.html'),
        background: fromHere('./src/background.ts'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
