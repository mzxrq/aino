import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['@lingui/babel-plugin-lingui-macro']],
      },
    }),
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
    hmr: { overlay: false },
    watch: {
      usePolling: false,
      ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    },
    fs: { strict: false },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'echarts',
      '@lingui/react',
      '@lingui/core',
      'luxon',
    ],
    exclude: ['@vite/client', '@vite/env'],
    esbuildOptions: {
      target: 'es2020',
    },
  },
  build: {
    target: 'es2020',
    minify: 'terser',
    sourcemap: false,
    cssCodeSplit: true,
    reportCompressedSize: true,
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 3,
        pure_funcs: ['console.info', 'console.debug', 'console.warn'],
      },
      mangle: true,
      format: { comments: false },
    },

    // Improve tree-shaking and CJS handling
    commonjsOptions: {
      include: /node_modules/,
      transformMixedEsModules: true,
    },
    rollupOptions: {
      // enable Rollup treeshaking aggressively
      treeshake: {
        moduleSideEffects: false
      },
      output: {
manualChunks(id) {
  if (id.includes('node_modules')) {
    if (id.includes('echarts')) return 'echarts';
    if (id.includes('@mui')) return 'mui';
    // Let Vite handle React and others in the main vendor chunk
  }
}
      },
      plugins: [
        visualizer({ filename: 'dist/stats.html', open: false, gzipSize: true })
      ],
    },

    chunkSizeWarningLimit: 1000,
  },
})
