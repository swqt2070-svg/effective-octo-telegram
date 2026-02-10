import fs from 'fs'
import path from 'path'

const entry = path.resolve('node_modules/libsignal-protocol/dist/libsignal-protocol-worker.js')
const outFile = path.resolve('public/libsignal-protocol.js')

try {
  const src = fs.readFileSync(entry, 'utf8')
  const patched = src
    .replace('var libsignal = {};', 'var libsignal = window.libsignal = {};')
    .replace(/\}\)\(this,/g, '})(window,')
    .replace(/\}\)\(this\)/g, '})(window)')

  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, patched)
  console.log('Prepared libsignal-protocol.js from worker bundle')
} catch (err) {
  console.error('Failed to prepare libsignal-protocol.js')
  console.error(err)
  process.exit(1)
}
