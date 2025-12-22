import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    // VitePWA({
    //   registerType: 'autoUpdate',
    //   includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
    //   manifestFilename: 'manifest.json',
    //   devOptions: {
    //     enabled: true
    //   },
    //   manifest: {
    //     name: 'Paradigm IFS',
    //     short_name: 'Paradigm',
    //     description: 'Paradigm Integrated Field Services Application',
    //     theme_color: '#007bff',
    //     background_color: '#ffffff',
    //     display: 'standalone',
    //     orientation: 'portrait',
    //     start_url: '/',
    //     icons: [
    //       {
    //         src: '/Paradigm-Logo-3-1024x157.png',
    //         sizes: '1024x157',
    //         type: 'image/png'
    //       },
    //       {
    //         src: '/Paradigm-Logo-3-1024x157.png',
    //         sizes: '192x192',
    //         type: 'image/png',
    //         purpose: 'any maskable'
    //       },
    //       {
    //         src: '/Paradigm-Logo-3-1024x157.png',
    //         sizes: '512x512',
    //         type: 'image/png'
    //       }
    //     ],
    //     protocol_handlers: [
    //       {
    //         protocol: 'web+paradigm',
    //         url: '/handle-protocol?%s'
    //       }
    //     ]
    //   }
    // })
  ],



  resolve: {
    alias: {
      '@/services': path.resolve(__dirname, './services'),
      '@/components': path.resolve(__dirname, './components'),
      '@/hooks': path.resolve(__dirname, './hooks'),
      '@/store': path.resolve(__dirname, './store'),
      '@/utils': path.resolve(__dirname, './utils'),
      '@/types': path.resolve(__dirname, './types'),
    },
  },
  server: {
    // Proxy /api requests to the Node.js server running on port 3000
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        // Rewrite the path to remove /api if the backend doesn't expect it
        // rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
    // Configure the file watcher.  Without an ignore list Vite watches the entire
    // project directory, so events such as downloading or opening files in external
    // directories can trigger an unnecessary full reload.  Ignoring these patterns
    // prevents unwanted reloads when you download PDFs or other files during
    // development.
    watch: {
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/tmp/**',
        '**/Downloads/**',
        '**/.DS_Store/**',
      ],
    },
  },
});