import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          ['@lingui/babel-plugin-lingui-macro']
        ]
      }
    })
  ],
  define: {
    'process.env': JSON.stringify(process.env),
    process: {
      env: JSON.stringify({}),
    },
  },
  resolve: {
    alias: {
      process: 'process/browser',
      path: 'path-browserify',
      os: 'os-browserify/browser',
    },
  },
  server: {
    hmr: {
      overlay: false, // disable error overlay that can cause slowdowns
    },
    watch: {
      usePolling: false, // avoid polling, use native fs events
      ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**'], // skip heavy dirs
    },
    fs: {
      strict: false, // allow serving files outside root if needed
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'echarts',
      'echarts/core',
      'echarts/charts',
      'echarts/components',
      'echarts/renderers',
      '@lingui/react',
      '@lingui/core',
      'luxon',
    ],
    exclude: ['@vite/client', '@vite/env'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-echarts': ['echarts', 'echarts/core', 'echarts/charts', 'echarts/components', 'echarts/renderers'],
          'vendor-i18n': ['@lingui/react', '@lingui/core', 'luxon'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
})
