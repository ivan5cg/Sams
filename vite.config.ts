/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Rutas relativas: funciona igual en la raíz de un dominio o en una subcarpeta (GitHub Pages).
  base: './',
  build: {
    // Phaser (~1,5 MB) va aparte: casi nunca cambia y se queda en la caché entre versiones.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/phaser')) return 'phaser';
          // Textos y datos del juego: cambian a menudo, pero por separado del código.
          if (/src\/data\/|src\/sim\/phrases\.ts/.test(id)) return 'contenido';
          return undefined;
        },
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Sams',
        short_name: 'Sams',
        description: 'Simulador de vida: cuida de tu familia y de sus mascotas.',
        lang: 'es',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#1d2233',
        theme_color: '#1d2233',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        // Phaser va en su propio fichero (~1,5 MB): margen por si crece.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    // Las partidas empiezan «hoy»: en las pruebas, hoy es siempre el mismo día (ver tests/setup.ts).
    setupFiles: ['tests/setup.ts'],
    // Las simulaciones de varios días tardan el doble en los servidores de CI.
    testTimeout: 20_000,
  },
});
