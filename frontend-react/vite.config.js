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
})
