import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// libsignal-protocol expects Buffer in browser
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'window',
  },
  optimizeDeps: {
    include: ['libsignal-protocol']
  }
})
