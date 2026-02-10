import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// libsignal-protocol expects Buffer in browser and has no package entry.
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'window',
  },
  resolve: {
    alias: {
      'libsignal-protocol': 'libsignal-protocol/dist/libsignal-protocol.js',
    },
  },
  optimizeDeps: {
    include: ['libsignal-protocol', 'long'],
  },
})
