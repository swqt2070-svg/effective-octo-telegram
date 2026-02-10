import path from 'path'
import { build } from 'esbuild'

const entry = path.resolve('node_modules/libsignal-protocol/dist/libsignal-protocol.js')
const outFile = path.resolve('public/libsignal-protocol.js')

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  outfile: outFile,
  define: {
    global: 'window',
  },
})

console.log('Bundled libsignal-protocol.js to public/')
