/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Rutas relativas: funciona igual en la raíz de un dominio o en una subcarpeta (GitHub Pages).
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
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
        // Phaser ocupa más de los 2 MB que Workbox permite por defecto.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
