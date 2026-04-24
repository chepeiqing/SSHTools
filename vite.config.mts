import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'
import pkg from './package.json'

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        onstart(options) {
          options.startup()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['ssh2', 'electron-store']
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron'
          }
        }
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          const pathAfterNodeModules = id.split('node_modules/')[1]
          const packageName = pathAfterNodeModules.startsWith('@')
            ? pathAfterNodeModules.split('/').slice(0, 2).join('/')
            : pathAfterNodeModules.split('/')[0]

          if (packageName === 'react' || packageName === 'react-dom' || packageName === 'scheduler') {
            return 'react-vendor'
          }
          if (packageName === 'antd') return 'antd'
          if (packageName === '@ant-design/icons') return 'ant-icons'
          if (packageName === '@ant-design/cssinjs' || packageName === '@ant-design/colors' || packageName === '@ctrl/tinycolor') {
            return 'ant-style'
          }
          if (packageName === '@xterm/addon-fit' || packageName === '@xterm/addon-search' || packageName === '@xterm/addon-web-links' || packageName === '@xterm/xterm') {
            return 'xterm'
          }
          if (
            packageName === 'codemirror' ||
            packageName === '@codemirror/state' ||
            packageName === '@codemirror/view' ||
            packageName === '@codemirror/language' ||
            packageName === '@codemirror/search' ||
            packageName === '@codemirror/theme-one-dark' ||
            packageName === '@codemirror/commands' ||
            packageName === '@codemirror/autocomplete' ||
            packageName === '@codemirror/lint'
          ) {
            return 'codemirror-core'
          }
          if (packageName.startsWith('@codemirror/lang-') || packageName === '@codemirror/legacy-modes' || packageName.startsWith('@lezer/')) {
            return `codemirror-${packageName.replace(/[@/]/g, '_')}`
          }
          if (packageName === 'dayjs' || packageName === 'string-convert' || packageName === 'json2mq') {
            return 'antd'
          }
          if (packageName.startsWith('rc-') || packageName.startsWith('@rc-component/')) {
            return `rc-${packageName.replace(/[@/]/g, '_')}`
          }
          return `vendor-${packageName.replace(/[@/]/g, '_')}`
        },
      },
    },
  }
})
