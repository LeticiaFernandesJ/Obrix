import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon-64.png', 'assets/obrix-logo.jpg', 'assets/login-bg.jpg'],
      manifest: {
        name: 'Obrix - Gestão inteligente de obras',
        short_name: 'Obrix',
        description: 'Controle de verbas AC21 e cronograma de obra em um só sistema.',
        lang: 'pt-BR',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#0f2c55',
        background_color: '#0b1e3b',
        categories: ['business', 'productivity'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Obras', url: './obras', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Cronograma', url: './cronograma', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,jpg,svg,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          // fontes do Google: guarda para funcionar sem internet
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'fontes', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          // dados e login do Supabase: sempre direto na rede, nunca do cache
          { urlPattern: /^https:\/\/[^/]+\.supabase\.co\/.*/i, handler: 'NetworkOnly' },
        ],
      },
    }),
  ],
  base: process.env.VITE_BASE_URL || '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          graficos: ['chart.js'],
        },
      },
    },
  },
});
