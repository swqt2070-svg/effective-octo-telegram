import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const libsignalPath = require.resolve('libsignal-protocol/dist/libsignal-protocol.js')

// libsignal-protocol expects Buffer in browser and has no package entry.
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'patch-libsignal-umd',
      enforce: 'pre',
      load(id) {
        if (!id.includes('libsignal-protocol/dist/libsignal-protocol.js')) return null
        let code = fs.readFileSync(id, 'utf-8')
        code = code.replace(/\}\)\(this/g, '})(window')
        return code
      },
    },
  ],
  define: {
    global: 'window',
  },
  build: {
    target: 'es2022',
  },
  resolve: {
    alias: {
      'libsignal-protocol': libsignalPath,
    },
  },
  optimizeDeps: {
    include: ['libsignal-protocol', 'long'],
  },
})
