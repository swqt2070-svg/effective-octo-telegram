import { build } from 'esbuild'
import path from 'path'
import fs from 'fs'
import { createRequire } from 'module'

const entry = path.resolve('node_modules/libsignal-protocol/dist/libsignal-protocol.js')
const outFile = path.resolve('public/libsignal-protocol.js')
const require = createRequire(import.meta.url)

try {
  await build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    outfile: outFile,
    logLevel: 'info',
    define: {
      global: 'window',
    },
    inject: [path.resolve('scripts/shim-buffer.js')],
    plugins: [
      {
        name: 'alias-mocha-bytebuffer',
        setup(build) {
          build.onResolve({ filter: /^mocha-bytebuffer$/ }, (args) => ({
            path: require.resolve('bytebuffer'),
          }))
        },
      },
    ],
    external: ['crypto', 'path', 'fs', 'os', 'stream', 'util'],
  })
  const contents = fs.readFileSync(outFile, 'utf8')
  const patched = contents
    .replace(/\}\)\(this,/g, '})(window,')
    .replace(/\}\)\(this\)/g, '})(window)')
  if (patched !== contents) {
    fs.writeFileSync(outFile, patched)
    console.log('Patched libsignal-protocol.js global this -> window')
  }
  console.log('Bundled libsignal-protocol.js to public/')
} catch (err) {
  console.error('Failed to bundle libsignal-protocol.js')
  if (err?.errors) {
    for (const e of err.errors) console.error(e)
  } else {
    console.error(err)
  }
  process.exit(1)
}
