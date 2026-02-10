import { build } from 'esbuild'
import path from 'path'

const entry = path.resolve('node_modules/libsignal-protocol/dist/libsignal-protocol.js')
const outFile = path.resolve('public/libsignal-protocol.js')

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
    plugins: [
      {
        name: 'alias-mocha-bytebuffer',
        setup(build) {
          build.onResolve({ filter: /^mocha-bytebuffer$/ }, () => ({
            path: 'bytebuffer',
          }))
        },
      },
    ],
  })
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
