import { build } from 'esbuild'
import fs from 'fs'
import path from 'path'
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
    plugins: [
      {
        name: 'alias-mocha-bytebuffer',
        setup(build) {
          build.onResolve({ filter: /^mocha-bytebuffer$/ }, () => ({
            path: require.resolve('bytebuffer'),
          }))
        },
      },
    ],
    external: ['fs', 'path', 'crypto'],
  })

  const contents = fs.readFileSync(outFile, 'utf8')
  let patched = contents
    .replace(/\}\)\(this,/g, '})(window,')
    .replace(/\}\)\(this\)/g, '})(window)')

  const guard = 'var require = undefined; var module = undefined; var exports = undefined; var define = undefined;'
  const needle = ';(function(){'
  const idx = patched.indexOf(needle)
  if (idx !== -1) {
    patched = patched.slice(0, idx) + guard + '\n' + patched.slice(idx)
  } else {
    patched = guard + '\n' + patched
  }

  if (patched !== contents) {
    fs.writeFileSync(outFile, patched)
    console.log('Patched libsignal-protocol.js globals for browser')
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
