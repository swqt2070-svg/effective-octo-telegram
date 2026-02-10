import fs from 'fs'
import path from 'path'

const src = path.resolve('node_modules/libsignal-protocol/dist/libsignal-protocol.js')
const destDir = path.resolve('public')
const dest = path.join(destDir, 'libsignal-protocol.js')

if (!fs.existsSync(src)) {
  console.error('libsignal-protocol not found at', src)
  process.exit(1)
}

fs.mkdirSync(destDir, { recursive: true })
fs.copyFileSync(src, dest)
console.log('Copied libsignal-protocol.js to public/')